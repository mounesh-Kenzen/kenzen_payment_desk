import React, { useState } from "react";
import { useStore, useName } from "../lib/store.jsx";
import { useDrawer } from "../lib/drawer.jsx";
import { useToast } from "../lib/toast.jsx";
import { api } from "../lib/api.js";
import { Chip, KindTag, VerdictBlock } from "./RequestTable.jsx";
import {
  checks, passes, verdict, myAction, waitingOn, canRaiseBalance, canEditTerms, balanceLeft, termsLabel, tdsText,
  kindLabel, fmtDate, fmtWhen, money, money0, todayISO, handleClean, TERMS, addDays, ACT_LABEL, isOverdue,
} from "../../shared/logic.js";

const ACT_DOT = { approved_l1: "ok", approved_l2: "ok", paid: "ok", rejected: "bad", submitted: "acc", resubmitted: "acc", terms_changed: "acc", reel_checked: "ok", balance_raised: "acc" };

function RouteSteps({ r }) {
  const l1 = !!r.l1By, l2 = !!r.l2By, st = r.status;
  const steps = [<span className="step done" key="raised">Raised</span>];
  steps.push(<span className={"step " + (l1 ? "done" : st === "pending_l1" ? "now" : (st === "rejected" && !l1) ? "stop" : "")} key="l1">Level 1</span>);
  if (r.levels === 2) steps.push(<span className={"step " + (l2 ? "done" : st === "pending_l2" ? "now" : (st === "rejected" && l1) ? "stop" : "")} key="l2">Level 2</span>);
  steps.push(<span className={"step " + (st === "paid" ? "done" : st === "approved" ? "now" : "")} key="paid">Paid</span>);
  if (r.kind === "advance") steps.push(<span className={"step " + (r.balanceId ? "done" : st === "paid" ? "now" : "")} key="bal">Balance</span>);
  return <div className="route">{steps.map((s, i) => <React.Fragment key={i}>{i > 0 && <span className="muted">→</span>}{s}</React.Fragment>)}</div>;
}

function Checklist({ ctx, r, nm }) {
  return (
    <ul className="checklist">
      {checks(ctx, r).map((c) => {
        const ov = !c.ok && c.ovr && r.overrides && r.overrides[c.id];
        const cls = c.ok ? "ok" : ov ? "acc" : c.sev === "warn" ? "warn" : "no";
        const mk = c.ok ? "✓" : (ov || c.sev === "warn") ? "!" : "✕";
        return (
          <li key={c.id}>
            <span className={"mark " + cls}>{mk}</span>
            <div>
              <div>{c.ok ? c.label : c.reason}</div>
              {c.detail && <div className="cell-sub">{c.detail}</div>}
              {ov && <div className="cell-sub">Accepted by {nm(ov.by)}: {ov.note}</div>}
              {!c.ok && !ov && c.sev === "warn" && <div className="cell-sub">Warning only</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Voucher({ r, findReq }) {
  const docT = r.docType === "pi" ? "PI" : "invoice";
  const par = r.kind === "balance" ? findReq(r.parentId) : null;
  return (
    <div className="voucher">
      <div className="vrow"><span>Taxable value</span><span className="num">{money(r.taxable)}</span></div>
      <div className="vrow"><span>GST{r.gstRate !== "custom" && r.gstRate != null ? ` @ ${r.gstRate}%` : ""}</span><span className="num">{money(r.gstAmount)}</span></div>
      <div className="vrow"><span><strong>{r.docType === "pi" ? "PI total" : "Invoice total"}</strong></span><span className="num"><strong>{money(r.invoiceTotal)}</strong></span></div>
      <div className="vrow"><span>TDS on full {docT} · {tdsText(r)}</span><span className="num">− {money(r.tdsAmount)}</span></div>
      {(r.kind === "advance" || r.kind === "balance") && (
        <>
          <div className="vrow"><span>Net of TDS (full {docT})</span><span className="num">{money(r.invoiceNet)}</span></div>
          {par && <div className="vrow"><span>Already paid as advance ({par.id})</span><span className="num">{money(par.payGross)} − TDS {money(par.payTds)}</span></div>}
          <div className="vrow"><span>{r.kind === "advance" ? "Advance" : "Balance"} amount (incl. GST)</span><span className="num">{money(r.payGross)}</span></div>
          <div className="vrow"><span>Less TDS on this payment</span><span className="num">− {money(r.payTds)}</span></div>
        </>
      )}
      <div className="vrow total"><span><strong>Net payable{r.kind === "advance" ? " now" : ""}</strong></span><span className="num">{money(r.netPayable)}</span></div>
    </div>
  );
}

export default function RequestDetail({ state }) {
  const { ctx, refresh } = useStore();
  const { open, close } = useDrawer();
  const toast = useToast();
  const nm = useName();
  const [note, setNote] = useState("");
  const [accept, setAccept] = useState(false);
  const [reel, setReel] = useState(false);
  const [utr, setUtr] = useState("");
  const [paidOn, setPaidOn] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [editTerms, setEditTerms] = useState(false);
  const [tCode, setTCode] = useState("");
  const [tCustom, setTCustom] = useState("");
  const [tDue, setTDue] = useState("");
  const [tNote, setTNote] = useState("");

  const findReq = (id) => ctx.requests.filter((x) => x.id === id)[0];
  const r = findReq(state.id);
  if (!r) return (
    <>
      <div className="drawer-h"><h2>Not found</h2><button className="btn ghost" type="button" onClick={close}>Close</button></div>
      <div className="drawer-b"><div className="empty"><h3>Request not found</h3><p className="muted">It may have been removed.</p></div></div>
    </>
  );

  const act = myAction(ctx, r), w = waitingOn(ctx, r), p = r.payee || {}, v = verdict(ctx, r), cs = checks(ctx, r);

  function startEditTerms() {
    setEditTerms(true); setTCode(r.termsCode); setTCustom(r.termsText || ""); setTDue(r.dueDate || ""); setTNote("");
  }
  function onTermsCodeChange(code) {
    setTCode(code);
    const t = TERMS.filter((x) => x.v === code)[0];
    if (t && t.days != null) { const base = (code === "advance" || code === "receipt") ? todayISO() : r.invoiceDate; if (base) setTDue(addDays(base, t.days)); }
  }
  async function saveTerms() {
    if (tCode === "custom" && !tCustom.trim()) return toast("Describe the terms.", "bad");
    if (!tDue) return toast("Enter the pay-by date.", "bad");
    if (!tNote.trim()) return toast("Add a reason for the change.", "bad");
    setBusy(true);
    try { await api.terms(r.id, tCode, tCustom, tDue, tNote); await refresh(); setEditTerms(false); toast("Terms updated."); }
    catch (e) { toast(e.message, "bad"); } finally { setBusy(false); }
  }

  async function doAction(kind) {
    if (kind === "reject" && !note.trim()) return toast("Add a comment so the requester knows what to fix.", "bad");
    const opts = { note: note.trim(), accept, reel };
    if (kind === "paid") {
      opts.utr = utr.trim(); opts.paidOn = paidOn || todayISO();
      if (opts.utr.length < 6) return toast("Enter the UTR or bank reference from the bank statement.", "bad");
    }
    setBusy(true);
    try {
      await api.act(r.id, kind, opts);
      await refresh();
      close();
      const msgs = {
        approve: r.levels === 2 && r.status === "pending_l1" ? "Approved at Level 1. Sent to Level 2." : "Approved. It's now with Finance.",
        reject: "Sent back to the requester.", withdraw: "Request withdrawn.",
        paid: r.kind === "advance" ? "Advance marked as paid. The balance now waits for the requester to raise it." : "Marked as paid.",
      };
      toast(msgs[kind]);
    } catch (e) { toast(e.message, "bad"); } finally { setBusy(false); }
  }

  let actionBlock = null;
  if (act === "approve") {
    const hard = cs.filter((c) => c.sev === "block" && !c.ovr && !c.ok && c.id !== "reelok");
    const soft = cs.filter((c) => c.sev === "block" && c.ovr && !passes(c, r));
    const needReel = r.isInfluencer && !r.reelCheckedBy;
    actionBlock = (
      <div className="actbox">
        <h3>{r.status === "pending_l1" ? "Level 1" : "Level 2"} approval</h3>
        <p className="small muted" style={{ margin: 0 }}>You're approving <strong className="num">{money(r.netPayable)}</strong>{r.kind === "advance" ? " as an advance" : r.kind === "balance" ? " as the balance" : ""} to {p.name} for {r.nature || "this invoice"}, on terms "{termsLabel(r)}".</p>
        {hard.length > 0 && <div className="notice warn"><p className="small">This can't be approved until it's fixed: {hard.map((c) => c.reason).join("; ")}. Send it back with a comment.</p></div>}
        {needReel && !hard.length && (
          <label className="check"><input type="checkbox" checked={reel} onChange={(e) => setReel(e.target.checked)} /> <span>I opened <a href={r.reelLink} target="_blank" rel="noopener noreferrer">the reel</a>. It's live on @{handleClean(r.igHandle)} and matches the brief.</span></label>
        )}
        {soft.length > 0 && !hard.length && (
          <label className="check"><input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} /> <span>Accept these exceptions and approve anyway: {soft.map((c) => c.reason).join("; ")}. Explain why in the comment.</span></label>
        )}
        <div className="field"><label htmlFor="act-note">Comment {soft.length ? "(required)" : "(required to send back)"}</label><textarea id="act-note" rows={2} placeholder="e.g. PO reference missing, GST amount doesn't match invoice" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn bad" type="button" disabled={busy} onClick={() => doAction("reject")}>Send back</button>
          <button className="btn ok" type="button" disabled={busy || hard.length > 0} onClick={() => doAction("approve")}>Approve</button>
        </div>
      </div>
    );
  } else if (act === "pay") {
    actionBlock = v.k === "yes" ? (
      <div className="actbox">
        <h3>Record payment</h3>
        {p.account ? <p className="small" style={{ margin: 0 }}>Pay <strong className="num">{money(r.netPayable)}</strong> to {p.beneficiary || p.name} · <span className="mono">{p.account}</span> · <span className="mono">{p.ifsc}</span>{p.bank ? " · " + p.bank : ""}</p> : <p className="small" style={{ margin: 0, color: "var(--warn)" }}>No bank details on file. Confirm the account with {p.name} before paying.</p>}
        <div className="grid2">
          <div className="field"><label htmlFor="pay-utr">UTR / bank reference</label><input type="text" id="pay-utr" autoComplete="off" placeholder="e.g. HDFCR52026103012345678" value={utr} onChange={(e) => setUtr(e.target.value)} /></div>
          <div className="field"><label htmlFor="pay-date">Paid on</label><input type="date" id="pay-date" value={paidOn} max={todayISO()} onChange={(e) => setPaidOn(e.target.value)} /></div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn ok" type="button" disabled={busy} onClick={() => doAction("paid")}>Mark as paid</button></div>
      </div>
    ) : (
      <div className="notice warn"><p className="small">Approved, but it can't be paid yet: {v.reasons.join("; ")}. Ask an approver to send it back so it's corrected.</p></div>
    );
  } else if (act === "fix") {
    const why = (r.history || []).slice().reverse().filter((h) => h.action === "rejected")[0];
    actionBlock = (
      <div className="actbox">
        <h3>Sent back by {nm(why && why.by)}</h3>
        {why && why.note && <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{why.note}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn" type="button" disabled={busy} onClick={() => doAction("withdraw")}>Withdraw</button>
          <button className="btn primary" type="button" onClick={() => open({ mode: "form", editId: r.id, kind: r.kind === "balance" ? "balance" : "new", parent: r.kind === "balance" ? findReq(r.parentId) : null, sourceReq: r })}>Edit &amp; resubmit</button>
        </div>
      </div>
    );
  } else if (r.status === "pending_l1" || r.status === "pending_l2") {
    actionBlock = (
      <div className="notice">
        <p className="small">{w.length ? `Waiting for ${w.map(nm).join(", ")}.` : `Nobody is assigned who can approve this yet${r.status === "pending_l2" ? " at Level 2" : ""}.`}</p>
        {r.requestedBy === ctx.me.id && <button className="btn" type="button" disabled={busy} onClick={() => doAction("withdraw")}>Withdraw</button>}
      </div>
    );
  } else if (r.status === "approved") {
    actionBlock = <div className="notice"><p className="small">Approved. {w.length ? `Waiting for ${w.map(nm).join(", ")} to pay.` : "No Finance person is assigned yet."}</p></div>;
  }

  let balanceBlock = null;
  if (r.kind === "advance" && r.status === "paid") {
    if (r.balanceId) balanceBlock = <div className="infobox">Balance raised on <button className="btn ghost" type="button" style={{ padding: 0 }} onClick={() => open({ mode: "detail", id: r.balanceId })}>{r.balanceId}</button></div>;
    else if (canRaiseBalance(ctx, r)) balanceBlock = (
      <div className="actbox">
        <h3>Balance pending</h3>
        <p className="small" style={{ margin: 0 }}><strong className="num">{money(balanceLeft(r))}</strong> of the {r.docType === "pi" ? "PI" : "invoice"} total ({money(r.invoiceTotal)}) is still to be paid. When it's due, raise it here and attach the final tax invoice if you have it. The balance goes through approval again.</p>
        <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn primary" type="button" onClick={() => open({ mode: "form", editId: null, kind: "balance", parent: r })}>Raise balance payment</button></div>
      </div>
    );
    else balanceBlock = <div className="infobox">Balance of {money(balanceLeft(r))} not raised yet. {nm(r.requestedBy)} can raise it.</div>;
  }

  const files = r.attachments || [];
  const hist = r.history || [];

  return (
    <>
      <div className="drawer-h"><h2 className="mono">{r.id}</h2><button className="btn ghost" type="button" onClick={close} aria-label="Close">Close</button></div>
      <div className="drawer-b">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Chip status={r.status} /><KindTag r={r} />
          {r.docType === "pi" && <span className="tag">Proforma</span>}
          {r.isInfluencer && <span className="tag">Influencer</span>}
          {r.priority === "urgent" && <span className="urgent">Urgent</span>}
          {isOverdue(r) && <span className="overdue small">Overdue</span>}
        </div>
        <RouteSteps r={r} />
        <div className={"vbox " + v.k}>
          <span className="flabel">CAN THIS BE PAID?</span>
          <VerdictBlock ctx={ctx} r={r} full />
          <Checklist ctx={ctx} r={r} nm={nm} />
        </div>
        {actionBlock}
        {balanceBlock}
        {r.kind === "balance" && <div className="infobox">Balance against advance <button className="btn ghost" type="button" style={{ padding: 0 }} onClick={() => open({ mode: "detail", id: r.parentId })}>{r.parentId}</button></div>}

        <div className="sect">
          <div className="sect-h">Amounts</div>
          <Voucher r={r} findReq={findReq} />
          {r.tdsNote && <p className="hint" style={{ margin: 0 }}>{r.tdsNote}</p>}
          <p className="hint" style={{ margin: 0 }}>Route set at submission: {r.levels === 2 ? `above ${money0(r.tierLimit)}, so Level 1 and Level 2` : `up to ${money0(r.tierLimit)}, so Level 1 only`}.</p>
        </div>

        <div className="sect">
          <div className="sect-h"><span>Nature and terms of payment</span>{canEditTerms(ctx, r) && !editTerms && <button className="btn sm" type="button" onClick={startEditTerms}>Edit terms</button>}</div>
          <dl className="kv">
            <dt>Nature of payment</dt><dd>{r.nature || "—"}{r.natureId === "other" && <div className="cell-sub">Not in the master</div>}</dd>
            <dt>TDS</dt><dd>{tdsText(r)}{r.tdsAuto === false && <div className="cell-sub">Set by hand</div>}</dd>
            <dt>Terms of payment</dt><dd>{termsLabel(r)}</dd>
            <dt>Pay by</dt><dd>{fmtDate(r.dueDate)}</dd>
          </dl>
          {editTerms && (
            <div className="actbox">
              <h3>Change terms of payment</h3>
              <div className="grid2">
                <div className="field"><label htmlFor="t-terms">Terms</label><select id="t-terms" value={tCode} onChange={(e) => onTermsCodeChange(e.target.value)}>{TERMS.map((t) => <option value={t.v} key={t.v}>{t.l}</option>)}</select></div>
                <div className="field"><label htmlFor="t-due">Pay by</label><input type="date" id="t-due" value={tDue} onChange={(e) => setTDue(e.target.value)} /></div>
              </div>
              {tCode === "custom" && <div className="field"><label htmlFor="t-custom">Describe the terms</label><input type="text" id="t-custom" value={tCustom} onChange={(e) => setTCustom(e.target.value)} placeholder="e.g. 50% advance, 50% after delivery" /></div>}
              <div className="field"><label htmlFor="t-note">Reason for the change</label><input type="text" id="t-note" value={tNote} onChange={(e) => setTNote(e.target.value)} placeholder="e.g. Vendor agreed to 45 days on call" /></div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn" type="button" onClick={() => setEditTerms(false)}>Cancel</button>
                <button className="btn primary" type="button" disabled={busy} onClick={saveTerms}>Save terms</button>
              </div>
            </div>
          )}
        </div>

        {r.isInfluencer && (
          <div className="sect">
            <div className="sect-h">Influencer</div>
            <dl className="kv">
              <dt>Instagram</dt><dd>@{handleClean(r.igHandle)}</dd>
              <dt>Reel</dt><dd>{r.reelLink ? <a href={r.reelLink} target="_blank" rel="noopener noreferrer">{r.reelLink}</a> : "—"}</dd>
              <dt>Reel check</dt><dd>{r.reelCheckedBy ? `Confirmed live by ${nm(r.reelCheckedBy)}, ${fmtWhen(r.reelCheckedAt)}` : "Not yet confirmed"}</dd>
            </dl>
          </div>
        )}

        <div className="sect">
          <div className="sect-h">Payee</div>
          <dl className="kv">
            <dt>Payee</dt><dd>{p.name}</dd>
            {p.email && <><dt>Email</dt><dd>{p.email}</dd></>}
            <dt>GSTIN</dt><dd className="mono">{p.gstin || "—"}</dd>
            <dt>PAN</dt><dd className="mono">{p.pan || "—"}</dd>
            {p.account ? (<><dt>Beneficiary</dt><dd>{p.beneficiary || "—"}</dd><dt>Account</dt><dd className="mono">{p.account}</dd><dt>IFSC</dt><dd className="mono">{p.ifsc}{p.bank ? " · " + p.bank : ""}</dd></>) : (<><dt>Bank</dt><dd className="muted">Not on file</dd></>)}
          </dl>
        </div>

        <div className="sect">
          <div className="sect-h">{r.docType === "pi" ? "Proforma invoice" : "Invoice"}</div>
          <dl className="kv">
            <dt>{r.docType === "pi" ? "PI no." : "Invoice no."}</dt><dd className="mono">{r.invoiceNo}</dd>
            <dt>Date</dt><dd>{fmtDate(r.invoiceDate)}</dd>
            <dt>Payment</dt><dd>{kindLabel(r)}</dd>
            <dt>Cost centre</dt><dd>{r.costCentre}</dd>
            <dt>Details</dt><dd style={{ whiteSpace: "pre-wrap" }}>{r.description || "—"}</dd>
          </dl>
          <div className="files">
            {files.length ? files.map((a, i) => <div className="file" key={i}><a href={a.url} target="_blank" rel="noopener noreferrer">{a.name}</a><span className="muted small">{a.size ? Math.max(1, Math.round(a.size / 1024)) + " KB" : ""}</span></div>)
              : <p className="muted small" style={{ margin: 0 }}>Nothing attached.</p>}
          </div>
        </div>

        {r.status === "paid" && (
          <div className="sect">
            <div className="sect-h">Payment</div>
            <dl className="kv"><dt>Paid on</dt><dd>{fmtDate(r.paidOn)}</dd><dt>UTR</dt><dd className="mono">{r.utr}</dd><dt>Recorded by</dt><dd>{nm(r.paidBy)}</dd></dl>
          </div>
        )}

        <div className="sect">
          <div className="sect-h">Trail</div>
          <ul className="timeline">
            {hist.map((h, i) => (
              <li key={i}>
                <span className={"dot " + (ACT_DOT[h.action] || "")} />
                <div>
                  <div><strong>{nm(h.by)}</strong> · {ACT_LABEL[h.action] || h.action}</div>
                  <div className="cell-sub">{fmtWhen(h.at)}</div>
                  {h.note && <div className="note">{h.note}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
