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
const familySearchLayer = ArchiveFamilySearch.createLayer(map);
const {load} = ArchivePeriodMap;
let metadata = null, active = null, modern = null, searchId = 0;
let periodRecords;
function pairs(values) {
  return [...new Map(values.filter(Boolean).map(name => [norm(name), name])).values()]
    .sort((a,b) => a.localeCompare(b,'tr'));
}
function options(id, values) {
  const input = $(id), old = input.value;
  input.replaceChildren(new Option('Tümü',''), ...pairs(values).map(value => new Option(value,value)));
  if ([...input.options].some(option => option.value === old)) input.value = old;
}
function card(row) {
  const [number,,eyalet,sancak,kaza,historical,il,ilce,place,lon,lat,page,hane,erkek,grade,source,divan] = row;
  const identity = [eyalet,sancak,kaza,divan].filter(Boolean).map(esc).join(' / ');
  const present = [il,ilce,place].filter(Boolean).map(esc).join(' / ');
  const figures = [page&&'Varak / sayfa '+esc(page),hane&&esc(hane)+' hane',erkek&&esc(erkek)+' erkek'].filter(Boolean).join(' · ');
  const condition = grade === 2 ? 'Kullanıcı onaylı eşleşme' : grade === 1 ? 'Konum eşleşmesi' :
    place ? 'Aday veya konumu doğrulanmamış eşleşme' : 'Bugünkü karşılık açık';
  return '<article class="entry"><b>'+esc(historical)+'</b><p>BOA NFS.d.'+number+'</p>'+
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
    [row[6],row[7],row[8], 'NFS.d.'+row[0]].filter(Boolean).map(esc).join(' / ')+'</small>';
}
async function showArea(area) {
  ++searchId;
  const [,eyalet,sancak] = area;
  const tokens=searchId;
  const rows=(await periodRecords).filter(row => norm(row[2])===norm(eyalet) &&
    norm(row[3])===norm(sancak));
  if(tokens!==searchId)return;
  list(sancak+' · '+count(rows.length)+' fihrist kaydı',rows,recordTitle,row=>showRecord(row,true));
}
function draw(fit=false) {
  if(!active)return;
  boundaries.clearLayers();villages.clearLayers();
  const sanjak = norm($('sanjak').value);
  const rows = active.records.filter(row => !sanjak || norm(row[3]) === sanjak);
  const areas = active.areas.filter(([level,,name]) => level === 1 && (!sanjak || norm(name) === sanjak));
  ArchivePeriodMap.draw(boundaries,areas,{onSelect:showArea});
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
  $('status').textContent=count(areas.length)+' sancak sınırı · '+count(rows.length)+' fihrist satırı';
  if(fit){
    const bounds=L.latLngBounds(rows.filter(r=>r[9]!=null&&r[14]).map(r=>[r[10],r[9]]));
    if(bounds.isValid())map.fitBounds(bounds,{padding:[18,18],maxZoom:10});
  }
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
  const value=$('query').value.trim();
  const familyOnly=/^s[üu]lale\s*:/i.test(value);
  const searchText=value.replace(/^s[üu]lale\s*:/i,'').trim();
  const query=norm(searchText);
  familySearchLayer.clearLayers();
  if(!query){++searchId;$('result').replaceChildren();return;}
  const token=++searchId;
  const number=query.match(/^(?:boa\s+)?(?:nfs[.\s]*(?:d[.\s]*)?)?(\d+)$/)?.[1];
  const rows=(await periodRecords).filter(row=>number?row[0]===Number(number):
    norm(row.slice(2,9).join(' ')).includes(query));
  if(token!==searchId)return;
  if(!number){
    try{
      const families=await ArchiveFamilySearch.find(searchText);
      if(token!==searchId)return;
      if(families.length){
        const open=place=>{
          if(place.lat!=null)map.setView([place.lat,place.lng],Math.max(10,map.getZoom()));
          const linked=active.records.filter(row=>row[9]!=null&&
            Math.abs(row[9]-place.lng)<.0001&&Math.abs(row[10]-place.lat)<.0001);
          if(linked.length)showRecord(linked[0],false);
          else $('result').innerHTML='<h2>'+esc(place.name)+'</h2><p>'+esc(place.il)+' / '+esc(place.ilce)+
            '</p><p>Sülale kaydı: '+place.matches.map(esc).join(', ')+'</p>';
        };
        ArchiveFamilySearch.show(familySearchLayer,families,open);
        ArchiveFamilySearch.fit(map,families);
        list(count(families.length)+' yerleşim · Sülale araması',families,place=>
          '<b>'+esc(place.name)+'</b><br><small>'+esc(place.il)+' / '+esc(place.ilce)+' · '+place.matches.map(esc).join(', ')+'</small>',open);
        const hint=document.createElement('p');hint.className='note';
        hint.textContent='Mavi noktalar genel sülale dizinindeki yerleşimlerdir. Sınırlar 1831–1850 dönemini kapsar.';
        $('result').insertBefore(hint,$('result').children[1]);
        if(rows.length&&!familyOnly){
          const switchResults=document.createElement('button');switchResults.type='button';switchResults.textContent='Karye ve kaza sonuçlarını göster';
          switchResults.onclick=()=>list(count(rows.length)+' fihrist kaydı',rows,recordTitle,row=>showRecord(row,true));
          $('result').prepend(switchResults);
        }
        return;
      }
    }catch(error){
      if(token!==searchId)return;
      if(familyOnly){$('result').textContent='Sülale araması açılamadı.';return;}
    }
    if(familyOnly){$('result').textContent='Konumu eşleştirilen sülale kaydı bulunamadı.';return;}
  }
  if(rows.length){list(count(rows.length)+' fihrist kaydı',rows,recordTitle,row=>showRecord(row,true));return;}
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
        $('result').innerHTML='<h2>'+esc(r[2])+'</h2><p>'+r.slice(0,2).filter(Boolean).map(esc).join(' / ')+'</p>'+
          '<p>Günümüz il / ilçe: '+(place||'Karye fihristlerinden henüz belirlenmedi')+
          '</p>'+(candidates?'<p>Bugünkü ad adayları: '+candidates+'</p>':'')+'<p>NFS: '+r[3].map(n=>'NFS.d.'+n).join(', ')+'</p>';
      });
      return;
    }
  }
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
$('query').oninput=()=>{++searchId;familySearchLayer.clearLayers()};
$('points').onchange=()=>draw();
$('sanjak').onchange=()=>draw(true);

(async()=>{
  try{
    const [atlas,areas]=await Promise.all([load('atlas'),load('period-areas')]);
    metadata=atlas;
    active={areas,records:[]};
    periodRecords=Promise.all(Array.from({length:20},(_,i)=>load(String(1831+i))))
      .then(sets=>sets.flatMap(set=>set.records)).catch(error=>{
        console.warn('Karye kayıtları yüklenemedi:',error);
        return [];
      });
    draw();
    $('coverage').textContent=count(metadata.catalogSizes[0])+' yeni NFS satırı ve önceki fon listesindeki '+count(metadata.catalogSizes[1])+
      ' NFS satırı tarandı. 1831–1850 tarihli '+count(metadata.periodRegisters)+' katalog kaydı, '+count(metadata.observations)+
      ' fihrist satırı ve '+count(metadata.mapped)+' konumlu eşleşme var. Çelişkili '+count(metadata.ambiguousPoints)+' nokta-yıl sınır hesabının dışında tutuldu.';
    active.records=await periodRecords;
    options('sanjak',[...areas.filter(area => area[0] === 1).map(area => area[2]), ...active.records.map(row => row[3])]);
    draw();
  }catch(error){$('status').textContent='Arşiv dizini açılamadı: '+error.message;}
})();
