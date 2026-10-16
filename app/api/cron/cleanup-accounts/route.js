import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRetry } from "@/lib/withRetry";

// Removes accounts that never paid. Client's rule (Oct 2026): an account
// that has not subscribed within 24 hours of signing up is deleted, so the
// only people in the database are paying readers (plus the grace window).
//
// Who gets deleted: subscriptionExpires IS NULL (never had a subscription —
// a lapsed subscriber keeps their account and can renew) AND createdAt is
// older than GRACE_HOURS AND the email isn't in PROTECTED.
//
// Vercel Cron hits this daily (vercel.json) with
// "Authorization: Bearer <CRON_SECRET>". Hobby crons run once a day, so an
// account is removed between 24 and 48 hours after signup. ?dry=1 lists
// what would go without deleting; ?limit=N caps a run (default 500).
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const GRACE_HOURS = 24;
const PROTECTED = new Set(
  (process.env.CLEANUP_PROTECTED_EMAILS || "dev.sitelytc@gmail.com,demo@ginnikibaatein.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

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
  const limit = Math.min(Number(url.searchParams.get("limit")) || 500, 2000);
  const cutoff = new Date(Date.now() - GRACE_HOURS * 60 * 60 * 1000);

  try {
    const candidates = await withRetry(() =>
      prisma.user.findMany({
        where: { subscriptionExpires: null, createdAt: { lt: cutoff } },
        select: { id: true, email: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: limit,
      })
    );
    const doomed = candidates.filter((u) => !PROTECTED.has(u.email.toLowerCase()));

    if (dry || doomed.length === 0) {
      return NextResponse.json({
        ok: true,
        dry,
        cutoff,
        wouldDelete: doomed.length,
        emails: doomed.map((u) => u.email),
      });
    }

    const ids = doomed.map((u) => u.id);
    // ChatMessage and PasswordResetToken cascade from User; Order and the
    // referral self-link don't, so they're handled explicitly, all in one
    // transaction so a failure part-way leaves nothing half-deleted.
    const [, , , deleted] = await withRetry(() =>
      prisma.$transaction([
        prisma.order.deleteMany({ where: { userId: { in: ids } } }),
        prisma.user.updateMany({ where: { referredByUserId: { in: ids } }, data: { referredByUserId: null } }),
        prisma.chatMessage.deleteMany({ where: { userId: { in: ids } } }),
        prisma.user.deleteMany({ where: { id: { in: ids } } }),
      ])
    );

    return NextResponse.json({ ok: true, cutoff, deleted: deleted.count, emails: doomed.map((u) => u.email) });
  } catch (err) {
    console.error("Account cleanup failed:", err);
    Sentry.captureException(err, { tags: { area: "cron-cleanup-accounts" } });
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
