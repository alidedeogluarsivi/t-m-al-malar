/* ALİDEDEOĞLU ARŞİVİ — TAHMİNÎ 1890 OSMANLI İDARÎ KATMANI
   Kaynak mantığı: Devlet Arşivleri Osmanlı Yer Adları + arşivde işlenmiş NFS/TMT tarihî idare alanları.
   Sınırlar tarihî çizili harita değildir; bugünkü ilçe geometrilerinin 1890 civarı idarî bağlılıklara göre birleştirilmiş yaklaşık görünümüdür. */
(function(){
'use strict';

let historicalLayer=null;
let historical1890=null;
let histSelection={vilayet:null,sancak:null,kaza:null};
let histLayersMap={vilayet:null,sancak:null,kaza:null,focus:null};

function clean(s){
  return String(s||'').replace(/\s+/g,' ').replace(/[“”"]/g,'').trim();
}
function stripAdminSuffix(s){
  return clean(s)
    .replace(/\b(vilâyeti|vilayeti|vilâyet|vilayet|eyâleti|eyaleti|eyâlet|eyalet|sancağı|sancagi|sancak|kazâsı|kazasi|kazâ|kaza)\b/gi,'')
    .replace(/\s+/g,' ').trim();
}
function yearCovers1890(line){
  const ranges=[...String(line||'').matchAll(/\((\d{4})(?:\s*[-–]\s*(\d{4}))?/g)];
  if(!ranges.length)return false;
  return ranges.some(m=>{
    const a=Number(m[1]),b=Number(m[2]||m[1]);
    return a<=1890 && 1890<=b;
  });
}
function statusOf(line){
  const s=clean(line).toLocaleLowerCase('tr-TR');
  if(s.startsWith('nâhiye')||s.startsWith('nahiye'))return'nahiye';
  if(s.startsWith('kazâ')||s.startsWith('kaza'))return'kaza';
  if(s.startsWith('sancak'))return'sancak';
  if(s.startsWith('vilâyet')||s.startsWith('vilayet')||s.startsWith('eyâlet')||s.startsWith('eyalet'))return'vilayet';
  return'';
}
function parse1890Line(currentName,line){
  if(!yearCovers1890(line))return null;
  if(/rusya|bulgaristan|romanya|yunanistan|iran|fransa mandası/i.test(line))return null;
  const status=statusOf(line);
  if(!status)return null;
  let body=String(line).replace(/^[^(]+/,'').replace(/^\s*\([^)]*\)\s*/,'').trim();
  const parts=body.split('→').map(clean).filter(Boolean);
  if(!parts.length)return null;

  let vilayet='';
  let vilayetIndex=-1;
  for(let i=parts.length-1;i>=0;i--){
    if(/vilâyet|vilayet|eyâlet|eyalet/i.test(parts[i])){
      vilayet=stripAdminSuffix(parts[i]);vilayetIndex=i;break;
    }
  }
  if(!vilayet){
    // Bazı satırlarda vilâyet sözcüğü ayrı devam satırına düşmüş olabilir.
    const last=parts[parts.length-1];
    if(last && !/salnâme|salname/i.test(last))vilayet=stripAdminSuffix(last);
    vilayetIndex=parts.length-1;
  }
  if(!vilayet)return null;

  const before=parts.slice(0,Math.max(0,vilayetIndex)).map(stripAdminSuffix).filter(Boolean);
  let sancak='',kaza='';
  if(status==='nahiye'){
    kaza=before[0]||currentName;
    sancak=before.length>1?before[before.length-1]:(before[0]||currentName);
  }else if(status==='kaza'){
    kaza=currentName;
    sancak=before.length?before[before.length-1]:currentName;
  }else if(status==='sancak'){
    sancak=currentName;kaza=currentName;
  }else{
    sancak=currentName;kaza=currentName;
  }
  return {vilayet:vilayet,sancak:sancak,kaza:kaza,status:status,sourceLine:clean(line)};
}
function reverseProvinceMap(){
  const out={};
  Object.keys(PROVINCE_MAP||{}).forEach(k=>{out[String(PROVINCE_MAP[k])]=k});
  return out;
}
function entryMatchesProvince(lines,province){
  const aliases=(typeof provinceAliases==='function'?provinceAliases(province):[province]).map(norm);
  const blob=norm((lines||[]).join(' '));
  return aliases.some(a=>a&&blob.includes(a));
}
async function loadHistorical1890(){
  if(historical1890)return historical1890;
  const [admin,dist]=await Promise.all([
    loadOsmanliAdmin(),
    districtGeo?Promise.resolve(districtGeo):getJSON(DIST_REMOTE)
  ]);
  if(!districtGeo)districtGeo=dist;
  const rev=reverseProvinceMap();
  const assignments=[];
  const missed=[];

  (dist.features||[]).forEach(f=>{
    const p=f.properties||{};
    const districtName=p.name||'';
    const modernProvince=rev[String(p.parent_id||'')]||'';
    if(!districtName||!modernProvince)return;

    const keyName=Object.keys(admin||{}).find(k=>norm(k)===norm(districtName));
    const entries=keyName?(admin[keyName]||[]):[];
    let candidates=[];
    entries.forEach(e=>{
      const lines=e.kayitlar||[];
      lines.forEach(line=>{
        const parsed=parse1890Line(districtName,line);
        if(parsed)candidates.push({parsed:parsed,lines:lines});
      });
    });
    if(candidates.length>1){
      const byProvince=candidates.filter(x=>entryMatchesProvince(x.lines,modernProvince));
      if(byProvince.length)candidates=byProvince;
    }
    if(candidates.length){
      const a=candidates[0].parsed;
      assignments.push({
        feature:f,
        district:districtName,
        modernProvince:modernProvince,
        vilayet:a.vilayet,
        sancak:a.sancak,
        kaza:a.kaza,
        sourceLine:a.sourceLine
      });
    }else missed.push({district:districtName,province:modernProvince});
  });

  // Arşiv defterlerindeki tarihî alanlarla boşlukları, yalnız açık alan varsa tamamla.
  (archive||[]).forEach(r=>{
    const exists=assignments.some(a=>norm(a.modernProvince)===norm(r.il)&&norm(a.district)===norm(r.ilce));
    if(exists)return;
    const d=(r.defterler||[]).find(x=>x&&(x.tarihi_kaza||x.kaza)&&(x.sancak||x.tarihi_sancak)&&(x.vilayet||x.eyalet||x.tarihi_vilayet||x.tarihi_eyalet));
    if(!d)return;
    const f=(dist.features||[]).find(x=>{
      const p=x.properties||{};
      return norm(p.name)===norm(r.ilce)&&norm(rev[String(p.parent_id||'')]||'')===norm(r.il);
    });
    if(!f)return;
    assignments.push({
      feature:f,district:r.ilce,modernProvince:r.il,
      vilayet:String(d.vilayet||d.eyalet||d.tarihi_vilayet||d.tarihi_eyalet),
      sancak:String(d.sancak||d.tarihi_sancak),
      kaza:String(d.tarihi_kaza||d.kaza),
      sourceLine:'NFS/TMT ARŞİV KARTI'
    });
  });

  historical1890={assignments:assignments,missed:missed};
  return historical1890;
}

function clearHistoricalLayer(){
  if(historicalLayer&&baseMap){baseMap.removeLayer(historicalLayer);historicalLayer=null}
  Object.keys(histLayersMap).forEach(function(k){
    if(histLayersMap[k]&&baseMap){baseMap.removeLayer(histLayersMap[k]);histLayersMap[k]=null}
  });
  histSelection={vilayet:null,sancak:null,kaza:null};
}
function fcFor(rows,field){
  return {type:'FeatureCollection',features:rows.map(r=>{
    const f=JSON.parse(JSON.stringify(r.feature));
    f.properties=Object.assign({},f.properties,{_histGroup:r[field],_histVilayet:r.vilayet,_histSancak:r.sancak,_histKaza:r.kaza});
    return f;
  })};
}
function dissolve(fc,field){
  if(!window.turf||!fc.features.length)return fc;
  try{
    return turf.dissolve(fc,{propertyName:field});
  }catch(e){
    return fc;
  }
}
function histLabel(layer,name,cls){
  if(!name)return;
  layer.bindTooltip(name,{permanent:true,direction:'center',className:'histMapLabel '+(cls||''),opacity:1});
}
function histInfo(html){
  const box=document.getElementById('histInfo');
  if(!box)return;
  box.innerHTML=html;
  box.classList.add('show');
}
function vilayetSummary(name,rows){
  const sancaks=[...new Set(rows.map(r=>r.sancak).filter(Boolean))];
  const kazas=[...new Set(rows.map(r=>r.kaza).filter(Boolean))];
  return '<b>TAHMİNÎ 1890 · '+esc(name.toLocaleUpperCase('tr-TR'))+' VİLÂYETİ</b><br>'+
    sancaks.length+' SANCAK · '+kazas.length+' KAZA EŞLEŞMESİ<br>'+
    '<small>SINIR: BUGÜNKÜ İLÇE GEOMETRİLERİNİN 1890 CİVARI TARİHÎ BAĞLILIKLARA GÖRE BİRLEŞTİRİLMİŞ YAKLAŞIK GÖRÜNÜMÜDÜR.</small>';
}
function histPane(){
  if(!baseMap)return;
  if(!baseMap.getPane('historicalBoundaries')){
    baseMap.createPane('historicalBoundaries');
    baseMap.getPane('historicalBoundaries').style.zIndex='520';
    baseMap.getPane('historicalBoundaries').style.pointerEvents='auto';
  }
  if(!baseMap.getPane('historicalLabels')){
    baseMap.createPane('historicalLabels');
    baseMap.getPane('historicalLabels').style.zIndex='780';
    baseMap.getPane('historicalLabels').style.pointerEvents='auto';
  }
}
function sideHistorical(title,subtitle,sections){
  if(typeof setSideInfo==='function'){
    setSideInfo(title,subtitle,sections);
  }else{
    histInfo('<b>'+esc(title)+'</b><br>'+sections.replace(/<[^>]+>/g,' '));
  }
}
function histTags(items,attr){
  return '<div class="sideInfoTags">'+items.map(function(x){
    return '<button type="button" '+attr+'="'+esc(x)+'">'+esc(x)+'</button>'
  }).join('')+'</div>'
}
function bindHistoricalSideButtons(){
  document.querySelectorAll('[data-hist-sancak]').forEach(function(btn){
    btn.onclick=function(){renderSancaks(btn.getAttribute('data-hist-sancak-vilayet')||histSelection.vilayet,btn.getAttribute('data-hist-sancak'))}
  });
  document.querySelectorAll('[data-hist-kaza]').forEach(function(btn){
    btn.onclick=function(){renderKazas(btn.getAttribute('data-hist-kaza-vilayet')||histSelection.vilayet,btn.getAttribute('data-hist-kaza-sancak')||histSelection.sancak,btn.getAttribute('data-hist-kaza'))}
  });
}
function showVilayetSide(name,rows){
  const sancaks=[...new Set(rows.map(r=>r.sancak).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));
  const kazas=[...new Set(rows.map(r=>r.kaza).filter(Boolean))];
  const modern=[...new Set(rows.map(r=>r.modernProvince).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));
  let body='<div class="sideInfoSec"><b class="title">TAHMİNÎ 1890 VİLÂYETİ</b>'+sancaks.length+' SANCAK · '+kazas.length+' KAZA EŞLEŞMESİ</div>';
  if(modern.length)body+='<div class="sideInfoSec"><b class="title">BUGÜNKÜ GEOMETRİDE KARŞILIK GELEN İLLER</b><div class="sideInfoTags">'+modern.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div></div>';
  body+='<div class="sideInfoSec"><b class="title">SANCAKLAR</b><div class="sideInfoTags">'+sancaks.map(function(x){return'<button type="button" data-hist-sancak="'+esc(x)+'" data-hist-sancak-vilayet="'+esc(name)+'">'+esc(x)+'</button>'}).join('')+'</div></div>';
  body+='<div class="sideInfoSec"><b class="title">SINIR NOTU</b><div class="sideInfoRecord">SINIRLAR, BUGÜNKÜ İLÇE GEOMETRİLERİNİN 1890 CİVARI OSMANLI İDARÎ BAĞLILIKLARINA GÖRE BİRLEŞTİRİLMİŞ YAKLAŞIK GÖRÜNÜMÜDÜR.</div></div>';
  sideHistorical(name+' VİLÂYETİ','OSMANLI İDARÎ HARİTASI · 1890',body);
  bindHistoricalSideButtons()
}
function showSancakSide(vilayet,name,rows){
  const kazas=[...new Set(rows.map(r=>r.kaza).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));
  const modern=[...new Set(rows.map(r=>r.modernProvince+' / '+r.district).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));
  let body='<div class="sideInfoSec"><b class="title">VİLÂYET</b>'+esc(vilayet)+' VİLÂYETİ</div>';
  body+='<div class="sideInfoSec"><b class="title">SANCAK</b>'+esc(name)+' SANCAĞI · '+kazas.length+' KAZA</div>';
  body+='<div class="sideInfoSec"><b class="title">KAZALAR</b><div class="sideInfoTags">'+kazas.map(function(x){return'<button type="button" data-hist-kaza="'+esc(x)+'" data-hist-kaza-vilayet="'+esc(vilayet)+'" data-hist-kaza-sancak="'+esc(name)+'">'+esc(x)+'</button>'}).join('')+'</div></div>';
  if(modern.length)body+='<div class="sideInfoSec"><b class="title">BUGÜNKÜ GEOMETRİ KARŞILIKLARI</b><div class="sideInfoTags">'+modern.slice(0,40).map(x=>'<span>'+esc(x)+'</span>').join('')+'</div></div>';
  sideHistorical(name+' SANCAĞI',vilayet+' VİLÂYETİ · TAHMİNÎ 1890',body);
  bindHistoricalSideButtons()
}
function showKazaSide(vilayet,sancak,name,rows){
  const modern=[...new Set(rows.map(r=>r.modernProvince+' / '+r.district).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));
  const source=[...new Set(rows.map(r=>r.sourceLine).filter(Boolean))];
  let body='<div class="sideInfoSec"><b class="title">İDARÎ HİYERARŞİ</b>'+esc(vilayet)+' VİLÂYETİ → '+esc(sancak)+' SANCAĞI → '+esc(name)+' KAZASI</div>';
  if(modern.length)body+='<div class="sideInfoSec"><b class="title">BUGÜNKÜ GEOMETRİYE DENK GELEN YERLER</b><div class="sideInfoTags">'+modern.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div></div>';
  if(source.length)body+='<div class="sideInfoSec"><b class="title">KAYNAK SATIRLARI</b>'+source.slice(0,30).map(x=>'<div class="sideInfoRecord">'+esc(x)+'</div>').join('')+'</div>';
  sideHistorical(name+' KAZASI',vilayet+' VİLÂYETİ / '+sancak+' SANCAĞI · TAHMİNÎ 1890',body)
}
function focusHistoricalLayer(layer,color){
  if(histLayersMap.focus&&baseMap){baseMap.removeLayer(histLayersMap.focus);histLayersMap.focus=null}
  if(!layer||!layer.toGeoJSON)return;
  histLayersMap.focus=L.geoJSON(layer.toGeoJSON(),{
    pane:'historicalBoundaries',
    style:{color:color||'#111',weight:5.5,fillColor:color||'#111',fillOpacity:.055,dashArray:null,opacity:1,interactive:false}
  }).addTo(baseMap)
}
function renderVilayets(){
  loadHistorical1890().then(data=>{
    histPane();clearHistoricalLayer();
    const rows=data.assignments.filter(r=>r.vilayet);
    const fc=dissolve(fcFor(rows,'vilayet'),'_histGroup');
    histLayersMap.vilayet=L.geoJSON(fc,{
      pane:'historicalBoundaries',
      style:{color:'#b71c2b',weight:3.6,fillColor:'#b71c2b',fillOpacity:.018,dashArray:'10 6',opacity:.95},
      onEachFeature:function(f,l){
        const name=(f.properties&&f.properties._histGroup)||'';
        histLabel(l,name+' VİLÂYETİ','vilayet');
        l.on('click',function(){
          histSelection.vilayet=name;histSelection.sancak=null;histSelection.kaza=null;
          const vrows=rows.filter(r=>norm(r.vilayet)===norm(name));
          focusHistoricalLayer(l,'#b71c2b');
          showVilayetSide(name,vrows);
          renderSancaks(name)
        })
      }
    }).addTo(baseMap);
    historicalLayer=histLayersMap.vilayet;
    if(histLayersMap.vilayet.getBounds().isValid())baseMap.fitBounds(histLayersMap.vilayet.getBounds(),{padding:[12,12]});
    histInfo('<b>OSMANLI İDARÎ HARİTASI · TAHMİNÎ 1890</b><br>KIRMIZI KESİKLİ ÇİZGİLER: VİLÂYET SINIRLARI. BİR VİLÂYETE TIKLAYIN → SANCAKLAR AÇILSIN.');
  })
}
function renderSancaks(vilayet,preselect){
  loadHistorical1890().then(data=>{
    histPane();
    if(histLayersMap.sancak&&baseMap){baseMap.removeLayer(histLayersMap.sancak);histLayersMap.sancak=null}
    if(histLayersMap.kaza&&baseMap){baseMap.removeLayer(histLayersMap.kaza);histLayersMap.kaza=null}
    const rows=data.assignments.filter(r=>norm(r.vilayet)===norm(vilayet)&&r.sancak);
    const fc=dissolve(fcFor(rows,'sancak'),'_histGroup');
    histLayersMap.sancak=L.geoJSON(fc,{
      pane:'historicalBoundaries',
      style:{color:'#b8860b',weight:3,fillColor:'#d4a72c',fillOpacity:.024,dashArray:null,opacity:.95},
      onEachFeature:function(f,l){
        const name=(f.properties&&f.properties._histGroup)||'';
        histLabel(l,name+' SANCAĞI','sancak');
        l.on('click',function(){
          histSelection.vilayet=vilayet;histSelection.sancak=name;histSelection.kaza=null;
          const srows=rows.filter(r=>norm(r.sancak)===norm(name));
          focusHistoricalLayer(l,'#b8860b');
          showSancakSide(vilayet,name,srows);
          renderKazas(vilayet,name)
        })
      }
    }).addTo(baseMap);
    historicalLayer=histLayersMap.sancak;
    const vrows=rows.filter(r=>norm(r.vilayet)===norm(vilayet));
    showVilayetSide(vilayet,vrows);
    if(preselect){
      histLayersMap.sancak.eachLayer(function(l){
        const n=l.feature&&l.feature.properties&&l.feature.properties._histGroup;
        if(norm(n)===norm(preselect)){histSelection.sancak=n;const sr=rows.filter(r=>norm(r.sancak)===norm(n));focusHistoricalLayer(l,'#b8860b');showSancakSide(vilayet,n,sr);renderKazas(vilayet,n)}
      })
    }else if(histLayersMap.sancak.getBounds().isValid())baseMap.fitBounds(histLayersMap.sancak.getBounds(),{padding:[22,22],maxZoom:8})
  })
}
function renderKazas(vilayet,sancak,preselect){
  loadHistorical1890().then(data=>{
    histPane();
    if(histLayersMap.kaza&&baseMap){baseMap.removeLayer(histLayersMap.kaza);histLayersMap.kaza=null}
    const rows=data.assignments.filter(r=>norm(r.vilayet)===norm(vilayet)&&norm(r.sancak)===norm(sancak)&&r.kaza);
    const fc=dissolve(fcFor(rows,'kaza'),'_histGroup');
    histLayersMap.kaza=L.geoJSON(fc,{
      pane:'historicalBoundaries',
      style:{color:'#163a55',weight:2.2,fillColor:'#163a55',fillOpacity:.015,dashArray:'3 3',opacity:.95},
      onEachFeature:function(f,l){
        const name=(f.properties&&f.properties._histGroup)||'';
        histLabel(l,name+' KAZASI','kaza');
        l.on('click',function(){
          histSelection.vilayet=vilayet;histSelection.sancak=sancak;histSelection.kaza=name;
          const krows=rows.filter(r=>norm(r.kaza)===norm(name));
          focusHistoricalLayer(l,'#163a55');
          showKazaSide(vilayet,sancak,name,krows)
        })
      }
    }).addTo(baseMap);
    historicalLayer=histLayersMap.kaza;
    const srows=data.assignments.filter(r=>norm(r.vilayet)===norm(vilayet)&&norm(r.sancak)===norm(sancak));
    showSancakSide(vilayet,sancak,srows);
    if(preselect){
      histLayersMap.kaza.eachLayer(function(l){
        const n=l.feature&&l.feature.properties&&l.feature.properties._histGroup;
        if(norm(n)===norm(preselect)){histSelection.kaza=n;const kr=rows.filter(r=>norm(r.kaza)===norm(n));focusHistoricalLayer(l,'#163a55');showKazaSide(vilayet,sancak,n,kr)}
      })
    }else if(histLayersMap.kaza.getBounds().isValid())baseMap.fitBounds(histLayersMap.kaza.getBounds(),{padding:[24,24],maxZoom:10})
  })
}

function setBtn(id,active){const e=document.getElementById(id);if(e)e.classList.toggle('active',!!active)}
function installControls(){
  const modern=document.getElementById('modernLayerBtn');
  const eyalet=document.getElementById('eyaletLayerBtn');
  const sancak=document.getElementById('sancakLayerBtn');
  const kaza=document.getElementById('kazaLayerBtn');
  if(eyalet)eyalet.textContent='1890 VİLÂYET';
  if(modern)modern.onclick=function(){
    clearHistoricalLayer();
    document.getElementById('histInfo').classList.remove('show');
    setBtn('modernLayerBtn',true);setBtn('eyaletLayerBtn',false);setBtn('sancakLayerBtn',false);setBtn('kazaLayerBtn',false);if(typeof renderSideVillage==='function'&&selectedDistrict&&vSel&&vSel.value!==''){const i=Number(vSel.value);if(currentVillages[i])openVillage(currentVillages[i].name)}else if(typeof renderSideDistrict==='function'&&selectedDistrict)renderSideDistrict(selectedProvince.name,selectedDistrict.name);else if(typeof renderSideProvince==='function'&&selectedProvince)renderSideProvince(selectedProvince.name);
  };
  if(eyalet)eyalet.onclick=function(){
    setBtn('modernLayerBtn',false);setBtn('eyaletLayerBtn',true);setBtn('sancakLayerBtn',false);setBtn('kazaLayerBtn',false);
    renderVilayets();
  };
  if(sancak)sancak.onclick=function(){
    setBtn('modernLayerBtn',false);setBtn('eyaletLayerBtn',false);setBtn('sancakLayerBtn',true);setBtn('kazaLayerBtn',false);
    if(histSelection.vilayet)renderSancaks(histSelection.vilayet);
    else {renderVilayets();histInfo('<b>ÖNCE VİLÂYETE TIKLAYIN.</b><br>SEÇTİĞİNİZ VİLÂYETİN SANCAKLARI ÖNE ÇIKACAK.')}
  };
  if(kaza)kaza.onclick=function(){
    setBtn('modernLayerBtn',false);setBtn('eyaletLayerBtn',false);setBtn('sancakLayerBtn',false);setBtn('kazaLayerBtn',true);
    if(histSelection.vilayet&&histSelection.sancak)renderKazas(histSelection.vilayet,histSelection.sancak);
    else histInfo('<b>ÖNCE VİLÂYET → SANCAK SEÇİN.</b><br>SONRA KAZALAR ÖNE ÇIKACAK.');
  };
}
function addCss(){
  const s=document.createElement('style');
  s.textContent='.leaflet-tooltip.histMapLabel{background:#fffdf7f5;border-radius:6px;box-shadow:0 3px 10px #0002;font-weight:900;white-space:nowrap;padding:4px 7px}.leaflet-tooltip.histMapLabel.vilayet{border:2px solid #b71c2b;color:#8f1220;font-size:12px}.leaflet-tooltip.histMapLabel.sancak{border:2px solid #b8860b;color:#7d5a08;font-size:11px}.leaflet-tooltip.histMapLabel.kaza{border:1px solid #163a55;color:#163a55;font-size:10px}';
  document.head.appendChild(s);
}

addCss();
installControls();
})();