// simulate Apps Script globals with an in-memory spreadsheet to exercise the server flow
const fs=require('fs');
const sheets={};
function mkSheet(name){ const rows=[]; const sh={name,rows,
  getLastRow(){return rows.length;},
  getRange(r,c,nr=1,nc=1){ return {
    getValues(){ const out=[]; for(let i=0;i<nr;i++){ const row=rows[r-1+i]||[]; const o=[]; for(let j=0;j<nc;j++) o.push(row[c-1+j]===undefined?"":row[c-1+j]); out.push(o);} return out; },
    getDisplayValues(){ return this.getValues().map(r=>r.map(v=>String(v))); },
    getValue(){ return this.getValues()[0][0]; },
    setValues(v){ v.forEach((row,i)=>{ rows[r-1+i]=rows[r-1+i]||[]; row.forEach((x,j)=>{ rows[r-1+i][c-1+j]=x; }); }); return this; },
    setFontWeight(){return this;}, setNumberFormat(){return this;}, clearContent(){ for(let i=0;i<nr;i++) rows[r-1+i]=[]; return this; } }; },
  appendRow(row){ rows.push(row); }, setFrozenRows(){}, hideColumns(){} }; sheets[name]=sh; return sh; }
let currentUser="owner@kenzen.com";
global.SpreadsheetApp={openById(){ return {getSheetByName:n=>sheets[n]||null, insertSheet:n=>mkSheet(n), getSheets:()=>Object.values(sheets), deleteSheet(){}, getUrl:()=>"sheet-url"}; }, flush(){}};
global.Session={getActiveUser:()=>({getEmail:()=>currentUser}), getEffectiveUser:()=>({getEmail:()=>"owner@kenzen.com"})};
global.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
global.Utilities={formatDate:(d,tz,f)=>d.toISOString().slice(2,10).replace(/-/g,""), getUuid:()=>Math.random().toString(16).slice(2)+"abcdefabcdef"};
global.DriveApp={getFolderById:()=>({getFoldersByName:()=>({hasNext:()=>true,next:()=>({})}),createFolder:()=>({})})};
global.ScriptApp={getProjectTriggers:()=>[], newTrigger:()=>({timeBased:()=>({everyDays:()=>({atHour:()=>({inTimezone:()=>({create(){}})})})})}), deleteTrigger(){}};
eval(fs.readFileSync(require('path').join(__dirname,'_server_bundle.js'),'utf8')+'\nglobal.API={setup,api_state,api_saveSettings,api_savePayee,api_saveRequest,api_act,api_terms};');
const A=global.API;
console.log(A.setup());
let st=A.api_state(); console.log('natures',st.natures.length,'admin',st.me.isAdmin);
st=A.api_saveSettings({tierLimit:50000,costCentres:["Ops"],companyGstins:[],names:{},roles:{admin:[],approver1:["l1@kenzen.com"],approver2:["l2@kenzen.com"],finance:["fin@kenzen.com"]}}, st.natures);
let res=A.api_savePayee({name:"Acme Logistics",gstin:"36AABCK1234L1Z5",pan:"AABCK1234L",account:"123456789",ifsc:"HDFC0001234",beneficiary:"ACME LOG",bank:"HDFC"},null);
const pid=res.id;
currentUser="req@kenzen.com";
const base={payeeId:pid,docType:"pi",kind:"advance",invoiceNo:"PI-1",invoiceDate:"2026-10-20",natureId:"n-whs",nature:"Warehousing",costCentre:"Ops",taxable:100000,gstRate:18,gstAmount:18000,invoiceTotal:118000,tdsSectionCode:"194C",tdsApplied:true,tdsRate:2,tdsAmount:2000,invoiceNet:116000,payGross:59000,payTds:1000,netPayable:58000,termsCode:"advance",dueDate:"2026-10-30",priority:"normal",isInfluencer:false,attachments:[{id:"f1",name:"pi.pdf"}]};
res=A.api_saveRequest(base,null); const id=res.id; console.log('created',id,'levels',res.state.requests[0].levels);
currentUser="l1@kenzen.com"; st=A.api_act(id,"approve",{note:"ok"}); console.log('after L1',st.requests.find(r=>r.id===id).status);
currentUser="l2@kenzen.com"; st=A.api_act(id,"approve",{note:"ok"}); console.log('after L2',st.requests.find(r=>r.id===id).status);
currentUser="fin@kenzen.com"; st=A.api_act(id,"paid",{utr:"HDFCR123456",paidOn:"2026-10-30"}); console.log('paid',st.requests.find(r=>r.id===id).status);
currentUser="req@kenzen.com";
const bal={...base,kind:"balance",docType:"tax",parentId:id,invoiceNo:"INV-9",payGross:59000,payTds:1000,netPayable:58000};
res=A.api_saveRequest(bal,null); console.log('balance',res.id,'parent balanceId',res.state.requests.find(r=>r.id===id).balanceId);
try{ A.api_saveRequest({...base,invoiceNo:"PI-1",kind:"full"},null); }catch(e){ console.log('dup blocked:',e.message); }
currentUser="req@kenzen.com"; try{ A.api_act(res.id,"approve",{}); }catch(e){ console.log('self-approve blocked:',e.message); }
console.log('audit rows',sheets["Audit log"].rows.length-1, 'req rows', sheets["Requests"].rows.length-1);
console.log(sheets["Requests"].rows[1].slice(0,7));
