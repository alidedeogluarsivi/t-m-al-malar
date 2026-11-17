/* Alidedeoglu Arsivi - ziyaret ve arama istatistikleri */
(function(){
'use strict';
const daily=document.getElementById('dailyVisitStat');
const village=document.getElementById('recentVillages');
const family=document.getElementById('recentFamilies');
if(!daily||!village||!family)return;
const origin=location.origin;
const api=typeof window.ARCHIVE_STATS_API==='string'?window.ARCHIVE_STATS_API.replace(/\/$/,'')+'/api/site-stats':'/api/site-stats';
const tzDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const key='alidedeogluarsivi_today_'+tzDay.replace(/\D/g,'');
function unavailable(el){el.textContent='VERİ HENÜZ YOK';}
async function today(){
 const counted='archive_daily_counted_'+tzDay;
 const action=sessionStorage.getItem(counted)==='1'?'get':'hit';
 const endpoint='https://countapi.mileshilliard.com/api/v1/'+action+'/'+key;
 try {
  let res=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(3500)});
  if(!res.ok&&action==='get')res=await fetch('https://countapi.mileshilliard.com/api/v1/hit/'+key,{cache:'no-store',signal:AbortSignal.timeout(3500)});
  if(!res.ok)throw Error('Sayaç erişilemedi');
  const body=await res.json(),value=Number(body.value);
  if(!Number.isSafeInteger(value)||value<0)throw Error('Geçersiz sayaç');
  if(action==='hit')sessionStorage.setItem(counted,'1');
  daily.textContent=value.toLocaleString('tr-TR');
 }catch(e){daily.textContent='—';daily.title='Günlük sayaç servisine erişilemedi';}
}
function render(el,items){
 el.replaceChildren();
 if(!Array.isArray(items)||!items.length){unavailable(el);return;}
 items.forEach(function(item,i){
  if(i)el.append(document.createTextNode(' · '));
  const name=typeof item==='string'?item:item&&item.name;
  if(typeof name!=='string'||!name.trim())return;
  const b=document.createElement('span');b.textContent=name.slice(0,90);el.append(b);
 });
}
async function load(){
 try{
  const r=await fetch(api,{cache:'no-store',signal:AbortSignal.timeout(3500)});
  if(!r.ok)throw Error('Arama istatistiği servisi erişilemiyor');
  const d=await r.json();
  render(village,d.villages&&d.villages.slice(0,3));
  render(family,d.families&&d.families.slice(0,5));
 }catch(e){village.textContent='ARŞİV ARAMA KAYDI BAĞLI DEĞİL';family.textContent='ARŞİV ARAMA KAYDI BAĞLI DEĞİL';}
}
const norm=s=>String(s||'').trim().replace(/\s+/g,' ').slice(0,90);
async function record(type,name){
 name=norm(name);
 if(name.length<2||!['village','family'].includes(type))return;
 try{await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,name}),keepalive:true,signal:AbortSignal.timeout(2500)});load()}catch(_){}
}
window.ArchiveStats={recordVillage:name=>record('village',name),recordFamily:name=>record('family',name)};
today();load();
})();
