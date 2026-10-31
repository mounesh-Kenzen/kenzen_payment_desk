import React, { useMemo, useState } from "react";
import { useStore } from "../lib/store.jsx";
import RequestTable, { EmptyBox } from "../components/RequestTable.jsx";
import { verdict, money } from "../../shared/logic.js";

export default function AllRequests() {
  const { ctx, loaded } = useStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [cc, setCc] = useState("all");
  const [vd, setVd] = useState("all");

  const ccs = useMemo(() => {
    const out = [];
    ctx.settings.costCentres.concat(ctx.requests.map((r) => r.costCentre)).forEach((c) => { if (c && out.indexOf(c) < 0) out.push(c); });
    return out;
  }, [ctx]);

  const rows = ctx.requests.filter((r) => {
    if (status === "pending" && ["pending_l1", "pending_l2"].indexOf(r.status) < 0) return false;
    if (status !== "all" && status !== "pending" && r.status !== status) return false;
    if (cc !== "all" && r.costCentre !== cc) return false;
    if (vd !== "all" && verdict(ctx, r).k !== vd) return false;
    if (q) {
      const hay = [r.id, (r.payee || {}).name, r.invoiceNo, r.description, r.nature, r.costCentre, r.igHandle, r.parentId].join(" ").toLowerCase();
      if (hay.indexOf(q.toLowerCase()) < 0) return false;
    }
    return true;
  });
  const total = rows.reduce((s, r) => s + (+r.netPayable || 0), 0);

  return (
    <>
      <div className="toolbar">
        <div className="field grow">
          <label htmlFor="flt-q">Search</label>
          <input type="search" id="flt-q" placeholder="Payee, invoice no., nature, request ID, Instagram handle" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="flt-status">Status</label>
          <select id="flt-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending">In approval</option>
            <option value="approved">Approved, unpaid</option>
            <option value="paid">Paid</option>
            <option value="rejected">Sent back</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="flt-verdict">Can be paid?</label>
          <select id="flt-verdict" value={vd} onChange={(e) => setVd(e.target.value)}>
            <option value="all">Any</option><option value="yes">Yes</option><option value="no">No</option><option value="wait">Not yet</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="flt-cc">Cost centre</label>
          <select id="flt-cc" value={cc} onChange={(e) => setCc(e.target.value)}>
            <option value="all">All cost centres</option>
            {ccs.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      {!loaded ? <EmptyBox title="Loading requests…" text="" /> : rows.length ? (
        <>
          <p className="muted small" style={{ margin: 0 }}>{rows.length} request{rows.length === 1 ? "" : "s"} · net {money(total)}</p>
          <RequestTable rows={rows} />
        </>
      ) : (
        <EmptyBox title={ctx.requests.length ? "No requests match" : "No payment requests yet"} text={ctx.requests.length ? "Try a different search or filter." : "Requests appear here once someone raises one."} />
      )}
    </>
  );
}
