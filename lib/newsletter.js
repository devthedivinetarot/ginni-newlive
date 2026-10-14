import crypto from "crypto";
import { DECK, cardSlug } from "@/lib/topics";
import { parseCardText } from "@/lib/parseReading";
import UNIVERSE from "@/data/universe_guidance.json";

// "Divine Insights" newsletter — card of the day, three times a week.
//
// Content comes entirely from data/universe_guidance.json (the same
// "Universe kehna chahta hai…" messages the app uses), so an issue costs
// nothing to produce and never depends on an AI key. Which card goes out
// is a pure function of the date, so every server/run agrees, previews
// match what gets sent, and a re-run never picks a different card.

export const NEWSLETTER_NAME = "Divine Insights";
export const IST_OFFSET_MIN = 330;

// YYYY-MM-DD in India time — the issue key and the thing the card is
// seeded from, so "today" means today for the subscribers, not for UTC.
export function istDateKey(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MIN * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

// A fixed shuffle of the deck (seeded, so it's the same forever) and then
// day-of-epoch modulo 78. Mon/Wed/Fri sends step through that order with
// gaps of 2/2/3 days, so no card repeats inside a 78-day window (~33
// issues) and the sequence doesn't read as the deck's printed order.
const ORDER = (() => {
  const arr = [...DECK];
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 0x100000000;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
})();

export function cardForDate(date = new Date()) {
  const key = istDateKey(date);
  const days = Math.floor(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / 86400000);
  return ORDER[((days % ORDER.length) + ORDER.length) % ORDER.length];
}

export function buildIssue(date = new Date()) {
  const card = cardForDate(date);
  const raw = UNIVERSE[card] || "";
  const p = parseCardText(raw);
  // Strip the shouted card name the source files start with ("THE FOOL").
  const clean = (t) => (t || "").replace(new RegExp("^\\s*" + card.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\n?", "i"), "").trim();
  return {
    issueKey: istDateKey(date),
    card,
    slug: cardSlug(card),
    text: { hinglish: clean(p.hinglish), english: clean(p.english), hindi: clean(p.hindi) },
  };
}

// ---------- unsubscribe tokens ----------
// HMAC of the email with SESSION_SECRET — nothing to store, can't be
// forged for someone else's address, and survives forever (a link in an
// old email still works).
export function unsubscribeToken(email) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return crypto.createHmac("sha256", secret).update(String(email).trim().toLowerCase()).digest("hex").slice(0, 32);
}
export function verifyUnsubscribeToken(email, token) {
  if (!email || !token) return false;
  const expected = unsubscribeToken(email);
  const a = Buffer.from(String(token)), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function unsubscribeUrl(appUrl, email) {
  const u = new URL("/api/newsletter/unsubscribe", appUrl);
  u.searchParams.set("email", email);
  u.searchParams.set("token", unsubscribeToken(email));
  return u.toString();
}

// ---------- email rendering ----------
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function para(t) {
  return esc(t).replace(/\n/g, "<br>");
}

export function renderNewsletterEmail({ issue, appUrl, unsubscribe }) {
  const img = `${appUrl.replace(/\/$/, "")}/cards/${issue.slug}.jpg`;
  const ask = `${appUrl.replace(/\/$/, "")}/?utm_source=newsletter&utm_medium=email&utm_campaign=${issue.issueKey}`;
  const subject = `✨ Aaj ka card: ${issue.card} — Universe ka message aapke liye`;
  const preheader = (issue.text.hinglish || issue.text.english || "").split("\n")[0].slice(0, 110);

  const text = [
    `${NEWSLETTER_NAME} — ${issue.card}`,
    "",
    issue.text.hinglish,
    "",
    issue.text.english ? "English:\n" + issue.text.english : "",
    issue.text.hindi ? "\nहिंदी:\n" + issue.text.hindi : "",
    "",
    `Apna sawaal Ginni se poochhiye: ${ask}`,
    "",
    `Unsubscribe: ${unsubscribe}`,
  ].filter((l) => l !== null).join("\n");

  const section = (label, body) =>
    body
      ? `<tr><td style="padding-top:18px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#ffd700;">${label}</td></tr>
         <tr><td style="font-size:15px;line-height:1.7;color:#eaeaf0;padding-top:6px;">${para(body)}</td></tr>`
      : "";

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#0b0b0f;font-family:Inter,Arial,sans-serif;color:#eaeaf0;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0b0f;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">
        <tr><td align="center" style="padding-bottom:18px;">
          <div style="font-family:Georgia,'Playfair Display',serif;font-size:20px;font-weight:700;color:#ffffff;">The Divine Tarot</div>
          <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#ffd700;margin-top:2px;">${NEWSLETTER_NAME}</div>
        </td></tr>
        <tr><td>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.10);border-radius:16px;padding:28px 24px;">
            <tr><td align="center" style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a1a1aa;">Aaj ka card</td></tr>
            <tr><td align="center" style="font-family:Georgia,'Playfair Display',serif;font-size:28px;font-weight:700;color:#ffe4a8;padding:6px 0 18px;">${esc(issue.card)}</td></tr>
            <tr><td align="center" style="padding-bottom:22px;">
              <img src="${img}" width="160" alt="${esc(issue.card)}" style="width:160px;max-width:60%;height:auto;border-radius:10px;border:1px solid rgba(244,197,66,0.35);display:block;">
            </td></tr>
            <tr><td style="font-size:16px;line-height:1.7;color:#eaeaf0;">${para(issue.text.hinglish || issue.text.english)}</td></tr>
            ${section("English", issue.text.english)}
            ${section("हिंदी", issue.text.hindi)}
            <tr><td align="center" style="padding-top:28px;">
              <a href="${ask}" style="display:inline-block;background:linear-gradient(to right,#ff4d4d,#ffd700);background-color:#f4c542;color:#000000;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:999px;">Ask Ginni your question →</a>
            </td></tr>
            <tr><td align="center" style="font-size:12px;color:#7a7a7a;padding-top:12px;">Readings at just 199/- Rs · Monthly subscription · Hinglish, English &amp; हिंदी</td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="font-size:11px;line-height:1.7;color:#7a7a7a;padding-top:22px;">
          You're receiving this because you signed up for Divine Insights at thedivinetarotonline.com.<br>
          <a href="${unsubscribe}" style="color:#a1a1aa;">Unsubscribe</a> · The Divine Tarot
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html, text };
}

// ---------- WhatsApp (pluggable; skipped until configured) ----------
// Meta WhatsApp Cloud API. Marketing messages to subscribers must use an
// approved template; this sends WHATSAPP_TEMPLATE_NAME with two body
// parameters: {{1}} = card name, {{2}} = the Hinglish message (newlines
// collapsed — WhatsApp rejects them inside template parameters).
// Env: WHATSAPP_TOKEN (permanent system-user token), WHATSAPP_PHONE_NUMBER_ID,
//      WHATSAPP_TEMPLATE_NAME, optional WHATSAPP_TEMPLATE_LANG (default en).
export function isWhatsappConfigured() {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TEMPLATE_NAME);
}

export function normalizePhone(raw) {
  // "+91 98765 43210" / "9876543210" -> "919876543210" (India default)
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10) d = "91" + d;
  if (d.startsWith("0") && d.length === 11) d = "91" + d.slice(1);
  return d.length >= 11 && d.length <= 15 ? d : null;
}

export async function sendWhatsappIssue(phone, issue) {
  const to = normalizePhone(phone);
  if (!to) throw new Error("invalid phone");
  const body = (issue.text.hinglish || issue.text.english || "").replace(/\s*\n+\s*/g, " ").slice(0, 900);
  const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: process.env.WHATSAPP_TEMPLATE_NAME,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en" },
        components: [{ type: "body", parameters: [{ type: "text", text: issue.card }, { type: "text", text: body }] }],
      },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return res.json();
}
