import React, { useState } from "react";
import { useStore } from "../lib/store.jsx";
import { useDrawer } from "../lib/drawer.jsx";
import { useToast } from "../lib/toast.jsx";
import { api } from "../lib/api.js";
import { GSTIN_RE, PAN_RE, IFSC_RE, HANDLE_RE, handleClean, TERMS } from "../../shared/logic.js";

export default function PayeeForm({ state }) {
  const { ctx, refresh } = useStore();
  const { open, close } = useDrawer();
  const toast = useToast();
  const existing = state.payeeId ? ctx.payees.get(state.payeeId) : null;

  const [name, setName] = useState(existing?.name || "");
  const [gstin, setGstin] = useState(existing?.gstin || "");
  const [pan, setPan] = useState(existing?.pan || "");
  const [email, setEmail] = useState(existing?.email || "");
  const [ig, setIg] = useState(existing?.igHandle ? "@" + handleClean(existing.igHandle) : "");
  const [benef, setBenef] = useState(existing?.beneficiary || "");
  const [acct, setAcct] = useState(existing?.account || "");
  const [acct2, setAcct2] = useState(existing?.account || "");
  const [ifsc, setIfsc] = useState(existing?.ifsc || "");
  const [bank, setBank] = useState(existing?.bank || "");
  const [defNature, setDefNature] = useState(existing?.defaultNatureId || "");
  const [defCc, setDefCc] = useState(existing?.defaultCc || "");
  const [defTerms, setDefTerms] = useState(existing?.defaultTerms || "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const nats = ctx.settings.natures.filter((n) => !n.inactive || n.id === existing?.defaultNatureId);

  async function save() {
    setErr("");
    const g = gstin.trim().toUpperCase();
    let pn = pan.trim().toUpperCase();
    const igc = handleClean(ig);
    const rec = { name: name.trim(), gstin: g, pan: pn, email: email.trim(), igHandle: igc, defaultNatureId: defNature, defaultCc: defCc, defaultTerms: defTerms, beneficiary: benef.trim(), account: acct.replace(/\s+/g, ""), ifsc: ifsc.trim().toUpperCase(), bank: bank.trim() };
    if (!rec.name) return setErr("Enter the payee name.");
    if (g && !GSTIN_RE.test(g)) return setErr("That GSTIN doesn't look right. It should be 15 characters, e.g. 36AABCK1234L1Z5.");
    if (!pn && g) { pn = g.slice(2, 12); rec.pan = pn; }
    if (pn && !PAN_RE.test(pn)) return setErr("PAN should be 5 letters, 4 digits, 1 letter.");
    if (g && pn && g.slice(2, 12) !== pn) return setErr("The PAN doesn't match the PAN inside the GSTIN (characters 3 to 12).");
    if (igc && !HANDLE_RE.test(igc)) return setErr("Instagram handles use letters, numbers, dots and underscores only.");
    if (rec.beneficiary || rec.account || rec.ifsc || rec.bank || acct2) {
      if (!rec.beneficiary) return setErr("Enter the beneficiary name as the bank has it, or clear the bank fields.");
      if (!/^[0-9]{6,18}$/.test(rec.account)) return setErr("Account number should be 6 to 18 digits.");
      if (rec.account !== acct2.replace(/\s+/g, "")) return setErr("The two account numbers don't match.");
      if (!IFSC_RE.test(rec.ifsc)) return setErr("IFSC should be 11 characters: 4 letters, a zero, then 6 letters or digits (e.g. HDFC0001234).");
    }
    setSaving(true);
    try {
      const res = await api.savePayee(rec, state.payeeId);
      await refresh();
      toast(rec.name + " saved.");
      if (state.returnTo) {
        const back = { ...state.returnTo, draft: { ...state.returnTo.draft, payeeId: res.id } };
        if (rec.defaultCc) back.draft.costCentre = back.draft.costCentre || rec.defaultCc;
        if (rec.defaultNatureId) back.draft.natureId = back.draft.natureId || rec.defaultNatureId;
        if (rec.defaultTerms && (!back.draft.termsCode || back.draft.termsCode === "net30")) back.draft.termsCode = rec.defaultTerms;
        if (rec.igHandle && !back.draft.igHandle) back.draft.igHandle = "@" + handleClean(rec.igHandle);
        open(back);
      } else close();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  return (
    <>
      <div className="drawer-h"><h2>{state.payeeId ? `Edit ${existing?.name || "payee"}` : "Add payee"}</h2><button className="btn ghost" type="button" onClick={close}>Close</button></div>
      <div className="drawer-b">
        <div className="sect">
          <div className="sect-h">Vendor or influencer</div>
          <div className="field"><label htmlFor="p-name">Payee name (as you know them)</label><input type="text" id="p-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid2">
            <div className="field"><label htmlFor="p-gstin">GSTIN (optional)</label><input type="text" id="p-gstin" value={gstin} maxLength={15} style={{ textTransform: "uppercase" }} onChange={(e) => setGstin(e.target.value)} /></div>
            <div className="field"><label htmlFor="p-pan">PAN</label><input type="text" id="p-pan" value={pan} maxLength={10} style={{ textTransform: "uppercase" }} onChange={(e) => setPan(e.target.value)} /><span className="hint">Taken from GSTIN if left blank. Without a PAN, TDS is 20%.</span></div>
          </div>
          <div className="grid2">
            <div className="field"><label htmlFor="p-email">Remittance email (optional)</label><input type="email" id="p-email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="field"><label htmlFor="p-ig">Instagram handle (influencers)</label><input type="text" id="p-ig" value={ig} placeholder="@handle" onChange={(e) => setIg(e.target.value)} /></div>
          </div>
        </div>
        <div className="sect">
          <div className="sect-h">Bank details (optional)</div>
          <p className="hint" style={{ margin: 0 }}>Saved with the payee and shown to Finance on every future request.{state.payeeId && existing?.account ? " Changes are logged and put open requests for this payee on hold until resubmitted." : ""}</p>
          <div className="field"><label htmlFor="p-benef">Beneficiary name (as per bank)</label><input type="text" id="p-benef" value={benef} onChange={(e) => setBenef(e.target.value)} /></div>
          <div className="grid2">
            <div className="field"><label htmlFor="p-acct">Account number</label><input type="text" id="p-acct" inputMode="numeric" autoComplete="off" value={acct} onChange={(e) => setAcct(e.target.value)} /></div>
            <div className="field"><label htmlFor="p-acct2">Re-enter account number</label><input type="text" id="p-acct2" inputMode="numeric" autoComplete="off" value={acct2} onChange={(e) => setAcct2(e.target.value)} /></div>
          </div>
          <div className="grid2">
            <div className="field"><label htmlFor="p-ifsc">IFSC</label><input type="text" id="p-ifsc" maxLength={11} value={ifsc} style={{ textTransform: "uppercase" }} onChange={(e) => setIfsc(e.target.value)} /></div>
            <div className="field"><label htmlFor="p-bank">Bank &amp; branch</label><input type="text" id="p-bank" value={bank} onChange={(e) => setBank(e.target.value)} /></div>
          </div>
        </div>
        <div className="sect">
          <div className="sect-h">Defaults for new requests</div>
          <div className="grid3">
            <div className="field"><label htmlFor="p-nature">Nature of payment</label><select id="p-nature" value={defNature} onChange={(e) => setDefNature(e.target.value)}><option value="">None</option>{nats.map((n) => <option value={n.id} key={n.id}>{n.name}</option>)}</select></div>
            <div className="field"><label htmlFor="p-cc">Cost centre</label><select id="p-cc" value={defCc} onChange={(e) => setDefCc(e.target.value)}><option value="">None</option>{ctx.settings.costCentres.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label htmlFor="p-terms">Terms of payment</label><select id="p-terms" value={defTerms} onChange={(e) => setDefTerms(e.target.value)}><option value="">None</option>{TERMS.filter((t) => t.v !== "custom").map((t) => <option value={t.v} key={t.v}>{t.l}</option>)}</select></div>
          </div>
        </div>
        {err && <p className="err">{err}</p>}
      </div>
      <div className="drawer-f">
        <button className="btn" type="button" onClick={() => (state.returnTo ? open(state.returnTo) : close())}>{state.returnTo ? "Back to request" : "Cancel"}</button>
        <button className="btn primary" type="button" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save payee"}</button>
      </div>
    </>
  );
}
