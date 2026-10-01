import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRetry } from "@/lib/withRetry";
import { isEmailConfigured, sendEmailBatch } from "@/lib/email";
import {
  buildIssue,
  renderNewsletterEmail,
  unsubscribeUrl,
  isWhatsappConfigured,
  sendWhatsappIssue,
} from "@/lib/newsletter";

// Vercel Cron hits this (schedule in vercel.json: 02:30 UTC = 08:00 IST,
// Mon/Wed/Fri) with "Authorization: Bearer <CRON_SECRET>". Anyone else
// needs the same header. ?force=1 re-sends today's issue even if it was
// already sent (for testing); ?dry=1 builds everything and sends nothing.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BATCH = 100;

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const h = req.headers.get("authorization") || "";
  return h === `Bearer ${secret}`;
}

export async function GET(req) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const dry = url.searchParams.get("dry") === "1";
  const appUrl = process.env.APP_URL || url.origin;

  if (!isEmailConfigured()) {
    return NextResponse.json({ error: "RESEND_API_KEY is not set — nothing sent." }, { status: 503 });
  }

  const issue = buildIssue(new Date());
  if (!issue.text.hinglish && !issue.text.english) {
    return NextResponse.json({ error: `No content for card ${issue.card}` }, { status: 500 });
  }

  try {
    // Idempotency: one row per IST date. A second cron fire (or a manual
    // hit) finds the row and stops, unless ?force=1.
    const existing = await withRetry(() => prisma.newsletterIssue.findUnique({ where: { issueKey: issue.issueKey } }));
    if (existing?.finishedAt && !force) {
      return NextResponse.json({ ok: true, alreadySent: true, issueKey: issue.issueKey, card: issue.card, emailSent: existing.emailSent });
    }
    if (!dry) {
      await withRetry(() =>
        prisma.newsletterIssue.upsert({
          where: { issueKey: issue.issueKey },
          create: { issueKey: issue.issueKey, card: issue.card },
          update: { card: issue.card, finishedAt: null },
        })
      );
    }

    const subscribers = await withRetry(() =>
      prisma.newsletterSubscriber.findMany({
        where: { unsubscribedAt: null },
        select: { id: true, email: true, phone: true },
        orderBy: { createdAt: "asc" },
      })
    );

    // ---- email ----
    let emailSent = 0, emailFailed = 0;
    const errors = [];
    for (let i = 0; i < subscribers.length; i += BATCH) {
      const chunk = subscribers.slice(i, i + BATCH);
      const messages = chunk.map((s) => {
        const unsubscribe = unsubscribeUrl(appUrl, s.email);
        const mail = renderNewsletterEmail({ issue, appUrl, unsubscribe });
        return { to: s.email, unsubscribeUrl: unsubscribe, ...mail };
      });
      if (dry) { emailSent += messages.length; continue; }
      try {
        await sendEmailBatch(messages);
        emailSent += chunk.length;
        await withRetry(() =>
          prisma.newsletterSubscriber.updateMany({ where: { id: { in: chunk.map((s) => s.id) } }, data: { lastEmailAt: new Date() } })
        );
      } catch (err) {
        emailFailed += chunk.length;
        errors.push(String(err.message || err).slice(0, 200));
        console.error("newsletter batch failed:", err);
        Sentry.captureException(err, { tags: { area: "newsletter-email" } });
      }
    }

    // ---- WhatsApp (only once credentials + an approved template exist) ----
    let whatsappSent = 0, whatsappFailed = 0, whatsappSkipped = false;
    if (isWhatsappConfigured() && !dry) {
      for (const s of subscribers.filter((x) => x.phone)) {
        try {
          await sendWhatsappIssue(s.phone, issue);
          whatsappSent++;
          await withRetry(() => prisma.newsletterSubscriber.update({ where: { id: s.id }, data: { lastWhatsappAt: new Date() } }));
        } catch (err) {
          whatsappFailed++;
          if (errors.length < 10) errors.push("wa: " + String(err.message || err).slice(0, 160));
        }
      }
    } else {
      whatsappSkipped = true;
    }

    if (!dry) {
      await withRetry(() =>
        prisma.newsletterIssue.update({
          where: { issueKey: issue.issueKey },
          data: { emailSent, emailFailed, whatsappSent, whatsappFailed, finishedAt: new Date() },
        })
      );
    }

    return NextResponse.json({
      ok: emailFailed === 0,
      dry,
      issueKey: issue.issueKey,
      card: issue.card,
      subscribers: subscribers.length,
      emailSent, emailFailed,
      whatsappSent, whatsappFailed, whatsappSkipped,
      errors,
    });
  } catch (err) {
    console.error("newsletter cron failed:", err);
    Sentry.captureException(err, { tags: { area: "newsletter-cron" } });
    return NextResponse.json({ error: "Newsletter run failed: " + String(err.message || err).slice(0, 200) }, { status: 500 });
  }
}
