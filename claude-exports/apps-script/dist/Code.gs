/* Kenzen Payment Desk – server (Google Apps Script). Data lives in the Google Sheet below. */
var SHEET_ID = "1_8ix-jc6U2-TUrFvagGKmp9MIQQxQr0NiZzaq2_KGX8";
var ROOT_FOLDER_ID = "1e9lIWVV2Q5C0Rx3MNIAvxN8E9BnQlWCU";
var TZ = "Asia/Kolkata";
var MAX_UPLOAD_MB = 10;

var S = {me:{id:null}, isAdmin:false, settings:mergeSettings(null,null), payees:new Map(), requests:[]};

var REQ_HEAD = ["Request ID","Raised on","Raised by","Status","Can be paid?","Reasons","Payment type","Advance / balance link","Document","Document no.","Document date","Payee","Payee GSTIN","Payee PAN","Nature of payment","Cost centre","Taxable value","GST","Invoice total","TDS section","TDS rate %","TDS on full invoice","This payment (incl. GST)","TDS on this payment","Net payable","Terms of payment","Pay by","Priority","Instagram handle","Reel link","Level 1 by","Level 2 by","Paid on","UTR","Paid by","Data (do not edit)"];
var PAYEE_HEAD = ["ID","Payee","GSTIN","PAN","Email","Instagram","Beneficiary","Account no.","IFSC","Bank & branch","Default nature ID","Default cost centre","Default terms","Added on","Added by","Updated on","Updated by","Bank changed on","Bank changed by"];
var PAYEE_KEYS = ["id","name","gstin","pan","email","igHandle","beneficiary","account","ifsc","bank","defaultNatureId","defaultCc","defaultTerms","createdAt","createdBy","updatedAt","updatedBy","bankChangedAt","bankChangedBy"];
var NAT_HEAD = ["ID","Nature of payment","TDS section","Rate % individual/HUF","Rate % company/firm","Per-invoice limit","Annual limit","Influencer","In use"];
var LOG_HEAD = ["When","Request ID","Payee","Action","By","Note"];

/* ---------- web app ---------- */
function doGet(){
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Kenzen Payment Desk")
    .addMetaTag("viewport","width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/* ---------- one-time setup: run this once from the Apps Script editor ---------- */
function setup(){
  var ss=SpreadsheetApp.openById(SHEET_ID);
  ensureSheet_(ss,"Requests",REQ_HEAD);
  ensureSheet_(ss,"Payees",PAYEE_HEAD);
  var nat=ensureSheet_(ss,"Nature master",NAT_HEAD);
  if(nat.getLastRow()<2) writeNatures_(DEFAULT_NATURES);
  ensureSheet_(ss,"Audit log",LOG_HEAD);
  var st=ensureSheet_(ss,"Settings",["Key","Value"]);
  if(!st.getRange(2,2).getValue()){
    var owner=Session.getEffectiveUser().getEmail().toLowerCase();
    st.getRange(2,1,1,2).setValues([["settings",JSON.stringify({tierLimit:50000,companyGstins:[],costCentres:DEFAULT_COST_CENTRES,names:{},roles:{admin:[owner],approver1:[],approver2:[],finance:[]}})]]);
  }
  var def=ss.getSheetByName("Sheet1"); if(def && ss.getSheets().length>1 && def.getLastRow()===0) ss.deleteSheet(def);
  ss.getSheetByName("Requests").hideColumns(REQ_HEAD.length);
  folder_("Attachments"); folder_("Excel logs");
  ScriptApp.getProjectTriggers().forEach(function(t){ if(t.getHandlerFunction()==="dailyExport") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("dailyExport").timeBased().everyDays(1).atHour(23).inTimezone(TZ).create();
  return "Setup done";
}
function ensureSheet_(ss,name,head){
  var sh=ss.getSheetByName(name) || ss.insertSheet(name);
  if(sh.getLastRow()===0){ sh.getRange(1,1,1,head.length).setValues([head]).setFontWeight("bold"); sh.setFrozenRows(1); }
  return sh;
}
function folder_(name){
  var root=DriveApp.getFolderById(ROOT_FOLDER_ID); var it=root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

/* ---------- loading ---------- */
function sheet_(name){ return SpreadsheetApp.openById(SHEET_ID).getSheetByName(name); }
function loadAll_(){
  var raw=sheet_("Settings").getRange(2,2).getValue();
  var settings={}; try{ settings=JSON.parse(raw||"{}"); }catch(e){}
  S.settings=mergeSettings(settings, readNatures_());
  S.payees=new Map(readPayees_().map(function(p){ return [p.id,p]; }));
  S.requests=readRequests_();
  S.me={id:(Session.getActiveUser().getEmail()||"").toLowerCase()};
  var owner=Session.getEffectiveUser().getEmail().toLowerCase();
  S.isAdmin = !!S.me.id && (S.me.id===owner || roleIds("admin").indexOf(S.me.id)>=0);
}
function readNatures_(){
  var sh=sheet_("Nature master"); var n=sh.getLastRow(); if(n<2) return [];
  return sh.getRange(2,1,n-1,NAT_HEAD.length).getValues().filter(function(r){ return r[1]; }).map(function(r){ return {
    id:String(r[0]||("n-"+Utilities.getUuid().slice(0,6))), name:String(r[1]), section:String(r[2]||""), rateInd:Number(r[3])||0, rateOther:Number(r[4])||0,
    single:Number(r[5])||0, annual:Number(r[6])||0, influencer:/^y/i.test(String(r[7])), inactive:/^n/i.test(String(r[8])) }; });
}
function writeNatures_(list){
  var sh=sheet_("Nature master"); var n=sh.getLastRow(); if(n>1) sh.getRange(2,1,n-1,NAT_HEAD.length).clearContent();
  if(!list.length) return;
  sh.getRange(2,1,list.length,NAT_HEAD.length).setValues(list.map(function(x){ return [x.id,x.name,x.section||"",Number(x.rateInd)||0,Number(x.rateOther)||0,Number(x.single)||0,Number(x.annual)||0,x.influencer?"Yes":"No",x.inactive?"No":"Yes"]; }));
}
function readPayees_(){
  var sh=sheet_("Payees"); var n=sh.getLastRow(); if(n<2) return [];
  return sh.getRange(2,1,n-1,PAYEE_HEAD.length).getDisplayValues().filter(function(r){ return r[0]; }).map(function(r){ var o={}; PAYEE_KEYS.forEach(function(k,i){ o[k]=String(r[i]||""); }); return o; });
}
function readRequests_(){
  var sh=sheet_("Requests"); var n=sh.getLastRow(); if(n<2) return [];
  return sh.getRange(2,REQ_HEAD.length,n-1,1).getValues().map(function(r){ try{ return JSON.parse(r[0]); }catch(e){ return null; } }).filter(Boolean);
}
function state_(){
  return {me:{id:S.me.id, isAdmin:S.isAdmin, owner:Session.getEffectiveUser().getEmail().toLowerCase()},
    settings:{tierLimit:S.settings.tierLimit, companyGstins:S.settings.companyGstins, costCentres:S.settings.costCentres, names:S.settings.names, roles:S.settings.roles},
    natures:S.settings.natures, payees:Array.from(S.payees.values()), requests:S.requests,
    sheetUrl:(S.isAdmin? SpreadsheetApp.openById(SHEET_ID).getUrl() : "")};
}

/* ---------- writing ---------- */
function withLock_(fn){
  var lock=LockService.getScriptLock(); lock.waitLock(20000);
  try{ loadAll_(); if(!S.me.id) throw new Error("Sign in with your Kenzen Google account to use the desk."); var out=fn(); SpreadsheetApp.flush(); return out; }
  finally{ lock.releaseLock(); }
}
function reqRow_(r){
  var v=verdict(r); var p=r.payee||{};
  return [r.id, fmtSheetTime_(r.createdAt), r.requestedBy, statusLabel(r.status), v.label, v.reasons.join("; "), kindLabel(r), r.parentId||r.balanceId||"",
    r.docType==="pi"?"Proforma invoice":"Tax invoice", r.invoiceNo, r.invoiceDate, p.name||"", p.gstin||"", p.pan||"", r.nature||"", r.costCentre||"",
    Number(r.taxable)||0, Number(r.gstAmount)||0, Number(r.invoiceTotal)||0, r.tdsSectionCode||"", Number(r.tdsRate)||0, Number(r.tdsAmount)||0,
    Number(r.payGross)||0, Number(r.payTds)||0, Number(r.netPayable)||0, termsLabel(r), r.dueDate||"", r.priority==="urgent"?"Urgent":"Normal",
    r.igHandle||"", r.reelLink||"", r.l1By||"", r.l2By||"", r.paidOn||"", r.utr||"", r.paidBy||"", JSON.stringify(r)];
}
function fmtSheetTime_(iso){ return iso ? Utilities.formatDate(new Date(iso),TZ,"yyyy-MM-dd HH:mm") : ""; }
function saveReq_(r, newEntries){
  var sh=sheet_("Requests"); var n=sh.getLastRow();
  var ids = n>1 ? sh.getRange(2,1,n-1,1).getValues().map(function(x){ return x[0]; }) : [];
  var idx=ids.indexOf(r.id);
  var i=S.requests.map(function(x){return x.id;}).indexOf(r.id); if(i>=0) S.requests[i]=r; else S.requests.push(r);
  var row=reqRow_(r);
  if(idx>=0) sh.getRange(idx+2,1,1,row.length).setValues([row]); else sh.appendRow(row);
  (newEntries||[]).forEach(function(h){ sheet_("Audit log").appendRow([fmtSheetTime_(h.at), r.id, (r.payee||{}).name||"", ACT_LABEL[h.action]||h.action, h.by, h.note||""]); });
}
function refreshVerdicts_(){
  var sh=sheet_("Requests"); var n=sh.getLastRow(); if(n<2) return;
  var vals=sh.getRange(2,5,n-1,2).getValues(); var ids=sh.getRange(2,1,n-1,1).getValues();
  var map={}; S.requests.forEach(function(r){ map[r.id]=r; });
  var out=ids.map(function(x,i){ var r=map[x[0]]; if(!r) return vals[i]; var v=verdict(r); return [v.label, v.reasons.join("; ")]; });
  sh.getRange(2,5,n-1,2).setValues(out);
}

/* ---------- API for the page ---------- */
function api_state(){ loadAll_(); return state_(); }

function api_saveRequest(base, editId){
  return withLock_(function(){
    var me=S.me.id, now=new Date().toISOString();
    var p=S.payees.get(base.payeeId); if(!p) throw new Error("Choose a payee that's saved in the desk.");
    var isBal = base.kind==="balance";
    var parent = isBal ? S.requests.filter(function(x){ return x.id===base.parentId; })[0] : null;
    if(isBal && (!parent || parent.status!=="paid" || parent.kind!=="advance")) throw new Error("The advance must be paid before its balance is raised.");
    if(isBal && parent.balanceId && parent.balanceId!==editId) throw new Error("A balance is already raised for "+parent.id+".");
    var fam = isBal ? parent.id : (editId ? (function(){ var e=S.requests.filter(function(x){return x.id===editId;})[0]; return e ? familyId(e) : null; })() : null);
    var dup=S.requests.filter(function(x){ return x.id!==editId && (!fam || familyId(x)!==fam) && x.payeeId===base.payeeId && normInv(x.invoiceNo)===normInv(base.invoiceNo) && x.status!=="withdrawn" && x.status!=="rejected"; })[0];
    if(dup) throw new Error("This invoice from "+p.name+" is already on "+dup.id+" ("+statusLabel(dup.status)+"). Duplicate payments are blocked.");
    var r = {};
    Object.keys(base).forEach(function(k){ r[k]=base[k]; });
    r.payee={name:p.name, email:p.email||"", gstin:p.gstin||"", pan:p.pan||"", beneficiary:p.beneficiary||"", account:p.account||"", ifsc:p.ifsc||"", bank:p.bank||""};
    r.levels = Number(r.invoiceTotal) > S.settings.tierLimit ? 2 : 1; r.tierLimit=S.settings.tierLimit;
    r.status="pending_l1"; r.l1By=null; r.l1At=null; r.l2By=null; r.l2At=null; r.reelCheckedBy=null; r.reelCheckedAt=null; r.overrides={};
    r.updatedAt=now;
    var entries=[];
    if(editId){
      var old=S.requests.filter(function(x){ return x.id===editId; })[0];
      if(!old || old.requestedBy!==me || old.status!=="rejected") throw new Error("Only a request that was sent back to you can be resubmitted.");
      r.id=old.id; r.requestedBy=old.requestedBy; r.createdAt=old.createdAt; r.balanceId=old.balanceId||null; r.parentId=old.parentId||null;
      var h={at:now,by:me,action:"resubmitted",note:""}; r.history=(old.history||[]).concat([h]); entries.push(h);
    } else {
      r.id="PR-"+Utilities.formatDate(new Date(),TZ,"yyMMdd")+"-"+Utilities.getUuid().replace(/-/g,"").slice(0,4).toUpperCase();
      r.requestedBy=me; r.createdAt=now; r.balanceId=null; r.parentId=isBal?parent.id:null;
      var h2={at:now,by:me,action:"submitted",note:isBal?("Balance against advance "+parent.id):""}; r.history=[h2]; entries.push(h2);
    }
    saveReq_(r, entries);
    if(isBal && !editId){
      var hb={at:now,by:me,action:"balance_raised",note:r.id+" · "+money(r.netPayable)+" net"};
      parent.balanceId=r.id; parent.updatedAt=now; parent.history=(parent.history||[]).concat([hb]); saveReq_(parent,[hb]);
    }
    refreshVerdicts_();
    return {state:state_(), id:r.id};
  });
}

function api_act(id, kind, opts){
  opts=opts||{};
  return withLock_(function(){
    var r=S.requests.filter(function(x){ return x.id===id; })[0]; if(!r) throw new Error("This request no longer exists.");
    var me=S.me.id, now=new Date().toISOString(), a=myAction(r), note=String(opts.note||"").trim(), entries=[];
    function log(action,n){ var h={at:now,by:me,action:action,note:n||""}; r.history=(r.history||[]).concat([h]); entries.push(h); }
    if(kind==="approve"){
      if(a!=="approve") throw new Error("You can't approve this request at its current stage.");
      var cs=checks(r);
      var hard=cs.filter(function(c){ return c.sev==="block" && !c.ovr && !c.ok && c.id!=="reelok"; });
      if(hard.length) throw new Error("Can't approve: "+hard[0].reason+". Send it back instead.");
      if(r.isInfluencer && !r.reelCheckedBy){ if(!opts.reel) throw new Error("Open the reel and tick the confirmation before approving."); r.reelCheckedBy=me; r.reelCheckedAt=now; log("reel_checked", r.reelLink); }
      var soft=cs.filter(function(c){ return c.sev==="block" && c.ovr && !passes(c,r); });
      if(soft.length){
        if(!opts.accept || !note) throw new Error("Tick “Accept these exceptions” and explain why in the comment, or send it back.");
        r.overrides=r.overrides||{}; soft.forEach(function(c){ r.overrides[c.id]={by:me,at:now,note:note,reason:c.reason}; });
      }
      var n2 = soft.length ? ("Accepted exceptions: "+soft.map(function(c){return c.reason;}).join("; ")+". "+note) : note;
      if(r.status==="pending_l1"){ r.l1By=me; r.l1At=now; r.status=r.levels===2?"pending_l2":"approved"; log("approved_l1",n2); }
      else { r.l2By=me; r.l2At=now; r.status="approved"; log("approved_l2",n2); }
    } else if(kind==="reject"){
      if(a!=="approve") throw new Error("You can't send this request back at its current stage.");
      if(!note) throw new Error("Add a comment so the requester knows what to fix.");
      r.status="rejected"; r.rejectedBy=me; r.rejectedAt=now; log("rejected",note);
    } else if(kind==="withdraw"){
      if(r.requestedBy!==me || ["pending_l1","pending_l2","rejected"].indexOf(r.status)<0) throw new Error("Only the requester can withdraw a request before it's approved.");
      r.status="withdrawn"; log("withdrawn",note);
      if(r.kind==="balance" && r.parentId){ var par=S.requests.filter(function(x){return x.id===r.parentId;})[0]; if(par && par.balanceId===r.id){ var hp={at:now,by:me,action:"withdrawn",note:"Balance "+r.id+" withdrawn"}; par.balanceId=null; par.history=(par.history||[]).concat([hp]); saveReq_(par,[hp]); } }
    } else if(kind==="paid"){
      if(a!=="pay") throw new Error("Only Finance can mark an approved request paid.");
      var v=verdict(r); if(v.k!=="yes") throw new Error("Can't mark paid: "+v.reasons.join("; "));
      var utr=String(opts.utr||"").trim().toUpperCase(); if(utr.length<6) throw new Error("Enter the UTR or bank reference from the bank statement.");
      r.status="paid"; r.paidBy=me; r.paidOn=opts.paidOn||todayISO(); r.utr=utr; log("paid","UTR "+utr+" · "+fmtDate(r.paidOn)+" · "+money(r.netPayable));
    } else throw new Error("Unknown action.");
    r.updatedAt=now; saveReq_(r, entries); refreshVerdicts_();
    return state_();
  });
}

function api_terms(id, code, text, due, note){
  return withLock_(function(){
    var r=S.requests.filter(function(x){ return x.id===id; })[0]; if(!r) throw new Error("This request no longer exists.");
    if(!canEditTerms(r)) throw new Error("Only approvers can change the terms, and only before payment.");
    if(!TERMS.some(function(t){return t.v===code;})) throw new Error("Choose valid terms.");
    if(code==="custom" && !String(text||"").trim()) throw new Error("Describe the terms.");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(due||"")) throw new Error("Enter the pay-by date.");
    if(!String(note||"").trim()) throw new Error("Add a reason for the change.");
    var now=new Date().toISOString();
    var before=termsLabel(r)+", due "+fmtDate(r.dueDate);
    r.termsCode=code; r.termsText=code==="custom"?String(text).trim():""; r.dueDate=due; r.updatedAt=now;
    var h={at:now,by:S.me.id,action:"terms_changed",note:before+" → "+termsLabel(r)+", due "+fmtDate(due)+". "+String(note).trim()};
    r.history=(r.history||[]).concat([h]); saveReq_(r,[h]); refreshVerdicts_();
    return state_();
  });
}

function api_savePayee(rec, id){
  return withLock_(function(){
    var me=S.me.id, now=new Date().toISOString();
    rec=rec||{};
    if(!String(rec.name||"").trim()) throw new Error("Enter the payee name.");
    if(rec.gstin && !GSTIN_RE.test(rec.gstin)) throw new Error("That GSTIN doesn't look right.");
    if(rec.pan && !PAN_RE.test(rec.pan)) throw new Error("PAN should be 5 letters, 4 digits, 1 letter.");
    if(rec.account && (!/^[0-9]{6,18}$/.test(rec.account) || !IFSC_RE.test(rec.ifsc||""))) throw new Error("Check the account number and IFSC.");
    var sh=sheet_("Payees"); var n=sh.getLastRow();
    var ids = n>1 ? sh.getRange(2,1,n-1,1).getValues().map(function(x){return x[0];}) : [];
    var o;
    if(id){
      var old=S.payees.get(id); if(!old) throw new Error("That payee no longer exists.");
      o={}; Object.keys(old).forEach(function(k){ o[k]=old[k]; }); Object.keys(rec).forEach(function(k){ o[k]=rec[k]; });
      o.updatedAt=now; o.updatedBy=me;
      if((old.account||"")!==(rec.account||"") || (old.ifsc||"")!==(rec.ifsc||"") || (old.beneficiary||"")!==(rec.beneficiary||"")){ o.bankChangedAt=now; o.bankChangedBy=me; }
    } else {
      o={}; Object.keys(rec).forEach(function(k){ o[k]=rec[k]; });
      o.id="py-"+Utilities.getUuid().slice(0,8); o.createdAt=now; o.createdBy=me; o.updatedAt=now; o.updatedBy=me;
    }
    var row=PAYEE_KEYS.map(function(k){ return o[k]==null?"":String(o[k]); });
    var idx=ids.indexOf(o.id);
    var rng = idx>=0 ? sh.getRange(idx+2,1,1,row.length) : sh.getRange(sh.getLastRow()+1,1,1,row.length);
    rng.setNumberFormat("@").setValues([row]);
    S.payees.set(o.id,o); refreshVerdicts_();
    return {state:state_(), id:o.id};
  });
}

function api_saveSettings(settings, natures){
  return withLock_(function(){
    if(!S.isAdmin) throw new Error("Only admins can change settings.");
    var s=mergeSettings(settings, natures);
    if(!(s.tierLimit>0)) throw new Error("Enter a threshold above ₹0.");
    s.companyGstins.forEach(function(g){ if(!GSTIN_RE.test(g)) throw new Error(g+" isn't a valid GSTIN."); });
    var owner=Session.getEffectiveUser().getEmail().toLowerCase();
    if(s.roles.admin.indexOf(owner)<0) s.roles.admin.unshift(owner);
    sheet_("Settings").getRange(2,1,1,2).setValues([["settings",JSON.stringify({tierLimit:s.tierLimit,companyGstins:s.companyGstins,costCentres:s.costCentres,names:s.names,roles:s.roles,updatedAt:new Date().toISOString(),updatedBy:S.me.id})]]);
    writeNatures_(s.natures.map(function(n){ if(!n.id) n.id="n-"+Utilities.getUuid().slice(0,6); return n; }));
    loadAll_(); refreshVerdicts_();
    return state_();
  });
}

function api_upload(name, mime, b64){
  loadAll_(); if(!S.me.id) throw new Error("Sign in with your Kenzen Google account.");
  var ok=["application/pdf","image/png","image/jpeg","image/webp"]; if(ok.indexOf(mime)<0) throw new Error("Attach a PDF, PNG, JPG or WebP.");
  var bytes=Utilities.base64Decode(b64); if(bytes.length>MAX_UPLOAD_MB*1024*1024) throw new Error("Files must be under "+MAX_UPLOAD_MB+" MB.");
  var stamp=Utilities.formatDate(new Date(),TZ,"yyyyMMdd-HHmmss");
  var f=folder_("Attachments").createFile(Utilities.newBlob(bytes,mime,stamp+" "+String(name).slice(0,120)));
  try{ f.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); }catch(e){}
  return {id:f.getId(), name:String(name), type:mime, size:bytes.length, url:f.getUrl()};
}

function api_export(){
  loadAll_();
  if(!(S.isAdmin || hasRole("finance") || hasRole("approver1") || hasRole("approver2"))) throw new Error("Only approvers, Finance and admins can export the log.");
  refreshVerdicts_(); SpreadsheetApp.flush();
  var f=exportXlsx_();
  return {url:f.getUrl(), name:f.getName()};
}
function exportXlsx_(){
  var url="https://docs.google.com/spreadsheets/d/"+SHEET_ID+"/export?format=xlsx";
  var blob=UrlFetchApp.fetch(url,{headers:{Authorization:"Bearer "+ScriptApp.getOAuthToken()}}).getBlob()
    .setName("Payment Desk log "+Utilities.formatDate(new Date(),TZ,"yyyy-MM-dd HHmm")+".xlsx");
  var f=folder_("Excel logs").createFile(blob);
  try{ f.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); }catch(e){}
  return f;
}
/* Runs daily at 11 pm IST once setup() has installed the trigger. */
function dailyExport(){
  S.me={id:Session.getEffectiveUser().getEmail().toLowerCase()};
  var raw=sheet_("Settings").getRange(2,2).getValue(); var settings={}; try{ settings=JSON.parse(raw||"{}"); }catch(e){}
  S.settings=mergeSettings(settings, readNatures_()); S.payees=new Map(readPayees_().map(function(p){ return [p.id,p]; })); S.requests=readRequests_();
  refreshVerdicts_(); SpreadsheetApp.flush();
  exportXlsx_();
}
