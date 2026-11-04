/* ALİDEDEOĞLU ARŞİVİ — TAHMİNÎ 1890 OSMANLI İDARÎ KATMANI
   Kaynak mantığı: Devlet Arşivleri Osmanlı Yer Adları + arşivde işlenmiş NFS/TMT tarihî idare alanları.
   Sınırlar tarihî çizili harita değildir; bugünkü ilçe geometrilerinin 1890 civarı idarî bağlılıklara göre birleştirilmiş yaklaşık görünümüdür. */
(function(){
'use strict';

let historicalLayer=null;
let historical1890=null;
let histSelection={vilayet:null,sancak:null};

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
  histSelection={vilayet:null,sancak:null};
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
function renderVilayets(){
  loadHistorical1890().then(data=>{
    clearHistoricalLayer();
    const rows=data.assignments.filter(r=>r.vilayet);
    const fc=dissolve(fcFor(rows,'vilayet'),'_histGroup');
    historicalLayer=L.geoJSON(fc,{
      style:{color:'#c21f2f',weight:3,fillColor:'#c21f2f',fillOpacity:.025,dashArray:'7 4'},
      onEachFeature:function(f,l){
        const name=(f.properties&&f.properties._histGroup)||'';
        histLabel(l,name+' VİLÂYETİ','vilayet');
        l.on('click',function(){
          histSelection.vilayet=name;
          const vrows=rows.filter(r=>norm(r.vilayet)===norm(name));
          histInfo(vilayetSummary(name,vrows));
          renderSancaks(name);
        });
      }
    }).addTo(baseMap);
    if(historicalLayer.getBounds().isValid())baseMap.fitBounds(historicalLayer.getBounds(),{padding:[12,12]});
    histInfo('<b>TAHMİNÎ 1890 OSMANLI İDARÎ HARİTASI</b><br>VİLÂYET SINIRLARI KIRMIZI VE SAYDAMDIR. BİR VİLÂYETE TIKLAYIN → SANCAKLAR AÇILSIN.<br><small>KAYNAK: OSMANLI YER ADLARI + NFS/TMT TARİHÎ İDARÎ ALANLARI.</small>');
  });
}
function renderSancaks(vilayet){
  loadHistorical1890().then(data=>{
    if(historicalLayer){baseMap.removeLayer(historicalLayer);historicalLayer=null}
    const rows=data.assignments.filter(r=>norm(r.vilayet)===norm(vilayet)&&r.sancak);
    const fc=dissolve(fcFor(rows,'sancak'),'_histGroup');
    historicalLayer=L.geoJSON(fc,{
      style:{color:'#9a6818',weight:3.2,fillColor:'#d6a13a',fillOpacity:.035},
      onEachFeature:function(f,l){
        const name=(f.properties&&f.properties._histGroup)||'';
        histLabel(l,name+' SANCAĞI','sancak');
        l.on('click',function(){
          histSelection.sancak=name;
          const srows=rows.filter(r=>norm(r.sancak)===norm(name));
          const kazas=[...new Set(srows.map(r=>r.kaza).filter(Boolean))];
          histInfo('<b>'+esc(vilayet.toLocaleUpperCase('tr-TR'))+' VİLÂYETİ → '+esc(name.toLocaleUpperCase('tr-TR'))+' SANCAĞI</b><br>'+kazas.length+' KAZA EŞLEŞMESİ · SANCAĞA TIKLANDI, KAZALAR AÇILIYOR.');
          renderKazas(vilayet,name);
        });
      }
    }).addTo(baseMap);
    if(historicalLayer.getBounds().isValid())baseMap.fitBounds(historicalLayer.getBounds(),{padding:[20,20],maxZoom:8});
  });
}
function renderKazas(vilayet,sancak){
  loadHistorical1890().then(data=>{
    if(historicalLayer){baseMap.removeLayer(historicalLayer);historicalLayer=null}
    const rows=data.assignments.filter(r=>norm(r.vilayet)===norm(vilayet)&&norm(r.sancak)===norm(sancak)&&r.kaza);
    const fc=dissolve(fcFor(rows,'kaza'),'_histGroup');
    historicalLayer=L.geoJSON(fc,{
      style:{color:'#17384e',weight:2.6,fillColor:'#17384e',fillOpacity:.025},
      onEachFeature:function(f,l){
        const name=(f.properties&&f.properties._histGroup)||'';
        histLabel(l,name+' KAZASI','kaza');
        l.on('click',function(){
          const krows=rows.filter(r=>norm(r.kaza)===norm(name));
          const modern=[...new Set(krows.map(r=>r.modernProvince+' / '+r.district))];
          openInfoPanel(name+' KAZASI','TAHMİNÎ 1890 · '+vilayet+' VİLÂYETİ / '+sancak+' SANCAĞI',
            '<div class="section"><h3>TARİHÎ KAZA KATMANI</h3><div class="notice"><b>TAHMİNÎ SINIR:</b> BUGÜNKÜ İLÇE GEOMETRİLERİ TARİHÎ BAĞLILIKLARA GÖRE BİRLEŞTİRİLMİŞTİR.</div></div>'+
            '<div class="section"><h3>BUGÜNKÜ GEOMETRİYE DENK GELEN YERLER</h3>'+modern.map(x=>'<span class="family">'+esc(x)+'</span>').join('')+'</div>'+
            '<div class="section"><h3>KAYNAK SATIRLARI</h3>'+krows.slice(0,30).map(x=>'<div class="record">'+esc(x.sourceLine)+'</div>').join('')+'</div>'
          );
        });
      }
    }).addTo(baseMap);
    if(historicalLayer.getBounds().isValid())baseMap.fitBounds(historicalLayer.getBounds(),{padding:[22,22],maxZoom:10});
  });
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
    setBtn('modernLayerBtn',true);setBtn('eyaletLayerBtn',false);setBtn('sancakLayerBtn',false);setBtn('kazaLayerBtn',false);
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
  s.textContent='.leaflet-tooltip.histMapLabel{background:#fffdf7ed;border-radius:5px;box-shadow:none;font-weight:900;white-space:nowrap;padding:3px 6px}.leaflet-tooltip.histMapLabel.vilayet{border:2px solid #c21f2f;color:#9f1624;font-size:12px}.leaflet-tooltip.histMapLabel.sancak{border:2px solid #9a6818;color:#79500f;font-size:11px}.leaflet-tooltip.histMapLabel.kaza{border:1px solid #17384e;color:#17384e;font-size:10px}';
  document.head.appendChild(s);
}

addCss();
installControls();
})();