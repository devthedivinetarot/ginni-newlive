import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRetry } from "@/lib/withRetry";
import { verifyUnsubscribeToken } from "@/lib/newsletter";

// GET  ?email=&token=  -> the link in the email footer; redirects to the
//                         confirmation page.
// POST ?email=&token=  -> Gmail/Apple one-click unsubscribe
//                         (List-Unsubscribe-Post header); plain 200.
async function unsubscribe(req) {
  const url = new URL(req.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const token = url.searchParams.get("token") || "";
  if (!verifyUnsubscribeToken(email, token)) {
    return { ok: false, status: 400 };
  }
  try {
    await withRetry(() =>
      prisma.newsletterSubscriber.updateMany({ where: { email, unsubscribedAt: null }, data: { unsubscribedAt: new Date() } })
    );
    return { ok: true, status: 200 };
  } catch (err) {
    console.error("unsubscribe failed:", err);
    return { ok: false, status: 500 };
  }
}

export async function GET(req) {
  const r = await unsubscribe(req);
  const dest = new URL("/newsletter/unsubscribed", req.url);
  if (!r.ok) dest.searchParams.set("error", r.status === 400 ? "invalid" : "failed");
  return NextResponse.redirect(dest, 303);
}

export async function POST(req) {
  const r = await unsubscribe(req);
  return NextResponse.json({ ok: r.ok }, { status: r.status });
}
