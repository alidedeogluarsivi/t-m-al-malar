'use strict';

const $ = id => document.getElementById(id);
const norm = value => String(value ?? '').toLocaleLowerCase('tr')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
})[char]);
const count = value => Number(value).toLocaleString('tr-TR');
const map = L.map('atlasMap', {preferCanvas:true}).setView([39.4, 34.7], 6);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
const boundaries = L.layerGroup().addTo(map);
const villages = L.layerGroup().addTo(map);
const colors = ['#88403c','#244e76','#136248'];
const files = new Map();
let metadata = null, active = null, modern = null, renderId = 0, searchId = 0;

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

function pairs(values) {
  return [...new Map(values.filter(Boolean).map(name => [norm(name), name])).values()]
    .sort((a,b) => a.localeCompare(b,'tr'));
}
function options(id, values) {
  const input = $(id), old = input.value;
  input.replaceChildren(new Option('Tümü',''), ...pairs(values).map(value => new Option(value,value)));
  if ([...input.options].some(option => option.value === old)) input.value = old;
}
function recordMatches(row) {
  return [['province',2],['sanjak',3],['county',4]].every(([id,col]) =>
    !$(id).value || norm($(id).value) === norm(row[col]));
}
function refreshFilters() {
  options('province',active.records.map(row => row[2]));
  const province = active.records.filter(row => !$('province').value || norm(row[2]) === norm($('province').value));
  options('sanjak',province.map(row => row[3]));
  options('county',province.filter(row => !$('sanjak').value || norm(row[3]) === norm($('sanjak').value)).map(row => row[4]));
}
function card(row) {
  const [number,year,eyalet,sancak,kaza,historical,il,ilce,place,lon,lat,page,hane,erkek,grade,source,divan] = row;
  const identity = [eyalet,sancak,kaza,divan].filter(Boolean).map(esc).join(' / ');
  const present = [il,ilce,place].filter(Boolean).map(esc).join(' / ');
  const figures = [page&&'Varak / sayfa '+esc(page),hane&&esc(hane)+' hane',erkek&&esc(erkek)+' erkek'].filter(Boolean).join(' · ');
  const condition = grade === 2 ? 'Kullanıcı onaylı eşleşme' : grade === 1 ? 'Konum eşleşmesi' :
    place ? 'Aday veya konumu doğrulanmamış eşleşme' : 'Bugünkü karşılık açık';
  return '<article class="entry"><b>'+esc(historical)+'</b><p>BOA NFS.d.'+number+' · '+year+'</p>'+
    (identity?'<p>'+identity+'</p>':'')+(present?'<p>Günümüz: '+present+'</p>':'')+
    (figures?'<p>'+figures+'</p>':'')+'<small>'+condition+' · '+esc(metadata.sources[source])+'</small></article>';
}
function showRecord(row, zoom) {
  ++searchId;
  const related=active?.records.filter(r=>r[9]===row[9]&&r[10]===row[10]&&r[9]!=null)||[];
  const records=[row,...related.filter(r=>r!==row)];
  $('result').innerHTML='<h2>NFS karye kaydı</h2>'+records.slice(0,25).map(card).join('');
  if(zoom && row[9]!=null && row[14])map.setView([row[10],row[9]],Math.max(11,map.getZoom()));
}
function list(title, entries, render, open) {
  $('result').replaceChildren();
  const h=document.createElement('h2');h.textContent=title;
  const ul=document.createElement('ul');ul.className='matches';
  for(const row of entries.slice(0,100)) {
    const li=document.createElement('li'),button=document.createElement('button');
    button.type='button';button.innerHTML=render(row);button.onclick=()=>open(row);li.append(button);ul.append(li);
  }
  $('result').append(h,ul);
  if(entries.length>100){
    let shown=100;const next=document.createElement('button');next.textContent='100 kayıt daha göster';
    next.onclick=()=>{
      for(const row of entries.slice(shown,shown+100)){
        const li=document.createElement('li'), item=document.createElement('button');
        item.type='button';item.innerHTML=render(row);item.onclick=()=>open(row);li.append(item); }
      shown+=100;if(shown>=entries.length)next.remove();
    };
    $('result').append(next);
  }
}
function recordTitle(row) {
  return '<b>'+esc(row[5])+'</b><br><small>'+
    [row[6],row[7],row[8], 'NFS.d.'+row[0]+' · '+row[1]].filter(Boolean).map(esc).join(' / ')+'</small>';
}
function showArea(area) {
  ++searchId;
  const [level,eyalet,sancak,kaza] = area;
  const rows=active.records.filter(row => norm(row[2])===norm(eyalet) &&
    (level===2||norm(row[3])===norm(sancak)) && (level!==0||norm(row[4])===norm(kaza)));
  list((kaza||sancak||eyalet)+' · '+count(rows.length)+' fihrist kaydı',rows,recordTitle,row=>showRecord(row,true));
}
function draw(fit=false) {
  if(!active)return;
  boundaries.clearLayers();villages.clearLayers();
  const level=Number($('level').value);
  const province=$('province').value,sanjak=$('sanjak').value,county=$('county').value;
  const rows=active.records.filter(recordMatches);
  const areas=active.areas.filter(row => row[0]===level &&
    (!province||norm(row[1])===norm(province))&&(!sanjak||level===2||norm(row[2])===norm(sanjak))&&
    (!county||level!==0||norm(row[3])===norm(county)));
  for(const area of areas){
    const [type,eyalet,sancak,kaza,pointCount,geometry,coordinates]=area;
    const name=kaza||sancak||eyalet, label=document.createElement('span');
    label.textContent=name+' · '+pointCount+' konum';
    L.geoJSON({type:geometry,coordinates},{
      style:{color:colors[type],dashArray:'7 4',weight:2,fillOpacity:.10},
      interactive:true
    }).bindTooltip(label,{sticky:true}).on('click',()=>showArea(area)).addTo(boundaries);
  }
  const displayed=new Set();
  for(const row of rows){
    if(!$('points').checked||row[9]==null||!row[14])continue;
    const key=row[9]+'|'+row[10];
    if(displayed.has(key))continue;
    displayed.add(key);
    const label=document.createElement('span');label.textContent=row[5]+' · NFS.d.'+row[0];
    L.circleMarker([row[10],row[9]],{radius:4,color:'#fff',weight:1,fillColor:'#941d37',fillOpacity:.9,bubblingMouseEvents:false})
      .bindTooltip(label).on('click',()=>showRecord(row,false)).addTo(villages);
  }
  $('status').textContent=$('year').value+' · '+count(rows.length)+' fihrist satırı · '+count(areas.length)+' yaklaşık alan';
  if(fit){
    const bounds=L.latLngBounds(rows.filter(r=>r[9]!=null&&r[14]).map(r=>[r[10],r[9]]));
    if(bounds.isValid())map.fitBounds(bounds,{padding:[18,18],maxZoom:10});
  }
}
async function setYear() {
  const token=++renderId;
  ++searchId;
  $('status').textContent='Yılın kayıtları yükleniyor…';
  $('result').replaceChildren();
  try {
    const data=await load($('year').value);
    if(token!==renderId)return;
    active=data;refreshFilters();draw();
  }catch(error){if(token===renderId)$('status').textContent='Yılın kayıtları açılamadı: '+error.message;}
}

function showCatalogue(rows) {
  list(count(rows.length)+' katalog kaydı', rows, row=>'<b>NFS.d.'+row[0]+'</b><br><small>'+
    [row[3],row[4],row[5].join(', '),row[1]].filter(Boolean).map(esc).join(' / ')+'</small>',
  row=>{
    $('result').innerHTML='<h2>BOA NFS.d.'+row[0]+'</h2><article class="entry"><p>'+
      esc(row[1])+' · Miladî '+row[2]+'</p><p>'+esc(row[7])+'</p><small>Katalog dökümü, kaynak satır '+row[6]+'</small></article>';
    const matches=active?.records.filter(r=>r[0]===row[0])||[];
    if(matches.length){
      const button=document.createElement('button');button.textContent=matches.length+' karye kaydını aç';
      button.onclick=()=>list('Defterdeki karyeler',matches,recordTitle,item=>showRecord(item,true));
      $('result').append(button);
    }
  });
}

$('find').onsubmit=async event=>{
  event.preventDefault();
  if(!active)return;
  const query=norm($('query').value).trim();
  if(!query)return;
  const token=++searchId;
  const number=query.match(/^(?:boa\s+)?(?:nfs[.\s]*(?:d[.\s]*)?)?(\d+)$/)?.[1];
  const rows=active.records.filter(row=>number?row[0]===Number(number):
    norm(row.slice(2,9).join(' ')).includes(query));
  if(rows.length){list(count(rows.length)+' fihrist kaydı · '+$('year').value,rows,recordTitle,row=>showRecord(row,true));return;}
  if(number){
    $('result').textContent='Defter kataloğu aranıyor…';
    try{
      const catalogue=(await Promise.all([1831,1836,1841,1846].map(y=>load('defter-'+y)))).flat();
      if(token!==searchId)return;
      const matches=catalogue.filter(r=>r[0]===Number(number));
      if(matches.length){showCatalogue(matches);return;}
    }catch(error){if(token===searchId)$('result').textContent='Defter dizini açılamadı.';return;}
  }else{
    const matches=metadata.kazas.filter(row=>norm([...row.slice(0,3),...row[5].flat(),...(row[6]||[]).flat()].join(' ')).includes(query));
    if(matches.length){
      list(count(matches.length)+' tarihî idarî kayıt',matches,r=>'<b>'+esc(r[2])+'</b><br><small>'+r.slice(0,2).filter(Boolean).map(esc).join(' / ')+'</small>',r=>{
        const place=r[5].map(p=>p.map(esc).join(' / ')).join(' · ');
        const candidates=(r[6]||[]).map(p=>p.map(esc).join(' / ')).join(' · ');
        const years=r[4].join(', ');
        $('result').innerHTML='<h2>'+esc(r[2])+'</h2><p>'+r.slice(0,2).filter(Boolean).map(esc).join(' / ')+'</p>'+
          '<p>Defter yılları: '+years+'</p><p>Günümüz il / ilçe: '+(place||'Karye fihristlerinden henüz belirlenmedi')+
          '</p>'+(candidates?'<p>Bugünkü ad adayları: '+candidates+'</p>':'')+'<p>NFS: '+r[3].map(n=>'NFS.d.'+n).join(', ')+'</p>';
      });
      return;
    }
  }
  $('result').textContent='Diğer yılların fihristleri aranıyor…';
  try{
    const sets=await Promise.all(Array.from({length:20},(_,i)=>load(String(1831+i))));
    if(token!==searchId)return;
    const matches=sets.flatMap(data=>data.records).filter(row=>number?row[0]===Number(number):
      norm(row.slice(2,9).join(' ')).includes(query));
    if(matches.length){list(count(matches.length)+' fihrist kaydı · 1831–1850',matches,recordTitle,row=>showRecord(row,true));return;}
  }catch(error){if(token===searchId)$('result').textContent='Diğer yılların fihristleri açılamadı.';return;}
  $('result').textContent='Bu aramada kayıt bulunamadı.';
};

$('modern').onchange=async()=>{
  if(!$('modern').checked){if(modern)modern.remove();return;}
  try{
    if(!modern){
      const res=await fetch('./geo/districts.geojson');
      if(!res.ok)throw Error(res.status);
      modern=L.geoJSON(await res.json(),{interactive:false,style:{color:'#556b77',weight:1,fill:false}});
    }
    if($('modern').checked)modern.addTo(map).bringToBack();
  }catch(error){$('modern').checked=false;$('status').textContent='Günümüz ilçe sınırları yüklenemedi.';}
};
$('level').onchange=()=>draw();
$('points').onchange=()=>draw();
for(const id of ['province','sanjak','county'])$(id).onchange=()=>{
  if(id==='province')$('sanjak').value='';
  if(id!=='county')$('county').value='';
  refreshFilters();draw(true);
};
$('year').onchange=setYear;

(async()=>{
  try{
    metadata=await load('atlas');
    for(let year=1831;year<=1850;year++)$('year').add(new Option(String(year),String(year)));
    $('year').value='1840';
    $('coverage').textContent=count(metadata.catalogSizes[0])+' yeni NFS satırı ve önceki fon listesindeki '+count(metadata.catalogSizes[1])+
      ' NFS satırı tarandı. 1831–1850 tarihli '+count(metadata.periodRegisters)+' katalog kaydı, '+count(metadata.observations)+
      ' fihrist satırı ve '+count(metadata.mapped)+' konumlu eşleşme var. Çelişkili '+count(metadata.ambiguousPoints)+' nokta-yıl sınır hesabının dışında tutuldu.';
    await setYear();
  }catch(error){$('status').textContent='Arşiv dizini açılamadı: '+error.message;}
})();
