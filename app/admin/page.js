"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

// /admin — subscribers, extend / end / refund. Data comes live from the
// database on every load (GET /api/admin/subscribers), so accounts removed
// by the daily cleanup disappear from here automatically. Only accounts in
// ADMIN_EMAILS get past the API; everyone else sees the "not an admin" card.

const TZ = "Asia/Kolkata";
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
}
function daysLeft(d) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

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

  if (state.status === 401 || state.status === 403) {
    return (
      <div className="admin-page">
        <div className="admin-gate">
          <h1>Ginni Admin</h1>
          <p>{state.error}</p>
          <p className="admin-muted">Log in on the main page with an admin account, then come back to /admin.</p>
          <Link href="/" className="btn-primary admin-gate-btn">Go to log in</Link>
        </div>
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
              onClick={() => setFilter(f.key)}
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
          onChange={(e) => setQuery(e.target.value)}
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
            {visible.map((r) => {
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
