#!/usr/bin/env python3
"""Prepare publicly documented köy bağlıları hierarchy for Alidedeoğlu Arşivi.
Source: siberfx/turkiye-il-ilce-mahalle, MIT; originally NVİ + İçişleri.
No personal address / building data. Historic archive records are untouched.
"""
import json, re, urllib.request
from collections import defaultdict
from pathlib import Path
BASE="https://raw.githubusercontent.com/siberfx/turkiye-il-ilce-mahalle/main/src/Database/sql-dumps/"
TUPLE=re.compile(r"\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)")
PAIR=re.compile(r"\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)")
def get(filename):
    with urllib.request.urlopen(BASE+filename, timeout=80) as f:
        return f.read().decode("utf-8")
def decode(x): return re.sub(r"\\(.)",r"\1",x)
cities={int(i):decode(name) for i,name in PAIR.findall(get("cities.sql"))}
districts={int(i):(int(city),decode(name)) for i,city,name in TUPLE.findall(get("districts.sql"))}
rows=[(int(i),int(d),decode(n)) for i,d,n in TUPLE.findall(get("neighborhoods.sql"))]
inactive=set()
try:
    raw=json.loads(get("inactive.json"))
    inactive={int(e["id"]) for e in raw.get("neighborhoods",[])}
except Exception: pass
owners={(d,n):i for i,d,n in rows if "," not in n}
result=defaultdict(lambda:defaultdict(lambda:{"muhtarliklar":{},"baglilar":{}}))
total=0
unresolved=0
for i,d,name in rows:
    if i in inactive or d not in districts: continue
    city_id,district=districts[d]
    province=cities.get(city_id)
    if not province: continue
    entry=result[f"{city_id:02d}"][district]
    if "," not in name:
        entry["muhtarliklar"][name]={"id":i}
        continue
    head,child=(x.strip() for x in name.split(",",1))
    parent=owners.get((d,head))
    resolved_head=head
    if parent is None and head.endswith(" KÖYÜ"):
        resolved_head=head[:-5]+" MAHALLESİ"
        parent=owners.get((d,resolved_head))
    if parent is None:
        unresolved+=1
        continue
    entry["baglilar"].setdefault(resolved_head,[]).append({"name":child,"source_id":i})
    total+=1
out=Path("official-addresses")
out.mkdir(exist_ok=True)
for plate,dist in result.items():
    payload={"source":"SiberFX Türkiye Adres / İçişleri 2026 verisi (MIT), resmî kayıtla ayrıca karşılaştırılmalı",
             "province":cities[int(plate)],"districts":dict(dist)}
    (out/(plate+".json")).write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
(out/"manifest.json").write_text(json.dumps({"source":"siberfx/turkiye-il-ilce-mahalle 2026, MIT","provinces":{p:cities[int(p)] for p in sorted(result)},"bagli_count":total,"unresolved":unresolved,"generated":True},ensure_ascii=False,indent=2),encoding="utf-8")
print("Provinces:",len(result),"attached:",total,"unmatched:",unresolved)
