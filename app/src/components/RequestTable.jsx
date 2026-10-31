import React from "react";
import { useStore, useName } from "../lib/store.jsx";
import { useDrawer } from "../lib/drawer.jsx";
import {
  STATUS, fmtDate, money, money0, termsLabel, tdsText, kindLabel, isOverdue, waitingOn, verdict, handleClean,
} from "../../shared/logic.js";

export function Chip({ status }) {
  const s = STATUS[status] || { label: status, cls: "s-muted" };
  return <span className={"chip " + s.cls}>{s.label}</span>;
}

export function KindTag({ r }) {
  if (!r.kind || r.kind === "full") return null;
  return <span className="tag">{kindLabel(r)}</span>;
}

export function VerdictBlock({ ctx, r, full }) {
  const v = verdict(ctx, r);
  const cls = { yes: "v-yes", no: "v-no", wait: "v-wait", paid: "v-paid" }[v.k];
  const shown = full ? v.reasons : v.reasons.slice(0, 2);
  return (
    <div className="verdict">
      <span className={"vlabel " + cls}>{v.label}</span>
      {shown.map((x, i) => <span className="vreason" key={i}>{x}</span>)}
      {!full && v.reasons.length > 2 && <span className="vreason">+{v.reasons.length - 2} more</span>}
    </div>
  );
}

function AmountCell({ r }) {
  if (r.kind === "advance" || r.kind === "balance") {
    return (
      <>
        <div className="cell-main num">{money(r.netPayable)}</div>
        <div className="bif">{r.kind === "advance" ? "Advance" : "Balance"} of {money0(r.invoiceTotal)}</div>
        <div className="bif">Paying {money0(r.payGross)} − TDS {money0(r.payTds)}</div>
      </>
    );
  }
  return (
    <>
      <div className="cell-main num">{money(r.netPayable)}</div>
      <div className="bif">Taxable {money0(r.taxable)}</div>
      <div className="bif">+ GST {money0(r.gstAmount)}</div>
      <div className="bif">− TDS {money0(r.tdsAmount)}</div>
    </>
  );
}

export default function RequestTable({ rows }) {
  const { ctx } = useStore();
  const nm = useName();
  const { open } = useDrawer();
  if (!rows.length) return null;
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Request</th><th>Payee &amp; document</th><th>Nature of payment</th><th>Terms of payment</th>
            <th className="r">Net payable</th><th>Status</th><th>Can be paid?</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const w = waitingOn(ctx, r);
            return (
              <tr key={r.id} className="click" tabIndex={0} onClick={() => open({ mode: "detail", id: r.id })}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open({ mode: "detail", id: r.id }); } }}>
                <td>
                  <div className="cell-main mono">{r.id}</div>
                  <div className="cell-sub">{fmtDate(r.createdAt)} · {nm(r.requestedBy)}</div>
                  <KindTag r={r} />
                  {r.priority === "urgent" && <div className="urgent">Urgent</div>}
                </td>
                <td style={{ minWidth: 180 }}>
                  <div className="cell-main">{(r.payee || {}).name || "—"}</div>
                  <div className="cell-sub">{r.docType === "pi" ? "PI" : "Inv"} {r.invoiceNo || "—"} · {r.costCentre || ""}</div>
                  {r.isInfluencer && <div className="cell-sub">@{handleClean(r.igHandle)}</div>}
                </td>
                <td style={{ minWidth: 190 }}>
                  <div>{r.nature || "—"}</div>
                  <div className="cell-sub">{tdsText(r)}</div>
                  {r.isInfluencer && <span className="tag">Influencer</span>}
                </td>
                <td style={{ minWidth: 150 }}>
                  <div>{termsLabel(r)}</div>
                  <div className="cell-sub">{r.dueDate ? <span className={isOverdue(r) ? "overdue" : ""}>Due {fmtDate(r.dueDate)}{isOverdue(r) ? " · overdue" : ""}</span> : "—"}</div>
                </td>
                <td className="r" style={{ minWidth: 200 }}><AmountCell r={r} /></td>
                <td>
                  <Chip status={r.status} />
                  {w.length > 0 && r.status !== "paid" && r.status !== "withdrawn" && (
                    <div className="cell-sub">{w.map(nm).slice(0, 2).join(", ")}{w.length > 2 ? ` +${w.length - 2}` : ""}</div>
                  )}
                </td>
                <td><VerdictBlock ctx={ctx} r={r} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyBox({ title, text, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p className="muted">{text}</p>
      {action}
    </div>
  );
}
