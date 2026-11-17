#!/usr/bin/env python3
"""Build names-only lookup for public recent searches on static GitHub Pages.
No personal data, IP addresses, or search logs in this file.
"""
import json, pathlib, unicodedata
from collections import defaultdict
ROOT=pathlib.Path(__file__).resolve().parent.parent
SOURCES=[*sorted((ROOT/"catalog").glob("*.ndjson")),ROOT/"archive_verified.ndjson"]
def clean(s):
    return " ".join(str(s or "").split()).strip()[:90]
def upper_tr(s):
    return unicodedata.normalize("NFC",clean(s).replace("i","İ").replace("ı","I").upper())
def digest(s):
    h=14695981039346656037
    for b in upper_tr(s).encode("utf-8"):
        h=((h^b)*1099511628211)&((1<<64)-1)
    return str(h & ((1<<48)-1))
data={"village":{},"family":{}}
def insert(typ,value):
    if not isinstance(value,str):return
    name=clean(value)
    if len(name)<2 or name.upper() in {"BELİRSİZ","YOK","NULL","BİLİNMİYOR"}:return
    key=digest(name)
    data[typ].setdefault(key,name)
def from_obj(row):
    insert("village",row.get("koy") or row.get("KÖY") or row.get("KÖY/KARYE/MAHALLE"))
    insert("family",row.get("SÜLALE ADI (STANDART)") or row.get("STANDART SÜLALE ADI") or row.get("sulale") or row.get("sulale_adi"))
    vals=row.get("sulaleler") or []
    if isinstance(vals,list):
        for x in vals:
            if isinstance(x,str):insert("family",x)
            elif isinstance(x,dict):insert("family",x.get("sulale") or x.get("ad") or x.get("name"))
for path in SOURCES:
    if not path.exists():continue
    try:
        with path.open(encoding="utf-8") as f:
            for line in f:
                try: from_obj(json.loads(line))
                except (ValueError,TypeError): pass
    except OSError: pass
dest=ROOT/"recent-search-index.json"
dest.write_text(json.dumps(data,ensure_ascii=False,separators=(",",":"),sort_keys=True),encoding="utf-8")
print("Recent search index:",len(data["village"]),"villages",len(data["family"]),"families",dest.stat().st_size,"bytes")
