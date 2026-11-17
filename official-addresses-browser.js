/* Alidedeoglu Arsivi — il/ilce/muhtarlik/koy baglisi resmi yerlesim tarayicisi */
(function(){
"use strict";
const mount=document.getElementById("officialHierarchy");
if(!mount)return;
const style=document.createElement("style");
style.textContent=".officialHierarchy{background:#fff;color:#151515;border:2px solid #182b35;border-radius:12px;padding:14px;margin:15px 0;font:14px Arial,sans-serif}.officialHierarchy h2{font-size:19px;margin:0 0 6px;font-weight:900}.officialHierarchy p{font-size:12px;line-height:1.5;margin:6px 0}.officialHierarchy .ohGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:11px 0}.officialHierarchy label{display:block;font-size:11px;font-weight:900}.officialHierarchy select{width:100%;margin-top:5px;padding:9px;min-height:42px;border:1px solid #555;border-radius:5px;background:#fff;color:#111}.officialHierarchy .ohList{max-height:320px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:6px;margin-top:10px}.officialHierarchy .ohItem{border:1px solid #bbb;border-radius:5px;padding:8px;font-weight:750;font-size:12px;background:#f8f8f8}.officialHierarchy .ohStatus{font-size:12px;font-weight:800;color:#424242}.officialHierarchy small{display:block;font-size:10px;color:#555;margin-top:7px}@media(max-width:750px){.officialHierarchy .ohGrid{grid-template-columns:1fr}}";
document.head.append(style);
mount.classList.add("officialHierarchy");
mount.innerHTML='<h2>RESMÎ YERLEŞİMLER · MUHTARLIĞA BAĞLI MAHALLE / MEZRA / OBA / YAYLA</h2>'+
'<p>İL → İLÇE → KÖY VEYA MAHALLE MUHTARLIĞI → O MUHTARLIĞA BAĞLI YERLEŞİMLER</p>'+
'<div class="ohGrid"><label>İL<select id="ohProvince" disabled><option>VERİ YÜKLENİYOR</option></select></label><label>İLÇE<select id="ohDistrict" disabled><option>ÖNCE İL SEÇİN</option></select></label><label>MAHALLE / KÖY MUHTARLIĞI<select id="ohParent" disabled><option>ÖNCE İLÇE SEÇİN</option></select></label></div>'+
'<div class="ohStatus" id="ohStatus">YERLEŞİM KAYITLARI DENETLENİYOR…</div><div id="ohChildren" class="ohList"></div>'+
'<small>Kaynak: Kamuya açık köy/mahalle/bağlı yerleşim envanterinden türetilmiş adres hiyerarşisi. Sokak/cadde adları bu veri kümesinde yoktur. Bir bağlı yerleşim, arşivde müstakil karye olarak kabul edilmiş sayılmaz.</small>';
const $=id=>document.getElementById(id),province=$("ohProvince"),district=$("ohDistrict"),parent=$("ohParent"),status=$("ohStatus"),children=$("ohChildren");
const norm=x=>String(x||"").toLocaleUpperCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
function fill(select,names,label){select.replaceChildren();const base=document.createElement("option");base.value="";base.textContent=label;select.append(base);for(const [value,name] of names){const o=document.createElement("option");o.value=value;o.textContent=name;select.append(o)}select.disabled=!names.length}
function message(str){status.textContent=str;children.replaceChildren()}
let manifest=null,active=null;
async function readJSON(path){
 const r=await fetch(path+"?v=20261118-muhtarlik3",{cache:"no-cache",signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw Error("Veri dosyası bulunamadı ("+r.status+")");
 return r.json();
}
async function start(){
 try{
  manifest=await readJSON("./official-addresses/manifest.json");
  const opts=Object.entries(manifest.provinces||{}).sort((a,b)=>a[1].localeCompare(b[1],"tr"));
  fill(province,opts,"İL SEÇİN");
  message("TÜRKİYE RESMÎ YERLEŞİM DİZİNİ HAZIR · İL SEÇİN");
 }catch(e){message("BAĞLI YERLEŞİM ENVANTERİ HENÜZ YAYINLANMADI · DOSYALAR OLUŞTURULDUĞUNDA BURADA GÖRÜNECEK");}
}
province.addEventListener("change",async function(){
 active=null;
 fill(district,[],"ÖNCE İL SEÇİN");fill(parent,[],"ÖNCE İLÇE SEÇİN");
 if(!province.value){message("İL SEÇİN");return}
 message("İL VE İLÇE VERİSİ YÜKLENİYOR…");
 try{
  active=await readJSON("./official-addresses/"+province.value+".json");
  const options=Object.keys(active.districts||{}).sort((a,b)=>a.localeCompare(b,"tr")).map(x=>[x,x]);
  fill(district,options,"İLÇE SEÇİN");
  message(options.length+" İLÇE HAZIR");
 }catch(_){message("BU İLE AİT KAYITLAR YÜKLENEMEDİ");}
});
district.addEventListener("change",function(){
 fill(parent,[],"ÖNCE İLÇE SEÇİN");
 if(!district.value||!active){message("İLÇE SEÇİN");return}
 const data=active.districts[district.value];
 const opts=Object.keys(data?.muhtarliklar||{}).sort((a,b)=>a.localeCompare(b,"tr")).map(x=>[x,x]);
 if((data?.eslesmeyen_baglilar||[]).length)opts.push(["__UNMATCHED__","ANA MUHTARLIĞI EŞLEŞTİRİLEMEMİŞ BAĞLILAR"]);
 fill(parent,opts,"KÖY / MAHALLE MUHTARLIĞI SEÇİN");
 message(opts.length+" KÖY / MAHALLE MUHTARLIĞI LİSTELENDİ");
});
parent.addEventListener("change",function(){
 if(!active||!district.value||!parent.value){message("MUHTARLIK SEÇİN");return}
 const districtData=active.districts[district.value];
 const unmatched=parent.value==="__UNMATCHED__";
 const rows=unmatched?(districtData?.eslesmeyen_baglilar||[]):(districtData?.baglilar?.[parent.value]||[]);
 children.replaceChildren();
 if(!rows.length){status.textContent="BU MUHTARLIĞA BAĞLI AYRI BİR YERLEŞİM KAYDI YOK";return}
 status.textContent=(unmatched?"ÜST MUHTARLIĞI DOĞRULANACAK KAYITLAR":parent.value)+" · "+rows.length+" BAĞLI YERLEŞİM";
 for(const item of rows){
  const name=typeof item==="string"?item:item.name;
  if(!name)continue;
  const el=document.createElement("div");el.className="ohItem";el.textContent=(unmatched?item.ana_ad+" → ":"")+name;children.append(el);
 }
});
start();
})();