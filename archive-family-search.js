(() => {
  'use strict';
  let index;
  const normalize = name => name.toLocaleLowerCase('tr').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[^a-z0-9]/g,'')
    .replace(/(?:ogullari|ogullary|oglu)$/,'');
  async function find(query) {
    const needle=normalize(query);
    if(needle.length<3)return [];
    if(!index)index=fetch('./geo/archive-family-points.json').then(response=>{
      if(!response.ok)throw Error('Sülale dizini açılamadı');
      return response.json();
    }).then(groups=>groups.flatMap(([il,ilce,rows])=>rows.map(([name,lat,lng,families])=>({
      name,lat,lng,il,ilce,families:ArchiveFamilyAudit.filterNames(families).map(family=>[family,normalize(family)])
    })))).catch(error=>{index=null;throw error});
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
      const label=document.createElement('span');
      label.textContent=place.name+' · '+place.matches.join(', ');
      L.circleMarker([place.lat,place.lng],{pane:'archiveFamilyMatches',radius:6,weight:1.4,color:'#fff',
        fillColor:'#1769ce',fillOpacity:1,bubblingMouseEvents:false})
        .bindTooltip(label).on('click',()=>select(place)).addTo(layer);
    }
  }
  function fit(map, matches) {
    if(matches.length)map.fitBounds(L.latLngBounds(matches.map(place=>[place.lat,place.lng])),
      {padding:[32,32],maxZoom:11,animate:false});
  }
  window.ArchiveFamilySearch = {createLayer,find,show,fit};
})();
