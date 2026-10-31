import React from "react";
import { useStore, useName } from "../lib/store.jsx";
import { useDrawer } from "../lib/drawer.jsx";
import { EmptyBox, Chip, KindTag, VerdictBlock } from "../components/RequestTable.jsx";
import { hasRole, verdict, money, money0, termsLabel, fmtDate, isOverdue, addDays, todayISO } from "../../shared/logic.js";

function last4(a) { return a ? "••" + String(a).slice(-4) : "—"; }

export default function Payments() {
  const { ctx, loaded } = useStore();
  const { open } = useDrawer();
  const nm = useName();
  const fin = hasRole(ctx, "finance");

  const appr = ctx.requests.filter((r) => r.status === "approved").sort((a, b) => String(a.dueDate || "9").localeCompare(String(b.dueDate || "9")));
  const payable = appr.filter((r) => verdict(ctx, r).k === "yes");
  const cutoff = addDays(todayISO(), -60);
  const paid = ctx.requests.filter((r) => r.status === "paid" && String(r.paidOn || "") >= cutoff).sort((a, b) => String(b.paidOn).localeCompare(String(a.paidOn)));

  return (
    <>
      {fin ? (
        <div className="selbar">
          <span><strong>{payable.length}</strong> ready to pay · <span className="num">{money(payable.reduce((s, r) => s + (+r.netPayable || 0), 0))}</span>{appr.length > payable.length && <span className="muted small"> · {appr.length - payable.length} on hold</span>}</span>
          <span className="muted small">Open a request to record its UTR once paid.</span>
        </div>
      ) : (
        <div className="notice"><p className="muted">Only people in the Finance role can mark payments as paid.</p></div>
      )}

      {!loaded ? <EmptyBox title="Loading…" text="" /> : appr.length ? (
        <div className="tablewrap">
          <table style={{ minWidth: 980 }}>
            <thead><tr><th>Request</th><th>Payee</th><th>Bank details</th><th>Terms of payment</th><th className="r">Net payable</th><th>Can be paid?</th></tr></thead>
            <tbody>
              {appr.map((r) => {
                const p = r.payee || {};
                return (
                  <tr key={r.id} className="click" tabIndex={0} onClick={() => open({ mode: "detail", id: r.id })}>
                    <td><div className="cell-main mono">{r.id}</div><div className="cell-sub">{r.docType === "pi" ? "PI" : "Inv"} {r.invoiceNo}</div><KindTag r={r} />{r.priority === "urgent" && <div className="urgent">Urgent</div>}</td>
                    <td><div className="cell-main">{p.name}</div><div className="cell-sub">{r.nature || ""}</div></td>
                    <td>{p.account ? (<><div className="small">{p.beneficiary || ""}</div><div className="cell-sub mono">{p.ifsc} · {last4(p.account)}</div></>) : <span className="cell-sub">Not on file</span>}</td>
                    <td><div>{termsLabel(r)}</div><div className="cell-sub">{r.dueDate ? <span className={isOverdue(r) ? "overdue" : ""}>Due {fmtDate(r.dueDate)}</span> : "—"}</div></td>
                    <td className="r">{money(r.netPayable)}</td>
                    <td><VerdictBlock ctx={ctx} r={r} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <EmptyBox title="Nothing waiting to be paid" text="Fully approved requests land here." />}

      <div className="group-h"><h2>Recently paid</h2><span className="muted small">last 60 days</span></div>
      {paid.length ? (
        <div className="tablewrap">
          <table style={{ minWidth: 760 }}>
            <thead><tr><th>Paid on</th><th>Request</th><th>Payee</th><th>UTR</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {paid.map((r) => (
                <tr key={r.id} className="click" tabIndex={0} onClick={() => open({ mode: "detail", id: r.id })}>
                  <td>{fmtDate(r.paidOn)}</td><td className="mono">{r.id} <KindTag r={r} /></td><td>{(r.payee || {}).name}</td>
                  <td className="mono small">{r.utr}</td><td className="r num">{money(r.netPayable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted small" style={{ margin: 0 }}>No payments recorded in the last 60 days.</p>}
    </>
  );
}
