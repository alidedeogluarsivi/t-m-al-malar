(() => {
  'use strict';
  const sanjakStyle = {color:'#285778', dashArray:'7 5', weight:2.7};
  const files = new Map();

  function load(name) {
    if (files.has(name)) return files.get(name);
    const pending = fetch('./historical/nfs/' + name + '.txt')
      .then(async res => {
        if (!res.ok) throw Error('HTTP ' + res.status);
        const encoded = (await res.text()).trim();
        const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
        return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
      }).catch(error => {files.delete(name);throw error;});
    files.set(name, pending);
    return pending;
  }

  function interiorLabelPoint(type, coordinates) {
    const polygons=type==='MultiPolygon'?coordinates:[coordinates];
    let best=null;
    for(const polygon of polygons){
      const outer=polygon[0];
      if(!outer?.length)continue;
      const lats=outer.map(point=>point[1]);
      const south=Math.min(...lats), height=Math.max(...lats)-south;
      for(const fraction of [.5,.3,.7,.15,.85]){
        const lat=south+height*fraction, edges=[];
        for(const ring of polygon){
          for(let i=1;i<ring.length;i++){
            const [x1,y1]=ring[i-1], [x2,y2]=ring[i];
            if((y1>lat)===(y2>lat))continue;
            edges.push(x1+(x2-x1)*(lat-y1)/(y2-y1));
          }
        }
        edges.sort((a,b)=>a-b);
        for(let i=0;i+1<edges.length;i+=2){
          const score=(edges[i+1]-edges[i])*height*(1-Math.abs(fraction-.5));
          if(!best||score>best.score)best={lat,lng:(edges[i]+edges[i+1])/2,score};
        }
      }
    }
    return best;
  }

  function draw(layer, areas, {onSelect, pane} = {}) {
    for (const area of areas) {
      const [level, , sancak, , , type, coordinates] = area;
      if (level !== 1) continue;
      const outline = L.geoJSON({type, coordinates}, {
        pane, interactive:!!onSelect, style:{...sanjakStyle, fillOpacity:onSelect ? .035 : .025}
      });
      if (onSelect) outline.on('click', () => onSelect(area));
      outline.addTo(layer);
      const center = interiorLabelPoint(type, coordinates);
      if (!center) continue;
      const label = document.createElement('span');
      label.textContent = sancak;
      const kind = document.createElement('small');
      kind.textContent = 'SANCAK';
      label.append(kind);
      L.tooltip({permanent:true, direction:'center', interactive:false,
        className:'period-admin-name sancak', offset:[0,4]})
        .setLatLng([center.lat,center.lng]).setContent(label).addTo(layer);
    }
  }
  window.ArchivePeriodMap = {load, draw};
})();
