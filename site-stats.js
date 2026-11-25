/* ALIDEDEOGLU ARSIVI - ortak sayaç arızası ve yerel geçmiş düzeltmesi (v6).
   Shared counters retain integer IDs, never names or identifying visitor data.
   Names resolved through generated public archive index.
   Public counters have no authentication and are best-effort, not an audit log.
*/
(function(){
"use strict";
const $=id=>document.getElementById(id);
const villages=$("recentVillages"),families=$("recentFamilies"),daily=$("dailyVisitStat"),status=$("recentSearchStatus");
const COUNT="https://countapi.mileshilliard.com/api/v1/";
const PREFIX="alidedeogluarsivi_last_search_v5_";
const OWN_KEY="alidedeoglu_recent_own_searches_v5";
const API_BASE=typeof window.ARCHIVE_STATS_API==="string"?window.ARCHIVE_STATS_API.trim().replace(/\/$/,""):"";
const api=API_BASE?API_BASE+"/api/site-stats":null;
const TYPES={village:{el:villages,n:10},family:{el:families,n:10}};
let publicIndex=null,indexRetryAfter=0,localIndex={village:{},family:{}};
let recentSharedSequence={village:0,family:0};
let lastRefresh=0,refreshBusy=false,sharedHealthy=null;
function statusText(msg){if(status)status.textContent=msg;}
function normalize(x){return String(x||"").trim().replace(/\s+/g," ").slice(0,90).toLocaleUpperCase("tr-TR").normalize("NFC");}
// Exclude editorial placeholders from public recent searches; preserve source records.
function validSearchName(type,value){
 const s=normalize(value);
 if(s.length<2||s.length>90)return false;
 if(/^(?:[-?.…\s]+|YERLEŞİM|KÖY|KARYE|SÜLALE|BİLİNMİYOR|BELİRTİLMEMİŞ|KAYIT YOK|VERİ YOK)$/.test(s))return false;
 if(/(?:ADI\s+(?:YOK|YAZILMAMIŞ|BELİRTİLMEMİŞ)|İSMİ\s+(?:YOK|BİLİNMİYOR)|TESPİT EDİLEMEDİ|OKUNAMADI|BİLİNMİYOR|BELİRTİLMEMİŞ|KAYIT BULUNAMADI)/.test(s))return false;
 if(type==='village'&&/^(?:TÜM KÖYLER|TÜM YERLEŞİMLER|İL SEÇİN|İLÇE SEÇİN|KÖY SEÇİN)$/.test(s))return false;
 return true;
}
function nameId(name){
 let hash=14695981039346656037n;
 for(const byte of new TextEncoder().encode(normalize(name))){
  hash=BigInt.asUintN(64,(hash^BigInt(byte))*1099511628211n);
 }
 return String(hash & ((1n<<48n)-1n));
}
function saveLocal(type,name){
 const normalized=normalize(name);if(!normalized||normalized.length<2)return;
 const id=nameId(name);
 localIndex[type][id]=name.trim();
 try{const store=JSON.parse(localStorage.getItem(OWN_KEY)||"{}");
  const rows=Array.isArray(store[type])?store[type]:[];
  store[type]=[name.trim(),...rows.filter(x=>normalize(x)!==normalized)].slice(0,TYPES[type].n);
  localStorage.setItem(OWN_KEY,JSON.stringify(store));
 }catch(_){}
}
function local(type){try{return (JSON.parse(localStorage.getItem(OWN_KEY)||"{}")[type]||[]).slice(0,10)}catch(_){return []}}
function draw(type,names,isLocal){
 const el=TYPES[type].el;if(!el)return;
 el.replaceChildren();
 const unique=[];const seen=new Set();
 for(const item of names){
  const name=String(item||"").trim();
  if(!validSearchName(type,name)||seen.has(normalize(name)))continue;
  unique.push(name);seen.add(normalize(name));
  if(unique.length>=TYPES[type].n)break;
 }
 if(!unique.length){el.textContent=isLocal?"BU CİHAZDA HENÜZ ARAMA YOK":"HENÜZ KAYIT YOK";return;}
 unique.forEach((name,i)=>{const s=document.createElement("span");s.className="archiveRecentItem";s.textContent=String(i+1)+". "+name;el.append(s)});
 if(isLocal){const small=document.createElement("small");small.textContent=" (BU TARAYICIDA)";el.append(small);}
}
async function request(action,key,value){
 const url=COUNT+action+"/"+key+(value===undefined?"":"?value="+encodeURIComponent(String(value)));
 const res=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(4500)});
 if(!res.ok)throw Error("SAYAÇ HTTP "+res.status);
 const json=await res.json();
 const n=Number(json.value);
 if(!Number.isSafeInteger(n)||n<0)throw Error("SAYAÇ VERİSİ GEÇERSİZ");
 return n;
}
async function ensureIndex(){
 if(publicIndex)return publicIndex;
 if(Date.now()<indexRetryAfter)return null;
 indexRetryAfter=Date.now()+60000;
 try{
  const r=await fetch("./recent-search-index.json?v=20261124-recent5",{cache:"no-cache",signal:AbortSignal.timeout(9000)});
  if(!r.ok)throw Error("index missing");
  const parsed=await r.json();
  if(parsed&&parsed.village&&parsed.family){publicIndex=parsed;indexRetryAfter=0;return parsed}
 }catch(e){console.warn("Arama isim indeksi henüz hazır değil:",e.message)}
 return null;
}
async function readShared(type){
 const limit=TYPES[type].n,base=PREFIX+type+"_";
 const position=await request("get",base+"position");
 recentSharedSequence[type]=position;
 if(position<1)return [];
 const slots=[...new Set(Array.from({length:Math.min(limit,position)},(_,i)=>(position-1-i)%limit))];
 const vals=await Promise.all(slots.map(async slot=>{try{return await request("get",base+"slot_"+slot)}catch(_){return 0}}));
 const lookup=await ensureIndex();
 if(!lookup)throw Error("İSİM DİZİNİ YÜKLENEMEDİ");
 const names=[];
 for(const raw of vals){
  const id=String(raw);
  const name=(lookup&&lookup[type]&&lookup[type][id])||localIndex[type][id];
  if(name&&validSearchName(type,name))names.push(name);
 }
 return names;
}
async function refresh(){
 if(refreshBusy)return;
 if(!villages&&!families)return;
 if(document.hidden)return;
 refreshBusy=true;
 try{
  if(api){
   try{
    const r=await fetch(api,{cache:"no-store",signal:AbortSignal.timeout(4500)});
    if(r.ok){const data=await r.json();draw("village",data.villages||[],false);draw("family",data.families||[],false);sharedHealthy=true;statusText("ORTAK ARAMA SİSTEMİ BAĞLI");return}
   }catch(_){}
  }
  let sharedRead=0,sharedErrors=0;
  await Promise.all(Object.keys(TYPES).map(async type=>{
   if(!TYPES[type].el)return;
   try{
    const rows=await readShared(type);
    sharedRead++;
    if(rows.length){draw(type,rows,false);return;}
    draw(type,[],false);
    TYPES[type].el.textContent=recentSharedSequence[type]>0
      ?"YENİ ORTAK ARAMALARIN İSİMLERİ HENÜZ ÇÖZÜMLENEMEDİ":"ORTAK ARAMA KAYDI HENÜZ YOK";
   }catch(e){
    sharedErrors++;
    draw(type,local(type),true);
    if(!local(type).length)TYPES[type].el.textContent="ORTAK SERVİSE ERİŞİLEMİYOR · BU TARAYICIDA ARAMA YOK";
    console.warn("Son aramalar:",type,e.message);
   }
  }));
  sharedHealthy=sharedRead>0;
  if(sharedHealthy)statusText("GÜNCEL ORTAK ARAMALAR · ESKİ LİSTELER GÖSTERİLMİYOR");
  else if(sharedErrors)statusText("ORTAK SUNUCUYA ERİŞİLEMİYOR · VARSA YALNIZ BU TARAYICININ ARAMALARI GÖSTERİLİYOR");
 }finally{refreshBusy=false;lastRefresh=Date.now()}
}
async function record(type,name){
 if(!TYPES[type])return;
 name=String(name||"").trim().replace(/\s+/g," ").slice(0,90);
 if(!validSearchName(type,name))return;
 saveLocal(type,name);
 if(TYPES[type].el&&sharedHealthy!==true)draw(type,local(type),true);
 statusText("ARAMA KAYDI ORTAK SAYAÇA GÖNDERİLİYOR…");
 if(api){
  try{
   const r=await fetch(api,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type,name}),signal:AbortSignal.timeout(5000)});
   if(r.ok){void refresh();return}
  }catch(_){}
 }
 // The sequence counter allocates a shared circular position. Concurrent writes
 // may overwrite the same slot; this is a best-effort latest-queries widget.
 try{
  const id=nameId(name);
  const base=PREFIX+type+"_";
  const seq=await request("hit",base+"position");
  const slot=(seq-1)%TYPES[type].n;
  await request("set",base+"slot_"+slot,id);
  const saved=await request("get",base+"slot_"+slot);
  if(saved!==Number(id))throw Error("Ortak sayaç kayıt doğrulaması başarısız");
  sharedHealthy=true;
  statusText("ARAMA ORTAK SAYAÇA KAYDEDİLDİ");
  void refresh();
 }catch(e){sharedHealthy=false;draw(type,local(type),true);statusText("ORTAK KAYIT YAPILAMADI · ARAMA BU TARAYICIDA SAKLANDI");console.warn("Ortak arama sayacına erişilemedi:",e.message)}
}
window.ArchiveStats={
 recordVillage:name=>record("village",name),
 recordFamily:name=>record("family",name),
 refresh
};
async function today(){
 if(!daily)return;
 const dayKey=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).replace(/\D/g,"");
 const verifiedKey="alidedeogluarsivi_verified_today_"+dayKey;
 try{const last=localStorage.getItem(verifiedKey);if(last!==null&&Number.isSafeInteger(Number(last))&&Number(last)>=0){daily.textContent=Number(last).toLocaleString("tr-TR");daily.title="SON DOĞRULANAN GÜNLÜK SAYI";}}catch(_){}
 const displayToday=n=>{daily.textContent=n.toLocaleString("tr-TR");daily.title="CANLI GÜNLÜK ZİYARET";try{localStorage.setItem(verifiedKey,String(n));}catch(_){}};
 if(api){
  try{
   const flag="archive_daily_api_visit_v1";
   if(sessionStorage.getItem(flag)!=="1"){
    const hit=await fetch(api,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"visit"}),signal:AbortSignal.timeout(6000)});
    if(!hit.ok)throw Error("API visit "+hit.status);
    sessionStorage.setItem(flag,"1");
    sessionStorage.setItem("alidedeoglu_visit_api_v1","1");
   }
   const res=await fetch(api,{cache:"no-store",signal:AbortSignal.timeout(6000)});
   if(!res.ok)throw Error("API today "+res.status);
   const data=await res.json();
   const n=Number(data.today);
   if(!Number.isSafeInteger(n)||n<0)throw Error("Invalid daily counter");
   displayToday(n);
   return;
  }catch(e){console.warn("Günlük sayaç API:",e)}
 }

 const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const key="alidedeogluarsivi_today_"+date.replace(/\D/g,"");
 const flag="archive_daily_counted_"+date;
 try{
  let value;
  if(sessionStorage.getItem(flag)==="1")value=await request("get",key);
  else {value=await request("hit",key);sessionStorage.setItem(flag,"1")}
  displayToday(value);
 }catch(e){if(daily.textContent.trim()==="—"||daily.textContent.trim()==="")daily.textContent="BAĞLANTI YOK";daily.title="Günlük ziyaret sayacı hizmetine erişilemiyor; son doğrulanan sayı varsa gösteriliyor";console.warn("Günlük ziyaret sayacı:",e.message)}
}
void today();void refresh();
if(villages||families){
 window.addEventListener("focus",()=>{if(Date.now()-lastRefresh>6000)void refresh()});
 window.addEventListener("pageshow",()=>{if(Date.now()-lastRefresh>6000)void refresh()});
 document.addEventListener("visibilitychange",()=>{if(!document.hidden&&Date.now()-lastRefresh>6000)void refresh()});
 setInterval(()=>{if(!document.hidden&&Date.now()-lastRefresh>=30000)void refresh()},30000);
}
})();
