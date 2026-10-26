import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

// Who may open /admin: the client's own admin accounts below, plus any extra
// emails in ADMIN_EMAILS (comma-separated, Vercel env). Admins log in with
// email + password on /admin itself (same accounts table as everyone else;
// passwords are only ever stored as bcrypt hashes).
const DEFAULT_ADMIN_EMAILS = [
  "dev.thedivinetarot111@gmail.com",
  "thedivinetarot111@gmail.com",
  "thedivinetarotsupport@gmail.com",
];

export function adminEmails() {
  const extra = (process.env.ADMIN_EMAILS || "").split(",");
  return [...new Set([...DEFAULT_ADMIN_EMAILS, ...extra].map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

// True when a state-changing request comes from this same site.
export function isSameOrigin(req) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  try {
    return !!origin && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function isAdminEmail(email) {
  return !!email && adminEmails().includes(String(email).toLowerCase());
}

// Every /api/admin route starts with this. Returns { admin } or { response }
// to send back as-is. State-changing requests must also come from this same
// site (Origin check) — the session cookie alone isn't enough to trust a
// refund button press.
export async function requireAdmin(req, { mutating = false } = {}) {
  if (mutating) {
    if (!isSameOrigin(req)) {
      return { response: NextResponse.json({ error: "Bad origin." }, { status: 403 }) };
    }
  }
  const user = await getSessionUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Please log in with an admin account." }, { status: 401 }) };
  }
  if (!isAdminEmail(user.email)) {
    return { response: NextResponse.json({ error: "This account isn't an admin." }, { status: 403 }) };
  }
  return { admin: user };
}
