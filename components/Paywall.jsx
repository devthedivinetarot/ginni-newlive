"use client";

import { useState } from "react";
import { MONTHLY_PRICE_INR, startSubscriptionCheckout } from "@/lib/razorpayCheckout";

export default function Paywall({ name, onUnlocked }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubscribe() {
    setError(null);
    setLoading(true);
    try {
      await startSubscriptionCheckout({
        name,
        onUnlocked: (access) => {
          setLoading(false);
          onUnlocked?.(access);
        },
        onError: (message) => {
          setError(message);
          setLoading(false);
        },
        onDismiss: () => setLoading(false),
      });
    } catch (e) {
      setError(e.message || "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div className="state-empty paywall">
      <svg className="glyph-big" viewBox="0 0 46 46" fill="none">
        <circle cx="23" cy="23" r="21" stroke="var(--gold)" strokeWidth="1" opacity="0.6" />
        <path d="M23 10 L27 20 L37 23 L27 26 L23 36 L19 26 L9 23 L19 20 Z" fill="var(--gold-soft)" opacity="0.85" />
      </svg>
      <h2>Get your reading at just {MONTHLY_PRICE_INR}/- Rs</h2>
      <p className="paywall-sub">(Monthly subscription)</p>
      <p>
        Unlimited readings, all 16 questions, in Hinglish, English or Hindi — for 30 days.
      </p>

      <button className="btn-gold paywall-btn" onClick={handleSubscribe} disabled={loading}>
        {loading ? "Opening payment…" : `Subscribe — ₹${MONTHLY_PRICE_INR}/month`}
      </button>

      {error && <p className="prompt" style={{ color: "var(--rose)", marginTop: 14 }}>{error}</p>}

      <p className="paywall-fineprint">
        Secure payment via Razorpay. Access opens the moment payment completes.
      </p>
    </div>
  );
}
