import React, { useEffect, useState } from "react";
import { useStore, useName } from "../lib/store.jsx";
import { useToast } from "../lib/toast.jsx";
import { api } from "../lib/api.js";
import { roleIds, money0, GSTIN_RE, DOMAIN_RE } from "../../shared/logic.js";

const ROLE_INFO = {
  admin: { title: "Admins", desc: "Change these settings and the nature master. The owner is always an admin." },
  approver1: { title: "Level 1 approvers", desc: "Approve every request. Any one of them can clear Level 1." },
  approver2: { title: "Level 2 approvers", desc: "Second sign-off above the threshold. Must differ from the Level 1 approver." },
  finance: { title: "Finance (payments)", desc: "Pay approved requests that pass every check, then record the UTR." },
};

function emptyNature() { return { id: "n-" + Math.random().toString(36).slice(2, 8), name: "", section: "", rateInd: 0, rateOther: 0, single: 0, annual: 0, influencer: false, inactive: false }; }

function PersonChip({ id, role, nm, onRemove }) {
  return <span className="person">{nm(id)}{onRemove ? <button type="button" aria-label="Remove" onClick={onRemove}>×</button> : <span style={{ width: 6 }} />}</span>;
}

export default function Settings() {
  const { ctx, refresh, owner } = useStore();
  const nm = useName();
  const toast = useToast();
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [roleInputs, setRoleInputs] = useState({ approver1: "", approver2: "", finance: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!dirty) setDraft(JSON.parse(JSON.stringify(ctx.settings))); /* eslint-disable-next-line */ }, [ctx.settings, dirty]);

  if (!ctx.isAdmin) {
    return (
      <>
        <div className="notice"><p className="muted">Only admins can change these settings.</p></div>
        <div className="sect">
          <div className="sect-h">Approval route</div>
          <p style={{ margin: 0 }}>Invoices up to <strong className="num">{money0(ctx.settings.tierLimit)}</strong> need one Level 1 approval. Above that, a Level 2 approval follows.</p>
        </div>
        <div className="rolegrid">
          {["approver1", "approver2", "finance"].map((r) => (
            <div className="rolecard" key={r}>
              <h3>{ROLE_INFO[r].title}</h3>
              <div className="people">{roleIds(ctx, r).length ? roleIds(ctx, r).map((id) => <PersonChip id={id} key={id} nm={nm} />) : <span className="muted small">Nobody yet</span>}</div>
            </div>
          ))}
        </div>
        <div className="sect">
          <div className="sect-h">Nature of payment master</div>
          <div className="tdsgrid">
            <table>
              <thead><tr><th>Nature of payment</th><th>TDS section</th><th className="r">Rate (ind./HUF)</th><th className="r">Rate (company/firm)</th><th className="r">Per-invoice limit</th><th className="r">Annual limit</th><th>Influencer</th></tr></thead>
              <tbody>
                {ctx.settings.natures.filter((n) => !n.inactive).map((n) => (
                  <tr key={n.id}><td>{n.name}</td><td>{n.section || "No TDS"}</td><td className="r num">{n.section ? n.rateInd + "%" : "—"}</td><td className="r num">{n.section ? n.rateOther + "%" : "—"}</td><td className="r num">{n.single ? money0(n.single) : "—"}</td><td className="r num">{n.annual ? money0(n.annual) : "—"}</td><td>{n.influencer ? "Yes" : ""}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  }

  if (!draft) return null;
  const d = draft;
  const warn = [];
  if (!d.roles.approver1.length) warn.push("No Level 1 approvers: every request will wait.");
  if (!d.roles.approver2.length) warn.push("No Level 2 approvers: invoices above " + money0(d.tierLimit) + " will wait.");
  if (d.roles.approver2.length === 1 && d.roles.approver1.length === 1 && d.roles.approver1[0] === d.roles.approver2[0]) warn.push("The same single person is Level 1 and Level 2. Level 2 must come from someone else, so large invoices will stall.");
  if (!d.roles.finance.length) warn.push("No Finance people: approved requests can't be paid from here.");
  if (!d.companyGstins.length) warn.push("Add Kenzen's GSTINs so they're on record for checks.");
  if (!d.allowedDomains.length) warn.push("No sign-in domains set: nobody can sign in until at least one is added.");

  function markDirty(next) { setDraft(next); setDirty(true); }
  function updateNature(i, patch) { const nats = d.natures.slice(); nats[i] = { ...nats[i], ...patch }; markDirty({ ...d, natures: nats }); }
  function addNature() { markDirty({ ...d, natures: [...d.natures, emptyNature()] }); }
  function addRole(role) {
    const em = (roleInputs[role] || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return toast("Enter a full email address.", "bad");
    if (d.roles[role].indexOf(em) < 0) markDirty({ ...d, roles: { ...d.roles, [role]: [...d.roles[role], em] } });
    setRoleInputs({ ...roleInputs, [role]: "" });
  }
  function removeRole(role, id) { markDirty({ ...d, roles: { ...d.roles, [role]: d.roles[role].filter((x) => x !== id) } }); }
  const namesText = Object.keys(d.names || {}).map((k) => k + " = " + d.names[k]).join("\n");

  async function save() {
    if (!(d.tierLimit > 0)) return toast("Enter a threshold above ₹0.", "bad");
    if (!d.costCentres.length) return toast("Add at least one cost centre.", "bad");
    const natures = d.natures.filter((n) => n.name || n.section);
    const seen = {};
    for (const n of natures) {
      if (!n.name) return toast("Every nature of payment needs a name.", "bad");
      if (seen[n.name.toLowerCase()]) return toast(`“${n.name}” is listed twice.`, "bad");
      seen[n.name.toLowerCase()] = 1;
      if (n.section && (!(n.rateInd >= 0 && n.rateInd <= 100) || !(n.rateOther >= 0 && n.rateOther <= 100))) return toast(`Check the TDS rates for “${n.name}”.`, "bad");
    }
    for (const g of d.companyGstins) if (!GSTIN_RE.test(g)) return toast(g + " isn't a valid GSTIN.", "bad");
    if (!d.allowedDomains.length) return toast("Add at least one allowed sign-in domain.", "bad");
    for (const dom of d.allowedDomains) if (!DOMAIN_RE.test(dom)) return toast(`"${dom}" isn't a valid domain.`, "bad");
    setSaving(true);
    try {
      await api.saveSettings(
        { tierLimit: d.tierLimit, companyGstins: d.companyGstins, costCentres: d.costCentres, names: d.names, roles: d.roles, aiExtraction: d.aiExtraction, allowedDomains: d.allowedDomains },
        natures
      );
      setDirty(false);
      await refresh();
      toast("Settings saved.");
    } catch (e) {
      toast(e.message, "bad");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {warn.length > 0 && <div className="notice warn"><p>{warn.map((w, i) => <React.Fragment key={i}>{w}<br /></React.Fragment>)}</p></div>}

      <div className="sect">
        <div className="sect-h"><span>Invoice reading</span></div>
        <label className="check">
          <input type="checkbox" checked={!!d.aiExtraction} onChange={(e) => markDirty({ ...d, aiExtraction: e.target.checked })} />
          <span>Let requesters auto-fill amounts by reading the attached invoice with AI (uses the OpenRouter key configured on the server; billed to Kenzen).</span>
        </label>
      </div>

      <div className="sect">
        <div className="sect-h"><span>Nature of payment master</span><button className="btn sm" type="button" onClick={addNature}>Add nature of payment</button></div>
        <p className="muted small" style={{ margin: 0 }}>Each request picks one of these. TDS is deducted once the invoice crosses the per-invoice limit, or the payee's total for that TDS section in the financial year crosses the annual limit. Leave a limit at 0 if it doesn't apply, and the section blank for no TDS. Payees with no PAN get 20% (section 206AA). Ticking "Influencer" asks for the Instagram handle and reel link.</p>
        <div className="tdsgrid">
          <table style={{ minWidth: 1040 }}>
            <thead><tr><th>Nature of payment</th><th style={{ width: 96 }}>TDS section</th><th style={{ width: 96 }}>Rate % ind./HUF</th><th style={{ width: 96 }}>Rate % company/firm</th><th style={{ width: 130 }}>Per-invoice limit ₹</th><th style={{ width: 130 }}>Annual limit ₹</th><th style={{ width: 80 }}>Influencer</th><th style={{ width: 80 }}>In use</th></tr></thead>
            <tbody>
              {d.natures.map((n, i) => (
                <tr key={n.id}>
                  <td><input type="text" value={n.name} onChange={(e) => updateNature(i, { name: e.target.value })} aria-label="Nature of payment" /></td>
                  <td><input type="text" value={n.section} onChange={(e) => updateNature(i, { section: e.target.value.toUpperCase() })} placeholder="None" aria-label="TDS section" style={{ textTransform: "uppercase" }} /></td>
                  <td><input type="number" min="0" max="100" step="0.01" value={n.rateInd} onChange={(e) => updateNature(i, { rateInd: Number(e.target.value) || 0 })} aria-label="Rate individual" /></td>
                  <td><input type="number" min="0" max="100" step="0.01" value={n.rateOther} onChange={(e) => updateNature(i, { rateOther: Number(e.target.value) || 0 })} aria-label="Rate company" /></td>
                  <td><input type="number" min="0" step="1" value={n.single} onChange={(e) => updateNature(i, { single: Number(e.target.value) || 0 })} aria-label="Per-invoice limit" /></td>
                  <td><input type="number" min="0" step="1" value={n.annual} onChange={(e) => updateNature(i, { annual: Number(e.target.value) || 0 })} aria-label="Annual limit" /></td>
                  <td style={{ textAlign: "center" }}><input type="checkbox" checked={!!n.influencer} onChange={(e) => updateNature(i, { influencer: e.target.checked })} aria-label="Influencer" /></td>
                  <td style={{ textAlign: "center" }}><input type="checkbox" checked={!n.inactive} onChange={(e) => updateNature(i, { inactive: !e.target.checked })} aria-label="In use" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <span className="hint">Untick "In use" to retire one without affecting old requests. Defaults follow FY 2025-26 rates and limits; confirm them with your CA.</span>
      </div>

      <div className="sect">
        <div className="sect-h">Who approves and pays</div>
        <p className="muted small" style={{ margin: 0 }}>Add people by their Kenzen Google email. Anyone at Kenzen with the link can raise a request; nobody can approve their own.</p>
        <div className="rolegrid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
          {Object.keys(ROLE_INFO).filter((r) => r !== "admin").concat(["admin"]).map((r) => (
            <div className="rolecard" key={r}>
              <h3>{ROLE_INFO[r].title}</h3>
              <p className="muted small" style={{ margin: 0 }}>{ROLE_INFO[r].desc}</p>
              <div className="people">
                {r === "admin" && owner && <PersonChip id={owner} nm={nm} />}
                {d.roles[r].filter((id) => !(r === "admin" && id === owner)).map((id) => <PersonChip id={id} role={r} nm={nm} key={id} onRemove={() => removeRole(r, id)} />)}
                {!d.roles[r].length && r !== "admin" && <span className="muted small">Nobody yet</span>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input type="email" placeholder="name@kenzenventures.com" autoComplete="off" value={roleInputs[r] || ""} onChange={(e) => setRoleInputs({ ...roleInputs, [r]: e.target.value })} />
                <button className="btn sm" type="button" onClick={() => addRole(r)}>Add</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid2">
        <div className="sect">
          <div className="sect-h">Display names</div>
          <div className="field">
            <label htmlFor="set-names">One per line as "email = Name". Used instead of the email in the app.</label>
            <textarea id="set-names" rows={4} placeholder="mounesh@kenzenventures.com = Mounesh" defaultValue={namesText}
              onBlur={(e) => { const m = {}; e.target.value.split("\n").forEach((line) => { const i = line.indexOf("="); if (i > 0) { const k = line.slice(0, i).trim().toLowerCase(); const n = line.slice(i + 1).trim(); if (k && n) m[k] = n; } }); markDirty({ ...d, names: m }); }} />
          </div>
        </div>
        <div className="sect">
          <div className="sect-h">Amount tier</div>
          <div className="field"><label htmlFor="set-tier">Level 2 needed above (₹, invoice total)</label><input type="number" min="1" step="1" id="set-tier" value={d.tierLimit} onChange={(e) => markDirty({ ...d, tierLimit: Number(e.target.value) || 0 })} /></div>
        </div>
        <div className="sect">
          <div className="sect-h">Kenzen GSTINs</div>
          <div className="field"><label htmlFor="set-gstins">One per line</label><textarea id="set-gstins" rows={3} defaultValue={(d.companyGstins || []).join("\n")} onBlur={(e) => markDirty({ ...d, companyGstins: e.target.value.split(/[\n,]/).map((s) => s.trim().toUpperCase()).filter(Boolean) })} /></div>
        </div>
        <div className="sect">
          <div className="sect-h">Allowed sign-in domains</div>
          <div className="field">
            <label htmlFor="set-domains">One per line, e.g. kenzenventures.com</label>
            <textarea id="set-domains" rows={2} defaultValue={(d.allowedDomains || []).join("\n")} onBlur={(e) => markDirty({ ...d, allowedDomains: e.target.value.split(/[\n,]/).map((s) => s.trim().toLowerCase()).filter(Boolean) })} />
            <span className="hint">Only Google accounts on these domains can sign in. Changes take effect immediately — no redeploy needed.</span>
          </div>
        </div>
        <div className="sect">
          <div className="sect-h">Cost centres</div>
          <div className="field"><label htmlFor="set-cc">One per line</label><textarea id="set-cc" rows={5} defaultValue={d.costCentres.join("\n")} onBlur={(e) => markDirty({ ...d, costCentres: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} /></div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button className="btn" type="button" disabled={!dirty || saving} onClick={() => { setDirty(false); setDraft(JSON.parse(JSON.stringify(ctx.settings))); }}>Discard changes</button>
        <button className="btn primary" type="button" disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save settings"}</button>
      </div>
    </>
  );
}
