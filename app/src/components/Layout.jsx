import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useStore } from "../lib/store.jsx";
import { useDrawer } from "../lib/drawer.jsx";
import { useToast } from "../lib/toast.jsx";
import { api } from "../lib/api.js";
import { hasRole, money0, myAction, todayISO, verdict } from "../../shared/logic.js";
import Drawer from "./Drawer.jsx";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function Layout() {
  const { email, setEmail, ctx, loaded, offline, offlineMsg } = useStore();
  const { open } = useDrawer();
  const toast = useToast();
  const [exporting, setExporting] = React.useState(false);

  const myRoles = ["approver1", "approver2", "finance"].filter((r) => hasRole(ctx, r));
  const canExport = ctx.isAdmin || myRoles.length > 0;

  const pend = ctx.requests.filter((r) => r.status === "pending_l1" || r.status === "pending_l2");
  const appr = ctx.requests.filter((r) => r.status === "approved");
  const readyToPay = appr.filter((r) => verdict(ctx, r).k === "yes");
  const mine = ctx.requests.filter((r) => myAction(ctx, r));
  const mon = todayISO().slice(0, 7);
  const paid = ctx.requests.filter((r) => r.status === "paid" && String(r.paidOn || "").slice(0, 7) === mon);
  const sum = (a) => a.reduce((s, r) => s + (Number(r.netPayable) || 0), 0);

  async function logout() {
    await api.logout();
    setEmail(null);
  }

  async function onExport() {
    setExporting(true);
    try {
      const res = await api.exportLog();
      toast(`Saved "${res.name}" to Drive. <a href="${res.url}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">Open it</a>`, null, { html: true, ms: 12000 });
    } catch (e) {
      toast(e.message, "bad");
    } finally {
      setExporting(false);
    }
  }

  const queueCount = mine.length;
  const payCount = ctx.requests.filter((r) => r.status === "approved").length;

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <span className="eyebrow">Kenzen Ventures · Accounts</span>
          <h1>Payment Desk</h1>
        </div>
        <div className="who">
          {offline ? (
            <span className="muted small">Not connected: {offlineMsg || "reload the page."}</span>
          ) : !loaded ? (
            <span className="muted small">Loading…</span>
          ) : (
            <span className="who">
              <span className="small">{email}</span>
              {myRoles.map((r) => (
                <span className="rolechip" key={r}>{r === "approver1" ? "L1" : r === "approver2" ? "L2" : "Finance"}</span>
              ))}
              {ctx.isAdmin && <span className="rolechip">Admin</span>}
              <button className="btn ghost sm" type="button" onClick={logout}>Sign out</button>
            </span>
          )}
          {canExport && loaded && <button className="btn" type="button" disabled={exporting} onClick={onExport}>{exporting ? "Saving to Drive…" : "Download Excel log"}</button>}
          {loaded && !offline && <button className="btn primary" type="button" onClick={() => open({ mode: "form", editId: null, kind: "new", parent: null })}>New payment request</button>}
        </div>
      </header>

      <section className="ledger" aria-label="Totals">
        <div className="you"><span className="lab">Waiting on you</span><span className="val">{loaded ? mine.length : "—"}</span><span className="sub">{loaded ? (mine.length ? `${mine.length} item${mine.length === 1 ? "" : "s"} to action` : "Nothing to action") : "Loading…"}</span></div>
        <div><span className="lab">In approval</span><span className="val">{loaded ? money0(sum(pend)) : "—"}</span><span className="sub">{loaded ? `${pend.length} request${pend.length === 1 ? "" : "s"}` : " "}</span></div>
        <div><span className="lab">Ready to pay</span><span className="val">{loaded ? money0(sum(readyToPay)) : "—"}</span><span className="sub">{loaded ? `${readyToPay.length} cleared${appr.length > readyToPay.length ? ` · ${appr.length - readyToPay.length} on hold` : ""}` : " "}</span></div>
        <div><span className="lab">Paid this {MONTHS[new Date().getMonth()]}</span><span className="val">{loaded ? money0(sum(paid)) : "—"}</span><span className="sub">{loaded ? `${paid.length} payment${paid.length === 1 ? "" : "s"}` : " "}</span></div>
      </section>

      <nav className="tabs" role="tablist">
        {[
          ["", "For you", queueCount],
          ["all", "All requests", 0],
          ["pay", "Payments", payCount],
          ["payees", "Payees", 0],
          ["settings", "Approvals & settings", 0],
        ].map(([path, label, badge]) => (
          <NavLink key={path || "queue"} to={"/" + path} end className={({ isActive }) => "tab" + (isActive ? " active" : "")} role="tab">
            {label} {badge > 0 && <span className="badge">{badge}</span>}
          </NavLink>
        ))}
      </nav>

      <section className="panel">
        <Outlet />
      </section>
      <Drawer />
    </div>
  );
}
