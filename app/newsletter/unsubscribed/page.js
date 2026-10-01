"use client";

import { useState } from "react";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

// Landing page after the footer "Unsubscribe" link in a Divine Insights email.
export default function UnsubscribedPage() {
  const [error] = useState(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("error")
  );
  return (
    <div className="site-page">
      <SiteHeader />
      <div id="onboard">
        <div className="onboard-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="The Divine Tarot" className="onboard-glyph" />
          <h1>Divine Insights</h1>
          {error ? (
            <>
              <p className="onboard-sub">
                {error === "invalid"
                  ? "That unsubscribe link isn't valid. Please use the link from a recent email."
                  : "Couldn't update your subscription right now. Please try again in a moment."}
              </p>
            </>
          ) : (
            <>
              <p className="onboard-sub">You&rsquo;ve been unsubscribed. You won&rsquo;t receive any more Divine Insights emails.</p>
              <p className="prompt" style={{ color: "var(--text-muted)", marginBottom: 20 }}>
                Changed your mind? Sign up again any time from the form in the footer.
              </p>
            </>
          )}
          <Link href="/" className="btn-primary" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
            Back to Ginni Ki Baatein
          </Link>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
