"use client";

import { useState } from "react";

// Same subdomain situation as SiteHeader: these pages don't exist on
// Ginni Ki Baatein's own domain, so Quick Links / Privacy point back at
// the main site instead of using next/link.
const MAIN_SITE = "https://thedivinetarotonline.com";

// Inline SVGs, in the same style as the social icons below — no icon
// package dependency needed for this project.
const LockIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const HeartIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
  </svg>
);

const SparklesIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
  </svg>
);

const InstagramIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const FacebookIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

const YoutubeIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48" />
  </svg>
);

export default function SiteFooter() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");
  // Plain render-time value (not effect-driven state) — no hydration
  // mismatch risk since this page isn't statically cached.
  const year = new Date().getFullYear();

  const validateEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateEmail(email)) {
      setError("Please enter a valid email address");
      return;
    }

    const trimmedPhone = phone.replace(/[^\d+]/g, "");
    if (trimmedPhone && trimmedPhone.replace(/\D/g, "").length < 10) {
      setError("Please enter a valid WhatsApp number, or leave it blank.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone: trimmedPhone || undefined, source: "footer" }),
      });

      if (response.ok) {
        setIsSuccess(true);
        setEmail("");
        setPhone("");
        setTimeout(() => setIsSuccess(false), 3000);
      } else {
        const data = await response.json();
        setError(data.message || "Something went wrong. Please try again.");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const socialLinks = [
    { name: "Instagram", href: "https://instagram.com/thedivineetarot", icon: InstagramIcon },
    { name: "Facebook", href: "https://facebook.com/profile.php?id=61578567343068", icon: FacebookIcon },
    { name: "YouTube", href: "https://youtube.com/@TheDivineTarot", icon: YoutubeIcon },
    { name: "YouTube (2nd Channel)", href: "https://youtube.com/@thedivineetarot", icon: YoutubeIcon },
  ];

  const trustItems = [
    { icon: LockIcon, text: "Secure & Private Readings" },
    { icon: HeartIcon, text: "Trusted by 7L+ Seekers" },
    { icon: SparklesIcon, text: "Authentic Spiritual Guidance" },
  ];

  return (
    <footer className="site-footer">
      <div className="site-footer-columns">
        {/* COLUMN 1 — BRAND */}
        <div className="site-footer-col">
          <div className="site-footer-brand-row">
            <div className="site-footer-logo-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="The Divine Tarot Logo" className="site-footer-logo" />
            </div>
            <div>
              <h3 className="site-footer-brand-name">The Divine Tarot</h3>
              <p className="site-footer-brand-tag">Premium Tarot Guidance</p>
            </div>
          </div>
          <p className="site-footer-desc">
            Clarity for your path. Guidance for your soul.
          </p>
        </div>

        {/* COLUMN 2 — QUICK LINKS */}
        <div className="site-footer-col">
          <h4 className="site-footer-heading">Quick Links</h4>
          <ul className="site-footer-links">
            {[
              { name: "About", href: `${MAIN_SITE}/about` },
              { name: "Support", href: "https://support.thedivinetarotonline.com/" },
            ].map((link) => (
              <li key={link.name}>
                <a href={link.href}>
                  <span className="site-footer-link-dot" />
                  {link.name}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* COLUMN 3 — SOCIAL MEDIA */}
        <div className="site-footer-col">
          <h4 className="site-footer-heading">Connect With Us</h4>
          <div className="site-footer-socials">
            {socialLinks.map((item) => (
              <a
                key={item.name}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                title={item.name}
                className="site-footer-social-btn"
              >
                <item.icon className="site-footer-social-icon" />
              </a>
            ))}
          </div>
          <a href={`${MAIN_SITE}/privacy`} className="site-footer-privacy-inline">
            Privacy
          </a>
        </div>

        {/* COLUMN 4 — NEWSLETTER */}
        <div className="site-footer-col">
          <h4 className="site-footer-heading site-footer-heading-tight">Get Daily Divine Insights</h4>
          <form onSubmit={handleSubmit} className="site-footer-form">
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              placeholder="Your email"
              className="site-footer-input"
              disabled={isSubmitting || isSuccess}
              aria-label="Email for daily insights"
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setError("");
              }}
              placeholder="WhatsApp number (optional)"
              className="site-footer-input"
              disabled={isSubmitting || isSuccess}
              aria-label="WhatsApp number for daily insights (optional)"
            />
            <button
              type="submit"
              disabled={isSubmitting || isSuccess}
              className={
                "site-footer-submit" +
                (isSuccess ? " is-success" : isSubmitting ? " is-submitting" : "")
              }
            >
              {isSuccess ? "Subscribed!" : isSubmitting ? "Subscribing..." : "Subscribe"}
            </button>
          </form>
          {error && (
            <p className="site-footer-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>

      {/* TRUST INDICATORS */}
      <div className="site-footer-trust-bar">
        <div className="site-footer-trust">
          {trustItems.map((item, i) => (
            <div key={i} className="site-footer-trust-item">
              <item.icon className="site-footer-trust-icon" />
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* COPYRIGHT BAR */}
      <div className="site-footer-bottom">
        <div>
          Designed by{" "}
          <a href="https://sitelytc.com/" target="_blank" rel="noopener noreferrer" className="site-footer-designedby">
            Sitelytc
          </a>
        </div>
        <div className="site-footer-bottom-links">
          <a href={`${MAIN_SITE}/privacy`}>Privacy</a>
          <span className="site-footer-divider" />
          <a href={`${MAIN_SITE}/refund-policy`}>Refunds</a>
          <span className="site-footer-divider" />
          <span>&copy; {year} The Divine Tarot. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
