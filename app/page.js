"use client";

import { useState, useEffect } from "react";
import AuthGate from "@/components/AuthGate";
import Onboarding from "@/components/Onboarding";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { TOPICS } from "@/lib/topics";

const LANG_KEY = "ginni:lang";
function loadLang() {
  try {
    const v = window.localStorage.getItem(LANG_KEY);
    return v === "hinglish" || v === "english" || v === "hindi" ? v : null;
  } catch {
    return null;
  }
}
function saveLang(lang) {
  try {
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {
    // private mode etc. — language just falls back to the default next time
  }
}

export default function Home() {
  const [me, setMe] = useState(null); // null while loading; {loggedIn, ...access} once known
  const [session, setSession] = useState(null); // {name, lang} — onboarding personalization, separate from auth
  const [activeTopic, setActiveTopic] = useState(null); // highlight only — the chat below is the source of truth
  const [pendingAsk, setPendingAsk] = useState(null); // {text, nonce} — a sidebar click waiting to be sent
  // Reading language chosen from the site header's EN / हिंदी / Hinglish
  // toggle. Before a session it seeds onboarding; during one it switches the
  // live session's language (same as the sidebar / settings chips).
  const [uiLang, setUiLang] = useState("hinglish");
  const [chatKey, setChatKey] = useState(0); // bumped by "Start over" to remount the chat
  // Visitors (not logged in) get the full chat and topic list. Asking for a
  // reading or tapping the pay button opens this sign-up / log-in card over
  // the chat: { mode, question?, intent? }. After they're in, the question
  // they asked is sent again for them (it then hits the ₹199 paywall, or
  // goes straight to the reading for an existing subscriber).
  const [authPrompt, setAuthPrompt] = useState(null);
  const [payIntent, setPayIntent] = useState(false);
  const currentLang = session?.lang || uiLang;
  function changeLang(next) {
    setUiLang(next);
    saveLang(next);
    setSession((prev) => (prev ? { ...prev, lang: next } : prev));
  }

  // One account = one person. The reading name is the name saved on the
  // account, so a reload (or a new device) goes straight back into the
  // chat instead of asking "Your name" again — and nobody can type a
  // friend's name to stretch one subscription across a whole group.
  // Onboarding only appears once, for an account that has no name yet.
  function applyMe(data) {
    setMe(data);
    if (data?.loggedIn && data.name) {
      const lang = loadLang() || uiLang;
      setUiLang(lang);
      setSession((prev) => prev || { name: data.name, lang });
    }
  }

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(applyMe)
      .catch(() => setMe({ loggedIn: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleBegin(name, lang) {
    saveLang(lang);
    setUiLang(lang);
    let savedName = name;
    try {
      const res = await fetch("/api/auth/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.name) {
        savedName = data.name;
        setMe((prev) => ({ ...prev, name: data.name }));
      }
    } catch {
      // Saving the name is best-effort; the session still starts.
    }
    setSession({ name: savedName, lang });
  }

  if (me === null) {
    // The session check (/api/auth/me) is a round trip to the database, so
    // paint the real page shell straight away instead of a blank screen —
    // on a slow connection the empty frame read as "the site is broken".
    return (
      <div className="site-page">
        <SiteHeader lang={currentLang} onChangeLang={changeLang} />
        <div id="onboard">
          <div className="onboard-card" aria-busy="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="The Divine Tarot" className="onboard-glyph" />
            <h1>Ginni Ki Baatein</h1>
            <p className="onboard-sub">Checking your session…</p>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe({ loggedIn: false });
    setSession(null);
    setActiveTopic(null);
    setPendingAsk(null);
  }

  function handleAuthedFromPrompt(data) {
    const prompt = authPrompt || {};
    setAuthPrompt(null);
    applyMe(data);
    if (prompt.question) setPendingAsk({ text: prompt.question, nonce: Date.now() });
    if (prompt.intent === "pay") setPayIntent(true);
  }

  const guest = !me.loggedIn;

  // Clicking a question in the sidebar fills the chat input with its exact
  // title and sends it — it goes through the same classifyQuestion() step
  // as anything typed (see ChatPanel.jsx), it never jumps straight to a
  // known topic id.
  function handleSelectTopic(topic) {
    setActiveTopic(topic);
    setPendingAsk({ text: topic.title, nonce: Date.now() });
  }

  return (
    <div className="site-page">
      <SiteHeader lang={currentLang} onChangeLang={changeLang} />

      {!guest && !session ? (
        <Onboarding defaultName={me.name} defaultLang={uiLang} onBegin={handleBegin} />
      ) : (
        <div id="app" className="active">
          <Sidebar
            name={guest ? null : session.name}
            lang={currentLang}
            activeTopicId={activeTopic?.id}
            onSelectTopic={handleSelectTopic}
            onChangeLang={changeLang}
            onRestart={() => {
              // Keeps the account's name — just a fresh look at the chat.
              setActiveTopic(null);
              setPendingAsk(null);
              setChatKey((k) => k + 1);
            }}
            onLogout={guest ? undefined : handleLogout}
            onLogin={guest ? () => setAuthPrompt({ mode: "login" }) : undefined}
            referralCode={me.referralCode}
          />
          <main className="main chat-mode">
            <div className="main-inner chat-main-inner">
              <ChatPanel
                key={guest ? `guest:${chatKey}` : `${session.name}:${chatKey}`}
                name={guest ? null : session.name}
                lang={currentLang}
                access={me}
                onAccessChange={(newAccess) => setMe((prev) => ({ ...prev, ...newAccess }))}
                pendingAsk={pendingAsk}
                onConsumedAsk={() => setPendingAsk(null)}
                onTopicResolved={(topicId) => setActiveTopic(TOPICS.find((t) => t.id === topicId) || null)}
                onPickTopic={handleSelectTopic}
                onRequireAuth={setAuthPrompt}
                autoOpenPay={payIntent}
                onConsumedPay={() => setPayIntent(false)}
              />
            </div>
          </main>
        </div>
      )}

      {authPrompt && (
        <AuthGate
          key={authPrompt.mode}
          modal
          initialMode={authPrompt.mode}
          intro={
            authPrompt.mode === "signup"
              ? "Create your account to get your reading — then subscribe for just ₹199/month."
              : undefined
          }
          onClose={() => setAuthPrompt(null)}
          onAuthed={handleAuthedFromPrompt}
        />
      )}

      <SiteFooter />
    </div>
  );
}
