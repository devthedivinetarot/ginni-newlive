"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DECK, TOPICS, cardSlug } from "@/lib/topics";
import { shuffle } from "@/lib/parseReading";
import { getGreeting, getClosing } from "@/lib/ginni";
import { classifyQuestion, looksNonLatinScript, isOffTopicChitchat } from "@/lib/classify";
import { buildShareImage, shareOrDownloadImage } from "@/lib/shareImage";
import DrawOverlay from "./DrawOverlay";
import RevealCard from "./RevealCard";
import Paywall from "./Paywall";
import { MONTHLY_PRICE_INR, startSubscriptionCheckout } from "@/lib/razorpayCheckout";

const INTRO = {
  hinglish: (name) =>
    `Namaste ${name}! Main Ginni hoon. Apna sawaal type kijiye, ya list mein se koi sawaal chuniye — main samajh kar aapke liye ek card nikaalti hoon.`,
  english: (name) =>
    `Namaste ${name}! I'm Ginni. Type your question, or pick one from the list — I'll understand it and draw a card for you.`,
  hindi: (name) =>
    `नमस्ते ${name}! मैं जिन्नी हूँ। अपना सवाल टाइप कीजिए, या सूची में से कोई सवाल चुनिए — मैं समझ कर आपके लिए एक कार्ड निकालती हूँ।`,
};

// In-character replies for pure small talk (see isOffTopicChitchat in
// lib/classify.js) — no card draw, no credit spent, per Mayank's call.
// A couple of variants each so it doesn't feel like the same canned line
// every time.
const CHITCHAT_REPLIES = {
  hinglish: [
    "Haha, main yahan tarot padhne ke liye hoon, bas chit-chat ke liye nahi! 😄 Koi sawaal poochiye — pyaar, shaadi, career — main dil se jawab dungi.",
    "Main theek hoon, shukriya poochne ke liye! Par main sabse zyada tab kaam aati hoon jab aap koi sacha sawaal poochte hain — try kijiye na? 💜",
  ],
  english: [
    "Haha, I'm here for tarot readings, not just chit-chat! Ask me something real — about love, marriage, career — and I'll answer from the heart.",
    "I'm well, thank you for asking! But I'm most useful when you bring me an actual question — go on, try me. 💜",
  ],
  hindi: [
    "हाहा, मैं यहाँ टैरो रीडिंग के लिए हूँ, सिर्फ़ बातचीत के लिए नहीं! प्यार, शादी, करियर के बारे में कुछ पूछिए — मैं दिल से जवाब दूँगी।",
    "मैं ठीक हूँ, पूछने के लिए शुक्रिया! पर मैं तब सबसे ज़्यादा काम आती हूँ जब आप कोई असली सवाल पूछते हैं — पूछिए ना? 💜",
  ],
};

const LIMIT_MESSAGE = {
  hinglish: (name) => `${name}, reading ke liye monthly subscription chahiye — sirf ₹${MONTHLY_PRICE_INR}/month. Neeche se subscribe kijiye aur turant apna card nikaaliye. 🌙`,
  english: (name) => `${name}, readings need a monthly subscription — just ₹${MONTHLY_PRICE_INR}/month. Subscribe below and draw your card right away. 🌙`,
  hindi: (name) => `${name}, रीडिंग के लिए मंथली सब्सक्रिप्शन चाहिए — सिर्फ़ ₹${MONTHLY_PRICE_INR}/माह। नीचे से सब्सक्राइब कीजिए और तुरंत अपना कार्ड निकालिए। 🌙`,
};

// Shown as Ginni's reply the moment /api/verify-payment confirms a payment
// made from the "Subscribe now" button below the composer — so the person
// sees their access open right there in the conversation, no reload.
const UNLOCKED_MESSAGE = {
  hinglish: (name) => `${name}, aapka 30 din ka full access khul gaya hai! 🌟 Ab jitne chahein utne sawaal poochhiye — main yahin hoon.`,
  english: (name) => `${name}, your 30-day full access is now open! 🌟 Ask as many questions as you like — I'm right here.`,
  hindi: (name) => `${name}, आपका 30 दिन का फुल एक्सेस खुल गया है! 🌟 अब जितने चाहें उतने सवाल पूछिए — मैं यहीं हूँ।`,
};

// The always-visible pay control above the composer (client's ask: the
// "subscribe for unlimited access" line must itself be the way to pay,
// right on the screen, not just a note).
const SUBSCRIBE_LABELS = {
  hinglish: {
    remaining: (n) => `${n} bonus reading${n === 1 ? "" : "s"} baaki`,
    upsell: `Get your reading at just ${MONTHLY_PRICE_INR}/- Rs (Monthly subscription)`,
    payNow: `Get your reading at just ${MONTHLY_PRICE_INR}/- Rs (Monthly subscription)`,
    payNowShort: `Get your reading at just ${MONTHLY_PRICE_INR}/- Rs · Monthly`,
    opening: "Payment khul raha hai…",
  },
  english: {
    remaining: (n) => `${n} bonus reading${n === 1 ? "" : "s"} remaining`,
    upsell: `Get your reading at just ${MONTHLY_PRICE_INR}/- Rs (Monthly subscription)`,
    payNow: `Get your reading at just ${MONTHLY_PRICE_INR}/- Rs (Monthly subscription)`,
    payNowShort: `Get your reading at just ${MONTHLY_PRICE_INR}/- Rs · Monthly`,
    opening: "Opening payment…",
  },
  hindi: {
    remaining: (n) => `${n} बोनस रीडिंग बाकी`,
    upsell: `Get your reading at just ${MONTHLY_PRICE_INR}/- Rs (Monthly subscription)`,
    payNow: `Get your reading at just ${MONTHLY_PRICE_INR}/- Rs (Monthly subscription)`,
    payNowShort: `Get your reading at just ${MONTHLY_PRICE_INR}/- Rs · Monthly`,
    opening: "पेमेंट खुल रहा है…",
  },
};

// Quick-reply pills (phones only): every question as a tappable chip under
// Ginni's latest message — the welcome, and again after each reading — the
// way food-delivery / support chatbots offer their next options. Tapping
// one sends it exactly like typing it (page.js -> pendingAsk), so it goes
// through the same understanding step as everything else.
const QUICK_LABEL = {
  hinglish: "Ya inme se koi sawaal chuniye:",
  english: "Or pick one of these:",
  hindi: "या इनमें से कोई सवाल चुनिए:",
};

const GENERIC_ERROR = {
  hinglish: "Kshama kijiye, kuch gadbad ho gayi — thodi der baad phir koshish kijiye.",
  english: "Sorry, something went wrong — please try again in a moment.",
  hindi: "क्षमा कीजिए, कुछ गड़बड़ हो गई — थोड़ी देर बाद फिर कोशिश कीजिए।",
};

const NETWORK_ERROR = {
  hinglish: "Server tak nahi pahunch payi — apna connection check karke phir try kijiye.",
  english: "Couldn't reach the server — check your connection and try again.",
  hindi: "सर्वर तक नहीं पहुँच पाई — कनेक्शन चेक करके फिर कोशिश कीजिए।",
};

const CANCELLED_NOTE = {
  hinglish: "Koi baat nahi — jab chaho phir se poochh lena. 💜",
  english: "No worries — ask again whenever you're ready. 💜",
  hindi: "कोई बात नहीं — जब चाहें फिर से पूछ लीजिए। 💜",
};

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return idCounter;
}

// Fire-and-forget: persisted history is a nice-to-have layered on top of a
// chat that already works fully from local state, so a save failing here
// never blocks or errors the live conversation — it just means that one
// message won't be there next time they log in.
function persistMessage({ role, kind, text, card }) {
  fetch("/api/chat/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, kind, text, card }),
  }).catch(() => {});
}

export default function ChatPanel({
  name,
  lang,
  access,
  onAccessChange,
  pendingAsk,
  onConsumedAsk,
  onTopicResolved,
  onPickTopic,
}) {
  const [messages, setMessages] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [input, setInput] = useState("");
  // The card-draw ritual happens full-screen (see DrawOverlay), not inline
  // in the thread — matches chat.thedivinetarotonline.com's own pattern,
  // which is also the only way 78 cards comfortably fit on a phone screen.
  const [activeDraw, setActiveDraw] = useState(null); // {id, topicId, spread, flippingCard}
  const [busy, setBusy] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  // Loading/error state for the pay button above the composer. Kept
  // separate from `busy` (which gates sending questions) so an open
  // Razorpay window never blocks, and is never blocked by, the chat itself.
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState(null);
  const endRef = useRef(null);

  const busyRef = useRef(false);
  const activeDrawRef = useRef(null);
  // Guards each reveal message against being saved more than once — a
  // language-toggle click re-fetches the same reveal (see RevealCard.jsx)
  // and would otherwise re-persist a duplicate row every time.
  const persistedRevealIds = useRef(new Set());
  // Tracks which free follow-ups ("tell me more" / "deeper meaning") have
  // already been used per reveal message, as `${msgId}:${kind}` — purely
  // to stop the same button being clicked repeatedly into duplicate
  // messages; resets on reload, which is fine since re-showing the same
  // free content again is harmless either way.
  const [usedFollowups, setUsedFollowups] = useState(() => new Set());
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { activeDrawRef.current = activeDraw; }, [activeDraw]);

  // Loads the last ~30 saved messages for this account on mount. An empty
  // (or failed) history falls back to the same fresh greeting as before —
  // a brand-new account has never had anything to load.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/chat/history")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const loaded = (data.messages || []).map((m) =>
          m.kind === "reveal"
            ? { id: m.id, role: "ginni", kind: "reveal", card: m.card, pickToken: null, aiMode: m.aiMode, resolvedText: m.text }
            : { id: m.id, role: m.role, kind: "text", text: m.text }
        );
        setMessages(loaded.length ? loaded : [{ id: nextId(), role: "ginni", kind: "text", text: INTRO[lang]?.(name) || INTRO.hinglish(name) }]);
      })
      .catch(() => {
        if (cancelled) return;
        setMessages([{ id: nextId(), role: "ginni", kind: "text", text: INTRO[lang]?.(name) || INTRO.hinglish(name) }]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Only ever runs once, on mount — a lang toggle afterward shouldn't
    // reload (and definitely shouldn't re-greet) an already-loaded chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const threadRef = useRef(null);
  // How many messages were on screen the last time we scrolled — lets the
  // effect below react only to *newly added* messages. A reading resolving
  // its text in place (handleRevealResolved) changes `messages` without
  // adding anything, and must NOT move the scroll — that re-scroll is what
  // used to yank people past the reading down to the topic pills.
  const scrolledCountRef = useRef(0);
  useEffect(() => {
    // Scroll the thread itself, never the page (scrollIntoView would also
    // scroll the window, dragging the sticky header and context bar away).
    const thread = threadRef.current;
    if (!thread || historyLoading || messages.length === 0) return;
    const prev = scrolledCountRef.current;
    if (messages.length <= prev) {
      scrolledCountRef.current = messages.length;
      return;
    }
    scrolledCountRef.current = messages.length;
    const added = messages.slice(prev);
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") { lastUserIdx = i; break; }
    }

    // Which message should sit at the top of the thread:
    // - first load / a reading just arrived → the person's own question, so
    //   the question and Ginni's answer read top-down, and the topic pills
    //   stay below where they can be reached by scrolling, not forced on them
    // - they just asked something → that question
    // - anything else Ginni adds on her own (follow-up, error, unlock note)
    //   → the first new bubble
    let target = null;
    if (prev === 0 || added.some((m) => m.kind === "reveal")) {
      target = lastUserIdx >= 0 ? messages[lastUserIdx] : prev === 0 ? null : added[0];
    } else {
      target = added[0];
    }

    if (!target) {
      thread.scrollTo({ top: 0 });
      return;
    }
    // Wait a frame so the new bubbles are laid out before measuring.
    requestAnimationFrame(() => {
      const el = thread.querySelector(`[data-msg-id="${target.id}"]`);
      if (!el) return;
      const top = el.getBoundingClientRect().top - thread.getBoundingClientRect().top + thread.scrollTop - 10;
      thread.scrollTo({ top: Math.max(0, top), behavior: prev === 0 ? "auto" : "smooth" });
    });
  }, [messages, historyLoading]);


  function handleSend(rawText) {
    const text = (rawText || "").trim();
    if (!text || busyRef.current || activeDrawRef.current || historyLoading) return;

    // Pure small talk gets an in-character reply and nothing else — no
    // card, no credit spent, per Mayank's call. Checked before the real
    // classifier so "hi" never accidentally forces a reading.
    if (isOffTopicChitchat(text)) {
      const replies = CHITCHAT_REPLIES[lang] || CHITCHAT_REPLIES.hinglish;
      const reply = replies[Math.floor(Math.random() * replies.length)];
      setMessages((m) => [
        ...m,
        { id: nextId(), role: "user", text },
        { id: nextId(), role: "ginni", kind: "text", text: reply },
      ]);
      setInput("");
      persistMessage({ role: "user", kind: "text", text });
      persistMessage({ role: "ginni", kind: "text", text: reply });
      return;
    }

    // Free classifier first — zero cost, handles Hinglish/English/Hindi
    // keyword phrasing. When it can't map the question at all, or the text
    // isn't in a script it was ever built to read, this still always ends
    // in a real reading — either real AI if a provider key is configured
    // (lib/ai.js), or lib/localFallback.js's zero-cost local reading if
    // not, which is the default. See app/api/reveal/route.js.
    // No subscription (and no bonus readings) → the question is echoed,
    // Ginni explains, and the paywall opens right here. The server gate in
    // /api/reading/pick is still the real enforcement; this just stops an
    // unsubscribed account from walking through the whole draw ritual
    // only to be refused at the last step.
    if (access && access.loggedIn && access.hasAccess === false) {
      const limitText = LIMIT_MESSAGE[lang]?.(name) || LIMIT_MESSAGE.hinglish(name);
      setMessages((m) => [
        ...m,
        { id: nextId(), role: "user", text },
        { id: nextId(), role: "ginni", kind: "text", text: limitText },
      ]);
      setInput("");
      persistMessage({ role: "user", kind: "text", text });
      setTimeout(() => setShowPaywall(true), 700);
      return;
    }

    const matchedId = classifyQuestion(text);
    const useAI = matchedId === null || looksNonLatinScript(text);
    const topic = TOPICS.find((t) => t.id === matchedId) || TOPICS[6]; // Universe Message — also the generic lead-in when useAI
    if (!useAI) onTopicResolved?.(matchedId);

    const seed = Math.floor(Math.random() * 3);
    const greeting = getGreeting(name, lang, topic, seed);

    setMessages((m) => [
      ...m,
      { id: nextId(), role: "user", text },
      { id: nextId(), role: "ginni", kind: "text", text: greeting },
    ]);
    setInput("");
    persistMessage({ role: "user", kind: "text", text });
    persistMessage({ role: "ginni", kind: "text", text: greeting });
    setActiveDraw({
      id: nextId(),
      topicId: useAI ? "ai" : matchedId,
      question: useAI ? text : undefined,
      spread: shuffle(DECK),
      flippingCard: null,
    });
  }

  // A question clicked in the left-hand list arrives here as plain text and
  // is sent through the exact same understanding step as anything typed —
  // it never jumps straight to a topic lookup. Deferred one tick so the
  // setState calls inside handleSend() don't run synchronously within this
  // effect's body.
  useEffect(() => {
    if (pendingAsk?.text) {
      const t = setTimeout(() => handleSend(pendingAsk.text), 0);
      onConsumedAsk?.();
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAsk]);

  function handleCancelDraw() {
    if (busyRef.current) return; // a card is already being charged/fetched — too late to cancel
    setActiveDraw(null);
    const text = CANCELLED_NOTE[lang] || CANCELLED_NOTE.hinglish;
    setMessages((m) => [...m, { id: nextId(), role: "ginni", kind: "text", text }]);
    persistMessage({ role: "ginni", kind: "text", text });
  }

  // Called by RevealCard the first time a reveal actually resolves to real
  // text — this is where the finished reading gets saved, with the text
  // already baked in (the pick token itself is never stored; it expires in
  // 20 minutes and history needs to outlive that). Also records the text
  // on the message itself so the Share button (see ChatBubble) has the
  // finished reading to work with, not just a still-loading RevealCard.
  function handleRevealResolved(msgId, card, aiMode, text) {
    setMessages((m) => m.map((msg) => (msg.id === msgId ? { ...msg, resolvedText: text } : msg)));
    if (persistedRevealIds.current.has(msgId)) return;
    persistedRevealIds.current.add(msgId);
    persistMessage({ role: "ginni", kind: "reveal", text, card, aiMode });
  }

  // Free, unlimited elaboration on a card already revealed — no new draw,
  // no credit spent (see app/api/reading/followup/route.js). msgId+kind
  // together identify which button was clicked, purely to disable it
  // after use (see usedFollowups above).
  async function handleFollowup(msgId, card, kind) {
    const key = `${msgId}:${kind}`;
    if (usedFollowups.has(key)) return;
    setUsedFollowups((s) => new Set(s).add(key));

    try {
      const res = await fetch(`/api/reading/followup?card=${encodeURIComponent(card)}&kind=${kind}&lang=${encodeURIComponent(lang)}`);
      const data = await res.json();
      const text = data.available ? data.text : data.fallbackMessage || GENERIC_ERROR[lang] || GENERIC_ERROR.hinglish;
      setMessages((m) => [...m, { id: nextId(), role: "ginni", kind: "text", text }]);
      persistMessage({ role: "ginni", kind: "text", text });
    } catch {
      const text = NETWORK_ERROR[lang] || NETWORK_ERROR.hinglish;
      setMessages((m) => [...m, { id: nextId(), role: "ginni", kind: "text", text }]);
    }
  }

  async function handlePick(cardName) {
    const draw = activeDrawRef.current;
    if (!draw || busyRef.current) return;
    setBusy(true);
    setActiveDraw((d) => (d ? { ...d, flippingCard: cardName } : d));

    let res, data;
    try {
      res = await fetch("/api/reading/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: draw.topicId, card: cardName, question: draw.question }),
      });
      data = await res.json();
    } catch {
      setActiveDraw(null);
      setMessages((m) => [...m, { id: nextId(), role: "ginni", kind: "text", text: NETWORK_ERROR[lang] || NETWORK_ERROR.hinglish }]);
      setBusy(false);
      return;
    }

    if (!res.ok) {
      setActiveDraw(null);
      if (data.error === "limit_reached") {
        onAccessChange?.(data);
        setMessages((m) => [...m, { id: nextId(), role: "ginni", kind: "text", text: LIMIT_MESSAGE[lang]?.(name) || LIMIT_MESSAGE.hinglish(name) }]);
        setTimeout(() => setShowPaywall(true), 700);
      } else {
        setMessages((m) => [...m, { id: nextId(), role: "ginni", kind: "text", text: data.error || GENERIC_ERROR[lang] || GENERIC_ERROR.hinglish }]);
      }
      setBusy(false);
      return;
    }

    onAccessChange?.(data.access);
    const pickToken = data.pickToken;
    const aiMode = draw.topicId === "ai";

    setTimeout(() => {
      const closing = getClosing(name, lang, Math.floor(Math.random() * 3));
      setMessages((m) => [
        ...m,
        { id: nextId(), role: "ginni", kind: "reveal", card: cardName, pickToken, aiMode },
        { id: nextId(), role: "ginni", kind: "text", text: closing },
      ]);
      persistMessage({ role: "ginni", kind: "text", text: closing });
      setActiveDraw(null);
      setBusy(false);
    }, 620); // matches the existing card-flip timing from the original ReadingPanel.jsx
  }

  const composerDisabled = busy || !!activeDraw || historyLoading;
  // Pills show whenever it's the person's turn: Ginni spoke last and nothing
  // is in flight. They vanish the moment a question is sent (a user bubble
  // becomes last) and reappear under the reading that follows.
  const lastMsg = messages[messages.length - 1];
  const showQuickReplies = !!onPickTopic && !composerDisabled && !!lastMsg && lastMsg.role === "ginni";
  const freeLeft = access?.freeLeft ?? 0;

  // Direct pay from the banner above the composer — one tap opens Razorpay,
  // and as soon as the server verifies the payment the new `access` is
  // applied (which hides the banner and lifts the limit) and Ginni
  // confirms it in the thread. Same server-side verification as the
  // Paywall modal; this just removes the extra step of finding the modal.
  async function handlePayNow() {
    if (payBusy) return;
    setPayError(null);
    setPayBusy(true);
    try {
      await startSubscriptionCheckout({
        name,
        onUnlocked: (newAccess) => {
          setPayBusy(false);
          setShowPaywall(false);
          onAccessChange?.(newAccess);
          const text = UNLOCKED_MESSAGE[lang]?.(name) || UNLOCKED_MESSAGE.hinglish(name);
          setMessages((m) => [...m, { id: nextId(), role: "ginni", kind: "text", text }]);
          persistMessage({ role: "ginni", kind: "text", text });
        },
        onError: (message) => {
          setPayError(message);
          setPayBusy(false);
        },
        onDismiss: () => setPayBusy(false),
      });
    } catch (e) {
      setPayError(e.message || "Something went wrong.");
      setPayBusy(false);
    }
  }

  return (
    <div className="chat-shell">
      <div className="chat-thread" ref={threadRef}>
        {historyLoading ? (
          <div className="chat-row ginni">
            <div className="chat-bubble ginni">Aapki purani baatein la rahi hoon…</div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              data-msg-id={msg.id}
              className="chat-msg-anchor"
            >
              <ChatBubble
                msg={msg}
                lang={lang}
                onRevealResolved={handleRevealResolved}
                onFollowup={handleFollowup}
                usedFollowups={usedFollowups}
              />
            </div>
          ))
        )}
        {showQuickReplies && (
          <div className="quick-replies mobile-only">
            <div className="quick-replies-label">{QUICK_LABEL[lang] || QUICK_LABEL.hinglish}</div>
            <div className="quick-replies-pills">
              {TOPICS.map((t) => (
                <button key={t.id} type="button" className="quick-pill" onClick={() => onPickTopic?.(t)}>
                  {t.title}
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="chat-composer-wrap">
        {!access?.subscribed && (() => {
          const L = SUBSCRIBE_LABELS[lang] || SUBSCRIBE_LABELS.hinglish;
          return (
            <div className="chat-free-note">
              {freeLeft > 0 ? (
                <>
                  <span>{L.remaining(freeLeft)}</span>
                  <span className="chat-free-note-sep" aria-hidden="true">·</span>
                  <button type="button" className="chat-subscribe-link" onClick={handlePayNow} disabled={payBusy}>
                    {payBusy ? L.opening : L.upsell}
                  </button>
                </>
              ) : (
                <button type="button" className="chat-subscribe-btn" onClick={handlePayNow} disabled={payBusy}>
                  {payBusy ? L.opening : (
                    <>
                      <span className="label-long">{L.payNow}</span>
                      <span className="label-short">{L.payNowShort}</span>
                    </>
                  )}
                </button>
              )}
              {payError && <span className="chat-pay-error">{payError}</span>}
            </div>
          );
        })()}
        <form
          className="chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
        >
          <input
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Apna sawaal likhiye… (e.g. meri shaadi kab hogi)"
            disabled={composerDisabled}
          />
          <button className="chat-send-btn" type="submit" disabled={composerDisabled || !input.trim()}>
            Draw
          </button>
        </form>
      </div>

      <DrawOverlay
        key={activeDraw?.id ?? "none"}
        open={!!activeDraw}
        lang={lang}
        spread={activeDraw?.spread || []}
        flippingCard={activeDraw?.flippingCard}
        onPick={handlePick}
        onCancel={handleCancelDraw}
      />

      {showPaywall && typeof document !== "undefined" && createPortal(
        <div className="chat-modal-backdrop" onClick={() => setShowPaywall(false)}>
          <div className="chat-modal-panel" onClick={(e) => e.stopPropagation()}>
            <button className="chat-modal-close" onClick={() => setShowPaywall(false)} aria-label="Close">
              ✕
            </button>
            <Paywall
              name={name}
              onUnlocked={(newAccess) => {
                onAccessChange?.(newAccess);
                setShowPaywall(false);
              }}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const FOLLOWUP_LABELS = {
  hinglish: { universe: "🌙 Aur samjhaiye", spiritual: "✨ Deeper meaning" },
  english: { universe: "🌙 Tell me more", spiritual: "✨ Deeper meaning" },
  hindi: { universe: "🌙 और समझाइए", spiritual: "✨ गहरा अर्थ" },
};

function ChatBubble({ msg, lang, onRevealResolved, onFollowup, usedFollowups }) {
  if (msg.role === "user") {
    return (
      <div className="chat-row user">
        <div className="chat-bubble user">{msg.text}</div>
      </div>
    );
  }

  if (msg.kind === "reveal") {
    const labels = FOLLOWUP_LABELS[lang] || FOLLOWUP_LABELS.hinglish;
    return (
      <div className="chat-row ginni">
        <div className="chat-bubble ginni chat-bubble--reveal">
          {msg.aiMode && <div className="chat-ai-tag">✨ Ginni&apos;s own words for your question</div>}
          <RevealCard
            pick={{ card: msg.card, monthIndex: 1 }}
            pickToken={msg.pickToken}
            lang={lang}
            monthLabel={null}
            aiMode={msg.aiMode}
            resolvedText={msg.resolvedText}
            onResolved={msg.resolvedText ? undefined : (text) => onRevealResolved(msg.id, msg.card, msg.aiMode, text)}
          />
          <div className="reveal-followup-row">
            {["universe", "spiritual"].map((kind) => {
              const used = usedFollowups.has(`${msg.id}:${kind}`);
              return (
                <button
                  key={kind}
                  type="button"
                  className="reveal-followup-btn"
                  disabled={used}
                  onClick={() => onFollowup(msg.id, msg.card, kind)}
                >
                  {labels[kind]}
                </button>
              );
            })}
            {msg.resolvedText && <ShareButton card={msg.card} text={msg.resolvedText} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-row ginni">
      <div className="chat-bubble ginni">{msg.text}</div>
    </div>
  );
}

// Builds and shares/downloads a card image entirely client-side — see
// lib/shareImage.js. Its own tiny loading state, local to this one button,
// since generating the image takes a moment (loading the card art, drawing
// wrapped text) and nothing else in the bubble needs to know about it.
function ShareButton({ card, text }) {
  const [busy, setBusy] = useState(false);

  async function handleShare() {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await buildShareImage({ cardSrc: `/cards/${cardSlug(card)}.png`, cardName: card, text });
      if (blob) await shareOrDownloadImage(blob, `ginni-${cardSlug(card)}.png`);
    } catch {
      // Sharing/downloading is a nice-to-have on top of a reading that's
      // already fully shown in the chat — a failure here is silent rather
      // than interrupting the conversation with an error bubble.
    }
    setBusy(false);
  }

  return (
    <button type="button" className="reveal-followup-btn" disabled={busy} onClick={handleShare}>
      {busy ? "…" : "📤 Share this card"}
    </button>
  );
}
