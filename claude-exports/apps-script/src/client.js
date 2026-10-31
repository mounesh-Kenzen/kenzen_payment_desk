/* ===== Page logic (runs in the browser) ===== */
var S = {me:{id:null}, isAdmin:false, owner:"", settings:mergeSettings(null,null), payees:new Map(), requests:[], sheetUrl:"",
  loaded:false, tab:"queue", drawer:null, sDraft:null, sDirty:false, offline:false};

function $(s, r){ return (r||document).querySelector(s); }
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function last4(a){ return a ? "••" + String(a).slice(-4) : "—"; }
function chip(st){ var s=STATUS[st]||{label:st,cls:"s-muted"}; return '<span class="chip '+s.cls+'">'+esc(s.label)+'</span>'; }
function nm(id){ if(!id) return "Someone"; var n=S.settings.names[id]; var base = n || id.split("@")[0]; return id===S.me.id ? base+" (you)" : base; }
function rid(){ return Math.random().toString(36).slice(2,8); }

/* ---------- server calls ---------- */
function call(fn){
  var args=[].slice.call(arguments,1);
  return new Promise(function(res,rej){
    var runner=google.script.run.withSuccessHandler(res).withFailureHandler(function(e){ rej({message:(e && e.message) || String(e)}); });
    runner[fn].apply(runner,args);
  });
}
function applyState(st){
  S.me={id:st.me.id}; S.isAdmin=st.me.isAdmin; S.owner=st.me.owner; S.sheetUrl=st.sheetUrl||"";
  S.settings=mergeSettings(st.settings, st.natures);
  S.payees=new Map(st.payees.map(function(p){ return [p.id,p]; }));
  S.requests=st.requests.slice().sort(function(a,b){ return String(b.createdAt).localeCompare(String(a.createdAt)); });
  S.loaded=true; S.offline=false; render();
}
var refreshing=false;
function refresh(){
  if(refreshing) return Promise.resolve(); refreshing=true;
  return call("api_state").then(applyState).catch(function(e){ if(!S.loaded){ S.offline=true; S.offlineMsg=e.message; render(); } }).then(function(){ refreshing=false; });
}

/* ---------- toast ---------- */
var toastT;
function toast(msg, kind){ var t=$("#toast"); t.textContent=msg; t.className="toast"+(kind==="bad"?" bad":""); t.hidden=false; clearTimeout(toastT); toastT=setTimeout(function(){ t.hidden=true; }, 5500); }

/* ---------- rendering ---------- */
function render(){
  renderWho(); renderLedger(); renderTabs();
  var t=S.tab;
  if(t==="queue") renderQueue();
  if(t==="all") renderAll();
  if(t==="pay") renderPay();
  if(t==="payees") renderPayees();
  if(t==="settings" && !S.sDirty) renderSettings();
  if(S.drawer && S.drawer.mode==="detail") renderDetail(true);
}
function myRoles(){ return ["approver1","approver2","finance"].filter(hasRole); }
function renderWho(){
  var w=$("#who");
  var canExport = S.isAdmin || myRoles().length>0;
  $("#btn-xlsx").hidden = !S.loaded || !canExport;
  if(S.offline){ w.innerHTML='<span class="muted small">Not connected. Reload the page.</span>'; $("#btn-new").hidden=true; $("#btn-add-payee").hidden=true; return; }
  if(!S.loaded){ w.innerHTML='<span class="muted small">Loading…</span>'; $("#btn-new").hidden=true; return; }
  var roles=myRoles().map(function(r){ return '<span class="rolechip">'+(r==="approver1"?"L1":r==="approver2"?"L2":"Finance")+'</span>'; }).join("");
  if(S.isAdmin) roles+='<span class="rolechip">Admin</span>';
  w.innerHTML='<span class="who"><span class="small">'+esc(S.me.id)+'</span>'+roles+'</span>';
  $("#btn-new").hidden=false;
}
function renderLedger(){
  var pend=S.requests.filter(function(r){ return r.status==="pending_l1"||r.status==="pending_l2"; });
  var appr=S.requests.filter(function(r){ return r.status==="approved"; });
  var ready=appr.filter(function(r){ return verdict(r).k==="yes"; });
  var mine=S.requests.filter(function(r){ return myAction(r); });
  var mon=todayISO().slice(0,7);
  var paid=S.requests.filter(function(r){ return r.status==="paid" && String(r.paidOn||"").slice(0,7)===mon; });
  function sum(a){ return a.reduce(function(s,r){ return s+(Number(r.netPayable)||0); },0); }
  var ok=S.loaded;
  $("#sum-you").textContent = ok? String(mine.length) : "—";
  $("#sum-you-sub").textContent = ok? (mine.length? (mine.length+" item"+(mine.length===1?"":"s")+" to action") : "Nothing to action") : "Loading…";
  $("#sum-pend").textContent = ok? money0(sum(pend)) : "—";
  $("#sum-pend-sub").textContent = ok? (pend.length+" request"+(pend.length===1?"":"s")) : " ";
  $("#sum-appr").textContent = ok? money0(sum(ready)) : "—";
  $("#sum-appr-sub").textContent = ok? (ready.length+" cleared"+(appr.length>ready.length?(" · "+(appr.length-ready.length)+" on hold"):"")) : " ";
  $("#sum-paid-lab").textContent = "Paid in "+["January","February","March","April","May","June","July","August","September","October","November","December"][new Date().getMonth()];
  $("#sum-paid").textContent = ok? money0(sum(paid)) : "—";
  $("#sum-paid-sub").textContent = ok? (paid.length+" payment"+(paid.length===1?"":"s")) : " ";
}
function renderTabs(){
  document.querySelectorAll(".tab").forEach(function(b){ b.setAttribute("aria-selected", String(b.dataset.tab===S.tab)); });
  ["queue","all","pay","payees","settings"].forEach(function(t){ $("#panel-"+t).hidden = t!==S.tab; });
  var q=S.requests.filter(function(r){ return myAction(r); }).length; var bq=$("#badge-queue"); bq.hidden=!q; bq.textContent=q;
  var p=S.requests.filter(function(r){ return r.status==="approved"; }).length; var bp=$("#badge-pay"); bp.hidden=!p; bp.textContent=p;
}
function verdictHTML(r, full){
  var v=verdict(r); var cls={yes:"v-yes",no:"v-no",wait:"v-wait",paid:"v-paid"}[v.k];
  var shown = full ? v.reasons : v.reasons.slice(0,2);
  return '<div class="verdict"><span class="vlabel '+cls+'">'+esc(v.label)+'</span>'+shown.map(function(x){ return '<span class="vreason">'+esc(x)+'</span>'; }).join("")+(!full && v.reasons.length>2?'<span class="vreason">+'+(v.reasons.length-2)+' more</span>':'')+'</div>';
}
function amountCell(r){
  var sub;
  if(r.kind==="advance"||r.kind==="balance") sub='<div class="bif">'+(r.kind==="advance"?"Advance":"Balance")+' of '+esc(money0(r.invoiceTotal))+'</div><div class="bif">Paying '+esc(money0(r.payGross))+' − TDS '+esc(money0(r.payTds))+'</div>';
  else sub='<div class="bif">Taxable '+esc(money0(r.taxable))+'</div><div class="bif">+ GST '+esc(money0(r.gstAmount))+'</div><div class="bif">− TDS '+esc(money0(r.tdsAmount))+'</div>';
  return '<div class="cell-main num">'+esc(money(r.netPayable))+'</div>'+sub;
}
function kindTag(r){ return r.kind && r.kind!=="full" ? '<span class="tag">'+kindLabel(r)+'</span>' : ''; }
function reqTable(rows){
  if(!rows.length) return "";
  var body=rows.map(function(r){
    var due = r.dueDate ? '<span class="'+(isOverdue(r)?"overdue":"")+'">Due '+esc(fmtDate(r.dueDate))+(isOverdue(r)?" · overdue":"")+'</span>' : "—";
    var w=waitingOn(r);
    return '<tr class="click" data-open="'+esc(r.id)+'" tabindex="0">'+
      '<td><div class="cell-main mono">'+esc(r.id)+'</div><div class="cell-sub">'+esc(fmtDate(r.createdAt))+' · '+esc(nm(r.requestedBy))+'</div>'+kindTag(r)+(r.priority==="urgent"?'<div class="urgent">Urgent</div>':'')+'</td>'+
      '<td style="min-width:180px"><div class="cell-main">'+esc((r.payee||{}).name||"—")+'</div><div class="cell-sub">'+(r.docType==="pi"?"PI":"Inv")+' '+esc(r.invoiceNo||"—")+' · '+esc(r.costCentre||"")+'</div>'+(r.isInfluencer?'<div class="cell-sub">@'+esc(handleClean(r.igHandle))+'</div>':'')+'</td>'+
      '<td style="min-width:190px"><div>'+esc(r.nature||"—")+'</div><div class="cell-sub">'+esc(tdsText(r))+'</div>'+(r.isInfluencer?'<span class="tag">Influencer</span>':'')+'</td>'+
      '<td style="min-width:150px"><div>'+esc(termsLabel(r))+'</div><div class="cell-sub">'+due+'</div></td>'+
      '<td class="r" style="min-width:200px">'+amountCell(r)+'</td>'+
      '<td>'+chip(r.status)+(w.length && r.status!=="paid" && r.status!=="withdrawn" ? '<div class="cell-sub">'+esc(w.map(nm).slice(0,2).join(", "))+(w.length>2?(" +"+(w.length-2)):"")+'</div>':'')+'</td>'+
      '<td>'+verdictHTML(r)+'</td></tr>';
  }).join("");
  return '<div class="tablewrap"><table><thead><tr><th>Request</th><th>Payee &amp; document</th><th>Nature of payment</th><th>Terms of payment</th><th class="r">Net payable</th><th>Status</th><th>Can be paid?</th></tr></thead><tbody>'+body+'</tbody></table></div>';
}
function emptyBox(title, text, btn){ return '<div class="empty"><h3>'+esc(title)+'</h3><p class="muted">'+text+'</p>'+(btn||"")+'</div>'; }

function renderQueue(){
  var banner=$("#queue-banner"), body=$("#queue-body");
  if(S.offline){ banner.innerHTML=""; body.innerHTML=emptyBox("Not connected", esc(S.offlineMsg||"The desk couldn't load. Reload the page.")); return; }
  if(!S.loaded){ banner.innerHTML=""; body.innerHTML=emptyBox("Loading requests…",""); return; }
  var noRoles = !roleIds("approver1").length || !roleIds("finance").length;
  banner.innerHTML = noRoles ? '<div class="notice warn"><p>'+(S.isAdmin
      ? "Approvers and Finance aren't assigned yet, so new requests will wait. Add them under <strong>Approvals &amp; settings</strong>."
      : "Approvers haven't been assigned yet. Requests you raise will wait until an admin sets them up.")+'</p>'+(S.isAdmin?'<button class="btn" type="button" data-goto="settings">Assign people</button>':'')+'</div>' : "";
  var mine=S.requests.filter(function(r){ return myAction(r); });
  var groups=[
    ["approve","To approve","Requests at your approval level that someone else raised. Check the “Can be paid?” column before approving."],
    ["pay","To pay","Approved requests. Pay only those marked Yes, then record the UTR."],
    ["balance","Balances to raise","Advances you raised that are now paid. Open one and raise the balance when it's due. It goes through approval again."],
    ["fix","Sent back to you","An approver returned these. Open one to see why, edit it and resubmit."]
  ];
  var html="";
  groups.forEach(function(g){
    var rows=mine.filter(function(r){ return myAction(r)===g[0]; }).sort(function(a,b){ return ((b.priority==="urgent")-(a.priority==="urgent")) || String(a.dueDate||"9").localeCompare(String(b.dueDate||"9")); });
    if(rows.length) html+='<div class="group-h"><h2>'+g[1]+'</h2><span class="muted small">'+rows.length+(g[0]==="balance"?(" · "+esc(money0(rows.reduce(function(s,r){return s+balanceLeft(r);},0)))+" remaining"):(" · "+esc(money0(rows.reduce(function(s,r){return s+(+r.netPayable||0);},0)))))+'</span></div><p class="muted small" style="margin:-8px 0 0">'+g[2]+'</p>'+reqTable(rows);
  });
  var myOpen=S.requests.filter(function(r){ return r.requestedBy===S.me.id && ["pending_l1","pending_l2","approved"].indexOf(r.status)>=0; });
  if(myOpen.length) html+='<div class="group-h"><h2>Raised by you, in progress</h2><span class="muted small">'+myOpen.length+'</span></div>'+reqTable(myOpen);
  if(!html) html = S.requests.length
    ? emptyBox("You're all caught up","Nothing needs your action right now. Everything else is under <strong>All requests</strong>.")
    : emptyBox("No payment requests yet","Raise the first one with the vendor's invoice or PI attached. TDS is worked out from the nature of payment, and the request goes to Level 1 approval (then Level 2 above "+esc(money0(S.settings.tierLimit))+").",'<button class="btn primary" type="button" data-new>New payment request</button>');
  body.innerHTML=html;
}
function renderAll(){
  var sel=$("#flt-cc"), cur=sel.value;
  var ccs=[]; S.settings.costCentres.concat(S.requests.map(function(r){return r.costCentre;})).forEach(function(c){ if(c && ccs.indexOf(c)<0) ccs.push(c); });
  sel.innerHTML='<option value="all">All cost centres</option>'+ccs.map(function(c){ return '<option '+(c===cur?"selected":"")+'>'+esc(c)+'</option>'; }).join("");
  var q=$("#flt-q").value.trim().toLowerCase(), st=$("#flt-status").value, cc=sel.value, vd=$("#flt-verdict").value;
  var rows=S.requests.filter(function(r){
    if(st==="pending" && ["pending_l1","pending_l2"].indexOf(r.status)<0) return false;
    if(st!=="all" && st!=="pending" && r.status!==st) return false;
    if(cc!=="all" && r.costCentre!==cc) return false;
    if(vd!=="all" && verdict(r).k!==vd) return false;
    if(q){ var hay=[r.id,(r.payee||{}).name,r.invoiceNo,r.description,r.nature,r.costCentre,r.igHandle,r.parentId].join(" ").toLowerCase(); if(hay.indexOf(q)<0) return false; }
    return true;
  });
  var total=rows.reduce(function(s,r){ return s+(+r.netPayable||0); },0);
  $("#all-body").innerHTML = !S.loaded ? emptyBox("Loading requests…","") :
    rows.length ? '<p class="muted small" style="margin:0">'+rows.length+' request'+(rows.length===1?"":"s")+' · net '+esc(money(total))+'</p>'+reqTable(rows)
    : emptyBox(S.requests.length?"No requests match":"No payment requests yet", S.requests.length?"Try a different search or filter.":"Requests appear here once someone raises one.");
}
function renderPay(){
  var fin=hasRole("finance");
  var appr=S.requests.filter(function(r){ return r.status==="approved"; }).sort(function(a,b){ return String(a.dueDate||"9").localeCompare(String(b.dueDate||"9")); });
  var payable=appr.filter(function(r){ return verdict(r).k==="yes"; });
  $("#pay-bar").innerHTML = fin
    ? '<div class="selbar"><span><strong>'+payable.length+'</strong> ready to pay · <span class="num">'+esc(money(payable.reduce(function(s,r){return s+(+r.netPayable||0);},0)))+'</span>'+(appr.length>payable.length?(' <span class="muted small">· '+(appr.length-payable.length)+' on hold</span>'):'')+'</span><span class="muted small">Open a request to record its UTR once paid.</span></div>'
    : '<div class="notice"><p class="muted">Only people in the Finance role can mark payments as paid.</p></div>';
  if(!S.loaded){ $("#pay-body").innerHTML=emptyBox("Loading…",""); $("#paid-body").innerHTML=""; return; }
  $("#pay-body").innerHTML = appr.length ? '<div class="tablewrap"><table style="min-width:980px"><thead><tr><th>Request</th><th>Payee</th><th>Bank details</th><th>Terms of payment</th><th class="r">Net payable</th><th>Can be paid?</th></tr></thead><tbody>'+
    appr.map(function(r){ var p=r.payee||{}; return '<tr class="click" data-open="'+esc(r.id)+'" tabindex="0">'+
      '<td><div class="cell-main mono">'+esc(r.id)+'</div><div class="cell-sub">'+(r.docType==="pi"?"PI":"Inv")+' '+esc(r.invoiceNo)+'</div>'+kindTag(r)+(r.priority==="urgent"?'<div class="urgent">Urgent</div>':'')+'</td>'+
      '<td><div class="cell-main">'+esc(p.name)+'</div><div class="cell-sub">'+esc(r.nature||"")+'</div></td>'+
      '<td>'+(p.account?('<div class="small">'+esc(p.beneficiary||"")+'</div><div class="cell-sub mono">'+esc(p.ifsc)+' · '+esc(last4(p.account))+'</div>'):'<span class="cell-sub">Not on file</span>')+'</td>'+
      '<td><div>'+esc(termsLabel(r))+'</div><div class="cell-sub">'+(r.dueDate?('<span class="'+(isOverdue(r)?"overdue":"")+'">Due '+esc(fmtDate(r.dueDate))+'</span>'):"—")+'</div></td>'+
      '<td class="r">'+amountCell(r)+'</td><td>'+verdictHTML(r)+'</td></tr>'; }).join("")+'</tbody></table></div>'
    : emptyBox("Nothing waiting to be paid","Fully approved requests land here.");
  var cutoff=addDays(todayISO(),-60);
  var paid=S.requests.filter(function(r){ return r.status==="paid" && String(r.paidOn||"")>=cutoff; }).sort(function(a,b){ return String(b.paidOn).localeCompare(String(a.paidOn)); });
  $("#paid-body").innerHTML = paid.length ? '<div class="tablewrap"><table style="min-width:760px"><thead><tr><th>Paid on</th><th>Request</th><th>Payee</th><th>UTR</th><th class="r">Amount</th></tr></thead><tbody>'+
    paid.map(function(r){ return '<tr class="click" data-open="'+esc(r.id)+'" tabindex="0"><td>'+esc(fmtDate(r.paidOn))+'</td><td class="mono">'+esc(r.id)+' '+kindTag(r)+'</td><td>'+esc((r.payee||{}).name)+'</td><td class="mono small">'+esc(r.utr)+'</td><td class="r num">'+esc(money(r.netPayable))+'</td></tr>'; }).join("")+'</tbody></table></div>'
    : '<p class="muted small" style="margin:0">No payments recorded in the last 60 days.</p>';
}
function renderPayees(){
  var q=$("#payee-q").value.trim().toLowerCase();
  $("#btn-add-payee").hidden = !S.loaded;
  var list=Array.from(S.payees.values()).filter(function(p){ return !q || [p.name,p.gstin,p.pan,p.igHandle,p.email,p.ifsc,p.beneficiary].join(" ").toLowerCase().indexOf(q)>=0; }).sort(function(a,b){ return String(a.name).localeCompare(String(b.name)); });
  if(!S.loaded){ $("#payees-body").innerHTML=emptyBox("Loading payees…",""); return; }
  if(!list.length){ $("#payees-body").innerHTML = emptyBox(S.payees.size?"No payees match":"No payees yet", S.payees.size?"Try another search.":"Add each vendor or influencer once with their GSTIN and PAN, and bank details if you have them. Everything is remembered for the next request.", S.payees.size?"":'<button class="btn primary" type="button" data-addpayee>Add payee</button>'); return; }
  var fy=fyOf(todayISO()); var recent=Date.now()-30*864e5;
  $("#payees-body").innerHTML='<div class="tablewrap"><table style="min-width:960px"><thead><tr><th>Payee</th><th>GSTIN / PAN</th><th>Bank details</th><th>Defaults</th><th class="r">'+esc(fyLabel(fy))+' so far</th></tr></thead><tbody>'+
    list.map(function(p){ var fyTotal=S.requests.filter(function(r){ return r.payeeId===p.id && r.kind!=="balance" && r.status!=="withdrawn" && r.status!=="rejected" && fyOf(r.invoiceDate)===fy; }).reduce(function(s,r){ return s+(+r.taxable||0); },0);
      var nat=natureById(p.defaultNatureId); var tm=TERMS.filter(function(t){return t.v===p.defaultTerms;})[0];
      return '<tr class="click" data-payee="'+esc(p.id)+'" tabindex="0">'+
      '<td><div class="cell-main">'+esc(p.name)+'</div>'+(p.igHandle?'<div class="cell-sub">@'+esc(handleClean(p.igHandle))+'</div>':'')+(p.email?'<div class="cell-sub">'+esc(p.email)+'</div>':'')+'</td>'+
      '<td><div class="mono small">'+esc(p.gstin||"—")+'</div><div class="cell-sub mono">'+(p.pan?esc(p.pan):'<span style="color:var(--bad)">No PAN · TDS 20%</span>')+'</div></td>'+
      '<td>'+(p.account?('<div class="small">'+esc(p.beneficiary||"")+'</div><div class="cell-sub mono">'+esc(p.ifsc)+' · '+esc(last4(p.account))+'</div>'+(p.bankChangedAt && new Date(p.bankChangedAt).getTime()>recent?'<span class="chip s-pending">Changed '+esc(fmtDate(p.bankChangedAt))+'</span>':'')):'<span class="cell-sub">Not added</span>')+'</td>'+
      '<td class="small">'+esc(nat?nat.name:"—")+'<div class="cell-sub">'+esc(p.defaultCc||"")+(tm?(" · "+esc(tm.l)):"")+'</div></td>'+
      '<td class="r num small">'+esc(money0(fyTotal))+'<div class="cell-sub">taxable value</div></td></tr>'; }).join("")+'</tbody></table></div>';
}

/* ---------- settings ---------- */
var ROLE_INFO = {
  admin:{title:"Admins", desc:"Change these settings and the nature master. The owner is always an admin."},
  approver1:{title:"Level 1 approvers", desc:"Approve every request. Any one of them can clear Level 1."},
  approver2:{title:"Level 2 approvers", desc:"Second sign-off above the threshold. Must differ from the Level 1 approver."},
  finance:{title:"Finance (payments)", desc:"Pay approved requests that pass every check, then record the UTR."}
};
function personChip(id, role){ return '<span class="person" style="padding-left:10px">'+esc(nm(id))+(role?'<button type="button" aria-label="Remove" data-unrole="'+role+'" data-id="'+esc(id)+'">×</button>':'<span style="width:6px"></span>')+'</span>'; }
function renderSettings(){
  var el=$("#settings-body"); var s=S.settings;
  if(!S.isAdmin){
    el.innerHTML='<div class="notice"><p class="muted">Only admins can change these settings.</p></div>'+
    '<div class="sect"><div class="sect-h">Approval route</div><p style="margin:0">Invoices up to <strong class="num">'+esc(money0(s.tierLimit))+'</strong> need one Level 1 approval. Above that, a Level 2 approval follows.</p></div>'+
    '<div class="rolegrid">'+["approver1","approver2","finance"].map(function(r){ return '<div class="rolecard"><h3>'+ROLE_INFO[r].title+'</h3><div class="people">'+(roleIds(r).map(function(id){return personChip(id);}).join("")||'<span class="muted small">Nobody yet</span>')+'</div></div>'; }).join("")+'</div>'+
    '<div class="sect"><div class="sect-h">Nature of payment master</div><div class="tdsgrid"><table><thead><tr><th>Nature of payment</th><th>TDS section</th><th class="r">Rate (ind./HUF)</th><th class="r">Rate (company/firm)</th><th class="r">Per-invoice limit</th><th class="r">Annual limit</th><th>Influencer</th></tr></thead><tbody>'+
      s.natures.filter(function(n){return !n.inactive;}).map(function(n){ return '<tr><td>'+esc(n.name)+'</td><td>'+esc(n.section||"No TDS")+'</td><td class="r num">'+(n.section?esc(n.rateInd)+"%":"—")+'</td><td class="r num">'+(n.section?esc(n.rateOther)+"%":"—")+'</td><td class="r num">'+(n.single?esc(money0(n.single)):"—")+'</td><td class="r num">'+(n.annual?esc(money0(n.annual)):"—")+'</td><td>'+(n.influencer?"Yes":"")+'</td></tr>'; }).join("")+'</tbody></table></div></div>';
    return;
  }
  if(!S.sDraft || !S.sDirty) S.sDraft=JSON.parse(JSON.stringify(S.settings));
  var d=S.sDraft, warn=[];
  if(!d.roles.approver1.length) warn.push("No Level 1 approvers: every request will wait.");
  if(!d.roles.approver2.length) warn.push("No Level 2 approvers: invoices above "+money0(d.tierLimit)+" will wait.");
  if(d.roles.approver2.length===1 && d.roles.approver1.length===1 && d.roles.approver1[0]===d.roles.approver2[0]) warn.push("The same single person is Level 1 and Level 2. Level 2 must come from someone else, so large invoices will stall.");
  if(!d.roles.finance.length) warn.push("No Finance people: approved requests can't be paid from here.");
  if(!d.companyGstins.length) warn.push("Add Kenzen's GSTINs so they're on record for checks.");
  var namesText=Object.keys(d.names||{}).map(function(k){ return k+" = "+d.names[k]; }).join("\n");
  el.innerHTML=(warn.length?'<div class="notice warn"><p>'+warn.map(esc).join("<br>")+'</p></div>':'')+
  '<div class="sect"><div class="sect-h"><span>Nature of payment master</span><button class="btn sm" type="button" id="nat-add">Add nature of payment</button></div>'+
    '<p class="muted small" style="margin:0">Each request picks one of these. TDS is deducted once the invoice crosses the per-invoice limit, or the payee\'s total for that TDS section in the financial year crosses the annual limit. Leave a limit at 0 if it doesn\'t apply, and the section blank for no TDS. Payees with no PAN get 20% (section 206AA). Ticking “Influencer” asks for the Instagram handle and reel link. You can also edit the “Nature master” tab in the data Sheet directly.</p>'+
    '<div class="tdsgrid"><table style="min-width:1040px"><thead><tr><th>Nature of payment</th><th style="width:96px">TDS section</th><th style="width:96px">Rate % ind./HUF</th><th style="width:96px">Rate % company/firm</th><th style="width:130px">Per-invoice limit ₹</th><th style="width:130px">Annual limit ₹</th><th style="width:80px">Influencer</th><th style="width:80px">In use</th></tr></thead><tbody>'+
    d.natures.map(function(n,i){ return '<tr>'+
      '<td><input type="text" id="nat-name-'+i+'" data-nat="'+i+'" value="'+esc(n.name)+'" aria-label="Nature of payment"></td>'+
      '<td><input type="text" id="nat-sec-'+i+'" data-nat="'+i+'" value="'+esc(n.section)+'" placeholder="None" aria-label="TDS section" style="text-transform:uppercase"></td>'+
      '<td><input type="number" id="nat-ri-'+i+'" data-nat="'+i+'" min="0" max="100" step="0.01" value="'+esc(n.rateInd)+'" aria-label="Rate individual"></td>'+
      '<td><input type="number" id="nat-ro-'+i+'" data-nat="'+i+'" min="0" max="100" step="0.01" value="'+esc(n.rateOther)+'" aria-label="Rate company"></td>'+
      '<td><input type="number" id="nat-s-'+i+'" data-nat="'+i+'" min="0" step="1" value="'+esc(n.single)+'" aria-label="Per-invoice limit"></td>'+
      '<td><input type="number" id="nat-a-'+i+'" data-nat="'+i+'" min="0" step="1" value="'+esc(n.annual)+'" aria-label="Annual limit"></td>'+
      '<td style="text-align:center"><input type="checkbox" id="nat-inf-'+i+'" data-nat="'+i+'" '+(n.influencer?"checked":"")+' aria-label="Influencer"></td>'+
      '<td style="text-align:center"><input type="checkbox" id="nat-act-'+i+'" data-nat="'+i+'" '+(n.inactive?"":"checked")+' aria-label="In use"></td></tr>'; }).join("")+
    '</tbody></table></div><span class="hint">Untick “In use” to retire one without affecting old requests. Defaults follow FY 2025-26 rates and limits; confirm them with your CA, and rename sections if your filings use the Income-tax Act, 2025 numbering.</span></div>'+
  '<div class="sect"><div class="sect-h">Who approves and pays</div>'+
    '<p class="muted small" style="margin:0">Add people by their Kenzen Google email. Anyone at Kenzen with the link can raise a request; nobody can approve their own.</p>'+
    '<div class="rolegrid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">'+Object.keys(ROLE_INFO).map(function(r){ return '<div class="rolecard">'+
      '<h3>'+ROLE_INFO[r].title+'</h3><p class="muted small" style="margin:0">'+ROLE_INFO[r].desc+'</p>'+
      '<div class="people">'+(r==="admin"&&S.owner?personChip(S.owner):'')+d.roles[r].filter(function(id){ return !(r==="admin" && id===S.owner); }).map(function(id){ return personChip(id,r); }).join("")+(d.roles[r].length||r==="admin"?'':'<span class="muted small">Nobody yet</span>')+'</div>'+
      '<div style="display:flex;gap:6px"><input type="email" id="role-in-'+r+'" placeholder="name@kenzenventures.com" autocomplete="off"><button class="btn sm" type="button" data-addrole="'+r+'">Add</button></div></div>'; }).join("")+'</div></div>'+
  '<div class="grid2">'+
    '<div class="sect"><div class="sect-h">Display names</div><div class="field"><label for="set-names">One per line as “email = Name”. Used instead of the email in the app.</label><textarea id="set-names" rows="4" placeholder="mounesh@kenzenventures.com = Mounesh">'+esc(namesText)+'</textarea></div></div>'+
    '<div class="sect"><div class="sect-h">Amount tier</div><div class="field"><label for="set-tier">Level 2 needed above (₹, invoice total)</label><input type="number" min="1" step="1" id="set-tier" value="'+esc(d.tierLimit)+'"></div></div>'+
    '<div class="sect"><div class="sect-h">Kenzen GSTINs</div><div class="field"><label for="set-gstins">One per line</label><textarea id="set-gstins" rows="3">'+esc((d.companyGstins||[]).join("\n"))+'</textarea></div></div>'+
    '<div class="sect"><div class="sect-h">Cost centres</div><div class="field"><label for="set-cc">One per line</label><textarea id="set-cc" rows="5">'+esc(d.costCentres.join("\n"))+'</textarea></div></div>'+
  '</div>'+
  (S.sheetUrl?'<p class="hint" style="margin:0">All data is in the <a href="'+esc(S.sheetUrl)+'" target="_blank" rel="noopener">Kenzen Payment Desk – Data</a> Google Sheet.</p>':'')+
  '<div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap"><button class="btn" type="button" id="set-reset" '+(S.sDirty?"":"disabled")+'>Discard changes</button><button class="btn primary" type="button" id="set-save" '+(S.sDirty?"":"disabled")+'>Save settings</button></div>';
}
function readSettingsInputs(){
  var d=S.sDraft; if(!d) return;
  var v=function(id){ return $("#"+id); };
  if(v("set-tier")) d.tierLimit=Number(v("set-tier").value)||0;
  if(v("set-gstins")) d.companyGstins=v("set-gstins").value.split(/[\n,]/).map(function(s){return s.trim().toUpperCase();}).filter(Boolean);
  if(v("set-cc")) d.costCentres=v("set-cc").value.split("\n").map(function(s){return s.trim();}).filter(Boolean);
  if(v("set-names")){ var m={}; v("set-names").value.split("\n").forEach(function(line){ var i=line.indexOf("="); if(i>0){ var k=line.slice(0,i).trim().toLowerCase(), n=line.slice(i+1).trim(); if(k&&n) m[k]=n; } }); d.names=m; }
  d.natures.forEach(function(n,i){
    if(!v("nat-name-"+i)) return;
    n.name=v("nat-name-"+i).value.trim(); n.section=v("nat-sec-"+i).value.trim().toUpperCase();
    n.rateInd=Number(v("nat-ri-"+i).value)||0; n.rateOther=Number(v("nat-ro-"+i).value)||0;
    n.single=Number(v("nat-s-"+i).value)||0; n.annual=Number(v("nat-a-"+i).value)||0;
    n.influencer=v("nat-inf-"+i).checked; n.inactive=!v("nat-act-"+i).checked;
  });
}
function markDirty(){ S.sDirty=true; var s=$("#set-save"), r=$("#set-reset"); if(s) s.disabled=false; if(r) r.disabled=false; }
function saveSettings(){
  readSettingsInputs(); var d=S.sDraft;
  if(!(d.tierLimit>0)) return toast("Enter a threshold above ₹0.","bad");
  if(!d.costCentres.length) return toast("Add at least one cost centre.","bad");
  d.natures=d.natures.filter(function(n){ return n.name || n.section; });
  var seen={};
  for(var i=0;i<d.natures.length;i++){ var n=d.natures[i];
    if(!n.name) return toast("Every nature of payment needs a name.","bad");
    if(seen[n.name.toLowerCase()]) return toast("“"+n.name+"” is listed twice.","bad"); seen[n.name.toLowerCase()]=1;
    if(n.section && (!(n.rateInd>=0 && n.rateInd<=100) || !(n.rateOther>=0 && n.rateOther<=100))) return toast("Check the TDS rates for “"+n.name+"”.","bad");
  }
  for(var j=0;j<d.companyGstins.length;j++) if(!GSTIN_RE.test(d.companyGstins[j])) return toast(d.companyGstins[j]+" isn't a valid GSTIN.","bad");
  var btn=$("#set-save"); btn.disabled=true; btn.textContent="Saving…";
  call("api_saveSettings",{tierLimit:d.tierLimit, companyGstins:d.companyGstins, costCentres:d.costCentres, names:d.names, roles:d.roles}, d.natures)
    .then(function(st){ S.sDirty=false; S.sDraft=null; applyState(st); toast("Settings saved."); })
    .catch(function(e){ btn.disabled=false; btn.textContent="Save settings"; toast(e.message,"bad"); });
}

/* ---------- drawer ---------- */
function openDrawer(state){ S.drawer=state; $("#drawer").hidden=false; $("#scrim").hidden=false; document.body.style.overflow="hidden"; drawDrawer(); }
function closeDrawer(){ S.drawer=null; $("#drawer").hidden=true; $("#scrim").hidden=true; document.body.style.overflow=""; }
function drawDrawer(){ var m=S.drawer && S.drawer.mode; if(m==="detail") renderDetail(false); else if(m==="form") renderForm(); else if(m==="payee") renderPayeeForm(); }
function setFoot(html){ var f=$("#drawer-foot"); f.innerHTML=html||""; f.hidden=!html; }
function findReq(id){ return S.requests.filter(function(x){ return x.id===id; })[0]; }

function routeHTML(r){
  var st=r.status, l1=!!r.l1By, l2=!!r.l2By, s=[];
  s.push('<span class="step done">Raised</span>');
  s.push('<span class="step '+(l1?"done":st==="pending_l1"?"now":(st==="rejected"&&!l1)?"stop":"")+'">Level 1</span>');
  if(r.levels===2) s.push('<span class="step '+(l2?"done":st==="pending_l2"?"now":(st==="rejected"&&l1)?"stop":"")+'">Level 2</span>');
  s.push('<span class="step '+(st==="paid"?"done":st==="approved"?"now":"")+'">Paid</span>');
  if(r.kind==="advance") s.push('<span class="step '+(r.balanceId?"done":st==="paid"?"now":"")+'">Balance</span>');
  return '<div class="route">'+s.join("<span class='muted'>→</span>")+'</div>';
}
var ACT_DOT={approved_l1:"ok",approved_l2:"ok",paid:"ok",rejected:"bad",submitted:"acc",resubmitted:"acc",terms_changed:"acc",reel_checked:"ok",balance_raised:"acc"};
function checklistHTML(r){
  return '<ul class="checklist">'+checks(r).map(function(c){
    var ov = !c.ok && c.ovr && r.overrides && r.overrides[c.id];
    var cls = c.ok ? "ok" : ov ? "acc" : c.sev==="warn" ? "warn" : "no";
    var mk = c.ok ? "✓" : (ov || c.sev==="warn") ? "!" : "✕";
    return '<li><span class="mark '+cls+'">'+mk+'</span><div><div>'+esc(c.ok?c.label:c.reason)+'</div>'+(c.detail?'<div class="cell-sub">'+esc(c.detail)+'</div>':'')+(ov?'<div class="cell-sub">Accepted by '+esc(nm(ov.by))+': '+esc(ov.note)+'</div>':'')+(!c.ok&&!ov&&c.sev==="warn"?'<div class="cell-sub">Warning only</div>':'')+'</div></li>';
  }).join("")+'</ul>';
}
function voucherHTML(r){
  var docT=r.docType==="pi"?"PI":"invoice";
  var rows='<div class="vrow"><span>Taxable value</span><span class="num">'+esc(money(r.taxable))+'</span></div>'+
    '<div class="vrow"><span>GST'+(r.gstRate!=="custom"&&r.gstRate!=null?(" @ "+esc(r.gstRate)+"%"):"")+'</span><span class="num">'+esc(money(r.gstAmount))+'</span></div>'+
    '<div class="vrow"><span><strong>'+(r.docType==="pi"?"PI total":"Invoice total")+'</strong></span><span class="num"><strong>'+esc(money(r.invoiceTotal))+'</strong></span></div>'+
    '<div class="vrow"><span>TDS on full '+docT+' · '+esc(tdsText(r))+'</span><span class="num">− '+esc(money(r.tdsAmount))+'</span></div>';
  if(r.kind==="advance"||r.kind==="balance"){
    rows+='<div class="vrow"><span>Net of TDS (full '+docT+')</span><span class="num">'+esc(money(r.invoiceNet))+'</span></div>';
    if(r.kind==="balance"){ var par=findReq(r.parentId); if(par) rows+='<div class="vrow"><span>Already paid as advance ('+esc(par.id)+')</span><span class="num">'+esc(money(par.payGross))+' − TDS '+esc(money(par.payTds))+'</span></div>'; }
    rows+='<div class="vrow"><span>'+(r.kind==="advance"?"Advance":"Balance")+' amount (incl. GST)</span><span class="num">'+esc(money(r.payGross))+'</span></div><div class="vrow"><span>Less TDS on this payment</span><span class="num">− '+esc(money(r.payTds))+'</span></div>';
  }
  rows+='<div class="vrow total"><span><strong>Net payable'+(r.kind==="advance"?" now":"")+'</strong></span><span class="num">'+esc(money(r.netPayable))+'</span></div>';
  return '<div class="voucher">'+rows+'</div>';
}
function renderDetail(isRefresh){
  var st=S.drawer; var r=findReq(st.id);
  if(!r){ if(!isRefresh){ $("#drawer-body").innerHTML=emptyBox("Request not found","It may have been removed."); setFoot(""); } return; }
  if(isRefresh){ var ae=document.activeElement; if(st.busy) return; if(ae && $("#drawer").contains(ae) && ["TEXTAREA","INPUT","SELECT"].indexOf(ae.tagName)>=0 && st.lastStatus===r.status) return; }
  var keep={note:$("#act-note")&&$("#act-note").value, utr:$("#pay-utr")&&$("#pay-utr").value, date:$("#pay-date")&&$("#pay-date").value, accept:$("#act-accept")&&$("#act-accept").checked, reel:$("#act-reel")&&$("#act-reel").checked};
  st.lastStatus=r.status;
  $("#drawer-title").innerHTML='<span class="mono">'+esc(r.id)+'</span>';
  var act=myAction(r), w=waitingOn(r), p=r.payee||{}, v=verdict(r), cs=checks(r), action="";
  if(act==="approve"){
    var hard=cs.filter(function(c){ return c.sev==="block" && !c.ovr && !c.ok && c.id!=="reelok"; });
    var soft=cs.filter(function(c){ return c.sev==="block" && c.ovr && !passes(c,r); });
    var needReel=r.isInfluencer && !r.reelCheckedBy;
    action='<div class="actbox"><h3>'+(r.status==="pending_l1"?"Level 1":"Level 2")+' approval</h3>'+
      '<p class="small muted" style="margin:0">You\'re approving <strong class="num">'+esc(money(r.netPayable))+'</strong>'+(r.kind==="advance"?" as an advance":r.kind==="balance"?" as the balance":"")+' to '+esc(p.name)+' for '+esc(r.nature||"this invoice")+', on terms “'+esc(termsLabel(r))+'”.</p>'+
      (hard.length?'<div class="notice warn"><p class="small">This can\'t be approved until it\'s fixed: '+esc(hard.map(function(c){return c.reason;}).join("; "))+'. Send it back with a comment.</p></div>':'')+
      (needReel && !hard.length?'<label class="check"><input type="checkbox" id="act-reel"> <span>I opened <a href="'+esc(r.reelLink)+'" target="_blank" rel="noopener">the reel</a>. It\'s live on @'+esc(handleClean(r.igHandle))+' and matches the brief.</span></label>':'')+
      (soft.length && !hard.length?'<label class="check"><input type="checkbox" id="act-accept"> <span>Accept these exceptions and approve anyway: '+esc(soft.map(function(c){return c.reason;}).join("; "))+'. Explain why in the comment.</span></label>':'')+
      '<div class="field"><label for="act-note">Comment '+(soft.length?"(required)":"(required to send back)")+'</label><textarea id="act-note" rows="2" placeholder="e.g. PO reference missing, GST amount doesn\'t match invoice"></textarea></div>'+
      '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="btn bad" type="button" data-act="reject">Send back</button><button class="btn ok" type="button" data-act="approve" '+(hard.length?"disabled":"")+'>Approve</button></div></div>';
  } else if(act==="pay"){
    action = v.k==="yes" ? '<div class="actbox"><h3>Record payment</h3>'+
      (p.account?'<p class="small" style="margin:0">Pay <strong class="num">'+esc(money(r.netPayable))+'</strong> to '+esc(p.beneficiary||p.name)+' · <span class="mono">'+esc(p.account)+'</span> · <span class="mono">'+esc(p.ifsc)+'</span>'+(p.bank?(" · "+esc(p.bank)):"")+'</p>':'<p class="small" style="margin:0;color:var(--warn)">No bank details on file. Confirm the account with '+esc(p.name)+' before paying.</p>')+
      '<div class="grid2"><div class="field"><label for="pay-utr">UTR / bank reference</label><input type="text" id="pay-utr" autocomplete="off" placeholder="e.g. HDFCR52026103012345678"></div><div class="field"><label for="pay-date">Paid on</label><input type="date" id="pay-date" value="'+todayISO()+'" max="'+todayISO()+'"></div></div>'+
      '<div style="display:flex;justify-content:flex-end"><button class="btn ok" type="button" data-act="paid">Mark as paid</button></div></div>'
      : '<div class="notice warn"><p class="small">Approved, but it can\'t be paid yet: '+esc(v.reasons.join("; "))+'. Ask an approver to send it back so it\'s corrected.</p></div>';
  } else if(act==="fix"){
    var why=(r.history||[]).slice().reverse().filter(function(h){ return h.action==="rejected"; })[0];
    action='<div class="actbox"><h3>Sent back by '+esc(nm(why&&why.by))+'</h3>'+(why&&why.note?'<p style="margin:0;white-space:pre-wrap">'+esc(why.note)+'</p>':'')+'<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="btn" type="button" data-act="withdraw">Withdraw</button><button class="btn primary" type="button" data-edit="'+esc(r.id)+'">Edit &amp; resubmit</button></div></div>';
  } else if(r.status==="pending_l1"||r.status==="pending_l2"){
    action='<div class="notice"><p class="small">'+(w.length?("Waiting for "+esc(w.map(nm).join(", "))+"."):("Nobody is assigned who can approve this yet"+(r.status==="pending_l2"?" at Level 2":"")+"."))+'</p>'+(r.requestedBy===S.me.id?'<button class="btn" type="button" data-act="withdraw">Withdraw</button>':'')+'</div>';
  } else if(r.status==="approved"){
    action='<div class="notice"><p class="small">Approved. '+(w.length?("Waiting for "+esc(w.map(nm).join(", "))+" to pay."):"No Finance person is assigned yet.")+'</p></div>';
  }
  if(r.kind==="advance" && r.status==="paid"){
    if(r.balanceId) action+='<div class="infobox">Balance raised on <button class="btn ghost" type="button" data-jump="'+esc(r.balanceId)+'" style="padding:0">'+esc(r.balanceId)+'</button></div>';
    else if(canRaiseBalance(r)) action+='<div class="actbox"><h3>Balance pending</h3><p class="small" style="margin:0"><strong class="num">'+esc(money(balanceLeft(r)))+'</strong> of the '+(r.docType==="pi"?"PI":"invoice")+' total ('+esc(money(r.invoiceTotal))+') is still to be paid. When it\'s due, raise it here and attach the final tax invoice if you have it. The balance goes through approval again.</p><div style="display:flex;justify-content:flex-end"><button class="btn primary" type="button" data-balance="'+esc(r.id)+'">Raise balance payment</button></div></div>';
    else action+='<div class="infobox">Balance of '+esc(money(balanceLeft(r)))+' not raised yet. '+esc(nm(r.requestedBy))+' can raise it.</div>';
  }
  if(r.kind==="balance") action+='<div class="infobox">Balance against advance <button class="btn ghost" type="button" data-jump="'+esc(r.parentId)+'" style="padding:0">'+esc(r.parentId)+'</button></div>';
  var termsBlock = st.editTerms ? '<div class="actbox"><h3>Change terms of payment</h3><div class="grid2"><div class="field"><label for="t-terms">Terms</label><select id="t-terms">'+TERMS.map(function(t){ return '<option value="'+t.v+'" '+(t.v===r.termsCode?"selected":"")+'>'+esc(t.l)+'</option>'; }).join("")+'</select></div><div class="field"><label for="t-due">Pay by</label><input type="date" id="t-due" value="'+esc(r.dueDate||"")+'"></div></div>'+
      '<div class="field" id="t-custom-wrap" '+(r.termsCode==="custom"?"":"hidden")+'><label for="t-custom">Describe the terms</label><input type="text" id="t-custom" value="'+esc(r.termsText||"")+'" placeholder="e.g. 50% advance, 50% after delivery"></div>'+
      '<div class="field"><label for="t-note">Reason for the change</label><input type="text" id="t-note" placeholder="e.g. Vendor agreed to 45 days on call"></div>'+
      '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" type="button" data-terms="cancel">Cancel</button><button class="btn primary" type="button" data-terms="save">Save terms</button></div></div>' : "";
  var hist=(r.history||[]).map(function(h){ return '<li><span class="dot '+(ACT_DOT[h.action]||"")+'"></span><div><div><strong>'+esc(nm(h.by))+'</strong> · '+esc(ACT_LABEL[h.action]||h.action)+'</div><div class="cell-sub">'+esc(fmtWhen(h.at))+'</div>'+(h.note?'<div class="note">'+esc(h.note)+'</div>':'')+'</div></li>'; }).join("");
  var files=(r.attachments||[]).map(function(a){ return '<div class="file"><a href="'+esc(a.url)+'" target="_blank" rel="noopener">'+esc(a.name)+'</a><span class="muted small">'+(a.size?Math.max(1,Math.round(a.size/1024))+" KB":"")+'</span></div>'; }).join("") || '<p class="muted small" style="margin:0">Nothing attached.</p>';
  $("#drawer-body").innerHTML=
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+chip(r.status)+kindTag(r)+(r.docType==="pi"?'<span class="tag">Proforma</span>':'')+(r.isInfluencer?'<span class="tag">Influencer</span>':'')+(r.priority==="urgent"?'<span class="urgent">Urgent</span>':'')+(isOverdue(r)?'<span class="overdue small">Overdue</span>':'')+'</div>'+
    routeHTML(r)+
    '<div class="vbox '+v.k+'"><span class="flabel">CAN THIS BE PAID?</span>'+verdictHTML(r,true)+checklistHTML(r)+'</div>'+
    action+
    '<div class="sect"><div class="sect-h">Amounts</div>'+voucherHTML(r)+(r.tdsNote?'<p class="hint" style="margin:0">'+esc(r.tdsNote)+'</p>':'')+'<p class="hint" style="margin:0">Route set at submission: '+(r.levels===2?("above "+esc(money0(r.tierLimit))+", so Level 1 and Level 2"):("up to "+esc(money0(r.tierLimit))+", so Level 1 only"))+'.</p></div>'+
    '<div class="sect"><div class="sect-h"><span>Nature and terms of payment</span>'+(canEditTerms(r)&&!st.editTerms?'<button class="btn sm" type="button" data-terms="edit">Edit terms</button>':'')+'</div>'+
      '<dl class="kv"><dt>Nature of payment</dt><dd>'+esc(r.nature||"—")+(r.natureId==="other"?'<div class="cell-sub">Not in the master</div>':'')+'</dd><dt>TDS</dt><dd>'+esc(tdsText(r))+(r.tdsAuto===false?'<div class="cell-sub">Set by hand</div>':'')+'</dd><dt>Terms of payment</dt><dd>'+esc(termsLabel(r))+'</dd><dt>Pay by</dt><dd>'+esc(fmtDate(r.dueDate))+'</dd></dl>'+termsBlock+'</div>'+
    (r.isInfluencer?'<div class="sect"><div class="sect-h">Influencer</div><dl class="kv"><dt>Instagram</dt><dd>@'+esc(handleClean(r.igHandle))+'</dd><dt>Reel</dt><dd>'+(r.reelLink?'<a href="'+esc(r.reelLink)+'" target="_blank" rel="noopener">'+esc(r.reelLink)+'</a>':"—")+'</dd><dt>Reel check</dt><dd>'+(r.reelCheckedBy?("Confirmed live by "+esc(nm(r.reelCheckedBy))+", "+esc(fmtWhen(r.reelCheckedAt))):"Not yet confirmed")+'</dd></dl></div>':'')+
    '<div class="sect"><div class="sect-h">Payee</div><dl class="kv"><dt>Payee</dt><dd>'+esc(p.name)+'</dd>'+(p.email?'<dt>Email</dt><dd>'+esc(p.email)+'</dd>':'')+'<dt>GSTIN</dt><dd class="mono">'+esc(p.gstin||"—")+'</dd><dt>PAN</dt><dd class="mono">'+esc(p.pan||"—")+'</dd>'+
      (p.account?'<dt>Beneficiary</dt><dd>'+esc(p.beneficiary||"—")+'</dd><dt>Account</dt><dd class="mono">'+esc(p.account)+'</dd><dt>IFSC</dt><dd class="mono">'+esc(p.ifsc)+(p.bank?(" · "+esc(p.bank)):"")+'</dd>':'<dt>Bank</dt><dd class="muted">Not on file</dd>')+'</dl></div>'+
    '<div class="sect"><div class="sect-h">'+(r.docType==="pi"?"Proforma invoice":"Invoice")+'</div><dl class="kv"><dt>'+(r.docType==="pi"?"PI no.":"Invoice no.")+'</dt><dd class="mono">'+esc(r.invoiceNo)+'</dd><dt>Date</dt><dd>'+esc(fmtDate(r.invoiceDate))+'</dd><dt>Payment</dt><dd>'+esc(kindLabel(r))+'</dd><dt>Cost centre</dt><dd>'+esc(r.costCentre)+'</dd><dt>Details</dt><dd style="white-space:pre-wrap">'+esc(r.description||"—")+'</dd></dl><div class="files">'+files+'</div></div>'+
    (r.status==="paid"?'<div class="sect"><div class="sect-h">Payment</div><dl class="kv"><dt>Paid on</dt><dd>'+esc(fmtDate(r.paidOn))+'</dd><dt>UTR</dt><dd class="mono">'+esc(r.utr)+'</dd><dt>Recorded by</dt><dd>'+esc(nm(r.paidBy))+'</dd></dl></div>':'')+
    '<div class="sect"><div class="sect-h">Trail</div><ul class="timeline">'+hist+'</ul></div>';
  if(keep.note && $("#act-note")) $("#act-note").value=keep.note;
  if(keep.utr && $("#pay-utr")) $("#pay-utr").value=keep.utr;
  if(keep.date && $("#pay-date")) $("#pay-date").value=keep.date;
  if(keep.accept && $("#act-accept")) $("#act-accept").checked=true;
  if(keep.reel && $("#act-reel")) $("#act-reel").checked=true;
  setFoot("");
}
function saveTerms(){
  var st=S.drawer, code=$("#t-terms").value, text=($("#t-custom")&&$("#t-custom").value||"").trim(), due=$("#t-due").value, note=($("#t-note").value||"").trim();
  if(code==="custom" && !text) return toast("Describe the terms.","bad");
  if(!due) return toast("Enter the pay-by date.","bad");
  if(!note) return toast("Add a reason for the change.","bad");
  st.busy=true;
  call("api_terms", st.id, code, text, due, note).then(function(s){ st.busy=false; st.editTerms=false; applyState(s); renderDetail(false); toast("Terms updated."); })
    .catch(function(e){ st.busy=false; toast(e.message,"bad"); });
}
function doAction(kind){
  var st=S.drawer, id=st && st.id; if(!id) return;
  var note=($("#act-note")&&$("#act-note").value||"").trim();
  if(kind==="reject" && !note){ toast("Add a comment so the requester knows what to fix.","bad"); $("#act-note").focus(); return; }
  var opts={note:note, accept:!!($("#act-accept")&&$("#act-accept").checked), reel:!!($("#act-reel")&&$("#act-reel").checked)};
  if(kind==="paid"){ opts.utr=($("#pay-utr")&&$("#pay-utr").value||"").trim(); opts.paidOn=$("#pay-date")&&$("#pay-date").value||todayISO(); if(opts.utr.length<6){ toast("Enter the UTR or bank reference from the bank statement.","bad"); return; } }
  document.querySelectorAll("[data-act]").forEach(function(b){ b.disabled=true; }); st.busy=true;
  var r=findReq(id);
  call("api_act", id, kind, opts).then(function(s){
    st.busy=false; applyState(s); closeDrawer();
    var nr=findReq(id);
    toast({approve: nr && nr.status==="approved" ? "Approved. It's now with Finance." : "Approved at Level 1. Sent to Level 2.", reject:"Sent back to the requester.", withdraw:"Request withdrawn.", paid: r && r.kind==="advance" ? "Advance marked as paid. The balance now waits for the requester to raise it." : "Marked as paid."}[kind]);
  }).catch(function(e){ st.busy=false; toast(e.message,"bad"); document.querySelectorAll("[data-act]").forEach(function(b){ b.disabled=false; }); });
}

/* ---------- request form ---------- */
function newDraft(){ return {payeeId:"", docType:"tax", kind:"full", payGross:"", invoiceNo:"", invoiceDate:"", description:"", natureId:"", natureOther:"", costCentre:"", taxable:"", gstRate:"18", gstAmount:"", tdsApplied:false, tdsSec:"", tdsRate:"", termsCode:"net30", termsText:"", dueDate:"", priority:"normal", isInf:false, igHandle:"", reelLink:""}; }
function openNewRequest(){ openDrawer({mode:"form", editId:null, kind:"new", parent:null, draft:newDraft(), attachments:[], tdsAuto:true, dueAuto:true, infManual:false}); }
function draftFromReq(r){
  return {payeeId:r.payeeId, docType:r.docType||"tax", kind:r.kind||"full", payGross:r.kind==="advance"?String(r.payGross):"", invoiceNo:r.invoiceNo, invoiceDate:r.invoiceDate, description:r.description||"",
    natureId:r.natureId||"", natureOther:r.natureId==="other"?r.nature:"", costCentre:r.costCentre,
    taxable:String(r.taxable), gstRate:String(r.gstRate==null?"custom":r.gstRate), gstAmount:String(r.gstAmount),
    tdsApplied:!!r.tdsApplied, tdsSec:r.tdsSectionCode||"", tdsRate:String(r.tdsRate==null?"":r.tdsRate),
    termsCode:r.termsCode||"custom", termsText:r.termsText||"", dueDate:r.dueDate, priority:r.priority||"normal",
    isInf:!!r.isInfluencer, igHandle:r.igHandle||"", reelLink:r.reelLink||""};
}
function openEditRequest(id){
  var r=findReq(id); if(!r) return;
  openDrawer({mode:"form", editId:id, kind:r.kind==="balance"?"balance":"new", parent:r.kind==="balance"?findReq(r.parentId):null,
    attachments:(r.attachments||[]).map(function(a){ return Object.assign({},a); }), tdsAuto:r.tdsAuto!==false, dueAuto:false, infManual:true, draft:draftFromReq(r)});
}
function openBalance(parentId){
  var par=findReq(parentId); if(!par) return;
  var d=draftFromReq(par);
  d.kind="balance"; d.payGross=""; d.docType="tax"; d.dueDate=""; d.priority="normal";
  d.description="Balance against advance "+par.id+(par.description?(" · "+par.description):"");
  if(d.termsCode==="advance"||d.termsCode==="live") d.termsCode="receipt";
  openDrawer({mode:"form", editId:null, kind:"balance", parent:par, attachments:(par.attachments||[]).map(function(a){ return Object.assign({},a); }), tdsAuto:true, dueAuto:true, infManual:true, draft:d});
}
function readForm(){
  var v=function(id){ var e=$("#"+id); return e ? e.value : ""; }; var st=S.drawer;
  return {payeeId:v("f-payee"), docType:v("f-doctype")||"tax", kind: st.kind==="balance" ? "balance" : (v("f-kind")||"full"), payGross:v("f-paygross"),
    invoiceNo:v("f-invno").trim(), invoiceDate:v("f-invdate"), description:v("f-desc").trim(), natureId:v("f-nature"), natureOther:v("f-nature-other").trim(), costCentre:v("f-cc"),
    taxable:v("f-taxable"), gstRate:v("f-gstrate"), gstAmount:v("f-gstamt"), tdsApplied:!!($("#f-tdson")&&$("#f-tdson").checked), tdsSec:v("f-tdssec").trim().toUpperCase(), tdsRate:v("f-tdsrate"),
    termsCode:v("f-terms"), termsText:v("f-terms-custom").trim(), dueDate:v("f-due"), priority:v("f-priority")||"normal",
    isInf:!!($("#f-inf")&&$("#f-inf").checked), igHandle:v("f-ig").trim(), reelLink:v("f-reel").trim()};
}
function compute(d){
  var st=S.drawer;
  var taxable=r2(d.taxable);
  var gst = d.gstRate==="custom" ? r2(d.gstAmount) : r2(taxable*Number(d.gstRate||0)/100);
  var total=r2(taxable+gst);
  var rate = d.tdsApplied ? (Number(d.tdsRate)||0) : 0;
  var tds = d.tdsApplied ? Math.round(taxable*rate/100) : 0;
  var net=r2(total-tds), payGross=total, payTds=tds;
  if(d.kind==="advance"){ payGross=r2(d.payGross); payTds = total>0 ? Math.round(payGross*(taxable/total)*rate/100) : 0; }
  if(d.kind==="balance" && st && st.parent){ payGross=r2(total-(Number(st.parent.payGross)||0)); payTds=Math.max(0, tds-(Number(st.parent.payTds)||0)); }
  return {taxable:taxable,gst:gst,total:total,rate:rate,tds:tds,net:net,payGross:payGross,payTds:payTds,payNet:r2(payGross-payTds)};
}
function renderForm(){
  var st=S.drawer, d=st.draft, isBal=st.kind==="balance", par=st.parent;
  $("#drawer-title").textContent = st.editId ? ("Edit "+st.editId) : isBal ? ("Balance for "+(par&&par.id)) : "New payment request";
  var payees=Array.from(S.payees.values()).sort(function(a,b){ return String(a.name).localeCompare(String(b.name)); });
  var ccs=[]; S.settings.costCentres.concat([d.costCentre]).forEach(function(c){ if(c && ccs.indexOf(c)<0) ccs.push(c); });
  var nats=S.settings.natures.filter(function(n){ return !n.inactive || n.id===d.natureId; });
  var gstOpts=["0","5","18","40"];
  $("#drawer-body").innerHTML=
    (isBal && par ? '<div class="infobox"><strong>Balance against advance '+esc(par.id)+'</strong><span>Advance paid '+esc(fmtDate(par.paidOn))+': '+esc(money(par.payGross))+' incl. GST, less TDS '+esc(money(par.payTds))+' (UTR '+esc(par.utr||"—")+').</span><span class="hint">Update the amounts if the final tax invoice differs from the PI, and attach it. The balance is worked out below.</span></div>' : '')+
    '<div class="sect"><div class="sect-h">Who is being paid</div><div class="field"><label for="f-payee">Payee</label><select id="f-payee" '+(isBal?"disabled":"")+'><option value="">Choose a payee…</option>'+payees.map(function(p){ return '<option value="'+esc(p.id)+'" '+(p.id===d.payeeId?"selected":"")+'>'+esc(p.name)+(p.gstin?(" · "+esc(p.gstin)):p.pan?(" · "+esc(p.pan)):"")+'</option>'; }).join("")+(isBal?'':'<option value="__new">＋ Add a new payee…</option>')+'</select><span class="hint" id="f-payee-hint"></span></div></div>'+
    '<div class="sect"><div class="sect-h">Document</div><div class="grid2">'+
      '<div class="field"><label for="f-doctype">Document type</label><select id="f-doctype"><option value="tax" '+(d.docType!=="pi"?"selected":"")+'>Tax invoice</option><option value="pi" '+(d.docType==="pi"?"selected":"")+'>Proforma invoice (PI)</option></select></div>'+
      (isBal ? '<div class="field"><span class="flabel">Payment type</span><span>Balance payment</span></div>' : '<div class="field"><label for="f-kind">Payment type</label><select id="f-kind"><option value="full" '+(d.kind!=="advance"?"selected":"")+'>Full payment</option><option value="advance" '+(d.kind==="advance"?"selected":"")+'>Advance (part payment)</option></select></div>')+
    '</div>'+
      '<div class="field"><label for="f-files">Attach the '+(isBal?"final tax invoice":"invoice or PI")+' (PDF or image, up to 10 MB)</label><input type="file" id="f-files" multiple accept="application/pdf,image/png,image/jpeg,image/webp"></div><div class="files" id="f-attlist"></div>'+
      '<div class="grid2"><div class="field"><label for="f-invno" id="f-invno-lab">'+(d.docType==="pi"?"PI no.":"Invoice / bill no.")+'</label><input type="text" id="f-invno" value="'+esc(d.invoiceNo)+'" autocomplete="off"></div><div class="field"><label for="f-invdate">Document date</label><input type="date" id="f-invdate" value="'+esc(d.invoiceDate)+'" max="'+todayISO()+'"></div></div>'+
      '<div class="field"><label for="f-nature">Nature of payment</label><select id="f-nature"><option value="">Choose from the master…</option>'+nats.map(function(n){ return '<option value="'+esc(n.id)+'" '+(n.id===d.natureId?"selected":"")+'>'+esc(n.name)+(n.section?(" · "+esc(n.section)):" · no TDS")+'</option>'; }).join("")+'<option value="other" '+(d.natureId==="other"?"selected":"")+'>Other (not in the master)…</option></select>'+
        '<span class="hint">'+(S.isAdmin?"New type of expense? Add it under Approvals &amp; settings → Nature of payment master.":"New type of expense? Ask an admin to add it to the master, or choose Other.")+'</span></div>'+
      '<div class="field" id="f-nature-other-wrap" '+(d.natureId==="other"?"":"hidden")+'><label for="f-nature-other">Describe the nature of payment</label><input type="text" id="f-nature-other" value="'+esc(d.natureOther)+'" placeholder="e.g. trade show stall fabrication"></div>'+
      '<div class="field"><label for="f-desc">Details for approvers</label><textarea id="f-desc" rows="2" placeholder="e.g. Sep 2026 storage and pick-pack at Bhiwandi FC, PO 4512">'+esc(d.description)+'</textarea></div>'+
      '<div class="field"><label for="f-cc">Cost centre</label><select id="f-cc"><option value="">Choose…</option>'+ccs.map(function(c){ return '<option '+(c===d.costCentre?"selected":"")+'>'+esc(c)+'</option>'; }).join("")+'</select></div></div>'+
    '<div class="sect"><div class="sect-h">Amounts</div><div class="grid3">'+
      '<div class="field"><label for="f-taxable">Taxable value (₹)</label><input type="number" id="f-taxable" min="0" step="0.01" inputmode="decimal" value="'+esc(d.taxable)+'"></div>'+
      '<div class="field"><label for="f-gstrate">GST rate</label><select id="f-gstrate">'+gstOpts.map(function(g){ return '<option value="'+g+'" '+(g===String(d.gstRate)?"selected":"")+'>'+g+'%</option>'; }).join("")+'<option value="custom" '+(d.gstRate==="custom"?"selected":"")+'>As on invoice / mixed</option></select></div>'+
      '<div class="field"><label for="f-gstamt">GST amount (₹)</label><input type="number" id="f-gstamt" min="0" step="0.01" value="'+esc(d.gstAmount)+'" '+(d.gstRate==="custom"?"":"readonly")+'></div></div>'+
      '<div class="field"><span class="flabel">TDS</span><div class="grid3" style="align-items:end"><label class="check"><input type="checkbox" id="f-tdson" '+(d.tdsApplied?"checked":"")+'> <span>Deduct TDS</span></label>'+
        '<div class="field"><label for="f-tdssec">Section</label><input type="text" id="f-tdssec" value="'+esc(d.tdsSec)+'" style="text-transform:uppercase"></div><div class="field"><label for="f-tdsrate">Rate (%)</label><input type="number" id="f-tdsrate" min="0" max="100" step="0.01" value="'+esc(d.tdsRate)+'"></div></div><span class="hint" id="f-tds-hint"></span></div>'+
      '<div class="field" id="f-adv-wrap" '+(d.kind==="advance"?"":"hidden")+'><label for="f-paygross">Advance to pay now (₹, including GST, before TDS)</label><input type="number" id="f-paygross" min="0" step="0.01" value="'+esc(d.payGross)+'"><span class="hint" id="f-adv-hint"></span></div>'+
      '<div class="voucher" id="f-calc"></div><p class="hint" style="margin:0">TDS is worked out on the taxable value (GST excluded) and rounded to the rupee. On an advance, TDS is deducted on the taxable part of the advance.</p></div>'+
    '<div class="sect"><div class="sect-h">Terms of payment</div><div class="grid3">'+
      '<div class="field"><label for="f-terms">Terms</label><select id="f-terms">'+TERMS.map(function(t){ return '<option value="'+t.v+'" '+(t.v===d.termsCode?"selected":"")+'>'+esc(t.l)+'</option>'; }).join("")+'</select></div>'+
      '<div class="field"><label for="f-due">Pay by</label><input type="date" id="f-due" value="'+esc(d.dueDate)+'"><span class="hint" id="f-due-hint"></span></div>'+
      '<div class="field"><label for="f-priority">Priority</label><select id="f-priority"><option value="normal" '+(d.priority!=="urgent"?"selected":"")+'>Normal</option><option value="urgent" '+(d.priority==="urgent"?"selected":"")+'>Urgent</option></select></div></div>'+
      '<div class="field" id="f-terms-custom-wrap" '+(d.termsCode==="custom"?"":"hidden")+'><label for="f-terms-custom">Describe the terms</label><input type="text" id="f-terms-custom" value="'+esc(d.termsText)+'" placeholder="e.g. 50% advance, 50% after delivery"></div><span class="hint">Approvers can change the terms while the request is with them.</span></div>'+
    '<div class="sect"><div class="sect-h">Influencer payment</div><label class="check"><input type="checkbox" id="f-inf" '+(d.isInf?"checked":"")+'> <span>This pays an influencer or creator for Instagram content</span></label>'+
      '<div class="grid2" id="f-inf-wrap" '+(d.isInf?"":"hidden")+'><div class="field"><label for="f-ig">Instagram handle</label><input type="text" id="f-ig" value="'+esc(d.igHandle)+'" placeholder="@handle" autocomplete="off"><span class="err" id="f-ig-err" hidden></span></div><div class="field"><label for="f-reel">Reel link</label><input type="url" id="f-reel" value="'+esc(d.reelLink)+'" placeholder="https://www.instagram.com/reel/…" autocomplete="off"><span class="err" id="f-reel-err" hidden></span></div></div><span class="hint" id="f-inf-hint"></span></div>'+
    '<p class="err" id="f-err" hidden></p>';
  setFoot('<button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" id="f-submit">'+(st.editId?"Resubmit for approval":isBal?"Submit balance for approval":"Submit for approval")+'</button>');
  renderAttachList(); applyAuto();
}
function renderAttachList(){
  var el=$("#f-attlist"); if(!el) return;
  el.innerHTML=S.drawer.attachments.map(function(a,i){ return '<div class="file"><span class="fn">'+esc(a.name)+'</span><span style="display:flex;gap:6px;align-items:center">'+(a.uploading?'<span class="muted small">Uploading…</span>':'<span class="muted small">'+(a.size?Math.max(1,Math.round(a.size/1024))+" KB":"")+'</span><button class="btn ghost" type="button" data-rmatt="'+i+'">Remove</button>')+'</span></div>'; }).join("");
}
function applyAuto(){
  var st=S.drawer; if(!st || st.mode!=="form") return;
  var d=readForm(), p=S.payees.get(d.payeeId), isBal=st.kind==="balance";
  var nat = d.natureId && d.natureId!=="other" ? natureById(d.natureId) : null;
  $("#f-nature-other-wrap").hidden = d.natureId!=="other";
  $("#f-invno-lab").textContent = d.docType==="pi" ? "PI no." : "Invoice / bill no.";
  $("#f-adv-wrap").hidden = d.kind!=="advance";
  var on=$("#f-tdson"), sec=$("#f-tdssec"), rate=$("#f-tdsrate"), hint=$("#f-tds-hint"), plan=null;
  if(d.natureId==="other") st.tdsAuto=false;
  if(isBal && st.parent){
    if(st.tdsAuto){ on.checked=!!st.parent.tdsApplied; sec.value=st.parent.tdsSectionCode||""; rate.value=st.parent.tdsApplied?String(st.parent.tdsRate):""; }
    st.planText="Same TDS as the advance: "+tdsText(st.parent)+".";
  } else if(nat){
    plan=tdsPlan(nat, p, r2(d.taxable), d.invoiceDate, {excludeId:st.editId});
    st.planText=plan.text;
    if(st.tdsAuto){ on.checked=plan.applies; sec.value=plan.section; rate.value=plan.applies?String(plan.rate):""; }
  } else st.planText="";
  var locked = st.tdsAuto && (nat || isBal);
  [on,sec,rate].forEach(function(el){ el.disabled=locked; });
  if(!locked){ sec.disabled=!on.checked; rate.disabled=!on.checked; }
  var t="";
  if(isBal) t=esc(st.planText);
  else if(nat) t='<span class="'+(plan.applies?"good":"")+'">'+esc(plan.text)+'</span>'+(plan.crossing?(' <span class="alert">This invoice crosses the annual limit, so TDS on earlier invoices this year ('+esc(money0(plan.prior))+') may also be due.</span>'):'')+(!p?" Choose the payee to check the threshold.":"");
  else if(d.natureId==="other") t="Not in the master, so set TDS yourself.";
  else t="Choose the nature of payment and TDS is worked out for you.";
  if(!st.tdsAuto && (nat||isBal)) t+=' TDS set by hand. <button class="btn ghost" type="button" data-tdsauto style="padding:0">Use the master</button>';
  else if(st.tdsAuto && (nat||isBal)) t+=' <button class="btn ghost" type="button" data-tdsman style="padding:0">Change</button>';
  hint.innerHTML=t;
  var ph=$("#f-payee-hint");
  ph.innerHTML = p ? ((p.pan?("PAN "+esc(p.pan)+" ("+(panEntity(p.pan)==="individual"?"individual/HUF":"company/firm")+")"):'<span style="color:var(--bad)">No PAN on file, so TDS is 20% when it applies.</span>')+(p.gstin?(" · GSTIN "+esc(p.gstin)):" · no GSTIN")+" · "+(p.account?("bank "+esc(p.ifsc)+" "+esc(last4(p.account))):"no bank details")+' <button class="btn ghost" type="button" data-editpayee="'+esc(p.id)+'" style="padding:0">Edit payee</button>') : (S.payees.size?"":"No payees yet. Choose “Add a new payee” to set one up.");
  if(!st.infManual) $("#f-inf").checked = !!(nat && nat.influencer) || !!(p && p.igHandle);
  var inf=$("#f-inf").checked; $("#f-inf-wrap").hidden=!inf; $("#f-inf-hint").textContent = inf ? "An approver must open the reel and confirm it's live before approving." : "";
  if(inf && p && p.igHandle && !$("#f-ig").value) $("#f-ig").value="@"+handleClean(p.igHandle);
  applyDue(); updateCalc();
}
function applyDue(){
  var st=S.drawer, code=$("#f-terms").value, inv=$("#f-invdate").value, t=TERMS.filter(function(x){return x.v===code;})[0];
  $("#f-terms-custom-wrap").hidden = code!=="custom";
  var hint=$("#f-due-hint");
  if(st.dueAuto && t && t.days!=null){
    var base=(code==="advance"||code==="receipt") ? todayISO() : inv;
    if(base){ $("#f-due").value=addDays(base,t.days); hint.textContent=(code==="advance"||code==="receipt")?"Set to today.":("Document date + "+t.days+" days."); }
    else hint.textContent="Enter the document date to set this.";
  } else hint.textContent = st.dueAuto ? "" : "Set by hand.";
}
function updateCalc(){
  var st=S.drawer, d=readForm(), c=compute(d);
  if(d.gstRate!=="custom") $("#f-gstamt").value = d.taxable!=="" ? c.gst.toFixed(2) : "";
  var levels = c.total > S.settings.tierLimit ? 2 : 1, docT=d.docType==="pi"?"PI":"Invoice";
  var rows='<div class="vrow"><span>Taxable value</span><span class="num">'+esc(money(c.taxable))+'</span></div>'+
    '<div class="vrow"><span>GST'+(d.gstRate!=="custom"?(" @ "+esc(d.gstRate)+"%"):"")+'</span><span class="num">'+esc(money(c.gst))+'</span></div>'+
    '<div class="vrow"><span><strong>'+docT+' total</strong></span><span class="num"><strong>'+esc(money(c.total))+'</strong></span></div>'+
    '<div class="vrow"><span>TDS'+(d.tdsApplied?(" · "+esc(d.tdsSec)+" @ "+esc(c.rate)+"%"):" · none")+(d.kind!=="full"?(" on full "+docT.toLowerCase()):"")+'</span><span class="num">− '+esc(money(c.tds))+'</span></div>';
  if(d.kind==="full") rows+='<div class="vrow total"><span><strong>Net payable</strong></span><span class="num">'+esc(money(c.payNet))+'</span></div>';
  else {
    if(d.kind==="balance" && st.parent) rows+='<div class="vrow"><span>Paid as advance ('+esc(st.parent.id)+')</span><span class="num">'+esc(money(st.parent.payGross))+' − TDS '+esc(money(st.parent.payTds))+'</span></div>';
    rows+='<div class="vrow"><span>'+(d.kind==="advance"?"Advance":"Balance")+' (incl. GST)</span><span class="num">'+esc(money(c.payGross))+'</span></div><div class="vrow"><span>Less TDS on this payment</span><span class="num">− '+esc(money(c.payTds))+'</span></div><div class="vrow total"><span><strong>Net payable now</strong></span><span class="num">'+esc(money(c.payNet))+'</span></div>';
  }
  rows+='<div class="vrow"><span class="small muted">'+(levels===2?("Above "+esc(money0(S.settings.tierLimit))+": needs Level 1 and Level 2"):("Up to "+esc(money0(S.settings.tierLimit))+": needs Level 1 only"))+'</span></div>';
  $("#f-calc").innerHTML=rows;
  var ah=$("#f-adv-hint"); if(ah && d.kind==="advance") ah.textContent = c.total>0 && c.payGross>0 ? ((c.payGross/c.total*100).toFixed(1)+"% of the "+docT.toLowerCase()+" total. Balance after this: "+money(c.total-c.payGross)+".") : "";
}
function onFiles(input){
  var st=S.drawer, files=[].slice.call(input.files); input.value="";
  var map={pdf:"application/pdf",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp"};
  files.forEach(function(f){
    var type=map[(f.name.split(".").pop()||"").toLowerCase()] || f.type;
    if(["application/pdf","image/png","image/jpeg","image/webp"].indexOf(type)<0){ toast(f.name+": attach a PDF, PNG, JPG or WebP.","bad"); return; }
    if(f.size>10*1024*1024){ toast(f.name+" is over 10 MB. Compress it and try again.","bad"); return; }
    var tmp={name:f.name, uploading:true}; st.attachments.push(tmp); renderAttachList();
    var fr=new FileReader();
    fr.onload=function(){ var b64=String(fr.result).split(",")[1];
      call("api_upload", f.name, type, b64).then(function(res){ Object.assign(tmp,res); delete tmp.uploading; if(S.drawer===st) renderAttachList(); })
        .catch(function(e){ st.attachments.splice(st.attachments.indexOf(tmp),1); if(S.drawer===st) renderAttachList(); toast(e.message,"bad"); }); };
    fr.onerror=function(){ st.attachments.splice(st.attachments.indexOf(tmp),1); renderAttachList(); toast("Couldn't read "+f.name+".","bad"); };
    fr.readAsDataURL(f);
  });
}
function submitRequest(){
  var st=S.drawer, d=readForm(); st.draft=d; var isBal=st.kind==="balance";
  var errEl=$("#f-err"); var fail=function(m){ errEl.textContent=m; errEl.hidden=false; errEl.scrollIntoView({block:"nearest"}); };
  errEl.hidden=true;
  var p=S.payees.get(d.payeeId);
  if(!p) return fail("Choose who is being paid.");
  if(!d.invoiceNo) return fail(d.docType==="pi"?"Enter the PI number.":"Enter the invoice or bill number.");
  if(!d.invoiceDate) return fail("Enter the document date.");
  if(!d.natureId) return fail("Choose the nature of payment.");
  if(d.natureId==="other" && !d.natureOther) return fail("Describe the nature of payment.");
  if(!d.costCentre) return fail("Choose a cost centre.");
  var c=compute(d);
  if(!(c.taxable>0)) return fail("Enter the taxable value.");
  if(d.tdsApplied && (!d.tdsSec || !(Number(d.tdsRate)>0))) return fail("Enter the TDS section and rate, or untick Deduct TDS.");
  if(d.kind==="advance" && !(c.payGross>0 && c.payGross<c.total)) return fail("The advance must be more than ₹0 and less than the "+(d.docType==="pi"?"PI":"invoice")+" total ("+money(c.total)+"). For the whole amount, choose Full payment.");
  if(isBal && !(c.payGross>0)) return fail("There's nothing left to pay. Check the amounts against the advance.");
  if(c.payNet<=0) return fail("Net payable must be above zero. Check GST and TDS.");
  if(d.termsCode==="custom" && !d.termsText) return fail("Describe the terms of payment.");
  if(!d.dueDate) return fail("Enter the date it should be paid by.");
  if(d.isInf){
    if(!HANDLE_RE.test(d.igHandle)) return fail("Enter the influencer's Instagram handle, e.g. @kenzen.creator.");
    if(!REEL_RE.test(d.reelLink)) return fail("Paste the reel link from Instagram. It should look like https://www.instagram.com/reel/ABC123xyz/.");
  }
  if(st.attachments.some(function(a){ return a.uploading; })) return fail("Wait for the attachments to finish uploading.");
  if(!st.attachments.length) return fail("Attach the invoice or PI.");
  var nat = d.natureId!=="other" ? natureById(d.natureId) : null;
  var base={payeeId:p.id, docType:d.docType, kind:d.kind, parentId:isBal?st.parent.id:null,
    invoiceNo:d.invoiceNo, invoiceDate:d.invoiceDate, description:d.description, natureId:d.natureId, nature:nat?nat.name:d.natureOther, costCentre:d.costCentre,
    taxable:c.taxable, gstRate:d.gstRate==="custom"?"custom":Number(d.gstRate), gstAmount:c.gst, invoiceTotal:c.total,
    tdsSectionCode:(nat&&nat.section)||d.tdsSec||"", tdsApplied:d.tdsApplied, tdsRate:d.tdsApplied?c.rate:0, tdsAmount:c.tds, tdsAuto:!!st.tdsAuto, tdsNote:st.planText||"",
    invoiceNet:c.net, payGross:c.payGross, payTds:c.payTds, netPayable:c.payNet,
    termsCode:d.termsCode, termsText:d.termsCode==="custom"?d.termsText:"", dueDate:d.dueDate, priority:d.priority,
    isInfluencer:d.isInf, igHandle:d.isInf?("@"+handleClean(d.igHandle)):"", reelLink:d.isInf?d.reelLink:"",
    attachments:st.attachments.map(function(a){ return {id:a.id,name:a.name,type:a.type||"",size:a.size||0,url:a.url||""}; })};
  var btn=$("#f-submit"); btn.disabled=true; btn.textContent="Submitting…";
  call("api_saveRequest", base, st.editId).then(function(res){ applyState(res.state); closeDrawer(); toast((st.editId?(st.editId+" resubmitted"):(res.id+" submitted"))+" for Level 1 approval."); })
    .catch(function(e){ btn.disabled=false; btn.textContent=st.editId?"Resubmit for approval":"Submit for approval"; fail(e.message); });
}

/* ---------- payee form ---------- */
function openPayee(id, returnTo){ openDrawer({mode:"payee", payeeId:id||null, returnTo:returnTo||null}); }
function renderPayeeForm(){
  var st=S.drawer, p=st.payeeId ? (S.payees.get(st.payeeId)||{}) : {};
  $("#drawer-title").textContent = st.payeeId ? ("Edit "+(p.name||"payee")) : "Add payee";
  var nats=S.settings.natures.filter(function(n){ return !n.inactive || n.id===p.defaultNatureId; });
  $("#drawer-body").innerHTML=
    '<div class="sect"><div class="sect-h">Vendor or influencer</div><div class="field"><label for="p-name">Payee name (as you know them)</label><input type="text" id="p-name" value="'+esc(p.name)+'"></div>'+
      '<div class="grid2"><div class="field"><label for="p-gstin">GSTIN (optional)</label><input type="text" id="p-gstin" value="'+esc(p.gstin)+'" maxlength="15" style="text-transform:uppercase"></div><div class="field"><label for="p-pan">PAN</label><input type="text" id="p-pan" value="'+esc(p.pan)+'" maxlength="10" style="text-transform:uppercase"><span class="hint">Taken from GSTIN if left blank. Without a PAN, TDS is 20%.</span></div></div>'+
      '<div class="grid2"><div class="field"><label for="p-email">Remittance email (optional)</label><input type="email" id="p-email" value="'+esc(p.email)+'"></div><div class="field"><label for="p-ig">Instagram handle (influencers)</label><input type="text" id="p-ig" value="'+(p.igHandle?("@"+esc(handleClean(p.igHandle))):"")+'" placeholder="@handle"></div></div></div>'+
    '<div class="sect"><div class="sect-h">Bank details (optional)</div><p class="hint" style="margin:0">Saved with the payee and shown to Finance on every future request.'+(st.payeeId&&p.account?" Changes are logged and put open requests for this payee on hold until resubmitted.":"")+'</p>'+
      '<div class="field"><label for="p-benef">Beneficiary name (as per bank)</label><input type="text" id="p-benef" value="'+esc(p.beneficiary)+'"></div>'+
      '<div class="grid2"><div class="field"><label for="p-acct">Account number</label><input type="text" id="p-acct" inputmode="numeric" autocomplete="off" value="'+esc(p.account)+'"></div><div class="field"><label for="p-acct2">Re-enter account number</label><input type="text" id="p-acct2" inputmode="numeric" autocomplete="off" value="'+esc(p.account)+'"></div></div>'+
      '<div class="grid2"><div class="field"><label for="p-ifsc">IFSC</label><input type="text" id="p-ifsc" maxlength="11" value="'+esc(p.ifsc)+'" style="text-transform:uppercase"></div><div class="field"><label for="p-bank">Bank &amp; branch</label><input type="text" id="p-bank" value="'+esc(p.bank)+'"></div></div></div>'+
    '<div class="sect"><div class="sect-h">Defaults for new requests</div><div class="grid3">'+
      '<div class="field"><label for="p-nature">Nature of payment</label><select id="p-nature"><option value="">None</option>'+nats.map(function(n){ return '<option value="'+esc(n.id)+'" '+(n.id===p.defaultNatureId?"selected":"")+'>'+esc(n.name)+'</option>'; }).join("")+'</select></div>'+
      '<div class="field"><label for="p-cc">Cost centre</label><select id="p-cc"><option value="">None</option>'+S.settings.costCentres.map(function(c){ return '<option '+(c===p.defaultCc?"selected":"")+'>'+esc(c)+'</option>'; }).join("")+'</select></div>'+
      '<div class="field"><label for="p-terms">Terms of payment</label><select id="p-terms"><option value="">None</option>'+TERMS.filter(function(t){return t.v!=="custom";}).map(function(t){ return '<option value="'+t.v+'" '+(t.v===p.defaultTerms?"selected":"")+'>'+esc(t.l)+'</option>'; }).join("")+'</select></div></div></div>'+
    '<p class="err" id="p-err" hidden></p>';
  setFoot('<button class="btn" type="button" id="p-cancel">'+(st.returnTo?"Back to request":"Cancel")+'</button><button class="btn primary" type="button" id="p-save">Save payee</button>');
}
function savePayee(){
  var st=S.drawer, v=function(id){ return ($("#"+id)&&$("#"+id).value||"").trim(); };
  var errEl=$("#p-err"), fail=function(m){ errEl.textContent=m; errEl.hidden=false; errEl.scrollIntoView({block:"nearest"}); };
  errEl.hidden=true;
  var gstin=v("p-gstin").toUpperCase(), pan=v("p-pan").toUpperCase(), ig=handleClean(v("p-ig"));
  var rec={name:v("p-name"), gstin:gstin, pan:pan, email:v("p-email"), igHandle:ig, defaultNatureId:v("p-nature"), defaultCc:v("p-cc"), defaultTerms:v("p-terms"),
    beneficiary:v("p-benef"), account:v("p-acct").replace(/\s+/g,""), ifsc:v("p-ifsc").toUpperCase(), bank:v("p-bank")};
  if(!rec.name) return fail("Enter the payee name.");
  if(gstin && !GSTIN_RE.test(gstin)) return fail("That GSTIN doesn't look right. It should be 15 characters, e.g. 36AABCK1234L1Z5.");
  if(!pan && gstin) rec.pan=pan=gstin.slice(2,12);
  if(pan && !PAN_RE.test(pan)) return fail("PAN should be 5 letters, 4 digits, 1 letter.");
  if(gstin && pan && gstin.slice(2,12)!==pan) return fail("The PAN doesn't match the PAN inside the GSTIN (characters 3 to 12).");
  if(ig && !HANDLE_RE.test(ig)) return fail("Instagram handles use letters, numbers, dots and underscores only.");
  if(rec.beneficiary || rec.account || rec.ifsc || rec.bank || v("p-acct2")){
    if(!rec.beneficiary) return fail("Enter the beneficiary name as the bank has it, or clear the bank fields.");
    if(!/^[0-9]{6,18}$/.test(rec.account)) return fail("Account number should be 6 to 18 digits.");
    if(rec.account!==v("p-acct2").replace(/\s+/g,"")) return fail("The two account numbers don't match.");
    if(!IFSC_RE.test(rec.ifsc)) return fail("IFSC should be 11 characters: 4 letters, a zero, then 6 letters or digits (e.g. HDFC0001234).");
  }
  var dup=Array.from(S.payees.values()).filter(function(p){ return p.id!==st.payeeId && ((rec.gstin && p.gstin===rec.gstin) || (!rec.gstin && rec.pan && !p.gstin && p.pan===rec.pan)); })[0];
  if(dup) return fail((rec.gstin?"This GSTIN":"This PAN")+" is already saved for "+dup.name+".");
  var btn=$("#p-save"); btn.disabled=true; btn.textContent="Saving…";
  call("api_savePayee", rec, st.payeeId).then(function(res){
    applyState(res.state); toast(rec.name+" saved.");
    if(st.returnTo){ var back=st.returnTo; back.draft.payeeId=res.id; applyPayeeDefaults(back.draft, rec, !st.payeeId); openDrawer(back); } else closeDrawer();
  }).catch(function(e){ btn.disabled=false; btn.textContent="Save payee"; fail(e.message); });
}
function applyPayeeDefaults(d, p, force){
  if(p.defaultCc && (force || !d.costCentre)) d.costCentre=p.defaultCc;
  if(p.defaultNatureId && natureById(p.defaultNatureId) && (force || !d.natureId)) d.natureId=p.defaultNatureId;
  if(p.defaultTerms && (force || !d.termsCode || d.termsCode==="net30")) d.termsCode=p.defaultTerms;
  if(p.igHandle && !d.igHandle) d.igHandle="@"+handleClean(p.igHandle);
}
function exportExcel(){
  var btn=$("#btn-xlsx"); btn.disabled=true; var label=btn.textContent; btn.textContent="Saving to Drive…";
  call("api_export").then(function(res){ btn.disabled=false; btn.textContent=label;
    $("#toast").innerHTML='Saved “'+esc(res.name)+'” to Drive. <a href="'+esc(res.url)+'" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">Open it</a>';
    $("#toast").className="toast"; $("#toast").hidden=false; clearTimeout(toastT); toastT=setTimeout(function(){ $("#toast").hidden=true; },12000);
  }).catch(function(e){ btn.disabled=false; btn.textContent=label; toast(e.message,"bad"); });
}

/* ---------- events ---------- */
function bind(){
  document.querySelectorAll(".tab").forEach(function(b){ b.addEventListener("click",function(){ S.tab=b.dataset.tab; if(S.tab==="settings"){ S.sDirty=false; S.sDraft=null; } render(); }); });
  $("#btn-new").addEventListener("click", openNewRequest);
  $("#btn-xlsx").addEventListener("click", exportExcel);
  $("#btn-add-payee").addEventListener("click", function(){ openPayee(null); });
  $("#drawer-close").addEventListener("click", closeDrawer);
  $("#scrim").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function(e){ if(e.key==="Escape" && S.drawer) closeDrawer();
    if((e.key==="Enter"||e.key===" ") && e.target.matches && e.target.matches("tr[data-open],tr[data-payee]")){ e.preventDefault(); e.target.click(); } });
  ["flt-q","flt-status","flt-cc","flt-verdict"].forEach(function(id){ $("#"+id).addEventListener("input", renderAll); });
  $("#payee-q").addEventListener("input", renderPayees);
  document.addEventListener("click", function(e){
    var t=e.target, c=function(sel){ return t.closest(sel); };
    if(c("a[href]")) return;
    var go=c("[data-goto]"); if(go){ S.tab=go.dataset.goto; S.sDraft=null; S.sDirty=false; render(); return; }
    if(c("[data-new]")) return openNewRequest();
    if(c("[data-addpayee]")) return openPayee(null);
    var jm=c("[data-jump]"); if(jm) return openDrawer({mode:"detail", id:jm.dataset.jump});
    var bl=c("[data-balance]"); if(bl) return openBalance(bl.dataset.balance);
    var op=c("[data-open]"); if(op && !$("#drawer").contains(op)) return openDrawer({mode:"detail", id:op.dataset.open});
    var pe=c("[data-payee]"); if(pe) return openPayee(pe.dataset.payee);
    var ep=c("[data-editpayee]"); if(ep){ var back=Object.assign({},S.drawer,{draft:readForm()}); return openPayee(ep.dataset.editpayee, back); }
    var ac=c("[data-act]"); if(ac) return doAction(ac.dataset.act);
    var ed=c("[data-edit]"); if(ed) return openEditRequest(ed.dataset.edit);
    var tm=c("[data-terms]"); if(tm){ var k=tm.dataset.terms; if(k==="edit"){ S.drawer.editTerms=true; renderDetail(false); } else if(k==="cancel"){ S.drawer.editTerms=false; renderDetail(false); } else saveTerms(); return; }
    if(c("[data-close]")) return closeDrawer();
    if(c("[data-tdsauto]")){ S.drawer.tdsAuto=true; applyAuto(); return; }
    if(c("[data-tdsman]")){ S.drawer.tdsAuto=false; applyAuto(); $("#f-tdsrate").focus(); return; }
    var rm=c("[data-rmatt]"); if(rm){ S.drawer.attachments.splice(Number(rm.dataset.rmatt),1); renderAttachList(); return; }
    if(t.id==="f-submit") return submitRequest();
    if(t.id==="p-save") return savePayee();
    if(t.id==="p-cancel"){ var b2=S.drawer.returnTo; return b2 ? openDrawer(b2) : closeDrawer(); }
    if(t.id==="set-save") return saveSettings();
    if(t.id==="set-reset"){ S.sDirty=false; S.sDraft=null; renderSettings(); return; }
    if(t.id==="nat-add"){ readSettingsInputs(); S.sDraft.natures.push({id:"n-"+rid(),name:"",section:"",rateInd:0,rateOther:0,single:0,annual:0,influencer:false,inactive:false}); markDirty(); renderSettings(); markDirty(); var ni=$("#nat-name-"+(S.sDraft.natures.length-1)); if(ni) ni.focus(); return; }
    var ar=c("[data-addrole]"); if(ar){ readSettingsInputs(); var r=ar.dataset.addrole, inp=$("#role-in-"+r), em=(inp.value||"").trim().toLowerCase();
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){ toast("Enter a full email address.","bad"); return; }
      if(S.sDraft.roles[r].indexOf(em)<0) S.sDraft.roles[r].push(em); markDirty(); renderSettings(); markDirty(); return; }
    var ur=c("[data-unrole]"); if(ur){ readSettingsInputs(); var rr=ur.dataset.unrole; S.sDraft.roles[rr]=S.sDraft.roles[rr].filter(function(x){ return x!==ur.dataset.id; }); markDirty(); renderSettings(); markDirty(); return; }
  });
  document.addEventListener("change", function(e){
    var t=e.target;
    if(t.id==="f-files") return onFiles(t);
    if(t.dataset && t.dataset.nat!=null){ readSettingsInputs(); markDirty(); return; }
    if(t.id==="t-terms"){ $("#t-custom-wrap").hidden = t.value!=="custom"; var tt=TERMS.filter(function(x){return x.v===t.value;})[0], r=findReq(S.drawer.id); if(tt && tt.days!=null && r){ var base=(t.value==="advance"||t.value==="receipt")?todayISO():r.invoiceDate; if(base) $("#t-due").value=addDays(base,tt.days); } return; }
    if(!S.drawer || S.drawer.mode!=="form") return;
    if(t.id==="f-payee"){
      if(t.value==="__new"){ var back=Object.assign({},S.drawer,{draft:readForm()}); back.draft.payeeId=""; return openPayee(null, back); }
      var p=S.payees.get(t.value), d=readForm(); if(p) applyPayeeDefaults(d,p,false); S.drawer.draft=d; renderForm(); return;
    }
    if(t.id==="f-nature"){ if(t.value!=="other") S.drawer.tdsAuto=true; S.drawer.infManual=false; applyAuto(); return; }
    if(t.id==="f-tdson"){ S.drawer.tdsAuto=false; applyAuto(); return; }
    if(t.id==="f-gstrate"){ $("#f-gstamt").readOnly = t.value!=="custom"; applyAuto(); return; }
    if(["f-doctype","f-kind","f-invdate"].indexOf(t.id)>=0){ applyAuto(); return; }
    if(t.id==="f-terms"){ applyDue(); return; }
    if(t.id==="f-inf"){ S.drawer.infManual=true; applyAuto(); return; }
  });
  document.addEventListener("input", function(e){
    var t=e.target;
    if(S.drawer && S.drawer.mode==="form" && t.closest("#drawer")){
      if(t.id==="f-taxable") applyAuto();
      else if(t.id==="f-tdsrate"||t.id==="f-tdssec"){ S.drawer.tdsAuto=false; updateCalc(); }
      else if(t.id==="f-due"){ S.drawer.dueAuto=false; $("#f-due-hint").textContent="Set by hand."; }
      else if(t.id==="f-gstamt"||t.id==="f-paygross") updateCalc();
      else if(t.id==="f-reel"){ var ok=!t.value||REEL_RE.test(t.value.trim()), er=$("#f-reel-err"); er.hidden=ok; er.textContent=ok?"":"Use the link from Instagram's Share → Copy link, e.g. https://www.instagram.com/reel/ABC123xyz/"; }
      else if(t.id==="f-ig"){ var ok2=!t.value||HANDLE_RE.test(t.value.trim()), er2=$("#f-ig-err"); er2.hidden=ok2; er2.textContent=ok2?"":"Handles use letters, numbers, dots and underscores."; }
    }
    if(["set-tier","set-cc","set-gstins","set-names"].indexOf(t.id)>=0 || (t.dataset && t.dataset.nat!=null)){ readSettingsInputs(); markDirty(); }
  });
}
bind(); render(); refresh();
setInterval(function(){ if(document.visibilityState==="visible" && !(S.drawer && S.drawer.mode!=="detail")) refresh(); }, 30000);
