// Transactional email via Resend's HTTP API (https://resend.com) — no SDK
// needed, it's one POST. Used for password-reset links; nothing else in
// the app sends email.
//
// Env vars:
//   RESEND_API_KEY  required to send at all. Without it, isEmailConfigured()
//                   is false and callers show a "not set up yet" message
//                   rather than pretending a mail went out.
//   EMAIL_FROM      optional. Must be on a domain verified in Resend, e.g.
//                   "Ginni Ki Baatein <ginni@thedivinetarotonline.com>".
//                   Defaults to Resend's shared test sender, which only
//                   delivers to the Resend account's own address — fine for
//                   trying it out, useless in production.

const DEFAULT_FROM = "Ginni Ki Baatein <onboarding@resend.dev>";

export function isEmailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend responded ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}

// Bulk send (newsletter). Resend's batch endpoint takes up to 100 messages
// per call; callers chunk. Each message carries List-Unsubscribe headers so
// Gmail/Apple show their own one-click unsubscribe — required for bulk
// senders and good for deliverability.
export async function sendEmailBatch(messages) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (messages.length > 100) throw new Error("sendEmailBatch: max 100 per call");
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(
      messages.map((m) => ({
        from,
        to: [m.to],
        subject: m.subject,
        html: m.html,
        text: m.text,
        headers: m.unsubscribeUrl
          ? { "List-Unsubscribe": `<${m.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
          : undefined,
      }))
    ),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend batch responded ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}

// Keeps an email in Resend's contact list after the account itself is
// deleted (client's rule: a lapsed or never-paid account is removed from the
// database, but the address is kept for win-back mail). Uses the same
// RESEND_API_KEY as everything else; RESEND_SEGMENT_ID (optional) also files
// the contact into that segment, e.g. one named "Ginni — lapsed".
//
// Returns true when Resend holds the contact afterwards — including when it
// was already there — and false otherwise, so the caller can leave the
// account in place rather than lose the email.
export async function saveContactToResend({ email, name, unsubscribed = false }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const first = String(name || "").trim().split(/\s+/)[0] || undefined;
  const segment = process.env.RESEND_SEGMENT_ID;
  const res = await fetch("https://api.resend.com/contacts", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      first_name: first,
      unsubscribed,
      ...(segment ? { segments: [{ id: segment }] } : {}),
    }),
  });
  if (res.ok) return true;
  const detail = await res.text().catch(() => "");
  // Resend doesn't document the duplicate case; treat "already exists" in
  // any form as success — the address is in Resend either way.
  if (res.status === 409 || /already exist/i.test(detail)) return true;
  console.error(`saveContactToResend: Resend responded ${res.status}: ${detail.slice(0, 200)}`);
  return false;
}

// The reset email itself. Plain, brand-coloured, works in every client —
// one button plus the raw link for people whose mail app strips buttons.
export function passwordResetEmail({ name, link, minutes }) {
  const greet = name ? `Namaste ${name},` : "Namaste,";
  const subject = "Reset your Ginni Ki Baatein password";
  const text = [
    greet,
    "",
    "Someone (hopefully you) asked to reset the password for your Ginni Ki Baatein account.",
    `Open this link to choose a new password — it works for ${minutes} minutes:`,
    link,
    "",
    "If you didn't ask for this, you can ignore this email; your password stays as it is.",
    "",
    "— The Divine Tarot",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#0b0b0f;font-family:Inter,Arial,sans-serif;color:#eaeaf0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0b0f;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#1a1a1a;border:1px solid rgba(255,255,255,0.10);border-radius:16px;padding:32px;">
        <tr><td style="font-family:Georgia,'Playfair Display',serif;font-size:22px;font-weight:700;color:#ffffff;padding-bottom:4px;">The Divine Tarot</td></tr>
        <tr><td style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#ffd700;padding-bottom:24px;">Ginni Ki Baatein</td></tr>
        <tr><td style="font-size:15px;line-height:1.6;padding-bottom:12px;">${escapeHtml(greet)}</td></tr>
        <tr><td style="font-size:15px;line-height:1.6;color:#a1a1aa;padding-bottom:24px;">Someone (hopefully you) asked to reset the password for your Ginni Ki Baatein account. Tap the button to choose a new one &mdash; the link works for ${minutes} minutes.</td></tr>
        <tr><td align="center" style="padding-bottom:24px;">
          <a href="${link}" style="display:inline-block;background:linear-gradient(to right,#ff4d4d,#ffd700);background-color:#f4c542;color:#000000;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:999px;">Reset my password</a>
        </td></tr>
        <tr><td style="font-size:12px;line-height:1.6;color:#7a7a7a;padding-bottom:8px;">If the button doesn't work, copy this link into your browser:</td></tr>
        <tr><td style="font-size:12px;line-height:1.6;word-break:break-all;"><a href="${link}" style="color:#ffe4a8;">${link}</a></td></tr>
        <tr><td style="font-size:12px;line-height:1.6;color:#7a7a7a;padding-top:24px;">If you didn't ask for this, ignore this email &mdash; your password stays as it is.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
