/* ALİDEDEOĞLU ARŞİVİ - LEAFLET VERİ HARİTASI */
(function(){
  'use strict';
  if(!window.L) return;

  const state={
    map:null,
    provinceLayer:null,
    districtLayer:null,
    villageLayer:null,
    villagePointLayer:null,
    provinceData:null,
    districtData:null,
    manifest:new Set(),
    pointManifest:new Set(),
    currentProvince:null,
    currentDistrict:null,
    archiveIndex:new Map(),
    archive:[]
  };

  function n(s){
    return String(s||'').toLocaleLowerCase('tr-TR')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/ı/g,'i').replace(/ş/g,'s').replace(/ğ/g,'g')
      .replace(/ü/g,'u').replace(/ö/g,'o').replace(/ç/g,'c')
      .replace(/[^a-z0-9]+/g,' ').trim();
  }
  function key(il,ilce,koy){return [n(il),n(ilce),n(koy)].join('|')}
  function archiveRow(il,ilce,koy){
    const direct=state.archiveIndex.get(key(il,ilce,koy));
    if(direct)return direct;
    return state.archive.find(r=>n(r.il)===n(il)&&n(r.ilce)===n(ilce)&&n(r.koy)===n(koy))||null;
  }
  function getJSON(u){return fetch(u,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(u);return r.json()})}
  async function loadArchiveData(){
    if(state.archive.length)return state.archive;
    const r=await fetch('./archive_verified.ndjson?v=20261105-final',{cache:'no-store'});
    if(!r.ok)return [];
    const txt=await r.text();
    state.archive=[];
    txt.split(/\r?\n/).forEach(line=>{
      if(!line.trim())return;
      try{
        const x=JSON.parse(line);
        if(x._summary)return;
        state.archive.push(x);
        if(x.il&&x.ilce&&x.koy)state.archiveIndex.set(key(x.il,x.ilce,x.koy),x);
      }catch(e){}
    });
    return state.archive;
  }

  function provinceStyle(f){
    const name=(f.properties&&f.properties.name)||'';
    const count=window.provinceArchiveCounts&&window.provinceArchiveCounts.get?n(window.provinceArchiveCounts.get(n(name))):0;
    const has = state.archive.some(r=>n(r.il)===n(name));
    return {
      color:has?'#155b3b':'#8c3030',
      weight:has?1.7:1.0,
      fillColor:has?'#8fc5a3':'#f4ece0',
      fillOpacity:has?0.42:0.24
    };
  }
  function districtStyle(f){
    const name=(f.properties&&f.properties.name)||'';
    const has=state.currentProvince?state.archive.some(r=>n(r.il)===n(state.currentProvince.name)&&n(r.ilce)===n(name)):false;
    return {color:has?'#7a5419':'#a77524',weight:has?2:1,fillColor:has?'#e2b75d':'#f3dfb2',fillOpacity:has?.35:.18};
  }
  function villageStyle(f){
    const name=(f.properties&&f.properties.name)||'';
    const has=state.currentProvince&&state.currentDistrict&&archiveRow(state.currentProvince.name,state.currentDistrict.name,name);
    return {color:has?'#155b3b':'#6d6b67',weight:has?2:0.8,fillColor:has?'#6fae87':'#ece8e0',fillOpacity:has?.42:.16};
  }

  function clearLayer(k){
    if(state[k]){state.map.removeLayer(state[k]);state[k]=null}
  }
  function setStatus(t){
    const el=document.getElementById('status');
    if(el)el.textContent=t;
  }
  function setCrumb(t){
    const el=document.getElementById('crumb');
    if(el)el.textContent=t;
  }

  function initBase(){
    const el=document.getElementById('leafletMap');
    if(!el||state.map)return;
    state.map=L.map(el,{
      center:[39.0,35.2],
      zoom:6,
      minZoom:5,
      maxZoom:19,
      zoomControl:true,
      scrollWheelZoom:true,
      doubleClickZoom:true,
      touchZoom:true,
      dragging:true,
      preferCanvas:true
    });

    const osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,
      attribution:'© OpenStreetMap katkıda bulunanlar'
    }).addTo(state.map);

    const light=L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{
      subdomains:'abcd',
      maxZoom:20,
      attribution:'© OpenStreetMap katkıda bulunanlar © CARTO'
    });

    L.control.layers(
      {'SOKAK HARİTASI':osm,'SADE HARİTA':light},
      {},
      {position:'topright',collapsed:true}
    ).addTo(state.map);

    L.control.scale({imperial:false,position:'bottomleft'}).addTo(state.map);
  }

  async function showTurkey(){
    initBase();
    clearLayer('districtLayer'); clearLayer('villageLayer'); clearLayer('villagePointLayer');
    await loadArchiveData();
    if(!state.provinceData) state.provinceData=await getJSON('./provinces-local.json');
    clearLayer('provinceLayer');
    state.currentProvince=null; state.currentDistrict=null;
    state.provinceLayer=L.geoJSON(state.provinceData,{
      style:provinceStyle,
      onEachFeature:function(f,layer){
        const name=(f.properties&&f.properties.name)||'';
        layer.bindTooltip(name,{sticky:true,direction:'top'});
        layer.on('click',()=>showProvince(f));
      }
    }).addTo(state.map);
    state.map.fitBounds(state.provinceLayer.getBounds(),{padding:[10,10]});
    setCrumb('TÜRKİYE');
    setStatus('MAUSLA YAKLAŞIN · İLE TIKLAYIN');
  }

  async function showProvince(feature){
    initBase();
    const p=feature.properties||{};
    const id=p.id||p.code||p.province_id||window.PROVINCE_MAP&&window.PROVINCE_MAP[p.name];
    const name=p.name||'';
    state.currentProvince={id,name};
    state.currentDistrict=null;
    clearLayer('provinceLayer'); clearLayer('districtLayer'); clearLayer('villageLayer'); clearLayer('villagePointLayer');
    if(!state.districtData) state.districtData=await getJSON('./geo/districts.geojson');
    const feats=(state.districtData.features||[]).filter(f=>{
      const pr=f.properties||{};
      return String(pr.parent_id||'')===String(id||'') || (window.PROVINCE_MAP&&String(pr.parent_id||'')===String(window.PROVINCE_MAP[name]||''));
    });
    state.districtLayer=L.geoJSON({type:'FeatureCollection',features:feats},{
      style:districtStyle,
      onEachFeature:function(f,layer){
        const dn=(f.properties&&f.properties.name)||'';
        layer.bindTooltip(dn,{sticky:true,direction:'top'});
        layer.on('click',()=>showDistrict(f));
      }
    }).addTo(state.map);
    if(state.districtLayer.getBounds().isValid())state.map.fitBounds(state.districtLayer.getBounds(),{padding:[20,20],maxZoom:10});
    setCrumb('TÜRKİYE → '+name.toLocaleUpperCase('tr-TR'));
    setStatus(feats.length+' İLÇE · İLÇEYE TIKLAYIN');
    try{
      const ps=document.getElementById('provinceSelect');
      if(ps)ps.value=name;
      if(typeof window.selectProvinceByName==='function')window.selectProvinceByName(name,id);
    }catch(e){}
  }

  async function loadManifests(){
    if(state.manifest.size||state.pointManifest.size)return;
    const [m,p]=await Promise.all([
      getJSON('./geo/manifest.json').catch(()=>({files:[]})),
      getJSON('./geo/points-manifest.json').catch(()=>({files:[]}))
    ]);
    state.manifest=new Set((m.files||[]).map(x=>String(x).replace(/\.geojson$/,'')));
    state.pointManifest=new Set((p.files||[]).map(x=>String(x).replace(/\.geojson$/,'')));
  }

  async function showDistrict(feature){
    initBase();
    await loadManifests();
    const p=feature.properties||{};
    const id=p.id||'';
    const name=p.name||'';
    state.currentDistrict={id,name};
    clearLayer('districtLayer'); clearLayer('villageLayer'); clearLayer('villagePointLayer');

    let shown=false;
    if(state.manifest.has(String(id))){
      try{
        const gj=await getJSON('./geo/villages/'+id+'.geojson');
        state.villageLayer=L.geoJSON(gj,{
          style:villageStyle,
          onEachFeature:function(f,layer){
            const vn=(f.properties&&f.properties.name)||'';
            const row=archiveRow(state.currentProvince.name,name,vn);
            const fam=row&&(row.sulaleler||[]).slice(0,5);
            const html='<b>'+vn+'</b><br>'+state.currentProvince.name+' / '+name+
              (row?'<br><b>ARŞİV KAYDI VAR</b>':'')+
              (fam&&fam.length?'<br>'+fam.map(x=>typeof x==='object'?JSON.stringify(x):x).join(' · '):'');
            layer.bindPopup(html);
            layer.bindTooltip(vn,{sticky:true,direction:'top'});
            layer.on('click',function(){
              if(row && typeof window.showRecord==='function')window.showRecord(row.koy,row,row.ilce,row.il);
            });
          }
        }).addTo(state.map);
        if(state.villageLayer.getBounds().isValid())state.map.fitBounds(state.villageLayer.getBounds(),{padding:[20,20],maxZoom:13});
        shown=true;
      }catch(e){}
    }

    if(!shown && state.pointManifest.has(String(id))){
      try{
        const gj=await getJSON('./geo/points/'+id+'.geojson');
        state.villagePointLayer=L.geoJSON(gj,{
          pointToLayer:function(f,ll){
            const vn=(f.properties&&f.properties.name)||'';
            const row=archiveRow(state.currentProvince.name,name,vn);
            return L.circleMarker(ll,{
              radius:row?7:4,
              color:row?'#155b3b':'#6d6b67',
              weight:row?2:1,
              fillColor:row?'#2f7d55':'#b9b4ab',
              fillOpacity:.85
            });
          },
          onEachFeature:function(f,layer){
            const vn=(f.properties&&f.properties.name)||'';
            const row=archiveRow(state.currentProvince.name,name,vn);
            layer.bindTooltip(vn,{sticky:true,direction:'top'});
            layer.on('click',function(){
              if(row && typeof window.showRecord==='function')window.showRecord(row.koy,row,row.ilce,row.il);
            });
          }
        }).addTo(state.map);
        if(state.villagePointLayer.getBounds().isValid())state.map.fitBounds(state.villagePointLayer.getBounds(),{padding:[20,20],maxZoom:13});
        shown=true;
      }catch(e){}
    }

    if(!shown){
      const rows=state.archive.filter(r=>n(r.il)===n(state.currentProvince.name)&&n(r.ilce)===n(name));
      const markers=[];
      // Konum geometresi yoksa kullanıcıya arşiv kayıtlarını listede bırakır.
      rows.forEach(()=>{});
      state.map.fitBounds(L.geoJSON(feature).getBounds(),{padding:[20,20],maxZoom:12});
    }

    setCrumb('TÜRKİYE → '+state.currentProvince.name.toLocaleUpperCase('tr-TR')+' → '+name.toLocaleUpperCase('tr-TR'));
    setStatus(shown?'KÖYLERE KADAR İNİN · KÖYE TIKLAYIN':'KÖY GEOMETRİSİ YOK · SOL LİSTEDEN KÖY SEÇİN');

    try{
      const ds=document.getElementById('districtSelect');
      if(ds){
        const opt=[...ds.options].find(o=>n(o.textContent)===n(name));
        if(opt)ds.value=opt.value;
      }
      if(typeof window.selectDistrict==='function'){
        const local=(window.districtList||[]).find(x=>String(x.id)===String(id))||{id:id,name:name};
        window.selectDistrict(local,feature);
      }
    }catch(e){}
  }

  window.archiveLeaflet={
    showTurkey,
    showProvinceByName:async function(name){
      if(!state.provinceData)state.provinceData=await getJSON('./provinces-local.json');
      const f=(state.provinceData.features||[]).find(x=>n(x.properties&&x.properties.name)===n(name));
      if(f)showProvince(f);
    },
    showDistrictByName:async function(il,ilce){
      if(!state.provinceData)state.provinceData=await getJSON('./provinces-local.json');
      const pf=(state.provinceData.features||[]).find(x=>n(x.properties&&x.properties.name)===n(il));
      if(!pf)return;
      await showProvince(pf);
      if(!state.districtData)state.districtData=await getJSON('./geo/districts.geojson');
      const id=state.currentProvince.id||window.PROVINCE_MAP&&window.PROVINCE_MAP[il];
      const df=(state.districtData.features||[]).find(f=>{
        const p=f.properties||{};
        return String(p.parent_id||'')===String(id||'')&&n(p.name)===n(ilce);
      });
      if(df)showDistrict(df);
    }
  };

  window.addEventListener('load',function(){
    setTimeout(showTurkey,250);
  });
})();