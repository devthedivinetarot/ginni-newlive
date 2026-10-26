import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRetry } from "@/lib/withRetry";
import { requireAdmin } from "@/lib/admin";

const DAY_MS = 24 * 60 * 60 * 1000;

// POST { userId, action: "extend", days }  -> adds days on top of whatever
//      is left (or from today if it has already run out). 1–3650 days.
// POST { userId, action: "end" }           -> access ends right now. The
//      account itself stays; the daily cleanup removes it 24 h later, the
//      same as any lapsed subscription (and keeps the email in Resend).
export async function POST(req) {
  const { admin, response } = await requireAdmin(req, { mutating: true });
  if (response) return response;

  const { userId, action, days } = await req.json().catch(() => ({}));
  if (!userId || !["extend", "end"].includes(action)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const n = Number(days);
  if (action === "extend" && (!Number.isInteger(n) || n < 1 || n > 3650)) {
    return NextResponse.json({ error: "Days must be a whole number from 1 to 3650." }, { status: 400 });
  }

  try {
    const user = await withRetry(() => prisma.user.findUnique({ where: { id: userId } }));
    if (!user) return NextResponse.json({ error: "Account not found (it may have been deleted)." }, { status: 404 });

    const now = new Date();
    let validTill;
    if (action === "extend") {
      const base = user.subscriptionExpires && user.subscriptionExpires > now ? user.subscriptionExpires : now;
      validTill = new Date(base.getTime() + n * DAY_MS);
    } else {
      validTill = now;
    }
    await withRetry(() => prisma.user.update({ where: { id: userId }, data: { subscriptionExpires: validTill } }));

    console.info(
      `[admin] ${admin.email} ${action === "extend" ? `extended +${n}d` : "ended subscription"} for ${user.email} -> ${validTill.toISOString()}`
    );
    return NextResponse.json({ ok: true, validTill });
  } catch (err) {
    console.error("admin subscription update failed:", err);
    Sentry.captureException(err, { tags: { area: "admin-subscription" } });
    return NextResponse.json({ error: "Couldn't update the subscription." }, { status: 500 });
  }
}
