import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, setSessionCookie, summarizeAccess } from "@/lib/auth";
import { withRetry } from "@/lib/withRetry";
import { generateUniqueReferralCode } from "@/lib/referral";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Server isn't configured yet (missing DATABASE_URL). Contact the site owner." },
      { status: 500 }
    );
  }
  if (!process.env.SESSION_SECRET) {
    return NextResponse.json(
      { error: "Server isn't configured yet (missing SESSION_SECRET). Contact the site owner." },
      { status: 500 }
    );
  }

  const { email, password, name, referralCode } = await req.json().catch(() => ({}));

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const existing = await withRetry(() => prisma.user.findUnique({ where: { email: normalizedEmail } }));
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    // A referral code arriving here just means "someone's link was used" —
    // an unrecognized or missing code is never an error, signup proceeds
    // exactly the same either way, just without crediting a referrer.
    let referredByUserId = null;
    if (referralCode) {
      const referrer = await withRetry(() =>
        prisma.user.findUnique({ where: { referralCode: String(referralCode).trim().toUpperCase() }, select: { id: true } })
      );
      referredByUserId = referrer?.id || null;
    }

    const passwordHash = await hashPassword(password);
    const newReferralCode = await generateUniqueReferralCode();
    const user = await withRetry(() =>
      prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: name?.trim() || null,
          referralCode: newReferralCode,
          referredByUserId,
        },
      })
    );

    await setSessionCookie(user.id);

    return NextResponse.json(summarizeAccess(user));
  } catch (err) {
    console.error("Signup failed:", err);
    Sentry.captureException(err, { tags: { area: "signup" } });
    return NextResponse.json(
      { error: "Couldn't create your account right now. Please try again in a moment." },
      { status: 500 }
    );
  }
}
