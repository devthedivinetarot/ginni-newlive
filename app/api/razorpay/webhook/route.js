import * as Sentry from "@sentry/nextjs";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { grantSubscriptionForOrder } from "@/lib/subscription";

// Razorpay → this app, server to server. Grants the subscription even when
// the buyer's browser never reached /api/verify-payment (tab closed, network
// dropped, UPI app didn't return) — the gap that left people "paid but
// locked" and would otherwise get them deleted by the 24-hour cleanup.
//
// Razorpay Dashboard → Account & Settings → Webhooks → Add:
//   URL     https://<site>/api/razorpay/webhook
//   Secret  same value as RAZORPAY_WEBHOOK_SECRET on Vercel
//   Events  payment.captured, order.paid
//
// The signature is an HMAC-SHA256 of the raw body with the webhook secret,
// so the body is read as text and only parsed after it checks out.
export const dynamic = "force-dynamic";

function signatureOk(raw, signature, secret) {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 503 });
  }

  const raw = await req.text();
  if (!signatureOk(raw, req.headers.get("x-razorpay-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad payload." }, { status: 400 });
  }

  // Both events carry the order id; anything else is acknowledged and ignored.
  const payment = event?.payload?.payment?.entity;
  const order = event?.payload?.order?.entity;
  const relevant =
    (event?.event === "payment.captured" && payment?.status === "captured") || event?.event === "order.paid";
  const orderId = payment?.order_id || order?.id;
  if (!relevant || !orderId) return NextResponse.json({ ok: true, ignored: true });

  try {
    const result = await grantSubscriptionForOrder(orderId);
    // not_found = an order from another app sharing this Razorpay account
    // (website, Kundli Milan, courses) or an account already deleted — 200 so
    // Razorpay doesn't keep retrying something that will never match.
    return NextResponse.json({ ok: true, status: result.status });
  } catch (err) {
    console.error("Razorpay webhook failed:", err);
    Sentry.captureException(err, { tags: { area: "razorpay-webhook" } });
    // 500 makes Razorpay retry later, which is what we want for a DB blip.
    return NextResponse.json({ error: "Temporary failure." }, { status: 500 });
  }
}
