"""Build 1831–1850 atlas data. Supply the source directory, site checkout and output directory.

Requires openpyxl, pyproj and Shapely 2.1 or later. Publication files encode
deterministic gzip as base64 text for static hosting.
"""
from collections import defaultdict
from pathlib import Path
import base64, gzip, json, re, sys, unicodedata, math
from datetime import date
from functools import lru_cache
import openpyxl
from shapely import MultiPoint, Point, make_valid, set_precision, union_all, voronoi_polygons
from shapely.geometry import mapping
from shapely.ops import transform
from pyproj import Transformer

src, repo, out = [Path(x) for x in sys.argv[1:4]]
out.mkdir(exist_ok=True,parents=True)
def read(p): return json.loads(p.read_text())
def val(x): return str(x).strip() if x is not None else ''
@lru_cache(None)
def norm(s):
    return ''.join(c for c in unicodedata.normalize('NFD',val(s).lower().replace('ı','i')) if not unicodedata.combining(c))
def key(s): return re.sub(r'[^a-z0-9]','',norm(val(s)))
def pk(s): return key(re.sub(r' (koyu|mahallesi)$','',norm(val(s)).strip()))
def nfs(s): return [int(x) for x in re.findall(r'\bNFS\s*[.]?\s*(?:d[.]?)?\s*(\d+)',val(s),re.I)]
def years(s): return [int(x) for x in re.findall(r'\b(?:18[3-4]\d|1850)\b',val(s)) if 1831<=int(x)<=1850]
def greg(s):
    m=re.search(r'([HM])-\s*(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{4})',s)
    if not m: return None
    typ,d,m,y=m.groups();y,m,d=map(int,(y,m,d))
    if typ=='M':return y
    # Tabular Hijri calendar. Preserve and display the catalog date separately.
    jd=d+math.ceil(29.5*(m-1))+(y-1)*354+(3+11*y)//30+1948439-1
    return date.fromordinal(jd-1721425).year
def dump(name,obj):
    payload=(json.dumps(obj,ensure_ascii=False,separators=(',',':'))+'\n').encode()
    encoded=base64.b64encode(gzip.compress(payload,mtime=0)).decode()
    (out/(Path(name).stem+'.txt')).write_text(encoded+'\n')
def split_places(value):
    return [a.strip() for a in re.split(r',|\s+ve\s+',value) if a.strip()]
def alias(s):
    t=key(s.split('(')[0])
    return {'boyabad':'boyabat','uguz':'oguz','uguzugiz':'oguz','oguzuguz':'oguz','sazdagi':'saz',
      'kureihadid':'kureihadid','kureihadit':'kureihadid','kureinuhas':'kureinuhas',
      'kengiri':'cankiri','yozgad':'yozgat','gilingiras':'gelingiras','zunnunabad':'zunnunabad'}.get(t,t)
def kaza_name(s):
    s=re.sub(r'\s+kazas[ıi]$','',val(s),flags=re.I)
    return {'boyabat':'Boyabat','oguz':'Oğuz (Üğüz)','saz':'Saz','cankiri':'Çankırı'}.get(alias(s),s)

catalog={}
source_names=['NFS_D_YENI_10000_KAYIT_TAM_LISTE.txt','NUFUS_DEFTERLERI_FON_FON_TAM_LISTE.txt']
catalog_sizes=[]
for filename in source_names:
    text=(src/filename).read_text()
    rows=list(re.finditer(r'^NFS\.d\.\. (\d+) \| Tarih: (.*?) \| Kaynak satır: (\d+)\s*\n(?:Özet: )?([^\n]+)',text,re.M))
    catalog_sizes.append(len(rows))
    for m in rows:
        no,raw,source_row,summary=m.groups()
        no=int(no)
        lead=re.split(r'\b(?:müslim|müslüman|gayrimüslim|gayr-i|reaya|sakin|mevcut|nüfus defteri)\b',summary,1,flags=re.I)[0]
        e=re.search(r'([^,;]+?)\s+(?:ey[âa]leti|vil[âa]yeti)\b',lead,re.I)
        sa=re.search(r'([^,;]+?)\s+sanca[ğg][ıi]\b',lead,re.I)
        # Parse the units immediately before the district suffix, after the last enclosing level.
        tail=lead[max((m.end() for m in (e,sa) if m),default=0):].strip(', ')
        tail=re.split(r'\b(?:muhassıllığı|nahiyesi|livâsı)\s*,',tail,flags=re.I)[-1].strip(', ')
        kz=re.search(r'(.+?)\s+kazalar[ıi](?:n[ıi]n|nda|na)?\b|(.+?)\s+kazas[ıi](?:n[ıi]n|nda|na)?\b',tail,re.I)
        names=split_places(next(x for x in kz.groups() if x)) if kz else []
        names=[kaza_name(x) for x in names if x and len(x)<75 and not x.startswith('(')]
        record=[no,raw,greg(raw),val(e[1]) if e else '',val(sa[1]) if sa else '',names,int(source_row),summary]
        if no not in catalog or (not catalog[no][2] and record[2]):
            catalog[no]=record
modern_prov={key(n):(plate,n) for plate,n in read(repo/'official-addresses/manifest.json')['provinces'].items()}
modern_prov['afyon']=modern_prov['afyonkarahisar']
districts={}
villages={}
for district in read(repo/'districts-local.json'):
    code=district['plate_code']; name=district['name']
    districts[(code,key(name))]=name
    if modern_prov.get(key(name),('',))[0]==code: districts[(code,'merkez')]=name
    file=repo/'geo/points'/f"{district['id']}.geojson"
    if not file.exists():continue
    choices=defaultdict(set)
    for f in read(file)['features']:
        choices[pk(f['properties']['name'])].add((f['properties']['name'],tuple(f['geometry']['coordinates'])))
    villages[(code,name)]=choices
def locate(il,ilce,koy,coords=None):
    if key(il) not in modern_prov:return None
    code, province=modern_prov[key(il)]
    district=districts.get((code,key(ilce)))
    if not district:return None
    name=val(koy)
    lookup=pk(koy)
    if lookup in ('ilcemerkezi',key(ilce)+'ilcemerkezi',key(ilce)+'merkez','merkez'):lookup=pk(district)
    matches=villages.get((code,district),{}).get(lookup,set())
    xy={point for _,point in matches}
    if len(xy)==1:
        coords=next(iter(xy));name=min(matches)[0]
    if not coords or len(coords)!=2 or not all(isinstance(x,(int,float)) and math.isfinite(x) for x in coords):
        return [province,district,name,None,None]
    if not (25<=coords[0]<=45 and 35<=coords[1]<=43):return [province,district,name,None,None]
    return [province,district,name,*[round(x,5) for x in coords]]
sources={}
def source_id(label):
    if label not in sources:sources[label]=len(sources)
    return sources[label]
observations={}
def emit(number,year,kaza,sancak,eyalet,history,modern,page,hane,erkek,state,provenance,divan=''):
    if not (1831<=year<=1850 and val(history)):return
    kaza=kaza_name(kaza)
    reg=catalog.get(number)
    conflict=False
    if reg:
        if len(reg[5])==1 and (not kaza or 'fihrist' in norm(kaza)):kaza=reg[5][0]
        if key(kaza).endswith('cevre') and len(reg[5])==1 and key(kaza).removesuffix('cevre')==alias(reg[5][0]):
            kaza=reg[5][0]
        if reg[5] and kaza and alias(kaza) not in {alias(name) for name in reg[5]}:
            # Locally explicit administration is preserved, but a conflicting register number
            # cannot establish the missing historical parents or draw a boundary.
            conflict=True
        if not conflict:
            eyalet=eyalet or reg[3]
            sancak=sancak or reg[4]
    if 'fihrist' in norm(kaza) or len(kaza)>95 or key(kaza) in ('belirtilmedi','belirsiz','sancagi','kazasi','livasi'):kaza=''
    status=norm(val(state))
    if conflict:grade=0
    elif 'kullanici' in status and ('onay' in status or 'kabul' in status):grade=2
    elif re.search(r'aday|belirsiz|teyit|suphe|^acik|dogrulanmadi|bekliyor|celiski|divan cevresi',status):grade=0
    elif modern and modern[3] is not None:grade=1
    else:grade=0
    ident=(number,year,key(kaza),key(history),val(page), tuple(modern[:3]) if modern else ())
    row=[number,year,eyalet,sancak,kaza,val(history),*(modern or ['', '', '',None,None]),val(page),val(hane),val(erkek),grade,source_id(provenance),val(divan)]
    old=observations.get(ident)
    if not old or (grade,sum(bool(x) for x in row[11:14]))>(old[14],sum(bool(x) for x in old[11:14])):
        observations[ident]=row

for p in sorted(set(repo.glob('archive_*.ndjson'))|set((repo/'catalog').glob('*.ndjson'))):
    if p.name=='sulale_tum_arsiv.ndjson':continue
    for line in p.open():
        if not line.strip():continue
        row=json.loads(line)
        il=row.get('bugunku_il') or row.get('il'); ilce=row.get('bugunku_ilce') or row.get('ilce')
        koy=row.get('bugunku_koy') or row.get('koy'); location=locate(il,ilce,koy,row.get('konum'))
        definitions=row.get('defterler') or ([row] if row.get('defter') else [])
        for d in definitions:
            if not isinstance(d,dict):continue
            for number in nfs(d.get('defter')):
                selected=years(d.get('yil') or row.get('yil'))
                if not selected:continue
                if len(selected)>1:
                    selected=[catalog[number][2]] if number in catalog and catalog[number][2] in selected else []
                flags=' '.join(val(v) for v in [row.get('yerlesim_eslesme_durumu'),row.get('eslesme_durumu'),d.get('eslesme_durumu'),d.get('kaynak_eslesme_durumu')])
                if row.get('eslesme_kesin') is False:flags='ADAY '+flags
                if not (koy or d.get('kayit_adi') or row.get('tarihi_karye')):continue
                for y in selected:
                    emit(number,y,d.get('tarihi_kaza') or row.get('tarihi_kaza'),d.get('sancak') or row.get('sancak') or '',d.get('eyalet') or row.get('eyalet') or '',
                         d.get('kayit_adi') or d.get('tarihi_ad') or row.get('tarihi_karye') or koy,location,d.get('varak') or d.get('sayfa'),d.get('hane'),d.get('erkek'),flags,p.name,d.get('divan'))

def sheet(prefix,name):
    files=sorted(src.glob(prefix+'*.xlsx'))
    if not files:return []
    wb=openpyxl.load_workbook(files[0],read_only=True,data_only=True)
    if name not in wb.sheetnames:return []
    rows=wb[name].values;next(rows)
    return [(list(r),files[0].name) for r in rows]

for r,p in sheet('AZDAVAY_DADAY_SEYDILER_AGLI','KÖY EŞLEŞMELERİ'):
    nums=nfs(r[0])
    if not nums or not isinstance(r[1],int):continue
    coords=[r[15],r[14]] if 'temsil' not in norm(val(r[13])) else None
    location=locate('Kastamonu',r[9],r[10],coords)
    emit(nums[0],r[1],r[4],'','',r[6],location,r[3],r[7],r[8],r[12],p,r[5])
for r,p in sheet('ARAC_1840_196_KABUL','196 ANA NFS KAYDI'):
    if not isinstance(r[2],int):continue
    emit(r[2],1840,r[0],'','',r[5],locate(r[8],r[9],r[10]),r[3],r[6],r[7],r[12],p,r[4])
for r,p in sheet('SIVAS_TUM_NFS','EK NFS HANE ERKEK'):
    if not nfs(r[2]) or not isinstance(r[3],int):continue
    emit(nfs(r[2])[0],r[3],r[1],'','',r[5],locate('Sivas',r[8],r[9]),r[4],r[6],r[7],r[10],p)
for r,p in sheet('Sungurlu_1840_1841_1850_Tekrar','108 KÖY KARŞILAŞTIRMA'):
    for i,n,y,k in ((7,1949,1841,18),(11,2072,1850,19)):
        if not r[i] or not r[k]:continue
        flag='ADAY' if (r[25] or re.search(r'aday|suphe|celiski',norm(val(r[17])))) else r[17]
        emit(n,y,r[k],'','',r[i],locate('Çorum','Sungurlu',r[1]),r[i+1],r[i+2],r[i+3],flag,p)
rumeli=read(repo/'geo/rumeli_current_map.json')['records']
for r,p in sheet('ZARI_1845_PINARBASI','1845 FİHRİSTİ'):
    if not isinstance(r[0],int):continue
    linked=r[7]
    location=locate('Kastamonu','Pınarbaşı',linked) if linked and r[9]!='İLÇE DIŞI' else None
    emit(965,1845,'Zarı','Kastamonu','',r[12] or r[3],location,r[1],r[4],r[5],r[9],p,r[13] or r[2])
for tab,number,year,sancak,eyalet,kaza in (
    ('DRAMA',4550,1839,'Drama','','Drama'),
    ('aydosYenipazar1834',6606,1834,'Varna','Silistre',''),
    ('krılabd',6473,1840,'Silistre','','Kirilabad')):
    for row,p in sheet('RUMEL',tab):
        if len(row)<10:continue
        for i in (0,5):
            group,page,name,hane,erkek=row[i:i+5]
            if not isinstance(page,int) or not name:continue
            emit(number,year,kaza or group,sancak,eyalet,name,None,page,hane,erkek,'',p)
for row,p in sheet('RUMEL','Sayfa2'):
    if len(row)<11 or not isinstance(row[6],int) or not isinstance(row[7],int) or 'nfs' not in norm(val(row[0])):continue
    emit(row[7],row[6],row[3],row[2],row[1],row[5],None,row[8],row[9],row[10],'',p,row[4])
for record in rumeli:
    h=record['historical']; m=record.get('current',{})
    coord=m.get('coordinates')
    refs=record.get('defter') or []
    if not isinstance(coord,list) or len(refs)!=len(h.get('yillar',[])) or not refs:continue
    historical=h.get('admin_1830_1850',{})
    for token in record.get('archive_docs',[]):
        matched_year=years(token)
        if not matched_year:continue
        year=matched_year[0]
        for value in refs:
            reg=catalog.get(int(value))
            if not reg or reg[2]!=year:continue
            emit(int(value),year,h.get('kaza'),historical.get('sancak',''),historical.get('eyalet',''),h['yer'][0],
                 [m['country'],m.get('municipality',''),m['settlement'],coord[1],coord[0]],None,None,None,'','Rumeli yerleşim dizini')

# Historical units share geometry only by union of their constituent kaza evidence areas.
project=Transformer.from_crs('EPSG:4326','EPSG:3035',always_xy=True).transform
unproject=Transformer.from_crs('EPSG:3035','EPSG:4326',always_xy=True).transform
ambiguous=set()
by_year=defaultdict(list)
kaza_index={}
parent_evidence=defaultdict(set)
for row in observations.values():
    if row[2] and row[3] and row[4] and row[14]:
        parent_evidence[row[1],alias(row[4])].add((row[2],row[3]))
for row in observations.values():
    if not row[4] or not row[14] or (row[2] and row[3]):continue
    candidates={(alias(e),alias(s)):(e,s) for e,s in parent_evidence[row[1],alias(row[4])]
                if (not row[2] or alias(row[2])==alias(e)) and (not row[3] or alias(row[3])==alias(s))}
    if len(candidates)==1:
        e,s=next(iter(candidates.values()));row[2]=row[2] or e;row[3]=row[3] or s
for row in sorted(observations.values(),key=lambda r:(r[1],r[2],r[3],r[4],r[0],r[5])):
    by_year[row[1]].append(row)
    if not row[4]:continue
    ident=tuple(alias(x) for x in row[2:5]);entry=kaza_index.setdefault(ident,[row[2],row[3],row[4],set(),set(),set()])
    entry[3].add(row[0]);entry[4].add(row[1])
    if row[6] and row[7] and row[14]:entry[5].add((row[6],row[7]))
for n,d,y,e,sa,names,_,_ in catalog.values():
    if y not in range(1831,1851):continue
    for k in names:
        ident=tuple(alias(x) for x in [e,sa,k])
        item=kaza_index.setdefault(ident,[e,sa,k,set(),set(),set()]);item[3].add(n);item[4].add(y)
def shape(geom):
    def coordinates(x):
        return [round(q,5) for q in x] if isinstance(x[0],(float,int)) else [coordinates(q) for q in x]
    geom=polygon_only(set_precision(make_valid(transform(unproject,geom.simplify(260,preserve_topology=True))),0.00001))
    return [geom.geom_type,coordinates(mapping(geom)['coordinates'])]
def polygon_only(geom):
    if geom.geom_type in ('Polygon','MultiPolygon'):return geom
    polygons=[g for g in getattr(geom,'geoms',[]) if g.geom_type in ('Polygon','MultiPolygon')]
    return union_all(polygons)

coverage={}
for y in range(1831,1851):
    rows=by_year[y]
    claims=defaultdict(dict)
    groups=defaultdict(set)
    labels={}
    for row in rows:
        if not (row[4] and row[9] is not None and row[14]):continue
        group=tuple(alias(x) for x in row[2:5])
        labels[group]=row[2:5]
        point=tuple(round(x) for x in project(row[9],row[10]))
        claims[point][group]=max(claims[point].get(group,0),row[14])
    owners={}
    for point, options in claims.items():
        strongest=max(options.values());choices=[k for k,v in options.items() if v==strongest]
        if len(choices)==1:
            owners[point]=choices[0];groups[choices[0]].add(point)
        else:ambiguous.add((y,point))
    areas=[]
    parent=defaultdict(list)
    if len(owners)>=3:
        cells=voronoi_polygons(MultiPoint(list(owners)),ordered=True)
        by_group=defaultdict(list)
        for i,point in enumerate(owners):by_group[owners[point]].append(cells.geoms[i])
        for group, points in sorted(groups.items()):
            if len(points)<3:continue
            hull=MultiPoint(list(points)).convex_hull
            if hull.geom_type!='Polygon' or hull.area<1500000:continue
            # A bounded interpolation: keep paths within 12 km of an observed settlement.
            footprint=hull.buffer(2200).intersection(union_all([Point(p).buffer(12000) for p in points]))
            geom=polygon_only(make_valid(footprint.intersection(union_all(by_group[group]))))
            if geom.is_empty:continue
            eyalet,sancak,kaza=labels[group]
            areas.append([0,eyalet,sancak,kaza,len(points),*shape(geom)])
            if sancak:parent[(1,group[0],group[1])].append((eyalet,sancak,geom,len(points)))
            if eyalet:parent[(2,group[0],'')].append((eyalet,'',geom,len(points)))
    for (level,_,_),pieces in sorted(parent.items()):
        eyalet,sancak,*_=pieces[0]
        geom=polygon_only(make_valid(union_all([g[2] for g in pieces])))
        if not geom.is_empty:areas.append([level,eyalet,sancak,'',sum(v[3] for v in pieces),*shape(geom)])
    mapped=sum(r[9] is not None and r[14]>0 for r in rows)
    coverage[y]=[len(rows),mapped,sum(a[0]==0 for a in areas),sum(a[0]==1 for a in areas),sum(a[0]==2 for a in areas)]
    dump(f'{y}.json',{'areas':areas,'records':rows})

# Period-only register data retains original dates and catalog source row.
period=[r for r in catalog.values() if r[2] in range(1831,1851)]
for start in (1831,1836,1841,1846):
    dump(f'defter-{start}.json',[r for r in sorted(period) if start<=r[2]<start+5])
name_candidates=defaultdict(set)
recorded=read(repo/'geo/osmanli_current_map.json')['by_district']
for entries in recorded.values():
    for entry in entries:
        if not any(line.startswith('Kazâ') and years(line) for line in entry.get('kayitlar',())):continue
        current=entry.get('bugun',{})
        if current.get('il') and current.get('ilce'):
            name_candidates[alias(entry['osmanli_adi'])].add((current['il'],current['ilce']))
lookup=sorted([[*item[:3],sorted(item[3]),sorted(item[4]),sorted(item[5]),
                sorted(name_candidates.get(ident[2],set())) if not item[5] else []]
               for ident,item in kaza_index.items() if ident[2] not in {'sancagi','kazasi','livasi'}],
              key=lambda r:(key(r[0]),key(r[1]),key(r[2])))
dump('atlas.json',{'catalogSizes':catalog_sizes,'uniqueCatalog':len(catalog),'periodRegisters':len(period),'observations':len(observations),
 'mapped':sum(r[9] is not None and r[14]>0 for r in observations.values()),'sources':list(sources),'coverage':coverage,
 'ambiguousPoints':len(ambiguous),'kazas':lookup})
print(catalog_sizes,len(catalog),len(period),len(observations),len(lookup),len(ambiguous));print(coverage)
