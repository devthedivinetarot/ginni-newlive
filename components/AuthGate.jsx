"use client";

import { useState } from "react";
import PasswordInput from "./PasswordInput";

export default function AuthGate({ onAuthed }) {
  const [mode, setMode] = useState("login"); // "login" | "signup" | "forgot"
  const [sent, setSent] = useState(null); // confirmation text after a reset email is requested
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "forgot") {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Something went wrong.");
        setSent(data.message);
        return;
      }

      // A referral link looks like yoursite.com/?ref=CODE — an unrecognized
      // or absent code is never an error, the server just signs them up
      // without crediting anyone (see app/api/auth/signup/route.js).
      const referralCode =
        mode === "signup" && typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("ref")
          : null;

      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { email, password, name, referralCode } : { email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      onAuthed(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="onboard">
      <div className="onboard-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="The Divine Tarot" className="onboard-glyph" />
        <h1>Ginni Ki Baatein</h1>
        <p className="onboard-sub">
          {mode === "login"
            ? "Log in to continue your readings."
            : mode === "signup"
              ? "Create an account to start your readings."
              : "Enter your email and we'll send you a link to set a new password."}
        </p>

        {sent ? (
          <p className="prompt auth-sent" role="status">{sent}</p>
        ) : (
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="authEmail">Email</label>
            <input
              id="authEmail"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>

          {mode === "signup" && (
            <div className="field">
              <label htmlFor="authName">Your name (optional)</label>
              <input
                id="authName"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="What should Ginni call you?"
              />
            </div>
          )}

          {mode !== "forgot" && (
          <div className="field">
            <label htmlFor="authPassword">Password</label>
            <PasswordInput
              id="authPassword"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder="At least 8 characters"
            />
          </div>
          )}

          {error && (
            <p className="prompt" style={{ color: "var(--rose)", marginTop: -8, marginBottom: 16 }}>
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading
              ? "Please wait…"
              : mode === "login"
                ? "Log in"
                : mode === "signup"
                  ? "Create account"
                  : "Send reset link"}
          </button>
        </form>
        )}

        {mode === "login" && (
          <button
            type="button"
            className="auth-switch auth-forgot"
            onClick={() => {
              setMode("forgot");
              setError(null);
            }}
          >
            Forgot your password?
          </button>
        )}

        <button
          type="button"
          className="auth-switch"
          onClick={() => {
            setMode((m) => (m === "login" ? "signup" : "login"));
            setError(null);
            setSent(null);
          }}
        >
          {mode === "login"
            ? "New here? Create an account"
            : mode === "signup"
              ? "Already have an account? Log in"
              : "Back to log in"}
        </button>
      </div>
    </div>
  );
}
