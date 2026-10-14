import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, summarizeAccess, createPickToken } from "@/lib/auth";
import { TOPICS, DECK } from "@/lib/topics";
import { withRetry } from "@/lib/withRetry";

// Drawing a card is the "spend a credit" moment — charged here, before any
// reading text is ever sent to the client. Language switches on an already
// -picked card reuse the token this returns instead of hitting this route
// again, so they never re-charge.
//
// topicId is either a real 1-15 topic id, or the sentinel string "ai" —
// sent when lib/classify.js on the client couldn't map the question to any
// topic (or it wasn't typed in Hinglish/English/Hindi at all). In that case
// there's no topic to validate yet, so `card` is checked against the real
// deck instead, and the raw `question` is carried into the pick token for
// /api/reveal's AI fallback (lib/ai.js) to use.
export async function POST(req) {
  if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
    return NextResponse.json(
      { error: "Server isn't configured yet. Contact the site owner." },
      { status: 500 }
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }

  const { topicId, card, question } = await req.json().catch(() => ({}));
  const isAiFallback = topicId === "ai";
  const topic = isAiFallback ? null : TOPICS.find((t) => t.id === topicId);

  if (!card || !DECK.includes(card) || (!isAiFallback && !topic)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (isAiFallback && !String(question || "").trim()) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    // Single source of truth for the gate — summarizeAccess() applies
    // FREE_READING_LIMIT (0 since Oct 2026: no free readings) plus any
    // referral bonus. Never hard-code the limit here again.
    const { subscribed, hasAccess } = summarizeAccess(user);

    if (!hasAccess) {
      return NextResponse.json(
        { error: "limit_reached", ...summarizeAccess(user) },
        { status: 403 }
      );
    }

    // Only spend a credit for readers on the free tier — subscribers don't
    // need their usage counted at all.
    const updated = subscribed
      ? user
      : await withRetry(() =>
          prisma.user.update({
            where: { id: user.id },
            data: { readingsUsed: { increment: 1 } },
          })
        );

    const pickToken = createPickToken({
      userId: user.id,
      topicId: isAiFallback ? "ai" : topic.id,
      card,
      question: isAiFallback ? question : undefined,
    });

    return NextResponse.json({
      allowed: true,
      pickToken,
      access: summarizeAccess(updated),
    });
  } catch (err) {
    console.error("Pick failed:", err);
    Sentry.captureException(err, { tags: { area: "reading-pick" } });
    return NextResponse.json({ error: "Couldn't draw a card right now. Please try again." }, { status: 500 });
  }
}
