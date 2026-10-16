# Ginni Ki Baatein — Tarot Chat (Next.js)

A private tarot counsel web app, themed to match thedivinetarotonline.com:
email/password accounts, name + language onboarding, a mobile-friendly
chip-bar / sidebar menu of 15 questions, a real 78-card spread with official
card art, and readings pulled from the JSON source files in `/data` —
original entries are never rewritten, only appended to or added when a card
was genuinely missing.

3 readings are free per account; after that, a ₹199/month paywall unlocks
unlimited access via Razorpay. Access is enforced server-side against a
real database — see "Accounts & server-side enforcement" below for exactly
what that means and what it doesn't.

## Run locally

```bash
npm install                          # also runs `prisma generate`
cp .env.local.example .env.local     # then fill in DATABASE_URL, SESSION_SECRET, Razorpay keys
npx prisma migrate dev --name init   # creates the User/Order tables
npm run dev
```

Open http://localhost:3000. First run will ask you to create an account
(email + password) before showing the onboarding screen.

## Build for production

```bash
npm run build
npm run start
```

Make sure `DATABASE_URL`, `SESSION_SECRET`, `RAZORPAY_KEY_ID`, and
`RAZORPAY_KEY_SECRET` are set in your hosting provider's environment
variables (e.g. Vercel project settings) — `.env.local` is gitignored and
never gets deployed automatically. Run `npx prisma migrate deploy` against
your production database before the first deploy.

Optional: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, **or** `GEMINI_API_KEY` —
only needed if you want real per-question AI writing (see "AI fallback"
below). None of these are required, and leaving all three unset is the
recommended default for a free deployment: without a key, an unmatched
question still always gets a real reading, just from this app's own data
instead of an external call.

## AI fallback for unmatched/non-Hinglish questions

By default — **no AI provider key configured, which is the recommended
setup for a $0 deployment** — `lib/classify.js`'s free keyword matcher is
the only thing that runs for a typed question, and when it can't map one
to any of the 15 topics, `lib/localFallback.js` guarantees a real, relevant
reading anyway: it takes this app's own "Universe Message" reading for the
card that was drawn (broadly-applicable guidance, one of the 15 topics
already in your data) and wraps it with a line that echoes the seeker's
own question back to them. Zero API calls, zero cost, always available —
"the system must respond to every question" holds true with no external
service involved at all.

If you ever do want real per-question AI writing instead, set
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY` and it's used
automatically — `/api/reveal/route.js` tries AI first and only falls back
to the local reading above if no key is configured or the AI call itself
fails. Priority if more than one is set: Anthropic, then OpenAI, then
Gemini (`lib/ai.js`'s `getProvider()`). When AI is used, it's shown the
drawn card, the seeker's exact question, and all 13 of this app's own
existing readings for that card, and asked to translate whichever one
actually answers the question (staying faithful to it) or, only if none
fit, write an original reading — one API call either way. Language-
toggling the sidebar afterward is deliberately a no-op for an AI-generated
reading (`RevealCard.jsx`'s `aiMode` prop) — it already matches the
language the question was asked in, so re-running it would just spend
another call for a near-identical result. Known limitation: no caching, so
a page refresh mid-AI-reading calls the API again rather than replaying
the first result.

Pure small talk — "hi," "thanks," a greeting with nothing else in it — is
handled separately and before any of this: `isOffTopicChitchat()` in
`lib/classify.js` catches it, and Ginni replies in character with no card
drawn and no credit spent (see `CHITCHAT_REPLIES` in `ChatPanel.jsx`).
Anything with real content alongside a greeting ("hi, when will I get
married?") still gets a full reading — the check is deliberately
conservative so a genuine question is never brushed off.

## Chat history

The last ~30 messages per account are saved and reloaded on login
(`app/api/chat/history/route.js`, `app/api/chat/messages/route.js`) — kept
small on purpose rather than growing forever. A saved "reveal" message
stores the finished reading text directly, not the pick token (which
expires in 20 minutes) — `components/RevealCard.jsx`'s `resolvedText` prop
renders it with no re-fetch. Saving never blocks or errors the live chat:
if it fails, the conversation keeps working locally, that one message just
won't be there next time.

**Requires a new database table.** Run this once — Supabase dashboard →
SQL Editor → New query → paste and run:

```sql
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT,
    "card" TEXT,
    "aiMode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatMessage_userId_createdAt_idx" ON "ChatMessage"("userId", "createdAt");

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

This is the same SQL as `prisma/migrations/20260921090000_add_chat_messages/migration.sql` — that file exists so `npx prisma migrate deploy` picks it up too if you ever run migrations that way instead.

## Error tracking (optional)

Set `SENTRY_DSN` (server errors) and/or `NEXT_PUBLIC_SENTRY_DSN` (browser
errors — same DSN value works for both, Sentry DSNs are safe to expose
client-side) to get real error reports instead of only Vercel's raw logs.
Sign up free at sentry.io, create a Next.js project, copy its DSN. Unset
by default — nothing about the build or runtime changes if you skip this.

Beyond Next.js's own automatic instrumentation (which has a known gap
under Turbopack for route handlers specifically — see
`sentry.server.config.js`'s comment), every catch block that's actually
been the source of a real bug in this app also calls
`Sentry.captureException()` explicitly: `lib/auth.js`'s `getSessionUser`,
both auth routes, `/api/reading/pick`, `/api/reveal`, both chat routes,
and the payment routes. That's deliberate — it's what would have turned
the pgbouncer/login investigation earlier in this project into a five-
minute Sentry lookup instead of many rounds of manually hunting through
Vercel's logs.

## Accounts & server-side enforcement

Every visitor now needs an account (email + password) before they can do
anything. This isn't just a login screen bolted on top — it's what makes
the paywall actually real:

- **Reading content never ships to the browser until it's been paid for or
  is within the free limit.** `lib/readings.js` (which imports every JSON
  file in `/data`) is only ever imported by server-side API routes
  (`app/api/reveal/route.js`) — no client component imports it anymore. A
  visitor's browser has no way to see interpretation text for a card they
  haven't picked and been authorized for, because it was never sent to
  them, not because it's merely hidden.
- **The free-reading count and subscription status live in the database**
  (`User.readingsUsed`, `User.subscriptionExpires`), keyed to the logged-in
  account — not in browser storage. Clearing cookies or switching devices
  doesn't reset anything; the same account still has the same usage.
- **The "charge" happens before content is served, not after.** Drawing a
  card calls `POST /api/reading/pick`, which checks access and — for
  free-tier users — increments `readingsUsed` in the database, *then*
  issues a short-lived signed token (`lib/auth.js: createPickToken`) that
  authorizes exactly that one card's reveal. `GET /api/reveal` only returns
  text if it receives a valid, unexpired token for that specific pick.
  Switching languages on an already-revealed card re-fetches with the same
  token (no re-charge); drawing a *new* card always goes through
  `/api/reading/pick` again, so the limit can't be bypassed by re-fetching.
- **Payments are verified server-side against a real database, tied to the
  logged-in user.** `/api/verify-payment` re-derives the Razorpay signature
  itself, confirms the order belongs to the current session's user, checks
  it hasn't already been credited, and only then extends
  `subscriptionExpires` — nothing about "is this user subscribed" is ever
  decided by trusting anything the client sends.

**What this still doesn't cover** (real, worth knowing before relying on
it):
- **No account recovery / "forgot password" flow yet.** If someone loses
  their password, there's currently no way for them to reset it — that's a
  straightforward addition (send a reset-token email) but isn't built.
- **No email verification.** Signup accepts any email address without
  confirming the person owns it.
- **"Monthly" is a 30-day unlock you pay for again, not true auto-recurring
  billing.** Real auto-debit (Razorpay Subscriptions API with UPI
  Autopay/eMandate) needs separate business KYC approval from Razorpay and
  more integration work.
- **Rate limiting isn't implemented.** Nothing currently stops someone from
  scripting repeated signups with throwaway emails to keep getting 3 fresh
  free readings. Real mitigation needs either email verification, phone
  verification, or IP/device-based rate limiting on `/api/auth/signup`.


## Forgot password / reset

"Forgot your password?" on the login screen emails a one-time reset link.

- `POST /api/auth/forgot-password` `{ email }` — always answers with the same
  message whether or not the address has an account (no email enumeration).
  If it does, a 32-byte random token is generated, only its SHA-256 hash is
  stored (`PasswordResetToken` table, 30-minute expiry, max 3 per account per
  hour), and the raw token goes out in the link
  `https://<this deployment>/reset-password?token=…`.
- `GET /api/auth/reset-password?token=…` — `{ valid }`, so the page can say
  "expired" up front. `POST` `{ token, password }` sets the new password,
  burns that token and every other outstanding one for the account, and logs
  the person in.
- `app/reset-password/page.js` — the page the link opens.

**Email sending** uses Resend's HTTP API (`lib/email.js`, no SDK). Env vars:

- `RESEND_API_KEY` — required. Without it the forgot-password form shows
  "reset emails aren't set up yet" instead of silently doing nothing.
- `EMAIL_FROM` — e.g. `Ginni Ki Baatein <ginni@thedivinetarotonline.com>`.
  The domain must be verified in Resend (Domains → add
  thedivinetarotonline.com → add the DNS records it gives you). Until then
  the default `onboarding@resend.dev` sender only delivers to the Resend
  account's own email address.
- `APP_URL` — optional; the link normally uses the request's own origin.

**New migration required** — run
`prisma/migrations/20261001090000_add_password_reset/migration.sql` once in
Supabase's SQL Editor (or `npx prisma migrate deploy`) before the feature
goes live; without the table the forgot-password request fails with a 500.

## Deploying from the shared repo (devthedivinetarot/ginni-newlive)

The client's Vercel project is on a **Hobby** account and the repo is
**private**, so Vercel blocks every deployment attributed to a commit author
who isn't the account owner — Git-integration deployments *and* Deploy
Hooks both show as **Blocked**. Deployments therefore run from GitHub
Actions with the Vercel CLI (`.github/workflows/deploy-vercel.yml`): the
runner builds the app and uploads the result with a Vercel token, which
isn't tied to a Git author. `vercel.json` turns the automatic Git
deployments for `main` off so the dashboard stays clean.

One-time setup, three repository secrets on GitHub (Settings → Secrets and
variables → Actions), values from the **client's** Vercel account:
`VERCEL_TOKEN` (vercel.com/account/settings/tokens), `VERCEL_ORG_ID` and
`VERCEL_PROJECT_ID` (both under the project's Settings → General). App env
vars stay in the Vercel project; the workflow pulls them for the build.

Alternatives if preferred: make the repo public (Hobby allows outside
authors on public repos) or upgrade the Vercel account to Pro and add the
developer as a member — then the normal Git integration works and this
workflow can be deleted.

## Account cleanup (automated, daily)

Client's rule (Oct 2026): anyone who signs up and does not subscribe within
24 hours is deleted, so the database only ever holds paying readers plus the
24-hour grace window.

- **Schedule**: `vercel.json` → `crons` → `/api/cron/cleanup-accounts` at
  `0 21 * * *` UTC = **2:30 AM IST daily**. Vercel calls it with
  `Authorization: Bearer $CRON_SECRET`. Hobby crons run once a day, so an
  account is removed 24–48 hours after signup.
- **Rule** (`app/api/cron/cleanup-accounts/route.js`): `subscriptionExpires`
  is NULL (never subscribed — a lapsed subscriber keeps their account and
  can renew) **and** `createdAt` is older than 24 h **and** the email is not
  in `CLEANUP_PROTECTED_EMAILS` (comma-separated; defaults to the dev and
  demo accounts).
- Deletes the user's orders, chat history and reset tokens with them, in
  one transaction; referral links pointing at a deleted user are cleared.
- **Dry run** before trusting it: `curl -H "Authorization: Bearer $CRON_SECRET"
  "$APP_URL/api/cron/cleanup-accounts?dry=1"` lists the emails it would
  remove. `?limit=N` caps a single run (default 500).

## Divine Insights newsletter (automated, Mon/Wed/Fri)

Card-of-the-day emails to everyone in `NewsletterSubscriber` (the footer
"Get Daily Divine Insights" form), three times a week.

- **Schedule**: `vercel.json` → `crons` → `/api/cron/newsletter` at
  `30 2 * * 1,3,5` UTC = **8:00 AM IST Mon/Wed/Fri**. Vercel calls it with
  `Authorization: Bearer $CRON_SECRET`. (Hobby plan: cron timing can drift
  within the hour; fine for this.)
- **Content** (`lib/newsletter.js`): the card is a pure function of the IST
  date (seeded deck order, day-of-epoch mod 78), so previews match sends and
  no card repeats within ~33 issues. Text is the card's Universe Message
  from `data/universe_guidance.json` in Hinglish, English and Hindi — ₹0
  per issue, no AI key involved. Email links carry
  `utm_campaign=<issue date>`.
- **Email**: Resend batch API (100 per call) with `List-Unsubscribe` /
  one-click headers. Footer link → `/api/newsletter/unsubscribe` →
  `/newsletter/unsubscribed`. Unsubscribe tokens are an HMAC of the email
  with `SESSION_SECRET` (nothing stored, can't be forged).
- **Idempotent**: one `NewsletterIssue` row per IST date; a second run the
  same day is a no-op unless `?force=1`. `?dry=1` builds everything and
  sends nothing (returns the counts).
- **WhatsApp**: `sendWhatsappIssue()` uses Meta's WhatsApp Cloud API with an
  approved template (`{{1}}` card name, `{{2}}` message). It runs
  automatically once `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` and
  `WHATSAPP_TEMPLATE_NAME` (optional `WHATSAPP_TEMPLATE_LANG`) are set;
  until then the step is skipped and the run reports `whatsappSkipped`.
- **Preview** an issue in the browser:
  `/api/newsletter/preview?key=<CRON_SECRET>&date=2026-10-03`.

Env vars: `CRON_SECRET` (any long random string — Vercel sends it on cron
calls automatically once set), `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`
(used for image + link URLs in the email; falls back to the request origin).

**New migration required** —
`prisma/migrations/20261001120000_add_newsletter_automation/migration.sql`
(adds `unsubscribedAt`/`lastEmailAt`/`lastWhatsappAt` and the
`NewsletterIssue` table). Run it in Supabase before the first scheduled send.

## Structure

- `app/page.js` — top-level screen switcher (auth → onboarding → app)
- `app/layout.js` — fonts, global shell, Razorpay checkout script
- `app/globals.css` — all design tokens, styles, and animations
- `app/api/auth/signup/route.js`, `login/route.js`, `logout/route.js`,
  `me/route.js` — account creation, login, logout, and session check
- `app/api/reading/pick/route.js` — checks access, charges a free-tier
  credit if applicable, issues a one-time reveal token
- `app/api/reveal/route.js` — the only place reading text is ever read from
  `/data` and sent to a client, gated on a valid pick token
- `app/api/create-order/route.js` — creates a Razorpay order for the logged
  -in user (server-side)
- `app/api/verify-payment/route.js` — verifies a Razorpay payment signature
  and extends that user's subscription in the database
- `components/AuthGate.jsx` — login/signup screen shown before anything else
- `components/Onboarding.jsx` — name + language capture (after auth)
- `components/Sidebar.jsx` — desktop sidebar + mobile top bar/chip bar for
  the 15 questions, plus logout
- `components/ReadingPanel.jsx` — spread, draw (via `/api/reading/pick`),
  and paywall-gating logic
- `components/Paywall.jsx` — the ₹199/month upgrade screen + checkout flow
- `components/TarotCard.jsx` — the flippable card
- `components/RevealCard.jsx` — fetches and shows one revealed card's
  reading via `/api/reveal`
- `lib/topics.js` — the 78-card deck + the 15 topic definitions
- `lib/readings.js` — imports all 13 JSON reading files; **only imported by
  `app/api/reveal/route.js`**, never by client components
- `lib/parseReading.js` — language-aware parser for the raw reading text
- `lib/auth.js` — password hashing, session cookies, pick tokens
- `lib/db.js` — the shared Prisma client
- `prisma/schema.prisma` — `User` and `Order` table definitions
- `lib/ginni.js` — Ginni's greeting/closing voice lines
- `data/*.json` — the reading content itself, unmodified except where noted
  in chat history (a handful of genuinely missing cards/translations added)

## Payment module — ₹199/month, no free readings

**Policy (client decision, Oct 2026):** `FREE_READING_LIMIT` in `lib/auth.js`
is `0` — every account needs the monthly subscription from the first
reading. The wording everywhere (banner above the composer, paywall modal,
Ginni's message) is *"Get your reading at just 199/- Rs (Monthly
subscription)"*. Referral bonus readings still stack on top of the limit, so
a referred friend's subscription still earns both sides 3 readings.

**Setup:**
1. Create a Postgres database. Any host works (Neon, Vercel Postgres,
   Railway), but **if you're using Supabase**: go to Project Settings →
   Database → "Connect" (or "Connection string"). Supabase shows three
   tabs there — **Direct connection**, **Transaction pooler**, and
   **Session pooler**. Use only the pooler ones:
   - **Transaction pooler** (port 6543) → `DATABASE_URL`
   - **Session pooler** (port 5432) → `DIRECT_URL`

   **Do not use "Direct connection"** (`db.<project-ref>.supabase.co`) for
   either variable, even though it's the first/most obvious option and
   also happens to use port 5432 — it's IPv6-only unless you've bought
   Supabase's IPv4 add-on, and Vercel's serverless functions only have
   IPv4 egress, so that host is simply unreachable from a Vercel
   deployment. This produces a `PrismaClientInitializationError: Can't
   reach database server` error that has nothing to do with your
   password, your schema, or your code — only the pooler hostnames work
   from Vercel.

   Also don't use the Project URL / anon key / service_role key shown
   elsewhere in that dashboard — those are for Supabase's separate REST
   API, which this app doesn't call at all.
2. Get API keys from your [Razorpay dashboard](https://dashboard.razorpay.com/app/keys)
   (start in test mode). The env var names must be exactly
   `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
3. Copy `.env.local.example` to `.env.local` and fill in `DATABASE_URL`,
   `DIRECT_URL`, `SESSION_SECRET` (any long random string — e.g.
   `openssl rand -base64 32`), and the two Razorpay keys.
4. Run `npx prisma migrate dev --name init` to create the tables.
5. Add all five variables in your hosting provider's environment variable
   settings before deploying — `.env.local` is gitignored and never gets
   deployed automatically. Run `npx prisma migrate deploy` against the
   production database too (this uses `DIRECT_URL`).
6. Test with [Razorpay's test cards](https://razorpay.com/docs/payments/payments/test-card-details/)
   before switching to live keys.

**If you ever paste a real secret (API key, database password) into a chat,
treat it as compromised — rotate/regenerate it from the provider's
dashboard afterward, even if the conversation is private.**

**How it works:** see "Accounts & server-side enforcement" above — the
short version is that access is checked and charged in the database before
any reading content is served, and payments are verified server-side before
a subscription is granted. The two honest limitations (30-day unlock
instead of true auto-billing, and no rate limiting on signups yet) are also
listed there.

### Referrals — 3 free readings for both sides

Every account gets a unique `referralCode` (generated at signup,
`lib/referral.js`) and a shareable link in the form `yoursite.com/?ref=CODE`
— visible via "Invite a friend" in the sidebar (`InviteModal.jsx`). When
someone signs up through that link, their `referredByUserId` is recorded
(`app/api/auth/signup/route.js`); an unrecognized or missing code is never
an error, signup just proceeds without crediting anyone.

The reward — `REFERRAL_BONUS_READINGS` (3, `lib/auth.js`) for **both** the
referrer and the new subscriber — is only granted once, at the moment the
referred friend's *first* subscription payment is verified
(`app/api/verify-payment/route.js`), guarded by a `referralRewarded` flag so
it can never fire again on a renewal. Signing up alone doesn't trigger
anything — matching "when a friend... subscribes," not just registers.

`bonusReadings` adds on top of the normal free-reading limit (now 0) rather than
resetting it (`lib/auth.js`'s `summarizeAccess`, and the same check in
`/api/reading/pick`), so it stacks cleanly across multiple referrals and
never interferes with a user's actual usage count.

## Language parsing

`lib/parseReading.js` recognises every language-label style found across the
original 13 source files — inline colon labels (`Hinglish:`, `English:`,
`HINDI:`, `Devanagari Hinglish:`, common misspellings like
`Hinid:`/`HINDIN:`), and whole-line labels with no colon (`ENGLISH`,
`हिंदी`, etc.). For a handful of cards that stacked all three languages
back-to-back with no labels at all, it splits them by detecting Devanagari
vs. Latin script rather than relying on wording. As of that content pass,
every card in every one of those 15 questions resolves to real text in all
three languages — verified by running the parser against every file, not
by inspection. The newer 16th topic, Career (`data/career_guidance.json`),
is Hinglish-only for now — it uses the same graceful single-language
fallback several original cards already relied on (see
`SINGLE_LANG_NOTE` in `RevealCard.jsx`), rather than a special case.

## AI fallback for unmatched/non-Hinglish questions

`lib/classify.js`'s free keyword matcher is the first and only pass for
anything typed in Hinglish/English/Hindi that maps cleanly to one of the 16
topics — no AI, no cost. It only hands off further in two cases: the
question doesn't match any of the 15 topics' keyword rules, or
`looksNonLatinScript()` flags the text as mostly outside the Latin-alphabet
range. See the "AI fallback" section near the top of this file for what
happens next — by default that's the free local reading, not AI.

## Spread & draw behaviour

- The full 78-card deck is shown, reshuffled on every topic open and on
  every "Draw again." Cards fade in with a staggered, scattered-spread
  entrance animation.
- Picking a card flips it in place with a glow-pulse and grow animation,
  then reveals its real card art alongside the reading.
- All animation respects `prefers-reduced-motion: reduce`.

## Card art

`public/cards/` has all 78 official card images (from the same source as
the parent site's live deck), named to match `cardSlug()` in `lib/topics.js`
(e.g. `the-fool.png`). `RevealCard.jsx` and `TarotCard.jsx` show the
matching image, with a plain-text fallback if a specific file is ever
missing.

## Site header & footer

`components/SiteHeader.jsx` and `components/SiteFooter.jsx` are the global
brand chrome, matched to thedivinetarotonline.com's own header/footer
(same nav items, same "Ask your question here" CTA, same footer columns,
socials, newsletter form, and trust row — colors pulled from the live
site's own footer source).

They wrap **every screen** — login, onboarding, and the active reading
session — via the `.site-page` wrapper in `app/page.js`. Since `SiteHeader`
is sticky and the reading app's own `Sidebar`/`#app` grid was originally
built to fill the full viewport on its own, `globals.css` has a matching
`.site-page #app` / `.site-page .sidebar` override that subtracts the
header's height (`--site-header-h`, 80px) so the app still fits exactly
below it instead of overflowing by 80px. The same subtraction is applied
to the app's own mobile sticky bars (`.mobile-topbar`, `.chip-bar`,
`.mobile-settings-panel`), which otherwise assumed they were the topmost
thing on the page. `SiteFooter` sits below the app in normal document
flow — reachable by scrolling past the reading screen, not squeezed into
the viewport with it.

Worth knowing: on narrow screens this now stacks `SiteHeader`'s own
compact bar (logo + hamburger) directly above `Sidebar`'s mobile bar
(logo + "Ginni Ki Baatein" + settings), so there are two brand rows before
the reading content on mobile. Nothing overlaps, but if that reads as too
much chrome, the fix is either hiding `SiteHeader` specifically on the
active-session screen again (revert to wrapping only `AuthGate`/
`Onboarding`) or trimming `Sidebar`'s own mobile bar down to just the
settings control once `SiteHeader` is always present.

Since this app lives on its own subdomain, every nav item that isn't
Reading, Course, or Personal Reading (each already a separate subdomain)
resolves back to `https://thedivinetarotonline.com/...` rather than
routing inside this app — there's no local `/about`, `/kundli-milan`, or
`/privacy` page here. Change `MAIN_SITE`/`READING_SITE` at the top of
either component if those domains ever change.

The footer's "Get Daily Divine Insights" form posts to `app/api/subscribe`,
which upserts into a new `NewsletterSubscriber` table. Run this once after
pulling these changes:

```bash
npx prisma migrate dev --name add_newsletter_subscriber
```

## Mobile layout

Under 820px, the sidebar becomes a sticky top bar plus a horizontally
scrollable chip bar listing all 15 questions — nothing is hidden behind a
hamburger menu. The "choose a question" empty state also renders the full
question list as tappable cards, so it's visible without relying on the
chip bar alone. Language switching and "start over" live behind a small
avatar-icon popover in the top-right, since those are secondary controls.
