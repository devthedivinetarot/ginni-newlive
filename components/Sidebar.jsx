"use client";

import { useState } from "react";
import { TOPICS, LANG_LABEL } from "@/lib/topics";
import InviteModal from "./InviteModal";

const LANGS = [
  { key: "hinglish", label: "मिली" },
  { key: "english", label: "EN" },
  { key: "hindi", label: "हिं" },
];

// `name` is null for a visitor who isn't logged in: the "Reading for …" line
// becomes a plain heading, "Invite a friend" is hidden (no referral code
// yet) and onLogin replaces onLogout.
export default function Sidebar({ name, lang, activeTopicId, onSelectTopic, onChangeLang, onRestart, onLogout, onLogin, referralCode }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const activeTopic = TOPICS.find((t) => t.id === activeTopicId) || null;

  return (
    <>
      {/* Mobile context bar — only visible under 820px (desktop hides it).
          One slim row: who the reading is for, plus a settings pill that
          opens the sheet below (language / invite / start over / log out). */}
      <div className="mobile-topbar">
        <span className="mobile-topbar-user">
          {name ? <>Reading for <b>{name}</b></> : <b>Ginni Ki Baatein</b>}
        </span>
        <button
          type="button"
          className="mobile-settings-btn"
          aria-label={panelOpen ? "Close settings" : "Open settings"}
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((o) => !o)}
        >
          {LANG_LABEL[lang]} <span aria-hidden="true">▾</span>
        </button>
      </div>

      {panelOpen && <div className="sidebar-backdrop mobile-only" onClick={() => setPanelOpen(false)} />}

      {/* Compact mobile settings panel — language + restart only; topics are never hidden here */}
      <div className={"mobile-settings-panel" + (panelOpen ? " open" : "")} role="dialog" aria-label="Settings" aria-hidden={!panelOpen}>
        <div className="qsheet-handle" aria-hidden="true" />
        <div className="mobile-settings-head">
          <span>{name ? <>Reading for <b>{name}</b></> : <b>Ginni Ki Baatein</b>}</span>
          <button type="button" className="qsheet-close" aria-label="Close" onClick={() => setPanelOpen(false)}>✕</button>
        </div>
        {onChangeLang && (
          <div className="lang-switch">
            <span className="lang-switch-label">Reading language</span>
            <div className="lang-switch-row">
              {LANGS.map((l) => (
                <button
                  key={l.key}
                  className={"lang-chip" + (lang === l.key ? " active" : "")}
                  onClick={() => { onChangeLang(l.key); setPanelOpen(false); }}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {referralCode && (
          <button className="restart-link" onClick={() => { setPanelOpen(false); setInviteOpen(true); }}>
            Invite a friend
          </button>
        )}
        <button className="restart-link" onClick={onRestart}>
          Start over
        </button>
        {onLogout && (
          <button className="restart-link" onClick={onLogout}>
            Log out
          </button>
        )}
        {onLogin && (
          <button className="restart-link" onClick={() => { setPanelOpen(false); onLogin(); }}>
            Log in
          </button>
        )}
      </div>

      {/* Desktop sidebar — unchanged */}
      <aside className="sidebar">
        <div className="sidebar-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="The Divine Tarot" className="sidebar-glyph" />
          <span className="brand">Ginni Ki Baatein</span>
        </div>
        <div className="sidebar-user">
          {name ? <>Reading for <b>{name}</b> · {LANG_LABEL[lang]}</> : <>Pick a question · {LANG_LABEL[lang]}</>}
        </div>

        <ul className="topic-list">
          {TOPICS.map((t) => (
            <li
              key={t.id}
              className={"topic-item" + (activeTopicId === t.id ? " selected" : "")}
              style={{ animationDelay: `${t.id * 40}ms` }}
              onClick={() => onSelectTopic(t)}
            >
              <span className="topic-num">{String(t.id).padStart(2, "0")}</span>
              <span className="topic-text">
                <span className="topic-title">{t.title}</span>
                <span className="topic-meta">
                  {t.cards} card{t.cards > 1 ? "s" : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>

        {onChangeLang && (
          <div className="lang-switch">
            <span className="lang-switch-label">Reading language</span>
            <div className="lang-switch-row">
              {LANGS.map((l) => (
                <button
                  key={l.key}
                  className={"lang-chip" + (lang === l.key ? " active" : "")}
                  onClick={() => onChangeLang(l.key)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="sidebar-footer">
          Each spread is shuffled fresh. Pick with an open mind — the card that calls to you is the
          one meant for you.
          {referralCode && <button onClick={() => setInviteOpen(true)}>Invite a friend</button>}
          <button onClick={onRestart}>Start over</button>
          {onLogout && <button onClick={onLogout}>Log out</button>}
          {onLogin && <button onClick={onLogin}>Log in</button>}
        </div>
      </aside>

      {inviteOpen && <InviteModal referralCode={referralCode} onClose={() => setInviteOpen(false)} />}
    </>
  );
}
