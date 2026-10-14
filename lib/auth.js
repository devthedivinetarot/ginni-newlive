import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/db";
import { withRetry } from "@/lib/withRetry";

const SESSION_COOKIE = "gkb_session";
const SESSION_DAYS = 30;

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set — required for auth to work.");
  }
  return secret;
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function createSessionCookieValue(userId) {
  return jwt.sign({ sub: userId }, getSecret(), { expiresIn: `${SESSION_DAYS}d` });
}

export async function setSessionCookie(userId) {
  const token = createSessionCookieValue(userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// Returns the logged-in User row (fresh from the DB, so access fields are
// always current) or null if there's no valid session or the DB can't be
// reached. Deliberately swallows DB errors here (instead of throwing) so a
// misconfigured/unreachable database degrades to "logged out" rather than
// crashing every page load — /api/auth/me calls this on every app open.
export async function getSessionUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, getSecret());
  } catch {
    return null;
  }
  if (!payload?.sub) return null;
  try {
    return await withRetry(() => prisma.user.findUnique({ where: { id: payload.sub } }));
  } catch (err) {
    console.error("getSessionUser: database error", err);
    Sentry.captureException(err, { tags: { area: "getSessionUser" } });
    return null;
  }
}

export function summarizeAccess(user) {
  if (!user) {
    return { loggedIn: false };
  }
  const subscribed = !!(user.subscriptionExpires && new Date(user.subscriptionExpires) > new Date());
  const limit = FREE_READING_LIMIT + (user.bonusReadings || 0);
  const freeLeft = Math.max(0, limit - user.readingsUsed);
  return {
    loggedIn: true,
    email: user.email,
    name: user.name,
    readingsUsed: user.readingsUsed,
    bonusReadings: user.bonusReadings || 0,
    freeLeft,
    subscribed,
    subscriptionExpires: user.subscriptionExpires,
    hasAccess: subscribed || user.readingsUsed < limit,
    referralCode: user.referralCode || null,
  };
}

// Client's call (Oct 2026): no free readings — every account needs the
// ₹199/month subscription from the first reading. Kept as a constant so the
// counter logic (readingsUsed vs limit + bonusReadings) stays intact.
export const FREE_READING_LIMIT = 0;
export const MONTHLY_PRICE_INR = 199;
export const REFERRAL_BONUS_READINGS = 3; // granted to both sides when a referred friend's first subscription is verified

// A pick token authorizes exactly one already-charged reveal (a specific
// user + topic + card), so switching languages on an already-picked card
// can re-fetch text without spending another credit — the credit was
// charged once, at pick time, in /api/reading/pick. `question` is only
// present for the AI-fallback path (topicId "ai") — see lib/ai.js — and is
// trimmed here so an unusually long message can't bloat the cookie-sized
// JWT.
export function createPickToken({ userId, topicId, card, question }) {
  const payload = { userId, topicId, card };
  if (question) payload.question = String(question).slice(0, 500);
  return jwt.sign(payload, getSecret(), { expiresIn: "20m" });
}

export function verifyPickToken(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
}
