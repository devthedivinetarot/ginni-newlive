import * as Sentry from "@sentry/nextjs";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSessionUser, summarizeAccess } from "@/lib/auth";
import { grantSubscriptionForOrder } from "@/lib/subscription";

// The client sends back what Razorpay's checkout gave it after payment.
// We re-derive the signature server-side with the key secret and compare —
// this is the step that actually proves the payment is real, not spoofed.
// Access itself is granted in lib/subscription.js, the same code the
// Razorpay webhook uses, so whichever of the two arrives first wins and
// the other is a harmless no-op.
export async function POST(req) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }

  if (!process.env.RAZORPAY_KEY_SECRET) {
    return NextResponse.json({ error: "Payments aren't configured yet." }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body || {};

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: "Missing payment fields." }, { status: 400 });
  }

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    return NextResponse.json({ error: "Signature mismatch — payment could not be verified." }, { status: 400 });
  }

  try {
    const result = await grantSubscriptionForOrder(razorpay_order_id, { expectUserId: user.id });
    if (result.status === "not_found" || result.status === "wrong_user") {
      return NextResponse.json({ error: "This order doesn't belong to your account." }, { status: 403 });
    }
    // "granted" or "already" (the webhook got there first) — both mean paid.
    return NextResponse.json({ verified: true, access: summarizeAccess(result.user) });
  } catch (err) {
    console.error("Payment verification failed:", err);
    Sentry.captureException(err, { tags: { area: "verify-payment" } });
    return NextResponse.json(
      { error: "Payment succeeded but we couldn't confirm it just now. Contact support with your payment ID." },
      { status: 500 }
    );
  }
}
