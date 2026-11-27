(function(){
"use strict";
const $=id=>document.getElementById(id);
const villages=$("recentVillages"),families=$("recentFamilies"),daily=$("dailyVisitStat");
const COUNT="https://countapi.mileshilliard.com/api/v1/";
const API_BASE=typeof window.ARCHIVE_STATS_API==="string"?window.ARCHIVE_STATS_API.trim().replace(/\/$/,""):"";
const api=API_BASE?API_BASE+"/api/site-stats":null;
const TYPES={village:{el:villages,n:10},family:{el:families,n:10}};
const RECENT_API="https://alidedeoglu-arsivi-arama-kayitlari.ahmet-sel-al-2548.chatgpt.site/api/recent-searches";
let lastRefresh=0,refreshPromise=null;
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
function draw(type,names){
 const el=TYPES[type].el;if(!el)return;
 const unique=[];const seen=new Set();
 for(const item of names){
  const name=String(item||"").trim();
  if(!validSearchName(type,name)||seen.has(normalize(name)))continue;
  unique.push(name);seen.add(normalize(name));
  if(unique.length>=TYPES[type].n)break;
 }
 el.textContent=unique.join(", ")||"—";
}
async function request(action,key){
 const url=COUNT+action+"/"+key;
 const res=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(4500)});
 if(!res.ok)throw Error("SAYAÇ HTTP "+res.status);
 const json=await res.json();
 const n=Number(json.value);
 if(!Number.isSafeInteger(n)||n<0)throw Error("SAYAÇ VERİSİ GEÇERSİZ");
 return n;
}
function refresh(){
 if((!villages&&!families)||document.hidden)return;
 if(refreshPromise)return refreshPromise;
 refreshPromise=(async()=>{
  try{
   const response=await fetch(RECENT_API,{cache:"no-store",signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw Error("Arama listesi HTTP "+response.status);
   const data=await response.json();
   if(!Array.isArray(data.villages)||!Array.isArray(data.families))throw Error("Arama listesi verisi geçersiz");
   draw("village",data.villages);
   draw("family",data.families);
  }catch(error){
   console.warn("Ortak arama listesi:",error.message);
  }finally{
   lastRefresh=Date.now();
   refreshPromise=null;
  }
 })();
 return refreshPromise;
}
function sendSearch(kind,id){
 return fetch(RECENT_API,{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({kind,id}),
  signal:AbortSignal.timeout(10000),
  keepalive:true,
 });
}
async function record(type,name){
 if(!Object.hasOwn(TYPES,type)||!validSearchName(type,name))return;
 const original=normalize(name);
 try{
  let response=await sendSearch(type,nameId(original));
  if(response.status===422&&type==="family"){
   const variant=original.endsWith(" OĞULLARI")
    ?original.replace(/ OĞULLARI$/,"OĞULLARI")
    :original.replace(/(?<! )OĞULLARI$/," OĞULLARI");
   if(variant!==original)response=await sendSearch(type,nameId(variant));
  }
  if(!response.ok)throw Error("Arama kaydı HTTP "+response.status);
  await refreshPromise;
  await refresh();
 }catch(error){
  console.warn("Ortak arama kaydı:",error.message);
 }
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
 setInterval(()=>{if(!document.hidden&&Date.now()-lastRefresh>=15000)void refresh()},15000);
}
})();
