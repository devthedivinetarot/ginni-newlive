"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Header matched 1:1 to thedivinetarotonline.com's own (measured from the
// live site's markup and computed styles):
//   - sticky, bg black/60 + blur, 1px white/10 bottom border
//   - heights 56px (<640) / 64px (640–1023) / 68px (≥1024) — see the
//     --site-header-h media rules in globals.css
//   - brand: logo 32/40px, Cinzel 16/18px 600 white, tag Inter 10/11px
//     uppercase tracking .15em gold/80 (shown at every width)
//   - ≥1280px (Tailwind xl): centred nav (14px 500 white/70, gold + 2px
//     underline when current), language toggle pill, red→gold CTA pill
//   - <1280px: only brand + hamburger; nav, language toggle and CTA live in
//     a right-side drawer (288px, #0a0a0a, black/50 backdrop) with a "Menu"
//     header, exactly like the site's
//   - hides on scroll down, returns on scroll up (the site's
//     transition-transform behaviour) — instead of the old height shrink.
// Ginni Ki Baatein lives on its own subdomain and has no /about,
// /kundli-milan or /privacy of its own, so those resolve to the main site.
const MAIN_SITE = "https://thedivinetarotonline.com";
const READING_SITE = "https://reading.thedivinetarotonline.com/";

const NAV_LINKS = [
  { href: `${MAIN_SITE}/`, label: "Home" },
  { href: `${MAIN_SITE}/about`, label: "About" },
  { href: READING_SITE, label: "Reading", isExternal: true },
  { href: "https://learn.thedivinetarotonline.com/", label: "Course", isExternal: true },
  { href: `${MAIN_SITE}/kundli-milan`, label: "Kundli Milan" },
  { href: "https://booking.thedivinetarotonline.com/", label: "Personal Booking", isExternal: true },
];

const CTA_HREF = READING_SITE;

// Same three options, same order and labels as the site's toggle. Keys are
// this app's own language ids (lib/topics.js).
const LANG_OPTIONS = [
  { key: "english", label: "EN" },
  { key: "hindi", label: "हिंदी" },
  { key: "hinglish", label: "Hinglish" },
];

function LangToggle({ lang, onChange, className = "" }) {
  return (
    <div className={"site-lang " + className} role="group" aria-label="Select language">
      {LANG_OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          className={"site-lang-btn" + (lang === o.key ? " active" : "")}
          aria-pressed={lang === o.key}
          onClick={() => onChange?.(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function SiteHeader({ lang = "hinglish", onChangeLang }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Hide on scroll down / reveal on scroll up, like the main site. Only the
  // window scroll counts; the chat screen scrolls its own thread, so there
  // the header simply stays.
  const lastYRef = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastYRef.current;
      if (open || y < 40) setHidden(false);
      else if (delta > 8) setHidden(true);
      else if (delta < -8) setHidden(false);
      lastYRef.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open]);

  // Drawer: lock page scroll + Escape closes.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const linkProps = (link) =>
    link.isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {};

  return (
    <>
      <header className={"site-header" + (hidden ? " is-hidden" : "")}>
        <div className="site-header-inner">
          <a className="site-brand" href={`${MAIN_SITE}/`} aria-label="The Divine Tarot — home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="site-brand-logo" />
            <span className="site-brand-text">
              <span className="site-brand-name">The Divine Tarot</span>
              <span className="site-brand-tag">Premium Tarot Guidance</span>
            </span>
          </a>

          <nav className="site-nav" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <a key={link.label} href={link.href} {...linkProps(link)}>
                {link.label}
              </a>
            ))}
          </nav>

          <div className="site-header-right">
            <LangToggle lang={lang} onChange={onChangeLang} className="site-lang--bar" />
            <a className="site-cta" href={CTA_HREF}>
              Ask your question here
            </a>
            <button
              type="button"
              className="site-menu-btn"
              aria-label="Open menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {open && typeof document !== "undefined" && createPortal(
        <>
          <div className="site-drawer-backdrop" onClick={() => setOpen(false)} />
          <div className="site-drawer" role="dialog" aria-modal="true" aria-label="Mobile navigation menu">
            <div className="site-drawer-head">
              <span className="site-drawer-title">Menu</span>
              <button type="button" className="site-drawer-close" aria-label="Close menu" onClick={() => setOpen(false)}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <nav className="site-drawer-nav" aria-label="Primary">
              {NAV_LINKS.map((link) => (
                <a key={link.label} href={link.href} {...linkProps(link)} onClick={() => setOpen(false)}>
                  {link.label}
                </a>
              ))}
              <div className="site-drawer-extra">
                <LangToggle lang={lang} onChange={onChangeLang} />
                <a className="site-cta site-cta-block" href={CTA_HREF} onClick={() => setOpen(false)}>
                  Ask your question here
                </a>
              </div>
            </nav>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
