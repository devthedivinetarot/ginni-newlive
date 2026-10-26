import * as Sentry from "@sentry/nextjs";
import Razorpay from "razorpay";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRetry } from "@/lib/withRetry";
import { requireAdmin } from "@/lib/admin";

export const maxDuration = 60;

// POST { orderId, amountInr?, endSubscription? }
// Refunds one of the account's paid orders through Razorpay — the full
// amount by default, or a part of it. The order is marked "refunded" (so no
// webhook replay or cleanup check can ever grant access from it again), and
// with endSubscription (on by default in the admin page) access ends now.
// Razorpay sends the money back to the original payment method; normal
// refunds take 5–7 working days to reach the customer.
export async function POST(req) {
  const { admin, response } = await requireAdmin(req, { mutating: true });
  if (response) return response;

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return NextResponse.json({ error: "Razorpay isn't configured." }, { status: 500 });
  }

  const { orderId, amountInr, endSubscription = true } = await req.json().catch(() => ({}));
  if (!orderId) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    const order = await withRetry(() =>
      prisma.order.findUnique({ where: { id: orderId }, include: { user: true } })
    );
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (order.status !== "paid") {
      return NextResponse.json({ error: `This order is "${order.status}", not a paid order — nothing to refund.` }, { status: 409 });
    }

    const amountPaise = amountInr == null ? order.amount : Math.round(Number(amountInr) * 100);
    if (!Number.isInteger(amountPaise) || amountPaise < 100 || amountPaise > order.amount) {
      return NextResponse.json(
        { error: `Refund amount must be between ₹1 and ₹${order.amount / 100}.` },
        { status: 400 }
      );
    }

    // Claim the order before touching Razorpay: two clicks (or two admins)
    // at the same moment can't both refund it. Released again if Razorpay
    // says no, so the admin can retry.
    const claim = await withRetry(() =>
      prisma.order.updateMany({ where: { id: order.id, status: "paid" }, data: { status: "refunding" } })
    );
    if (claim.count === 0) {
      return NextResponse.json({ error: "A refund for this order is already in progress or done." }, { status: 409 });
    }

    let refund;
    let payment;
    try {
      const rz = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
      const payments = await rz.orders.fetchPayments(order.razorpayOrderId);
      payment = (payments?.items || []).find((p) => p.status === "captured");
      if (!payment) {
        await prisma.order.update({ where: { id: order.id }, data: { status: "paid" } });
        return NextResponse.json(
          { error: "Razorpay has no captured payment for this order (it may already be refunded)." },
          { status: 409 }
        );
      }
      refund = await rz.payments.refund(payment.id, {
        amount: amountPaise,
        speed: "normal",
        notes: { reason: "Refunded from Ginni admin", by: admin.email, account: order.user.email },
        receipt: `gkb_refund_${order.id}`.slice(0, 40),
      });
    } catch (err) {
      await prisma.order.update({ where: { id: order.id }, data: { status: "paid" } }).catch(() => {});
      throw err;
    }

    await withRetry(() =>
      prisma.$transaction([
        prisma.order.update({ where: { id: order.id }, data: { status: "refunded" } }),
        ...(endSubscription
          ? [prisma.user.update({ where: { id: order.userId }, data: { subscriptionExpires: new Date() } })]
          : []),
      ])
    );

    console.info(
      `[admin] ${admin.email} refunded ₹${amountPaise / 100} on ${payment.id} (${order.user.email}) refund=${refund.id} endSubscription=${!!endSubscription}`
    );
    return NextResponse.json({ ok: true, refundId: refund.id, amountInr: amountPaise / 100, status: refund.status });
  } catch (err) {
    console.error("admin refund failed:", err);
    Sentry.captureException(err, { tags: { area: "admin-refund" } });
    const msg = err?.error?.description || err?.message || "Refund failed.";
    return NextResponse.json({ error: `Razorpay: ${msg}` }, { status: 502 });
  }
}
