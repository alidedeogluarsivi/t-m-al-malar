/* Alidedeoglu Arsivi: ortak ziyaret ve son arama istatistikleri. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const village=$("recentVillages"),family=$("recentFamilies"),daily=$("dailyVisitStat");
const apiBase=typeof window.ARCHIVE_STATS_API==="string"&&window.ARCHIVE_STATS_API.trim()
  ? window.ARCHIVE_STATS_API.trim().replace(/\/$/,"") : "";
const api=apiBase ? apiBase+"/api/site-stats" : "/api/site-stats";
const clean=s=>String(s||"").trim().replace(/\s+/g," ").slice(0,90);
let refreshTimer=0;
function show(el,items){
 if(!el)return;
 el.replaceChildren();
 if(!Array.isArray(items)||!items.length){el.textContent="HENÜZ KAYIT YOK";return;}
 items.forEach((item,i)=>{
  const name=clean(typeof item==="string"?item:item?.name);
  if(!name)return;
  if(i)el.append(document.createTextNode(" · "));
  const span=document.createElement("span");span.textContent=name;el.append(span);
 });
}
async function load(){
 if(!village&&!family)return;
 try{
  const res=await fetch(api,{cache:"no-store",signal:AbortSignal.timeout(5000)});
  if(!res.ok)throw Error("API HTTP "+res.status);
  const data=await res.json();
  show(village,data.villages?.slice(0,3));
  show(family,data.families?.slice(0,5));
 }catch(e){
  if(village)village.textContent="ARAMA KAYIT SERVİSİ BAĞLI DEĞİL";
  if(family)family.textContent="ARAMA KAYIT SERVİSİ BAĞLI DEĞİL";
 }
}
async function record(type,name){
 name=clean(name);
 if(!["village","family"].includes(type)||name.length<2)return;
 try{
  const res=await fetch(api,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type,name}),signal:AbortSignal.timeout(5000)});
  if(!res.ok)throw Error("API HTTP "+res.status);
  if(village||family){clearTimeout(refreshTimer);refreshTimer=setTimeout(load,200);}
 }catch(e){console.warn("Arşiv araması kaydedilemedi:",e.message);}
}
window.ArchiveStats={
 recordVillage:name=>record("village",name),
 recordFamily:name=>record("family",name),
 refresh:load
};
async function today(){
 if(!daily)return;
 const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const key="alidedeogluarsivi_today_"+day.replace(/\D/g,"");
 const flag="archive_daily_counted_"+day;
 const action=sessionStorage.getItem(flag)==="1"?"get":"hit";
 const url="https://countapi.mileshilliard.com/api/v1/";
 try{
  let res=await fetch(url+action+"/"+key,{cache:"no-store",signal:AbortSignal.timeout(4000)});
  if(!res.ok&&action==="get")res=await fetch(url+"hit/"+key,{cache:"no-store",signal:AbortSignal.timeout(4000)});
  if(!res.ok)throw Error("Günlük sayaç erişilemiyor");
  const data=await res.json(),n=Number(data.value);
  if(!Number.isSafeInteger(n)||n<0)throw Error("Geçersiz günlük sayı");
  daily.textContent=n.toLocaleString("tr-TR");
  if(action==="hit")sessionStorage.setItem(flag,"1");
 }catch(_){daily.textContent="—";}
}
today();load();
if(village||family)window.addEventListener("focus",load);
})();
