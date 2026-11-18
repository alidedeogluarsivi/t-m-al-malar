#!/usr/bin/env python3
"""Compile all checked-in NFS/TMT family names to a single, source-grounded search feed.
Do not invent locality for any row. Distinct conflicting locality records remain distinct.
"""
import json
import gzip
from collections import Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "catalog/sulale_source_manifest.json"
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
def is_candidate(o, il, ilce, koy):
    if not all([il,ilce,koy]) or any(s.upper() in EMPTY for s in [il,ilce,koy]):return True
    check=get(o,["EŞLEŞME DURUMU","DOĞRULAMA","yerlesim_eslesme_durumu","eslesme_durumu"])
    if any(x in check.upper() for x in ["ADAY","BELİRSİZ","KONTROL","ŞÜPHE","BEKLİYOR","DOĞRULANMADI"]):return True
    if any(any(t in txt(x).upper() for t in ["EŞLEŞMESİ KONTROL EDİLECEK","GÜNCEL ADRES DOĞRULAMASI","GÜNCEL YERLEŞİM EŞLEŞMESİ DOĞRULANMADI"]) for x in (o.get("durumlar") or []) if isinstance(x,str)):return True
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
        for name in names:
            report["family_mentions"]+=1
            key=(il.casefold(),ilce.casefold(),koy.casefold(),child.casefold(),name.casefold(),defter,hane)
            if key in seen:
                previous=records[seen[key]]
                if previous["EŞLEŞME DURUMU"].startswith("ADAY") and not candidate:
                    previous["EŞLEŞME DURUMU"]="KAYNAKTAKİ YERLEŞİM"
                    report["candidate"]-=1
                continue
            seen[key]=len(records)
            # Only archive-derived names and directly recorded location metadata.
            row={"SÜLALE ADI (STANDART)":name,"İL":il,"İLÇE":ilce,"KÖY":koy,
                 "KÖY ALTI":child,"SOKAK":sokak,"CADDE":cadde,
                 "DEFTER NO":defter,"DEFTER YILI":year,"HANE NO":hane,
                 "KAYNAK PDF":source,"KAYNAK DOSYA":rel,
                 "EŞLEŞME DURUMU":"ADAY — GÜNCEL YERLEŞİM DOĞRULANMADI" if candidate else "KAYNAKTAKİ YERLEŞİM"}
            records.append(row)
            file_count+=1
            report["candidate"]+=candidate
    report["files"][rel]=file_count
report["export_rows"]=len(records)
records.sort(key=lambda r:tuple(str(r.get(k) or "") for k in ["İL","İLÇE","KÖY","SÜLALE ADI (STANDART)","DEFTER NO"]))
OUT.write_text("".join(json.dumps(row,ensure_ascii=False,separators=(",",":"))+"\n" for row in records),encoding="utf-8")
(ROOT/"catalog/sulale_tum_arsiv.ndjson.gz").write_bytes(gzip.compress(OUT.read_bytes(),compresslevel=9,mtime=0))
REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps({k:v for k,v in report.items() if k!="files"},ensure_ascii=False))
