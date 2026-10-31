import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "../lib/store.jsx";
import { useDrawer } from "../lib/drawer.jsx";
import { useToast } from "../lib/toast.jsx";
import { api } from "../lib/api.js";
import { uploadAttachment } from "../lib/upload.js";
import {
  natureById, tdsPlan, compute, todayISO, addDays, money, money0, TERMS, panEntity, handleClean, last4,
  HANDLE_RE, REEL_RE,
} from "../../shared/logic.js";

function newDraft() {
  return {
    uploaderName: "", payeeId: "", docType: "tax", kind: "full", payGross: "", invoiceNo: "", invoiceDate: "", description: "",
    natureId: "", natureOther: "", costCentre: "", taxable: "", gstRate: "18", gstAmount: "",
    tdsApplied: false, tdsSec: "", tdsRate: "", termsCode: "net30", termsText: "", dueDate: "", priority: "normal",
    isInf: false, igHandle: "", reelLink: "",
  };
}
function draftFromReq(r) {
  return {
    uploaderName: r.uploadedByName || "",
    payeeId: r.payeeId, docType: r.docType || "tax", kind: r.kind || "full", payGross: r.kind === "advance" ? String(r.payGross) : "",
    invoiceNo: r.invoiceNo, invoiceDate: r.invoiceDate, description: r.description || "",
    natureId: r.natureId || "", natureOther: r.natureId === "other" ? r.nature : "", costCentre: r.costCentre,
    taxable: String(r.taxable), gstRate: String(r.gstRate == null ? "custom" : r.gstRate), gstAmount: String(r.gstAmount),
    tdsApplied: !!r.tdsApplied, tdsSec: r.tdsSectionCode || "", tdsRate: String(r.tdsRate == null ? "" : r.tdsRate),
    termsCode: r.termsCode || "custom", termsText: r.termsText || "", dueDate: r.dueDate, priority: r.priority || "normal",
    isInf: !!r.isInfluencer, igHandle: r.igHandle || "", reelLink: r.reelLink || "",
  };
}

export default function RequestForm({ state }) {
  const { ctx, refresh } = useStore();
  const { close } = useDrawer();
  const toast = useToast();
  const isBal = state.kind === "balance";
  const par = state.parent;

  const [d, setD] = useState(() => {
    if (isBal && !state.editId) {
      const base = draftFromReq(par);
      base.kind = "balance"; base.payGross = ""; base.docType = "tax"; base.dueDate = ""; base.priority = "normal";
      base.description = "Balance against advance " + par.id + (par.description ? " · " + par.description : "");
      if (base.termsCode === "advance" || base.termsCode === "live") base.termsCode = "receipt";
      return base;
    }
    if (state.editId && state.sourceReq) return draftFromReq(state.sourceReq);
    return newDraft();
  });
  const [attachments, setAttachments] = useState(() => {
    const src = state.editId && state.sourceReq ? state.sourceReq.attachments : isBal ? par.attachments : [];
    return (src || []).map((a) => ({ ...a }));
  });
  const [tdsAuto, setTdsAuto] = useState(true);
  const [dueAuto, setDueAuto] = useState(!state.editId);
  const [infManual, setInfManual] = useState(!!state.editId);
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const payee = ctx.payees.get(d.payeeId);
  const nat = d.natureId && d.natureId !== "other" ? natureById(ctx, d.natureId) : null;
  const plan = useMemo(() => {
    if (isBal) return null;
    if (!nat) return null;
    return tdsPlan(ctx, nat, payee, Number(d.taxable) || 0, d.invoiceDate, { excludeId: state.editId });
  }, [ctx, nat, payee, d.taxable, d.invoiceDate, isBal, state.editId]);

  // nature changed -> re-enable auto TDS (unless "other"), reset manual influencer override
  function patch(p) { setD((prev) => ({ ...prev, ...p })); }

  function onNatureChange(id) {
    patch({ natureId: id });
    if (id !== "other") setTdsAuto(true); else setTdsAuto(false);
    setInfManual(false);
  }
  function onPayeeChange(id) {
    const p = ctx.payees.get(id);
    const next = { ...d, payeeId: id };
    if (p) {
      if (p.defaultCc && !next.costCentre) next.costCentre = p.defaultCc;
      if (p.defaultNatureId && natureById(ctx, p.defaultNatureId) && !next.natureId) next.natureId = p.defaultNatureId;
      if (p.defaultTerms && (!next.termsCode || next.termsCode === "net30")) next.termsCode = p.defaultTerms;
      if (p.igHandle && !next.igHandle) next.igHandle = "@" + handleClean(p.igHandle);
    }
    setD(next);
  }

  // auto TDS sync
  useEffect(() => {
    if (isBal && par) {
      if (tdsAuto) patch({ tdsApplied: !!par.tdsApplied, tdsSec: par.tdsSectionCode || "", tdsRate: par.tdsApplied ? String(par.tdsRate) : "" });
      return;
    }
    if (nat && tdsAuto) {
      patch({ tdsApplied: plan ? plan.applies : false, tdsSec: plan ? plan.section : nat.section, tdsRate: plan && plan.applies ? String(plan.rate) : "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tdsAuto, nat?.id, plan?.applies, plan?.rate, isBal]);

  // auto due date
  useEffect(() => {
    if (!dueAuto) return;
    const t = TERMS.filter((x) => x.v === d.termsCode)[0];
    if (t && t.days != null) {
      const base = (d.termsCode === "advance" || d.termsCode === "receipt") ? todayISO() : d.invoiceDate;
      if (base) patch({ dueDate: addDays(base, t.days) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueAuto, d.termsCode, d.invoiceDate]);

  // auto influencer toggle
  useEffect(() => {
    if (infManual) return;
    const shouldBe = !!(nat && nat.influencer) || !!(payee && payee.igHandle);
    if (shouldBe !== d.isInf) patch({ isInf: shouldBe });
    if (shouldBe && payee && payee.igHandle && !d.igHandle) patch({ igHandle: "@" + handleClean(payee.igHandle) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infManual, nat?.id, payee?.id]);

  // auto GST amount when rate isn't "custom"
  useEffect(() => {
    if (d.gstRate === "custom") return;
    const taxable = Number(d.taxable) || 0;
    const gst = Math.round(taxable * Number(d.gstRate || 0) / 100 * 100) / 100;
    patch({ gstAmount: d.taxable !== "" ? gst.toFixed(2) : "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.taxable, d.gstRate]);

  const c = compute(d, isBal ? par : null);
  const levels = c.total > ctx.settings.tierLimit ? 2 : 1;
  const docT = d.docType === "pi" ? "PI" : "Invoice";

  async function onFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const f of files) {
      const tmp = { name: f.name, uploading: true };
      setAttachments((prev) => [...prev, tmp]);
      try {
        const res = await uploadAttachment(f);
        setAttachments((prev) => prev.map((a) => (a === tmp ? { ...res } : a)));
        if (ctx.settings.aiExtraction) extractFrom(res); // fires right after upload, no button needed
      } catch (e2) {
        setAttachments((prev) => prev.filter((a) => a !== tmp));
        toast(e2.message, "bad");
      }
    }
  }
  function removeAttachment(i) { setAttachments((prev) => prev.filter((_, idx) => idx !== i)); }

  async function extractFrom(att) {
    setExtracting(true);
    try {
      const res = await api.extract(att.id, att.type);
      if (res.skipped) { toast(res.reason || "Couldn't read this file automatically. Fill in the details by hand."); return; }
      setD((prev) => {
        const next = { ...prev };
        if (res.docType) next.docType = res.docType;
        if (res.invoiceNo) next.invoiceNo = res.invoiceNo;
        if (res.invoiceDate) next.invoiceDate = res.invoiceDate;
        if (res.taxable) next.taxable = String(res.taxable);
        if (res.gstRate === 0 || res.gstRate === 5 || res.gstRate === 18 || res.gstRate === 40) next.gstRate = String(res.gstRate);
        else if (res.gstAmount) { next.gstRate = "custom"; next.gstAmount = String(res.gstAmount); }
        return next;
      });
      toast("Filled in from the invoice. Check the amounts before submitting.");
    } catch (e) { toast(e.message, "bad"); } finally { setExtracting(false); }
  }

  async function readWithAI() {
    const a = attachments.find((x) => x.id && !x.uploading);
    if (!a) return toast("Attach the invoice first.", "bad");
    await extractFrom(a);
  }

  function ccOptions() {
    const out = [];
    ctx.settings.costCentres.concat([d.costCentre]).forEach((x) => { if (x && out.indexOf(x) < 0) out.push(x); });
    return out;
  }
  const nats = ctx.settings.natures.filter((n) => !n.inactive || n.id === d.natureId);

  async function submit() {
    setErr("");
    const p = payee;
    // Only the payee (above the attachment) and the attachment itself are
    // required. Everything below the file input — invoice no./date, nature,
    // cost centre, amounts, TDS, terms, influencer fields — can be filled in
    // later and won't block submission; the "Can this be paid?" checklist on
    // the request itself will flag what's still missing.
    if (!d.uploaderName.trim()) return setErr("Enter who is raising this request.");
    if (!p) return setErr("Choose who is being paid.");
    if (attachments.some((a) => a.uploading)) return setErr("Wait for the attachments to finish uploading.");
    if (!attachments.length) return setErr("Attach the invoice or PI.");

    const natRec = d.natureId !== "other" ? natureById(ctx, d.natureId) : null;
    const base = {
      uploadedByName: d.uploaderName.trim(),
      payeeId: p.id, docType: d.docType, kind: d.kind, parentId: isBal ? par.id : null,
      invoiceNo: d.invoiceNo, invoiceDate: d.invoiceDate, description: d.description, natureId: d.natureId, nature: natRec ? natRec.name : d.natureOther, costCentre: d.costCentre,
      taxable: c.taxable, gstRate: d.gstRate === "custom" ? "custom" : Number(d.gstRate), gstAmount: c.gst, invoiceTotal: c.total,
      tdsSectionCode: (natRec && natRec.section) || d.tdsSec || "", tdsApplied: d.tdsApplied, tdsRate: d.tdsApplied ? c.rate : 0, tdsAmount: c.tds, tdsAuto: !!tdsAuto, tdsNote: plan ? plan.text : "",
      invoiceNet: c.net, payGross: c.payGross, payTds: c.payTds, netPayable: c.payNet,
      termsCode: d.termsCode, termsText: d.termsCode === "custom" ? d.termsText : "", dueDate: d.dueDate, priority: d.priority,
      isInfluencer: d.isInf, igHandle: d.isInf ? "@" + handleClean(d.igHandle) : "", reelLink: d.isInf ? d.reelLink : "",
      attachments: attachments.map((a) => ({ id: a.id, name: a.name, type: a.type || "", size: a.size || 0, url: a.url || "" })),
    };
    setSubmitting(true);
    try {
      const res = await api.saveRequest(base, state.editId);
      await refresh();
      close();
      toast((state.editId ? state.editId + " resubmitted" : res.id + " submitted") + " for Level 1 approval.");
    } catch (e) { setErr(e.message); } finally { setSubmitting(false); }
  }

  const payees = Array.from(ctx.payees.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const lockedTds = tdsAuto && (nat || isBal);

  return (
    <>
      <div className="drawer-h">
        <h2>{state.editId ? `Edit ${state.editId}` : isBal ? `Balance for ${par?.id}` : "New payment request"}</h2>
        <button className="btn ghost" type="button" onClick={close}>Close</button>
      </div>
      <div className="drawer-b">
        {isBal && par && (
          <div className="infobox">
            <strong>Balance against advance {par.id}</strong>
            <span>Advance paid {par.paidOn}: {money(par.payGross)} incl. GST, less TDS {money(par.payTds)} (UTR {par.utr || "—"}).</span>
            <span className="hint">Update the amounts if the final tax invoice differs from the PI, and attach it. The balance is worked out below.</span>
          </div>
        )}

        <div className="sect">
          <div className="sect-h">Who is raising this</div>
          <div className="field">
            <label htmlFor="f-uploader">Your name</label>
            <input type="text" id="f-uploader" autoComplete="off" value={d.uploaderName} onChange={(e) => patch({ uploaderName: e.target.value })} placeholder="e.g. Priya Sharma" />
            <span className="hint">The person filling in this request — separate from the payee below.</span>
          </div>
        </div>

        <div className="sect">
          <div className="sect-h">Who is being paid</div>
          <div className="field">
            <label htmlFor="f-payee">Payee</label>
            <select id="f-payee" disabled={isBal} value={d.payeeId} onChange={(e) => onPayeeChange(e.target.value)}>
              <option value="">Choose a payee…</option>
              {payees.map((p) => <option value={p.id} key={p.id}>{p.name}{p.gstin ? " · " + p.gstin : p.pan ? " · " + p.pan : ""}</option>)}
            </select>
            <span className="hint">
              {payee ? (
                <>{payee.pan ? `PAN ${payee.pan} (${panEntity(payee.pan) === "individual" ? "individual/HUF" : "company/firm"})` : <span style={{ color: "var(--bad)" }}>No PAN on file, so TDS is 20% when it applies.</span>}
                {payee.gstin ? ` · GSTIN ${payee.gstin}` : " · no GSTIN"} · {payee.account ? `bank ${payee.ifsc} ${last4(payee.account)}` : "no bank details"}</>
              ) : (ctx.payees.size ? "" : "No payees yet. Add one from the Payees tab, then come back here.")}
            </span>
          </div>
        </div>

        <div className="sect">
          <div className="sect-h">Document</div>
          <div className="grid2">
            <div className="field"><label htmlFor="f-doctype">Document type</label>
              <select id="f-doctype" value={d.docType} onChange={(e) => patch({ docType: e.target.value })}>
                <option value="tax">Tax invoice</option><option value="pi">Proforma invoice (PI)</option>
              </select>
            </div>
            {isBal ? <div className="field"><span className="flabel">Payment type</span><span>Balance payment</span></div> : (
              <div className="field"><label htmlFor="f-kind">Payment type</label>
                <select id="f-kind" value={d.kind} onChange={(e) => patch({ kind: e.target.value })}>
                  <option value="full">Full payment</option><option value="advance">Advance (part payment)</option>
                </select>
              </div>
            )}
          </div>
          <div className="field">
            <label htmlFor="f-files">Attach the {isBal ? "final tax invoice" : "invoice or PI"} (PDF or image, up to 10 MB)</label>
            <input type="file" id="f-files" multiple accept="application/pdf,image/png,image/jpeg,image/webp" onChange={onFiles} />
          </div>
          {extracting && (
            <div className="notice warn" role="status" aria-live="polite">
              <p><strong>Reading the invoice with AI… this can take a few seconds.</strong></p>
            </div>
          )}
          {ctx.settings.aiExtraction && attachments.some((a) => a.url) && !extracting && (
            <div>
              <button className="btn sm" type="button" onClick={readWithAI}>Read this invoice with AI</button>
              <span className="hint"> Fills in the document and amount fields below — check them before submitting.</span>
            </div>
          )}
          <div className="files">
            {attachments.map((a, i) => (
              <div className="file" key={i}>
                <span className="fn">{a.name}</span>
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {a.uploading ? <span className="muted small">Uploading…</span> : (<><span className="muted small">{a.size ? Math.max(1, Math.round(a.size / 1024)) + " KB" : ""}</span><button className="btn ghost" type="button" onClick={() => removeAttachment(i)}>Remove</button></>)}
                </span>
              </div>
            ))}
          </div>
          <div className="grid2">
            <div className="field"><label htmlFor="f-invno">{d.docType === "pi" ? "PI no." : "Invoice / bill no."}</label><input type="text" id="f-invno" autoComplete="off" value={d.invoiceNo} onChange={(e) => patch({ invoiceNo: e.target.value })} /></div>
            <div className="field"><label htmlFor="f-invdate">Document date</label><input type="date" id="f-invdate" value={d.invoiceDate} max={todayISO()} onChange={(e) => patch({ invoiceDate: e.target.value })} /></div>
          </div>
          <div className="field">
            <label htmlFor="f-nature">Nature of payment</label>
            <select id="f-nature" value={d.natureId} onChange={(e) => onNatureChange(e.target.value)}>
              <option value="">Choose from the master…</option>
              {nats.map((n) => <option value={n.id} key={n.id}>{n.name}{n.section ? " · " + n.section : " · no TDS"}</option>)}
              <option value="other">Other (not in the master)…</option>
            </select>
            <span className="hint">{ctx.isAdmin ? "New type of expense? Add it under Approvals & settings → Nature of payment master." : "New type of expense? Ask an admin to add it to the master, or choose Other."}</span>
          </div>
          {d.natureId === "other" && (
            <div className="field"><label htmlFor="f-nature-other">Describe the nature of payment</label><input type="text" id="f-nature-other" value={d.natureOther} onChange={(e) => patch({ natureOther: e.target.value })} placeholder="e.g. trade show stall fabrication" /></div>
          )}
          <div className="field"><label htmlFor="f-desc">Details for approvers</label><textarea id="f-desc" rows={2} placeholder="e.g. Sep 2026 storage and pick-pack at Bhiwandi FC, PO 4512" value={d.description} onChange={(e) => patch({ description: e.target.value })} /></div>
          <div className="field"><label htmlFor="f-cc">Cost centre</label><select id="f-cc" value={d.costCentre} onChange={(e) => patch({ costCentre: e.target.value })}><option value="">Choose…</option>{ccOptions().map((c2) => <option key={c2}>{c2}</option>)}</select></div>
        </div>

        <div className="sect">
          <div className="sect-h">Amounts</div>
          <div className="grid3">
            <div className="field"><label htmlFor="f-taxable">Taxable value (₹)</label><input type="number" id="f-taxable" min="0" step="0.01" inputMode="decimal" value={d.taxable} onChange={(e) => patch({ taxable: e.target.value })} /></div>
            <div className="field"><label htmlFor="f-gstrate">GST rate</label>
              <select id="f-gstrate" value={d.gstRate} onChange={(e) => patch({ gstRate: e.target.value })}>
                {["0", "5", "18", "40"].map((g) => <option value={g} key={g}>{g}%</option>)}
                <option value="custom">As on invoice / mixed</option>
              </select>
            </div>
            <div className="field"><label htmlFor="f-gstamt">GST amount (₹)</label><input type="number" id="f-gstamt" min="0" step="0.01" value={d.gstAmount} readOnly={d.gstRate !== "custom"} onChange={(e) => patch({ gstAmount: e.target.value })} /></div>
          </div>
          <div className="field">
            <span className="flabel">TDS</span>
            <div className="grid3" style={{ alignItems: "end" }}>
              <label className="check"><input type="checkbox" checked={d.tdsApplied} disabled={lockedTds} onChange={(e) => { setTdsAuto(false); patch({ tdsApplied: e.target.checked }); }} /> <span>Deduct TDS</span></label>
              <div className="field"><label htmlFor="f-tdssec">Section</label><input type="text" id="f-tdssec" value={d.tdsSec} disabled={lockedTds || !d.tdsApplied} style={{ textTransform: "uppercase" }} onChange={(e) => { setTdsAuto(false); patch({ tdsSec: e.target.value.toUpperCase() }); }} /></div>
              <div className="field"><label htmlFor="f-tdsrate">Rate (%)</label><input type="number" id="f-tdsrate" min="0" max="100" step="0.01" value={d.tdsRate} disabled={lockedTds || !d.tdsApplied} onChange={(e) => { setTdsAuto(false); patch({ tdsRate: e.target.value }); }} /></div>
            </div>
            <span className="hint">
              {isBal ? `Same TDS as the advance: ${par?.tdsApplied ? par.tdsSectionCode + " @ " + par.tdsRate + "%" : "no TDS"}.`
                : nat ? <span className={plan?.applies ? "good" : ""}>{plan?.text}{plan?.crossing ? <span className="alert"> This invoice crosses the annual limit, so TDS on earlier invoices this year ({money0(plan.prior)}) may also be due.</span> : null}{!payee ? " Choose the payee to check the threshold." : ""}</span>
                : d.natureId === "other" ? "Not in the master, so set TDS yourself." : "Choose the nature of payment and TDS is worked out for you."}
              {!tdsAuto && (nat || isBal) && <> TDS set by hand. <button className="btn ghost" type="button" style={{ padding: 0 }} onClick={() => setTdsAuto(true)}>Use the master</button></>}
              {tdsAuto && (nat || isBal) && <> <button className="btn ghost" type="button" style={{ padding: 0 }} onClick={() => setTdsAuto(false)}>Change</button></>}
            </span>
          </div>
          {d.kind === "advance" && (
            <div className="field">
              <label htmlFor="f-paygross">Advance to pay now (₹, including GST, before TDS)</label>
              <input type="number" id="f-paygross" min="0" step="0.01" value={d.payGross} onChange={(e) => patch({ payGross: e.target.value })} />
              <span className="hint">{c.total > 0 && c.payGross > 0 ? `${(c.payGross / c.total * 100).toFixed(1)}% of the ${docT.toLowerCase()} total. Balance after this: ${money(c.total - c.payGross)}.` : ""}</span>
            </div>
          )}
          <div className="voucher">
            <div className="vrow"><span>Taxable value</span><span className="num">{money(c.taxable)}</span></div>
            <div className="vrow"><span>GST{d.gstRate !== "custom" ? ` @ ${d.gstRate}%` : ""}</span><span className="num">{money(c.gst)}</span></div>
            <div className="vrow"><span><strong>{docT} total</strong></span><span className="num"><strong>{money(c.total)}</strong></span></div>
            <div className="vrow"><span>TDS{d.tdsApplied ? ` · ${d.tdsSec} @ ${c.rate}%` : " · none"}{d.kind !== "full" ? ` on full ${docT.toLowerCase()}` : ""}</span><span className="num">− {money(c.tds)}</span></div>
            {d.kind === "full" ? (
              <div className="vrow total"><span><strong>Net payable</strong></span><span className="num">{money(c.payNet)}</span></div>
            ) : (
              <>
                {d.kind === "balance" && par && <div className="vrow"><span>Paid as advance ({par.id})</span><span className="num">{money(par.payGross)} − TDS {money(par.payTds)}</span></div>}
                <div className="vrow"><span>{d.kind === "advance" ? "Advance" : "Balance"} (incl. GST)</span><span className="num">{money(c.payGross)}</span></div>
                <div className="vrow"><span>Less TDS on this payment</span><span className="num">− {money(c.payTds)}</span></div>
                <div className="vrow total"><span><strong>Net payable now</strong></span><span className="num">{money(c.payNet)}</span></div>
              </>
            )}
            <div className="vrow"><span className="small muted">{levels === 2 ? `Above ${money0(ctx.settings.tierLimit)}: needs Level 1 and Level 2` : `Up to ${money0(ctx.settings.tierLimit)}: needs Level 1 only`}</span></div>
          </div>
          <p className="hint" style={{ margin: 0 }}>TDS is worked out on the taxable value (GST excluded) and rounded to the rupee. On an advance, TDS is deducted on the taxable part of the advance.</p>
        </div>

        <div className="sect">
          <div className="sect-h">Terms of payment</div>
          <div className="grid3">
            <div className="field"><label htmlFor="f-terms">Terms</label><select id="f-terms" value={d.termsCode} onChange={(e) => patch({ termsCode: e.target.value })}>{TERMS.map((t) => <option value={t.v} key={t.v}>{t.l}</option>)}</select></div>
            <div className="field"><label htmlFor="f-due">Pay by</label><input type="date" id="f-due" value={d.dueDate} onChange={(e) => { setDueAuto(false); patch({ dueDate: e.target.value }); }} /><span className="hint">{dueAuto ? "" : "Set by hand."}</span></div>
            <div className="field"><label htmlFor="f-priority">Priority</label><select id="f-priority" value={d.priority} onChange={(e) => patch({ priority: e.target.value })}><option value="normal">Normal</option><option value="urgent">Urgent</option></select></div>
          </div>
          {d.termsCode === "custom" && <div className="field"><label htmlFor="f-terms-custom">Describe the terms</label><input type="text" id="f-terms-custom" value={d.termsText} onChange={(e) => patch({ termsText: e.target.value })} placeholder="e.g. 50% advance, 50% after delivery" /></div>}
          <span className="hint">Approvers can change the terms while the request is with them.</span>
        </div>

        <div className="sect">
          <div className="sect-h">Influencer payment</div>
          <label className="check"><input type="checkbox" checked={d.isInf} onChange={(e) => { setInfManual(true); patch({ isInf: e.target.checked }); }} /> <span>This pays an influencer or creator for Instagram content</span></label>
          {d.isInf && (
            <div className="grid2">
              <div className="field"><label htmlFor="f-ig">Instagram handle</label><input type="text" id="f-ig" value={d.igHandle} placeholder="@handle" autoComplete="off" onChange={(e) => patch({ igHandle: e.target.value })} />
                {d.igHandle && !HANDLE_RE.test(d.igHandle.trim()) && <span className="err">Handles use letters, numbers, dots and underscores.</span>}
              </div>
              <div className="field"><label htmlFor="f-reel">Reel link</label><input type="url" id="f-reel" value={d.reelLink} placeholder="https://www.instagram.com/reel/…" autoComplete="off" onChange={(e) => patch({ reelLink: e.target.value })} />
                {d.reelLink && !REEL_RE.test(d.reelLink.trim()) && <span className="err">Use the link from Instagram's Share → Copy link, e.g. https://www.instagram.com/reel/ABC123xyz/</span>}
              </div>
            </div>
          )}
        </div>

        {err && <p className="err">{err}</p>}
      </div>
      <div className="drawer-f">
        <button className="btn" type="button" onClick={close}>Cancel</button>
        <button className="btn primary" type="button" disabled={submitting} onClick={submit}>
          {submitting ? "Submitting…" : state.editId ? "Resubmit for approval" : isBal ? "Submit balance for approval" : "Submit for approval"}
        </button>
      </div>
    </>
  );
}
