import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, summarizeAccess } from "@/lib/auth";
import { grantSubscriptionForOrder, orderHasCapturedPayment } from "@/lib/subscription";

// POST { orderId } — "did my payment go through?" for an order of the logged-in person whose checkout ended
// without a signature (paid in a UPI app / bank page, app closed). Asks Razorpay directly; a captured payment is
// credited exactly like /api/verify-payment and the webhook (lib/subscription.js), so nothing is ever granted twice.
export async function POST(req) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const { orderId } = await req.json().catch(() => ({}));
  if (typeof orderId !== "string" || !orderId.startsWith("order_")) return NextResponse.json({ error: "Invalid order." }, { status: 400 });
  try {
    const order = await prisma.order.findUnique({ where: { razorpayOrderId: orderId } });
    if (!order || order.userId !== user.id) return NextResponse.json({ error: "This order doesn't belong to your account." }, { status: 403 });
    if (order.status === "created" && (await orderHasCapturedPayment(orderId))) {
      const r = await grantSubscriptionForOrder(orderId, { expectUserId: user.id });
      return NextResponse.json({ paid: true, access: summarizeAccess(r.user || user) });
    }
    return NextResponse.json({ paid: order.status === "paid", access: summarizeAccess(user) });
  } catch (err) {
    console.error("check-order failed:", err);
    Sentry.captureException(err, { tags: { area: "check-order" } });
    return NextResponse.json({ error: "Couldn't check the payment right now." }, { status: 500 });
  }
}
