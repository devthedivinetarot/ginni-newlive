import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRetry } from "@/lib/withRetry";
import { getSessionUser, verifyPassword, hashPassword } from "@/lib/auth";
import { isSameOrigin } from "@/lib/admin";

// POST { currentPassword, newPassword } — the logged-in person changes their
// own password (used by the "Change password" button on /admin). The current
// password must be right; the new one at least 8 characters and different.
export async function POST(req) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  const { currentPassword, newPassword } = await req.json().catch(() => ({}));
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Enter your current and new password." }, { status: 400 });
  }
  if (String(newPassword).length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ error: "New password must be different from the current one." }, { status: 400 });
  }

  try {
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }
    const passwordHash = await hashPassword(newPassword);
    await withRetry(() => prisma.user.update({ where: { id: user.id }, data: { passwordHash } }));
    console.info(`[auth] password changed for ${user.email}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("change-password failed:", err);
    Sentry.captureException(err, { tags: { area: "change-password" } });
    return NextResponse.json({ error: "Couldn't change the password right now." }, { status: 500 });
  }
}
