import { buildIssue, renderNewsletterEmail, unsubscribeUrl } from "@/lib/newsletter";

// Renders the email for a given date in the browser, so an issue can be
// checked before it goes out. Protected like the cron route:
//   /api/newsletter/preview?key=<CRON_SECRET>&date=2026-10-03
export const dynamic = "force-dynamic";

export async function GET(req) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || url.searchParams.get("key") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  const dateParam = url.searchParams.get("date");
  const date = dateParam ? new Date(dateParam + "T06:00:00Z") : new Date();
  const appUrl = process.env.APP_URL || url.origin;
  const issue = buildIssue(date);
  const { html, subject } = renderNewsletterEmail({ issue, appUrl, unsubscribe: unsubscribeUrl(appUrl, "preview@example.com") });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "X-Subject": encodeURIComponent(subject) } });
}
