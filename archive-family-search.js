(() => {
  'use strict';
  let index;
  const fold = name => name.toLocaleLowerCase('tr').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[^a-z0-9]/g,'');
  const normalize = name => fold(name).replace(/(?:ogullari|ogullary|oglu)$/,'');
  async function find(query) {
    const needle=normalize(query);
    if(needle.length<3)return [];
    if(!index) {
      const base=fetch('./geo/archive-family-points.json?v=kaza-20261126').then(response=>{
        if(!response.ok)throw Error('Sülale dizini açılamadı');
        return response.json();
      });
      const additions=window.EmlakCensus?.loadAdditions()||Promise.resolve([]);
      index=Promise.all([base,additions]).then(([groups,rows])=>{
        const placeKey = (il,ilce,name) => [il,ilce,name.replace(/\s+(?:mahallesi|köyü)$/iu,'')].map(fold).join('|');
        const places=new Map();
        const add=(il,ilce,name,lat,lng,families)=>{
          const id=placeKey(il,ilce,name),existing=places.get(id);
          const accepted=ArchiveFamilyAudit.filterNames(families);
          if(!accepted.length)return;
          if(existing)for(const family of accepted)existing.families.set(normalize(family),family);
          else places.set(id,{name,lat,lng,il,ilce,families:new Map(accepted.map(family=>[normalize(family),family]))});
        };
        for(const [il,ilce,villages] of groups)for(const [name,lat,lng,families] of villages)add(il,ilce,name,lat,lng,families);
        for(const {il,ilce,koy,konum,sulaleler,eslesme_kesin,tarihi_yerlesim_kaydi} of rows){
          if(!il||!ilce||!koy||eslesme_kesin===false||tarihi_yerlesim_kaydi)continue;
          const [lng,lat]=konum||[null,null];
          add(il,ilce,koy,lat,lng,sulaleler||[]);
        }
        return [...places.values()].map(place=>({...place,families:[...place.families].map(([key,name])=>[name,key])}));
      }).catch(error=>{index=null;throw error});
    }
    const found=(await index).flatMap(({families,...place})=>{
      const matches=families.filter(([,key])=>key.includes(needle)).map(([name])=>name);
      return matches.length?[{...place,matches}]:[];
    });
    if(normalize(ArchiveFamilyAudit.name).includes(needle)){
      for(const {il,ilce,koy,coords} of ArchiveFamilyAudit.records){
        if(!coords)continue;
        const [lat,lng]=coords;
        const existing=found.find(place=>Math.abs(place.lat-lat)<.0001 && Math.abs(place.lng-lng)<.0001 &&
          normalize(place.il)===normalize(il) && normalize(place.ilce)===normalize(ilce));
        if(existing)existing.matches.push(ArchiveFamilyAudit.name);
        else found.push({il,ilce,name:koy,lat,lng,matches:[ArchiveFamilyAudit.name]});
      }
    }
    return found;
  }
  function createLayer(map) {
    map.createPane('archiveFamilyMatches').style.zIndex='550';
    return L.layerGroup().addTo(map);
  }
  function show(layer, matches, select) {
    layer.clearLayers();
    for(const place of matches){
      if(!Number.isFinite(place.lat)||!Number.isFinite(place.lng))continue;
      const label=document.createElement('span');
      label.textContent=place.name+' · '+place.matches.join(', ');
      L.circleMarker([place.lat,place.lng],{pane:'archiveFamilyMatches',radius:6,weight:1.4,color:'#fff',
        fillColor:'#1769ce',fillOpacity:1,bubblingMouseEvents:false})
        .bindTooltip(label).on('click',()=>select(place)).addTo(layer);
    }
  }
  function fit(map, matches) {
    const located=matches.filter(place=>Number.isFinite(place.lat)&&Number.isFinite(place.lng));
    if(located.length)map.fitBounds(L.latLngBounds(located.map(place=>[place.lat,place.lng])),
      {padding:[32,32],maxZoom:11,animate:false});
  }
  window.ArchiveFamilySearch = {createLayer,find,show,fit};
})();
