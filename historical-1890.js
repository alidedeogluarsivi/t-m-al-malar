/* ALİDEDEOĞLU ARŞİVİ — TARİHÎ OSMANLI İDARÎ KATMANI
   Sınırlar: R. Huber 1899 idarî haritası esas alınarak elle sayısallaştırılmış
   tarihî kaza poligonları (Amasyalı HGIS, c. 1893–1914).
   Vilâyet ve sancak sınırları bu gerçek kaza poligonlarının birleşiminden üretilir. */
(function(){
'use strict';

const HIST_GEO='./historical/kazas_boundaries_1899.geojson?v=20261105';
let historicalLayer=null;
let historicalData=null;
let histSelection={vilayet:null,sancak:null};

function hclean(s){return String(s||'').replace(/\s+/g,' ').trim()}
function hnorm(s){return hclean(s).toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[ıİ]/g,'i').replace(/[şŞ]/g,'s').replace(/[ğĞ]/g,'g').replace(/[üÜ]/g,'u').replace(/[öÖ]/g,'o').replace(/[çÇ]/g,'c').replace(/[^a-z0-9]+/g,'')}
function hesc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]})}
function stripKaza(s){return hclean(s).replace(/\s+kaza$/i,'').trim()}
function ensureMap(){if(typeof initBaseMap==='function')initBaseMap();return window.L&&baseMap}
async function loadHistoricalData(){
  if(historicalData)return historicalData;
  historicalData=await getJSON(HIST_GEO);
  return historicalData
}
function clearHistoricalLayer(){
  if(historicalLayer&&baseMap){baseMap.removeLayer(historicalLayer);historicalLayer=null}
}
function setButtons(mode){
  ['modernLayerBtn','eyaletLayerBtn','sancakLayerBtn','kazaLayerBtn'].forEach(function(id){
    const e=document.getElementById(id);if(e)e.classList.remove('active')
  });
  const id=mode==='modern'?'modernLayerBtn':mode==='vilayet'?'eyaletLayerBtn':mode==='sancak'?'sancakLayerBtn':'kazaLayerBtn';
  const e=document.getElementById(id);if(e)e.classList.add('active')
}
function histInfo(html){
  const box=document.getElementById('histInfo');if(!box)return;
  box.innerHTML=html;box.classList.add('show')
}
function sourceNote(){
  return '<small>KAYNAK SINIRLARI: R. HUBER 1899 OSMANLI İDARÎ HARİTASI ÜZERİNDEN SAYISALLAŞTIRILMIŞ TARİHÎ KAZA POLİGONLARI · AMASYALI HGIS. DÖNEM: 1893–1914 CİVARI.</small>'
}
function featureGroup(fc,field){
  return {
    type:'FeatureCollection',
    features:(fc.features||[]).map(function(f){
      const x=JSON.parse(JSON.stringify(f));
      const p=x.properties||{};
      x.properties=Object.assign({},p,{_histGroup:hclean(p[field]||'')});
      return x
    }).filter(function(f){return f.properties._histGroup})
  }
}
function dissolveBy(fc,field){
  const grouped=featureGroup(fc,field);
  if(!window.turf||!grouped.features.length)return grouped;
  try{return turf.dissolve(grouped,{propertyName:'_histGroup'})}
  catch(e){return grouped}
}
function histLabel(layer,name,cls){
  if(!name)return;
  layer.bindTooltip(name,{permanent:true,direction:'center',className:'histMapLabel '+cls,opacity:1})
}
function fit(layer,maxZoom){
  try{const b=layer.getBounds();if(b&&b.isValid())baseMap.fitBounds(b,{padding:[18,18],maxZoom:maxZoom||7})}catch(e){}
}
function rowsFor(data,vilayet,sancak){
  return (data.features||[]).filter(function(f){
    const p=f.properties||{};
    if(vilayet&&hnorm(p.Vilayet)!==hnorm(vilayet))return false;
    if(sancak&&hnorm(p.Sanjak)!==hnorm(sancak))return false;
    return true
  })
}
function renderVilayets(){
  if(!ensureMap())return;
  loadHistoricalData().then(function(data){
    clearHistoricalLayer();
    setButtons('vilayet');
    histSelection={vilayet:null,sancak:null};
    const fc=dissolveBy(data,'Vilayet');
    historicalLayer=L.geoJSON(fc,{
      pane:'overlayPane',
      style:{color:'#b51e2e',weight:3.6,fillColor:'#b51e2e',fillOpacity:.06,dashArray:'9 5',opacity:1},
      onEachFeature:function(f,l){
        const name=(f.properties&&f.properties._histGroup)||'';
        histLabel(l,name.toLocaleUpperCase('tr-TR')+' VİLÂYETİ','vilayet');
        l.on('click',function(){
          histSelection.vilayet=name;histSelection.sancak=null;
          const kazas=rowsFor(data,name,null);
          const sancaks=[...new Set(kazas.map(function(x){return hclean((x.properties||{}).Sanjak)}).filter(Boolean))];
          histInfo('<b>'+hesc(name.toLocaleUpperCase('tr-TR'))+' VİLÂYETİ</b><br>'+sancaks.length+' SANCAK · '+kazas.length+' KAZA<br>'+sourceNote());
          renderSancaks(name)
        })
      }
    }).addTo(baseMap);
    fit(historicalLayer,6);
    histInfo('<b>1899 OSMANLI İDARÎ SINIRLARI</b><br>VİLÂYET SINIRLARI GERÇEK TARİHÎ KAZA POLİGONLARINDAN ÜRETİLDİ. BİR VİLÂYETE TIKLAYIN → SANCAKLAR AÇILSIN.<br>'+sourceNote())
  })
}
function renderSancaks(vilayet){
  if(!ensureMap())return;
  loadHistoricalData().then(function(data){
    clearHistoricalLayer();
    setButtons('sancak');
    const rows=rowsFor(data,vilayet,null);
    const fc=dissolveBy({type:'FeatureCollection',features:rows},'Sanjak');
    historicalLayer=L.geoJSON(fc,{
      style:{color:'#a06c15',weight:3.2,fillColor:'#d6a13a',fillOpacity:.08,opacity:1},
      onEachFeature:function(f,l){
        const name=(f.properties&&f.properties._histGroup)||'';
        histLabel(l,name.toLocaleUpperCase('tr-TR')+' SANCAĞI','sancak');
        l.on('click',function(){
          histSelection.vilayet=vilayet;histSelection.sancak=name;
          const kazas=rowsFor(data,vilayet,name);
          histInfo('<b>'+hesc(vilayet.toLocaleUpperCase('tr-TR'))+' VİLÂYETİ → '+hesc(name.toLocaleUpperCase('tr-TR'))+' SANCAĞI</b><br>'+kazas.length+' KAZA<br>'+sourceNote());
          renderKazas(vilayet,name)
        })
      }
    }).addTo(baseMap);
    fit(historicalLayer,8)
  })
}
function renderKazas(vilayet,sancak){
  if(!ensureMap())return;
  loadHistoricalData().then(function(data){
    clearHistoricalLayer();
    setButtons('kaza');
    const rows=rowsFor(data,vilayet,sancak);
    historicalLayer=L.geoJSON({type:'FeatureCollection',features:rows},{
      style:{color:'#17384e',weight:2.1,fillColor:'#17384e',fillOpacity:.045,opacity:1},
      onEachFeature:function(f,l){
        const p=f.properties||{};
        const name=stripKaza(p.KazaName||'');
        histLabel(l,name.toLocaleUpperCase('tr-TR')+' KAZASI','kaza');
        l.on('click',function(){
          const body='<div class="section"><h3>TARİHÎ İDARÎ HİYERARŞİ</h3><div class="record"><strong>VİLÂYET:</strong> '+hesc(p.Vilayet||'')+'<br><strong>SANCAK:</strong> '+hesc(p.Sanjak||'')+'<br><strong>KAZA:</strong> '+hesc(name)+'</div></div><div class="section"><h3>SINIR KAYNAĞI</h3><div class="notice">R. HUBER 1899 OSMANLI İDARÎ HARİTASI ESAS ALINARAK SAYISALLAŞTIRILMIŞ TARİHÎ KAZA POLİGONU. 1893 NÜFUS COĞRAFYASI İLE UYUMLANDIRILMIŞTIR.</div></div>';
          if(typeof openInfoPanel==='function')openInfoPanel(name+' KAZASI',(p.Vilayet||'')+' VİLÂYETİ / '+(p.Sanjak||'')+' SANCAĞI',body)
        })
      }
    }).addTo(baseMap);
    fit(historicalLayer,10)
  })
}
function installControls(){
  const modern=document.getElementById('modernLayerBtn');
  const vil=document.getElementById('eyaletLayerBtn');
  const san=document.getElementById('sancakLayerBtn');
  const kaz=document.getElementById('kazaLayerBtn');
  const note=document.querySelector('.histPeriodNote');
  if(vil)vil.textContent='1899 VİLÂYET';
  if(note)note.textContent='1899 TARİHÎ İDARÎ KATMAN · KAZA SINIRLARI R. HUBER HARİTASI ÜZERİNDEN SAYISALLAŞTIRILMIŞTIR.';
  if(modern)modern.onclick=function(){
    clearHistoricalLayer();setButtons('modern');histSelection={vilayet:null,sancak:null};
    const box=document.getElementById('histInfo');if(box)box.classList.remove('show')
  };
  if(vil)vil.onclick=renderVilayets;
  if(san)san.onclick=function(){
    if(histSelection.vilayet)renderSancaks(histSelection.vilayet);
    else {renderVilayets();histInfo('<b>ÖNCE VİLÂYETE TIKLAYIN.</b><br>SEÇTİĞİNİZ VİLÂYETİN TARİHÎ SANCAKLARI AÇILACAK.<br>'+sourceNote())}
  };
  if(kaz)kaz.onclick=function(){
    if(histSelection.vilayet&&histSelection.sancak)renderKazas(histSelection.vilayet,histSelection.sancak);
    else histInfo('<b>ÖNCE VİLÂYET → SANCAK SEÇİN.</b><br>SONRA TARİHÎ KAZA SINIRLARI AÇILACAK.')
  }
}
function addCss(){
  const s=document.createElement('style');
  s.textContent='.leaflet-tooltip.histMapLabel{background:#fffdf7f2;border-radius:5px;box-shadow:0 2px 8px #0002;font-weight:900;white-space:nowrap;padding:3px 6px}.leaflet-tooltip.histMapLabel.vilayet{border:2px solid #b51e2e;color:#8f1220;font-size:12px}.leaflet-tooltip.histMapLabel.sancak{border:2px solid #a06c15;color:#75500d;font-size:11px}.leaflet-tooltip.histMapLabel.kaza{border:1px solid #17384e;color:#17384e;font-size:9px}';
  document.head.appendChild(s)
}
addCss();
installControls();
})();

/* İlçe bazlı toplu PDF/Excel çalışmalarındaki sülaleleri köy kartlarına bindir. */
(function(){
  const OVERLAY='./catalog/district_family_overlay.json?v=20261105-04';
  function sn(s){try{return searchNorm(s)}catch(e){return String(s||'').toLocaleLowerCase('tr-TR')}}
  function nn(s){try{return norm(s)}catch(e){return String(s||'').toLocaleLowerCase('tr-TR')}}
  async function applyDistrictFamilyOverlay(){
    try{
      if(typeof archive==='undefined'||!archive||!archive.length){setTimeout(applyDistrictFamilyOverlay,300);return}
      const ov=await getJSON(OVERLAY);
      const cards=(ov&&ov.cards)||{};
      let changed=0;
      archive.forEach(function(r){
        const o=cards[[r.il,r.ilce,r.koy].join('|')];
        if(!o)return;
        r.sulaleler=r.sulaleler||[];
        const have=new Set(r.sulaleler.map(function(x){return sn(typeof x==='object'?JSON.stringify(x):x)}));
        (o.families||[]).forEach(function(fam){
          const fk=sn(fam);
          if(fk&&!have.has(fk)){r.sulaleler.push(fam);have.add(fk);changed++}
        });
        r.defterler=r.defterler||[];
        (o.defterler||[]).forEach(function(d){
          const sig=nn(JSON.stringify([d.defter,d.yil,d.tur,d.tarihi_kaza,d.tarihi_ad]));
          const exists=r.defterler.some(function(x){
            return nn(JSON.stringify([x.defter,x.yil,x.tur,x.tarihi_kaza||x.kaza,x.tarihi_ad||x.tarihi_karye||x.karye]))===sig
          });
          if(!exists)r.defterler.push(d)
        })
      });
      if(changed&&typeof loadArchive==='function'){
        archiveIndex=new Map();familyIndex=new Map();provinceArchiveCounts=new Map();
        const provinceSeen=new Map();
        archive.forEach(function(r){
          const k=key(r.il,r.ilce,r.koy);
          if(!archiveIndex.has(k))archiveIndex.set(k,[]);
          archiveIndex.get(k).push(r);
          (r.sulaleler||[]).forEach(function(fam){
            const fk=sn(typeof fam==='object'?JSON.stringify(fam):fam);
            if(!fk)return;
            if(!familyIndex.has(fk))familyIndex.set(fk,[]);
            familyIndex.get(fk).push(r)
          });
          const pk=nn(canonicalProvince(r.il||''));
          if(pk){
            if(!provinceSeen.has(pk))provinceSeen.set(pk,new Set());
            provinceSeen.get(pk).add(nn(r.ilce)+'|'+nn(r.koy))
          }
        });
        provinceSeen.forEach(function(set,pk){provinceArchiveCounts.set(pk,set.size)});
        try{
          const famCount=new Set();
          archive.forEach(function(r){(r.sulaleler||[]).forEach(function(x){famCount.add(sn(typeof x==='object'?JSON.stringify(x):x))})});
          const el=document.getElementById('familyStat');if(el)el.textContent=famCount.size.toLocaleString('tr-TR')
        }catch(e){}
        try{renderPreview()}catch(e){}
      }
    }catch(e){console.warn('İlçe sülale katmanı yüklenemedi',e)}
  }
  applyDistrictFamilyOverlay();
})();
