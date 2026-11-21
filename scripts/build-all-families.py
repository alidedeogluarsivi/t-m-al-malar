#!/usr/bin/env python3
"""Compile all checked-in NFS/TMT family names to a single, source-grounded search feed.
Do not invent locality for any row. Distinct conflicting locality records remain distinct.
"""
import json
import gzip
from family_stats import family_totals
from collections import Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "catalog/sulale_source_manifest.json"
# Full rebuild: catalog includes the unresolved archival family import as well.
OUT = ROOT / "catalog/sulale_tum_arsiv.ndjson"
REPORT = ROOT / "catalog/sulale_tum_arsiv_rapor.json"
EMPTY = {"", "-", "BELİRSİZ", "BİLİNMİYOR", "NULL", "YOK", "NONE"}
def txt(x):
    return " ".join(str(x or "").split()).strip() if not isinstance(x, (list,dict)) else ""
def get(o, keys):
    for k in keys:
        val=txt(o.get(k))
        if val:return val
    return ""
def name_ok(n):
    return bool(n) and n.upper() not in EMPTY and len(n)<130
def families(o):
    names=[]
    for x in o.get("sulaleler",[]) if isinstance(o.get("sulaleler"),list) else []:
        n=txt(x) if isinstance(x,str) else get(x,["sulale","ad","name"]) if isinstance(x,dict) else ""
        if name_ok(n): names.append(n)
    n=get(o,["SÜLALE ADI (STANDART)","STANDART SÜLALE ADI","sulale","sulale_adi","SÜLALE","sülale"])
    if name_ok(n): names.append(n)
    for h in o.get("haneler",[]) if isinstance(o.get("haneler"),list) else []:
        if isinstance(h,dict):
            n=get(h,["sulale","sülale","sulale_adi","sulale_adi_standart"])
            if name_ok(n): names.append(n)
    return list(dict.fromkeys(names))
def first_defter(o):
    defs=o.get("defterler")
    if isinstance(defs,list):
        return ", ".join(dict.fromkeys(txt(d.get("defter")) for d in defs if isinstance(d,dict) and txt(d.get("defter"))))
    return get(o,["DEFTER NO","DEFTER NUMARASI","defter"])
def first_year(o):
    defs=o.get("defterler")
    if isinstance(defs,list):
        for d in defs:
            if isinstance(d,dict) and txt(d.get("yil")):return txt(d["yil"])
    return get(o,["DEFTER YILI","YIL","yil"])
def first_hane(o):
    return get(o,["HANE NO","hane_no"])
def corrupt_place(value):
    x=txt(value).upper().replace(" ","")
    return x in {"YL","DYL","YDL","YLL","YLI","YIL","Y"} or (len(x)<=3 and x.isalpha() and x not in {"ADA","OVA"})
def is_candidate(o, il, ilce, koy):
    if not all([il,ilce,koy]) or any(s.upper() in EMPTY for s in [il,ilce,koy]):return True
    if corrupt_place(koy) or corrupt_place(ilce):return True
    check=get(o,["EŞLEŞME DURUMU","DOĞRULAMA","yerlesim_eslesme_durumu","eslesme_durumu"])
    if any(x in check.upper() for x in ["ADAY","BELİRSİZ","KONTROL","ŞÜPHE","BEKLİYOR","DOĞRULANMADI"]):return True
    if any(any(t in txt(x).upper() for t in ["EŞLEŞMESİ KONTROL EDİLECEK","GÜNCEL ADRES DOĞRULAMASI","GÜNCEL YERLEŞİM EŞLEŞMESİ DOĞRULANMADI","AİDİYETİ DOĞRULANMADI","KONTROL BEKLİYOR","EŞLEŞME BEKLİYOR"]) for x in (o.get("durumlar") or []) if isinstance(x,str)):return True
    if "TARİHÎ KAYIT" in koy.upper() and "BEKLİYOR" in koy.upper():return True
    return False
seen={}
records=[]
report={"files":{},"source_rows":0,"family_mentions":0,"export_rows":0,"candidate":0,"source_missing":[]}
paths=json.loads(MANIFEST.read_text(encoding="utf-8")).get("paths",[])
for rel in paths:
    p=ROOT/rel
    if not p.is_file():
        report["source_missing"].append(rel)
        continue
    file_count=0
    for lineno,line in enumerate(p.read_text(encoding="utf-8-sig").splitlines(),1):
        if not line.strip():continue
        try:o=json.loads(line)
        except json.JSONDecodeError:continue
        if not isinstance(o,dict) or "_summary" in o:continue
        report["source_rows"]+=1
        names=families(o)
        if not names:continue
        il=get(o,["İL","il","bugunku_il"])
        ilce=get(o,["İLÇE","ilce","bugunku_ilce"])
        koy=get(o,["KÖY","KÖY/KARYE/MAHALLE","koy","bugunku_koy"])
        child=get(o,["KÖY ALTI YERLEŞİMİ","KÖY ALTI","BAĞLI MAHALLE","koy_alti_yerlesimi","koy_alti","bagli_mahalle","mezra","ciftlik"])
        sokak=get(o,["SOKAK","SOKAK ADI","sokak_adi","sokak"])
        cadde=get(o,["CADDE","CADDE ADI","cadde_adi","cadde"])
        defter=first_defter(o)
        year=first_year(o)
        hane=first_hane(o)
        candidate=is_candidate(o,il,ilce,koy)
        source=get(o,["KAYNAK PDF","ARŞİV PDF NO"])
        explicit_candidates=set(txt(x).casefold() for x in o.get("overlayCandidates",[]) if isinstance(x,str))
        for name in names:
            # Reused historical indexes retain this plural source spelling.
            if il.upper().replace("İ","I")=="SIVAS" and name.upper()=="KÖSEMAHMUDLAR":
                name="KÖSEMAHMUD OĞULLARI"
            family_candidate=candidate or name.casefold() in explicit_candidates
            report["family_mentions"]+=1
            key=(il.casefold(),ilce.casefold(),koy.casefold(),child.casefold(),name.casefold(),defter,hane)
            if key in seen:
                previous=records[seen[key]]
                if previous["EŞLEŞME DURUMU"].startswith("ADAY") and not family_candidate:
                    previous["EŞLEŞME DURUMU"]="KAYNAKTAKİ YERLEŞİM"
                    report["candidate"]-=1
                continue
            seen[key]=len(records)
            # Only archive-derived names and directly recorded location metadata.
            row={"SÜLALE ADI (STANDART)":name,"İL":il,"İLÇE":ilce,"KÖY":koy,
                 "KÖY ALTI":child,"SOKAK":sokak,"CADDE":cadde,
                 "DEFTER NO":defter,"DEFTER YILI":year,"HANE NO":hane,
                 "KAYNAK PDF":source,"KAYNAK DOSYA":rel,
                 "EŞLEŞME DURUMU":"ADAY — GÜNCEL YERLEŞİM DOĞRULANMADI" if family_candidate else "KAYNAKTAKİ YERLEŞİM"}
            records.append(row)
            file_count+=1
            report["candidate"]+=family_candidate
    report["files"][rel]=file_count
report["export_rows"]=len(records)
report["family_stats"]=family_totals(records)
records.sort(key=lambda r:tuple(str(r.get(k) or "") for k in ["İL","İLÇE","KÖY","SÜLALE ADI (STANDART)","DEFTER NO"]))
OUT.write_text("".join(json.dumps(row,ensure_ascii=False,separators=(",",":"))+"\n" for row in records),encoding="utf-8")
(ROOT/"catalog/sulale_tum_arsiv.ndjson.gz").write_bytes(gzip.compress(OUT.read_bytes(),compresslevel=9,mtime=0))
REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps({k:v for k,v in report.items() if k!="files"},ensure_ascii=False))


# Country-wide province -> district -> village -> family directory.
# This is used by the actual village cards, not only by the surname dictionary.
import unicodedata
def norm_key(value):
    x=unicodedata.normalize("NFD",txt(value).casefold().replace("ı","i"))
    return "".join(c for c in x if unicodedata.category(c)!="Mn").upper()
PLATES=json.loads((ROOT/"official-addresses/manifest.json").read_text(encoding="utf-8"))["provinces"]
PLATE_BY_NAME={norm_key(name):plate for plate,name in PLATES.items()}
PROVINCIAL={}
missing_province=[]
for row in records:
    province,district,village=(txt(row.get(x)) for x in ("İL","İLÇE","KÖY"))
    if not province or not district or not village or corrupt_place(district) or corrupt_place(village):continue
    plate=PLATE_BY_NAME.get(norm_key(province))
    if not plate:
        missing_province.append((province,district,village))
        continue
    target=PROVINCIAL.setdefault(plate,{"province":PLATES[plate],"districts":{}})
    cell=target["districts"].setdefault(norm_key(district),{}).setdefault(norm_key(village),{
        "name":village,"families":[],"candidate_families":[],"defterler":[],"sources":[]})
    family=txt(row.get("SÜLALE ADI (STANDART)"))
    if row.get("EŞLEŞME DURUMU","").startswith("ADAY"):
        if family not in cell["candidate_families"] and family not in cell["families"]:cell["candidate_families"].append(family)
    else:
        if family not in cell["families"]:cell["families"].append(family)
        if family in cell["candidate_families"]:cell["candidate_families"].remove(family)
    d=txt(row.get("DEFTER NO"))
    if d and d not in cell["defterler"]:cell["defterler"].append(d)
    src=txt(row.get("KAYNAK DOSYA"))
    if src and src not in cell["sources"]:cell["sources"].append(src)
TARGET=ROOT/"catalog/il_koy_sulale"
TARGET.mkdir(parents=True,exist_ok=True)
province_summary={}
for plate,content in PROVINCIAL.items():
    for district,villages in content["districts"].items():
        for v in villages.values():
            v["families"].sort()
            v["candidate_families"].sort()
    province_summary[plate]={"il":content["province"],"ilce":len(content["districts"]),
                             "koy":sum(map(len,content["districts"].values())),
                             "confirmed_family_places":sum(len(v["families"]) for d in content["districts"].values() for v in d.values()),
                             "candidate_family_places":sum(len(v["candidate_families"]) for d in content["districts"].values() for v in d.values())}
    (TARGET/(plate+".json")).write_text(json.dumps(content,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
(TARGET/"manifest.json").write_text(json.dumps({"source_count":len(paths),"province_count":len(PROVINCIAL),"provinces":province_summary,"unmapped_province_count":len(missing_province)},ensure_ascii=False,indent=2),encoding="utf-8")
print("Village-to-family overlays:",len(PROVINCIAL),"provinces; unresolved province rows:",len(missing_province))
# Publish each province separately so villages open quickly.


# One lightweight confirmed village-family feed for map, search, and full inventory.
# Only the confirmed families from the province overlays enter sulaleler.
COMMON=ROOT/"catalog/sulale_koy_ortak.ndjson"
rows_common=[]
for plate,content in sorted(PROVINCIAL.items()):
    for district,villages in sorted(content["districts"].items()):
        for vkey,v in sorted(villages.items()):
            confirmed=list(dict.fromkeys(v.get("families",[])))
            candidates=list(dict.fromkeys(v.get("candidate_families",[])))
            if not confirmed and not candidates:
                continue
            rows_common.append({
                "id":"toplu-sulale|"+plate+"|"+district+"|"+vkey,
                "il":content["province"],
                "ilce":district,
                "koy":v["name"],
                "sulaleler":confirmed,
                "overlayCandidates":candidates,
                "defterler":[{"tur":"NÜFUS / TEMETTUAT KAYNAK DİZİNİ","defter":d} for d in v.get("defterler",[]) if d],
                "kaynak_dosyalari":v.get("sources",[]),
                "haneler":[],
                "durumlar":["KAYNAK DOSYALARINDAN KÖY BAZINDA DERLENDİ; DOĞRULANMAYAN EŞLEŞMELER AYRI TUTULDU."],
                "arsiv_karti":True
            })
COMMON.write_text("".join(json.dumps(o,ensure_ascii=False,separators=(",",":"))+"\n" for o in rows_common),encoding="utf-8")
print("Unified village-family feed:",len(rows_common),"villages",sum(len(r["sulaleler"]) for r in rows_common),"confirmed links")

