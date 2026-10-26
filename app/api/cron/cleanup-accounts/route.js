import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRetry } from "@/lib/withRetry";
import { isEmailConfigured, saveContactToResend } from "@/lib/email";
import { grantSubscriptionForOrder, orderHasCapturedPayment } from "@/lib/subscription";
import { adminEmails } from "@/lib/admin";

// Client's rule (Oct 2026): only accounts with a running subscription stay
// in the database. Everyone else is deleted, and their email is kept as a
// contact in Resend for win-back mail.
//
// Deleted, once the 24-hour grace has passed:
//   - never paid:  no subscription at all, signed up more than 24 h ago
//                  (a failed payment can be retried during those 24 h)
//   - lapsed:      subscription ended more than 24 h ago and wasn't renewed
// Never deleted: CLEANUP_PROTECTED_EMAILS (dev/demo accounts by default).
//
// Two safety nets run before anything is removed:
//   1. Reconcile with Razorpay — if any of the person's unpaid orders was in
//      fact captured (browser never reached /api/verify-payment and the
//      webhook didn't land either), they get their 30 days instead.
//   2. The email must be saved in Resend first. If Resend isn't configured
//      or refuses the contact, that account is left alone and retried on the
//      next run — an address is never lost.
//
// Vercel Cron calls this daily (vercel.json, 02:30 IST) with
// "Authorization: Bearer <CRON_SECRET>". ?dry=1 reports without changing
// anything (it still asks Razorpay, read-only). ?limit=N caps one run.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const GRACE_HOURS = 24;
const RESEND_GAP_MS = 550; // Resend allows ~2 requests/second per account
// Admin accounts (ADMIN_EMAILS) are always protected too, so the admin can
// never be cleaned up for not having a subscription.
function protectedEmails() {
  return new Set([
    ...(process.env.CLEANUP_PROTECTED_EMAILS || "dev.sitelytc@gmail.com,demo@ginnikibaatein.com")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    ...adminEmails(),
  ]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(req) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const limit = Math.min(Number(url.searchParams.get("limit")) || 150, 400);
  const cutoff = new Date(Date.now() - GRACE_HOURS * 60 * 60 * 1000);

  if (!dry && !isEmailConfigured()) {
    // Deleting without somewhere to keep the email would break the rule.
    return NextResponse.json(
      { error: "RESEND_API_KEY is not set — nothing deleted, so no email is lost." },
      { status: 503 }
    );
  }

  try {
    const candidates = await withRetry(() =>
      prisma.user.findMany({
        where: {
          OR: [
            { subscriptionExpires: null, createdAt: { lt: cutoff } },
            { subscriptionExpires: { lt: cutoff } },
          ],
        },
        select: {
          id: true,
          email: true,
          name: true,
          subscriptionExpires: true,
          orders: { where: { status: "created" }, select: { razorpayOrderId: true } },
        },
        orderBy: { createdAt: "asc" },
        take: limit,
      })
    );

    const PROTECTED = protectedEmails();
    const rescued = [];
    const doomed = [];
    for (const u of candidates) {
      if (PROTECTED.has(u.email.toLowerCase())) continue;

      // Safety net 1: a captured payment Razorpay knows about but we don't.
      let paidOrder = null;
      for (const o of u.orders) {
        try {
          if (await orderHasCapturedPayment(o.razorpayOrderId)) {
            paidOrder = o.razorpayOrderId;
            break;
          }
        } catch (err) {
          // Can't confirm either way — don't delete on a guess.
          console.warn(`cleanup: Razorpay lookup failed for ${o.razorpayOrderId}:`, err?.message || err);
          paidOrder = "unknown";
          break;
        }
      }
      if (paidOrder === "unknown") continue;
      if (paidOrder) {
        if (!dry) await grantSubscriptionForOrder(paidOrder);
        rescued.push(u.email);
        continue;
      }
      doomed.push({ ...u, reason: u.subscriptionExpires ? "lapsed" : "never_paid" });
    }

    if (dry) {
      return NextResponse.json({
        ok: true,
        dry: true,
        cutoff,
        wouldRescue: rescued,
        wouldDelete: doomed.length,
        neverPaid: doomed.filter((u) => u.reason === "never_paid").map((u) => u.email),
        lapsed: doomed.filter((u) => u.reason === "lapsed").map((u) => u.email),
      });
    }

    // Safety net 2: email into Resend first, one at a time (rate limit).
    const saved = [];
    const notSaved = [];
    for (const u of doomed) {
      let ok = false;
      try {
        ok = await saveContactToResend({ email: u.email, name: u.name });
      } catch (err) {
        console.warn(`cleanup: Resend save failed for one contact:`, err?.message || err);
      }
      (ok ? saved : notSaved).push(u);
      await sleep(RESEND_GAP_MS);
    }

    let deleted = 0;
    if (saved.length) {
      const ids = saved.map((u) => u.id);
      // ChatMessage and PasswordResetToken cascade from User; Order and the
      // referral self-link don't, so they're handled explicitly — all in one
      // transaction so a failure part-way leaves nothing half-deleted.
      const results = await withRetry(() =>
        prisma.$transaction([
          prisma.order.deleteMany({ where: { userId: { in: ids } } }),
          prisma.user.updateMany({ where: { referredByUserId: { in: ids } }, data: { referredByUserId: null } }),
          prisma.user.deleteMany({ where: { id: { in: ids } } }),
        ])
      );
      deleted = results[2].count;
    }

    return NextResponse.json({
      ok: true,
      cutoff,
      rescued,
      deleted,
      deletedNeverPaid: saved.filter((u) => u.reason === "never_paid").length,
      deletedLapsed: saved.filter((u) => u.reason === "lapsed").length,
      keptBecauseResendFailed: notSaved.map((u) => u.email),
      moreRemaining: candidates.length === limit,
    });
  } catch (err) {
    console.error("Account cleanup failed:", err);
    Sentry.captureException(err, { tags: { area: "cron-cleanup-accounts" } });
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
