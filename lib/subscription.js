import Razorpay from "razorpay";
import { prisma } from "@/lib/db";
import { REFERRAL_BONUS_READINGS } from "@/lib/auth";

export const SUBSCRIPTION_DAYS = 30;
const PERIOD_MS = SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000;

// The one place a paid order turns into access. Three callers reach it:
//   - /api/verify-payment   (the browser, right after Razorpay checkout)
//   - /api/razorpay/webhook (Razorpay itself — covers a closed tab / lost network)
//   - /api/cron/cleanup-accounts (last-chance reconciliation before deleting
//     someone who looks unpaid but whose payment was actually captured)
// Any of them can arrive first, more than once, or at the same time, so the
// order is claimed atomically (status != "paid" -> "paid") inside the same
// transaction that extends the subscription. Whoever loses the race sees
// count 0 and returns "already" — a payment can never grant 60 days.
//
// Returns { status: "granted" | "already" | "not_found" | "wrong_user", user }.
export async function grantSubscriptionForOrder(razorpayOrderId, { expectUserId } = {}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { razorpayOrderId } });
    if (!order) return { status: "not_found", user: null };
    if (expectUserId && order.userId !== expectUserId) return { status: "wrong_user", user: null };

    // Only a "created" order can be claimed: "paid" was already granted, and
    // "refunded" (admin page) must never grant access again — not even from
    // a replayed Razorpay webhook.
    const claimed = await tx.order.updateMany({
      where: { id: order.id, status: "created" },
      data: { status: "paid" },
    });
    const user = await tx.user.findUnique({ where: { id: order.userId } });
    if (claimed.count === 0) return { status: "already", user };

    // Stack onto time still left rather than resetting — paying early never
    // costs days already bought.
    const now = new Date();
    const base = user.subscriptionExpires && user.subscriptionExpires > now ? user.subscriptionExpires : now;
    const newExpiry = new Date(base.getTime() + PERIOD_MS);

    // Referral reward — once per referred user, on their first subscription.
    const rewardReferral = !!user.referredByUserId && !user.referralRewarded;

    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        subscriptionExpires: newExpiry,
        ...(rewardReferral ? { bonusReadings: { increment: REFERRAL_BONUS_READINGS }, referralRewarded: true } : {}),
      },
    });
    if (rewardReferral) {
      // updateMany so a referrer who has since been deleted is simply skipped.
      await tx.user.updateMany({
        where: { id: user.referredByUserId },
        data: { bonusReadings: { increment: REFERRAL_BONUS_READINGS } },
      });
    }
    return { status: "granted", user: updated };
  });
}

function razorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

// Asks Razorpay directly whether any payment on this order was captured.
// Used by the cleanup cron before it deletes an account: if the person
// really paid (and only the browser hand-off failed), they get their access
// instead of being deleted. Returns false when Razorpay isn't configured.
export async function orderHasCapturedPayment(razorpayOrderId) {
  const rz = razorpayClient();
  if (!rz) return false;
  const res = await rz.orders.fetchPayments(razorpayOrderId);
  return (res?.items || []).some((p) => p.status === "captured");
}
