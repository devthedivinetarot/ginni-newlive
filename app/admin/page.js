"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PasswordInput from "@/components/PasswordInput";

// /admin — subscribers, extend / end / refund. Data comes live from the
// database on every load (GET /api/admin/subscribers), so accounts removed
// by the daily cleanup disappear from here automatically. Only accounts in
// the admin list (lib/admin.js) get past the API. Not logged in → the admin
// login form (email + password, forgot password). Logged in but not an
// admin → told so, with a way to switch account.

const TZ = "Asia/Kolkata";
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
}
function daysLeft(d) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

const PAGE_SIZE = 100;

const FILTERS = [
  { key: "active", label: "Active" },
  { key: "expired", label: "Expired" },
  { key: "none", label: "Never paid" },
  { key: "all", label: "All accounts" },
];

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export default function AdminPage() {
  const [state, setState] = useState({ loading: true, error: null, status: 200, rows: [], admin: null });
  const [filter, setFilter] = useState("active");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1); // 100 rows per page
  const [extendFor, setExtendFor] = useState(null); // row
  const [refundFor, setRefundFor] = useState(null); // row
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch("/api/admin/subscribers", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ loading: false, error: data.error || "Couldn't load.", status: res.status, rows: [], admin: null });
        return;
      }
      setState({ loading: false, error: null, status: 200, rows: data.rows, admin: data.admin });
    } catch {
      setState({ loading: false, error: "Network error — try again.", status: 0, rows: [], admin: null });
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  function flash(text, kind = "ok") {
    setToast({ text, kind });
    setTimeout(() => setToast(null), 5000);
  }

  const counts = useMemo(() => {
    const c = { active: 0, expired: 0, none: 0, all: state.rows.length, revenue: 0 };
    for (const r of state.rows) {
      c[r.status] += 1;
      c.revenue += r.totalPaidInr;
    }
    return c;
  }, [state.rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.rows
      .filter((r) => filter === "all" || r.status === filter)
      .filter((r) => !q || r.email.toLowerCase().includes(q) || (r.name || "").toLowerCase().includes(q));
  }, [state.rows, filter, query]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages); // e.g. after a refresh shrinks the list
  const pageRows = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstShown = visible.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const lastShown = Math.min(currentPage * PAGE_SIZE, visible.length);
  function goTo(n) {
    setPage(Math.min(Math.max(1, n), totalPages));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function endSubscription(row) {
    if (!window.confirm(`End ${row.email}'s subscription now?\n\nAccess stops immediately. The account is deleted by the daily cleanup 24 hours later (email kept in Resend) unless it is extended again.`)) return;
    try {
      await postJson("/api/admin/subscription", { userId: row.id, action: "end" });
      flash(`Subscription ended for ${row.email}.`);
      load();
    } catch (e) {
      flash(e.message, "err");
    }
  }

  const [changingPw, setChangingPw] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setState({ loading: false, error: null, status: 401, rows: [], admin: null });
  }

  if (state.status === 401 || state.status === 403) {
    return (
      <div className="admin-page">
        <AdminLogin
          notAdmin={state.status === 403}
          onSwitchAccount={logout}
          onLoggedIn={load}
        />
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h1>Ginni Admin</h1>
          <p className="admin-muted">Subscribers · signed in as {state.admin || "…"}</p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="admin-btn" onClick={load} disabled={state.loading}>
            {state.loading ? "Loading…" : "Refresh"}
          </button>
          <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setChangingPw(true)}>
            Change password
          </button>
          <button type="button" className="admin-btn admin-btn-ghost" onClick={logout}>
            Log out
          </button>
          <Link href="/" className="admin-btn admin-btn-ghost">Back to site</Link>
        </div>
      </header>

      <section className="admin-stats">
        <div className="admin-stat"><span>{counts.active}</span>Active</div>
        <div className="admin-stat"><span>{counts.expired}</span>Expired</div>
        <div className="admin-stat"><span>{counts.none}</span>Never paid</div>
        <div className="admin-stat"><span>₹{counts.revenue.toLocaleString("en-IN")}</span>Collected (not refunded)</div>
      </section>

      <section className="admin-toolbar">
        <div className="admin-tabs" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              className={"admin-tab" + (filter === f.key ? " active" : "")}
              onClick={() => { setFilter(f.key); setPage(1); }}
            >
              {f.label} <b>{counts[f.key]}</b>
            </button>
          ))}
        </div>
        <input
          className="admin-search"
          type="search"
          placeholder="Search name or email"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1); }}
        />
      </section>

      {state.error && <p className="admin-error">{state.error}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Login ID (email)</th>
              <th>Subscribed on</th>
              <th>Valid till</th>
              <th>Paid</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const left = daysLeft(r.validTill);
              const canRefund = r.orders.some((o) => o.status === "paid");
              return (
                <tr key={r.id}>
                  <td data-label="Name">{r.name || <span className="admin-muted">—</span>}</td>
                  <td data-label="Login ID" className="admin-email">{r.email}</td>
                  <td data-label="Subscribed on">
                    {r.subscribedAt ? fmtDate(r.subscribedAt) : r.validTill ? <span className="admin-muted">Added by admin</span> : <span className="admin-muted">—</span>}
                  </td>
                  <td data-label="Valid till">
                    {r.validTill ? (
                      <span className="admin-valid">
                        {fmtDate(r.validTill)}
                        <span className={"admin-pill " + r.status}>
                          {r.status === "active" ? `${left} day${left === 1 ? "" : "s"} left` : "Expired"}
                        </span>
                      </span>
                    ) : (
                      <span className="admin-pill none">No subscription</span>
                    )}
                  </td>
                  <td data-label="Paid">
                    ₹{r.totalPaidInr.toLocaleString("en-IN")}
                    {r.orders.some((o) => o.status === "refunded") && <span className="admin-muted"> · refunded</span>}
                  </td>
                  <td className="admin-actions">
                    <button type="button" className="admin-btn" onClick={() => setExtendFor(r)}>Extend</button>
                    {r.status === "active" && (
                      <button type="button" className="admin-btn admin-btn-ghost" onClick={() => endSubscription(r)}>End</button>
                    )}
                    {canRefund && (
                      <button type="button" className="admin-btn admin-btn-danger" onClick={() => setRefundFor(r)}>Refund</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!state.loading && visible.length === 0 && (
              <tr><td colSpan={6} className="admin-empty">No accounts here.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {visible.length > 0 && (
        <Pager
          page={currentPage}
          totalPages={totalPages}
          first={firstShown}
          last={lastShown}
          total={visible.length}
          onGo={goTo}
        />
      )}

      {extendFor && (
        <ExtendDialog
          row={extendFor}
          onClose={() => setExtendFor(null)}
          onDone={(msg) => { setExtendFor(null); flash(msg); load(); }}
          onError={(msg) => flash(msg, "err")}
        />
      )}
      {refundFor && (
        <RefundDialog
          row={refundFor}
          onClose={() => setRefundFor(null)}
          onDone={(msg) => { setRefundFor(null); flash(msg); load(); }}
          onError={(msg) => flash(msg, "err")}
        />
      )}
      {changingPw && (
        <ChangePasswordDialog
          onClose={() => setChangingPw(false)}
          onDone={() => { setChangingPw(false); flash("Password changed. Use the new one next time you log in."); }}
        />
      )}
      {toast && <div className={"admin-toast " + toast.kind} role="status">{toast.text}</div>}
    </div>
  );
}

function Dialog({ title, onClose, children }) {
  return (
    <div className="chat-modal-backdrop" onClick={onClose}>
      <div className="chat-modal-panel admin-dialog" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="chat-modal-close" onClick={onClose} aria-label="Close">✕</button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function ExtendDialog({ row, onClose, onDone, onError }) {
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const left = daysLeft(row.validTill);
  const base = row.validTill && left > 0 ? new Date(row.validTill) : new Date();
  const newDate = new Date(base.getTime() + (Number(days) || 0) * 86400000);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await postJson("/api/admin/subscription", { userId: row.id, action: "extend", days: Number(days) });
      onDone(`${row.email} extended to ${fmtDate(d.validTill)}.`);
    } catch (err) {
      onError(err.message);
      setBusy(false);
    }
  }

  return (
    <Dialog title="Extend subscription" onClose={onClose}>
      <p className="admin-muted">{row.name ? `${row.name} · ` : ""}{row.email}</p>
      <p>Currently valid till: <b>{row.validTill ? fmtDate(row.validTill) : "no subscription"}</b></p>
      <form onSubmit={submit}>
        <div className="admin-chips">
          {[7, 15, 30, 90, 365].map((n) => (
            <button key={n} type="button" className={"admin-chip" + (Number(days) === n ? " active" : "")} onClick={() => setDays(n)}>
              +{n} days
            </button>
          ))}
        </div>
        <label className="admin-field">
          Days to add
          <input type="number" min={1} max={3650} required value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
        <p>New validity: <b>{fmtDate(newDate)}</b></p>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : `Extend by ${days} days`}</button>
      </form>
    </Dialog>
  );
}

function RefundDialog({ row, onClose, onDone, onError }) {
  const paidOrders = row.orders.filter((o) => o.status === "paid");
  const [orderId, setOrderId] = useState(paidOrders[paidOrders.length - 1]?.id || "");
  const order = paidOrders.find((o) => o.id === orderId);
  const [amount, setAmount] = useState(order?.amountInr || 199);
  const [endSub, setEndSub] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!order) return;
    if (!window.confirm(`Refund ₹${amount} to ${row.email}?\n\nThis sends money back through Razorpay and cannot be undone.`)) return;
    setBusy(true);
    try {
      const d = await postJson("/api/admin/refund", { orderId, amountInr: Number(amount), endSubscription: endSub });
      onDone(`Refund of ₹${d.amountInr} started for ${row.email} (Razorpay ${d.refundId}). It reaches them in 5–7 working days.`);
    } catch (err) {
      onError(err.message);
      setBusy(false);
    }
  }

  return (
    <Dialog title="Refund a payment" onClose={onClose}>
      <p className="admin-muted">{row.name ? `${row.name} · ` : ""}{row.email}</p>
      <form onSubmit={submit}>
        <label className="admin-field">
          Payment
          <select
            value={orderId}
            onChange={(e) => {
              setOrderId(e.target.value);
              const o = paidOrders.find((x) => x.id === e.target.value);
              if (o) setAmount(o.amountInr);
            }}
          >
            {paidOrders.map((o) => (
              <option key={o.id} value={o.id}>
                {fmtDate(o.createdAt)} · ₹{o.amountInr} · {o.razorpayOrderId}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          Amount to refund (₹)
          <input type="number" min={1} max={order?.amountInr || 199} step="1" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="admin-check">
          <input type="checkbox" checked={endSub} onChange={(e) => setEndSub(e.target.checked)} />
          Also end their subscription now
        </label>
        <button type="submit" className="btn-primary admin-danger-btn" disabled={busy || !order}>
          {busy ? "Refunding…" : `Refund ₹${amount}`}
        </button>
      </form>
    </Dialog>
  );
}

// Shown on /admin when nobody (or a non-admin) is logged in. Uses the same
// /api/auth/login and /api/auth/forgot-password as the main site; whether
// the account is an admin is decided by the server on the next load.
function AdminLogin({ notAdmin, onSwitchAccount, onLoggedIn }) {
  const [mode, setMode] = useState("login"); // login | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(null);

  if (notAdmin) {
    return (
      <div className="admin-gate">
        <h1>Ginni Admin</h1>
        <p>This account isn&apos;t an admin.</p>
        <button type="button" className="btn-primary admin-gate-btn" onClick={onSwitchAccount}>
          Log in with an admin account
        </button>
        <p><Link href="/" className="admin-link">Back to site</Link></p>
      </div>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "forgot") {
        const d = await postJson("/api/auth/forgot-password", { email });
        setSent(d.message || "If that account exists, a reset link is on its way.");
      } else {
        await postJson("/api/auth/login", { email, password });
        setPassword("");
        await onLoggedIn();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-gate">
      <h1>Ginni Admin</h1>
      <p className="admin-muted">
        {mode === "login" ? "Log in with your admin email and password." : "Enter your admin email and we'll send a link to set a new password."}
      </p>
      {sent ? (
        <p className="admin-sent" role="status">{sent}</p>
      ) : (
        <form onSubmit={submit} className="admin-login-form">
          <label className="admin-field">
            Email ID
            <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          {mode === "login" && (
            <label className="admin-field">
              Password
              <PasswordInput required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
            </label>
          )}
          {error && <p className="admin-error">{error}</p>}
          <button type="submit" className="btn-primary admin-gate-btn" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Log in" : "Send reset link"}
          </button>
        </form>
      )}
      <button
        type="button"
        className="admin-link"
        onClick={() => { setMode(mode === "login" ? "forgot" : "login"); setError(null); setSent(null); }}
      >
        {mode === "login" ? "Forgot password? Reset it" : "Back to log in"}
      </button>
    </div>
  );
}

function ChangePasswordDialog({ onClose, onDone }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError("New password must be at least 8 characters.");
    if (next !== confirm) return setError("The two new passwords don't match.");
    setBusy(true);
    try {
      await postJson("/api/auth/change-password", { currentPassword: current, newPassword: next });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Dialog title="Change password" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="admin-field">
          Current password
          <PasswordInput required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="admin-field">
          New password (at least 8 characters)
          <PasswordInput required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label className="admin-field">
          Repeat new password
          <PasswordInput required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {error && <p className="admin-error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
      </form>
    </Dialog>
  );
}

// "Showing 101–200 of 370" + Previous / numbered pages / Next.
function Pager({ page, totalPages, first, last, total, onGo }) {
  const nums = [];
  for (let n = 1; n <= totalPages; n++) {
    if (n === 1 || n === totalPages || Math.abs(n - page) <= 1) nums.push(n);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  return (
    <nav className="admin-pager" aria-label="Pages">
      <span className="admin-muted">Showing {first}–{last} of {total}</span>
      {totalPages > 1 && (
        <div className="admin-pager-btns">
          <button type="button" className="admin-btn admin-btn-ghost" disabled={page === 1} onClick={() => onGo(page - 1)}>
            ‹ Previous
          </button>
          {nums.map((n, i) =>
            n === "…" ? (
              <span key={`gap${i}`} className="admin-muted">…</span>
            ) : (
              <button
                key={n}
                type="button"
                className={"admin-page-num" + (n === page ? " active" : "")}
                aria-current={n === page ? "page" : undefined}
                onClick={() => onGo(n)}
              >
                {n}
              </button>
            )
          )}
          <button type="button" className="admin-btn admin-btn-ghost" disabled={page === totalPages} onClick={() => onGo(page + 1)}>
            Next ›
          </button>
        </div>
      )}
    </nav>
  );
}
