"use client";

// Access control for the free-reading limit + ₹199/month unlock.
//
// IMPORTANT: this is client-side (localStorage) state, not a server-enforced
// paywall. There's no backend/database in this app yet, so a technically
// determined user could clear their browser storage to reset the free count,
// or edit localStorage to fake a subscription. This is a reasonable MVP —
// real enforcement needs a backend that tracks this per logged-in user.

const FREE_LIMIT = 0; // no free readings — see FREE_READING_LIMIT in lib/auth.js
const STORAGE_KEY = "gkb_access_v1";

function readState() {
  if (typeof window === "undefined") return { readingsUsed: 0, subscribedUntil: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { readingsUsed: 0, subscribedUntil: null };
    const parsed = JSON.parse(raw);
    return {
      readingsUsed: Number(parsed.readingsUsed) || 0,
      subscribedUntil: parsed.subscribedUntil || null,
    };
  } catch {
    return { readingsUsed: 0, subscribedUntil: null };
  }
}

function writeState(state) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable (private browsing, etc.) — fail silently,
    // access checks just fall back to defaults each time.
  }
}

export function isSubscribed() {
  const { subscribedUntil } = readState();
  if (!subscribedUntil) return false;
  return new Date(subscribedUntil).getTime() > Date.now();
}

export function getSubscriptionExpiry() {
  const { subscribedUntil } = readState();
  return subscribedUntil;
}

export function getReadingsUsed() {
  return readState().readingsUsed;
}

export function getFreeReadingsLeft() {
  return Math.max(0, FREE_LIMIT - getReadingsUsed());
}

export function hasAccess() {
  if (isSubscribed()) return true;
  return getReadingsUsed() < FREE_LIMIT;
}

// Call once per completed reading (when a reveal is actually shown).
export function recordReadingUsed() {
  const state = readState();
  writeState({ ...state, readingsUsed: state.readingsUsed + 1 });
}

// Call after a verified successful payment. Grants 30 days of access.
export function activateSubscription() {
  const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const state = readState();
  writeState({ ...state, subscribedUntil: expiry });
  return expiry;
}

export const FREE_READING_LIMIT = FREE_LIMIT;
export const MONTHLY_PRICE_INR = 199;
