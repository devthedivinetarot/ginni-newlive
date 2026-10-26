import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

// Who may open /admin: accounts whose email is in ADMIN_EMAILS
// (comma-separated, set on Vercel). They log in with their normal Ginni
// account; there is no separate admin password. With ADMIN_EMAILS unset,
// nobody is an admin.
export function adminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
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
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    let sameSite = false;
    try {
      sameSite = !!origin && new URL(origin).host === host;
    } catch {
      sameSite = false;
    }
    if (!sameSite) {
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
