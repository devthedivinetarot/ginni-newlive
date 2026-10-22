import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/db";
import { withRetry } from "@/lib/withRetry";
import { getSessionUser, summarizeAccess } from "@/lib/auth";

// Saves the reading name on the account — once. The name is locked after
// that so one subscription stays tied to one person (typing a different
// friend's name each time was the way a whole group could share one
// purchase). Changing it later is a support/admin job, not a UI field.
export async function POST(req) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }

  if (user.name && user.name.trim()) {
    return NextResponse.json(summarizeAccess(user));
  }

  const { name } = await req.json().catch(() => ({}));
  const clean = String(name || "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!clean) {
    return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  }

  try {
    const updated = await withRetry(() =>
      prisma.user.update({ where: { id: user.id }, data: { name: clean } })
    );
    return NextResponse.json(summarizeAccess(updated));
  } catch (err) {
    console.error("Saving profile name failed:", err);
    Sentry.captureException(err, { tags: { area: "profile" } });
    return NextResponse.json({ error: "Couldn't save your name right now." }, { status: 500 });
  }
}
