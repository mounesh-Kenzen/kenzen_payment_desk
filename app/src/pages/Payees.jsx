import React, { useState } from "react";
import { useStore } from "../lib/store.jsx";
import { useDrawer } from "../lib/drawer.jsx";
import { EmptyBox } from "../components/RequestTable.jsx";
import { fyOf, fyLabel, todayISO, natureById, TERMS, money0, fmtDate, handleClean } from "../../shared/logic.js";

function last4(a) { return a ? "••" + String(a).slice(-4) : "—"; }

export default function Payees() {
  const { ctx, loaded } = useStore();
  const { open } = useDrawer();
  const [q, setQ] = useState("");

  const list = Array.from(ctx.payees.values())
    .filter((p) => !q || [p.name, p.gstin, p.pan, p.igHandle, p.email, p.ifsc, p.beneficiary].join(" ").toLowerCase().indexOf(q.toLowerCase()) >= 0)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const fy = fyOf(todayISO());
  const recent = Date.now() - 30 * 864e5;

  return (
    <>
      <div className="toolbar">
        <div className="field grow">
          <label htmlFor="payee-q">Search payees</label>
          <input type="search" id="payee-q" placeholder="Name, GSTIN, PAN, IFSC, Instagram handle" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {loaded && <button className="btn" type="button" style={{ alignSelf: "flex-end" }} onClick={() => open({ mode: "payee", payeeId: null, returnTo: null })}>Add payee</button>}
      </div>

      {!loaded ? <EmptyBox title="Loading payees…" text="" /> : !list.length ? (
        <EmptyBox
          title={ctx.payees.size ? "No payees match" : "No payees yet"}
          text={ctx.payees.size ? "Try another search." : "Add each vendor or influencer once with their GSTIN and PAN, and bank details if you have them. Everything is remembered for the next request."}
          action={!ctx.payees.size && <button className="btn primary" type="button" onClick={() => open({ mode: "payee", payeeId: null, returnTo: null })}>Add payee</button>}
        />
      ) : (
        <div className="tablewrap">
          <table style={{ minWidth: 960 }}>
            <thead><tr><th>Payee</th><th>GSTIN / PAN</th><th>Bank details</th><th>Defaults</th><th className="r">{fyLabel(fy)} so far</th></tr></thead>
            <tbody>
              {list.map((p) => {
                const fyTotal = ctx.requests.filter((r) => r.payeeId === p.id && r.kind !== "balance" && r.status !== "withdrawn" && r.status !== "rejected" && fyOf(r.invoiceDate) === fy).reduce((s, r) => s + (+r.taxable || 0), 0);
                const nat = natureById(ctx, p.defaultNatureId);
                const tm = TERMS.filter((t) => t.v === p.defaultTerms)[0];
                const changed = p.bankChangedAt && new Date(p.bankChangedAt).getTime() > recent;
                return (
                  <tr key={p.id} className="click" tabIndex={0} onClick={() => open({ mode: "payee", payeeId: p.id, returnTo: null })}>
                    <td><div className="cell-main">{p.name}</div>{p.igHandle && <div className="cell-sub">@{handleClean(p.igHandle)}</div>}{p.email && <div className="cell-sub">{p.email}</div>}</td>
                    <td><div className="mono small">{p.gstin || "—"}</div><div className="cell-sub mono">{p.pan ? p.pan : <span style={{ color: "var(--bad)" }}>No PAN · TDS 20%</span>}</div></td>
                    <td>{p.account ? (<><div className="small">{p.beneficiary || ""}</div><div className="cell-sub mono">{p.ifsc} · {last4(p.account)}</div>{changed && <span className="chip s-pending">Changed {fmtDate(p.bankChangedAt)}</span>}</>) : <span className="cell-sub">Not added</span>}</td>
                    <td className="small">{nat ? nat.name : "—"}<div className="cell-sub">{p.defaultCc || ""}{tm ? " · " + tm.l : ""}</div></td>
                    <td className="r num small">{money0(fyTotal)}<div className="cell-sub">taxable value</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
