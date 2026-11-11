import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRetry } from "@/lib/withRetry";
import { bearerToken, clearSessionCookie, getSessionUser, verifyPassword } from "@/lib/auth";
import { isSameOrigin } from "@/lib/admin";

// POST { password } — the logged-in person deletes their own account (required for apps in the Play Store /
// App Store; the mobile app calls it with its Bearer session). The password must be right. Deletes the account,
// its chat history, reset tokens and orders — the same rows the daily cleanup removes.
export async function POST(req) {
  if (!isSameOrigin(req) && !(await bearerToken())) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const { password } = await req.json().catch(() => ({}));
  if (!password || !(await verifyPassword(String(password), user.passwordHash))) {
    return NextResponse.json({ error: "Password is incorrect.", code: "invalid_credentials" }, { status: 400 });
  }
  try {
    await withRetry(() =>
      prisma.$transaction([
        prisma.order.deleteMany({ where: { userId: user.id } }),
        prisma.user.delete({ where: { id: user.id } }),
      ])
    );
    await clearSessionCookie().catch(() => {});
    console.info(`[auth] account deleted by its owner: ${user.id}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("delete-account failed:", err);
    Sentry.captureException(err, { tags: { area: "delete-account" } });
    return NextResponse.json({ error: "Couldn't delete the account right now. Please try again." }, { status: 500 });
  }
}
