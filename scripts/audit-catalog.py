#!/usr/bin/env python3
"""Audit catalog integrity without changing historical place identifications."""
import json
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parent.parent
manifest=json.loads((ROOT/"catalog/sulale_source_manifest.json").read_text(encoding="utf-8"))
paths=manifest.get("paths",[])
report={"source_count":len(paths),"missing":[],"invalid_json":[],"records":0,"with_families":0,"with_registers":0,"missing_location":[],"family_without_register":[],"register_without_family":[],"duplicate_ids":[]}
seen=set()
for rel in paths:
    p=ROOT/rel
    if not p.is_file():
        report["missing"].append(rel);continue
    with p.open(encoding="utf-8") as stream:
        for number,line in enumerate(stream,1):
            if not line.strip():continue
            try:obj=json.loads(line)
            except json.JSONDecodeError:
                report["invalid_json"].append({"path":rel,"line":number});continue
            if not isinstance(obj,dict):continue
            report["records"]+=1
            fam=obj.get("sulaleler") or obj.get("sulale_kayitlari") or obj.get("sulale") or obj.get("SÜLALE ADI (STANDART)")
            reg=obj.get("defterler") or obj.get("DEFTER NO") or obj.get("defter")
            if fam:report["with_families"]+=1
            if reg:report["with_registers"]+=1
            if not all(obj.get(k) for k in ("il","ilce","koy")) and (fam or reg):
                report["missing_location"].append({"path":rel,"line":number})
            if fam and not reg:report["family_without_register"].append({"path":rel,"line":number})
            if reg and not fam:report["register_without_family"].append({"path":rel,"line":number})
            uid=obj.get("id")
            if uid:
                key=(rel,str(uid))
                if key in seen:report["duplicate_ids"].append({"path":rel,"id":uid})
                seen.add(key)
out=ROOT/"catalog/catalog_integrity_report.json"
out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("Audited",report["source_count"],"sources and",report["records"],"records")
for k in ("missing","invalid_json","missing_location","family_without_register","register_without_family","duplicate_ids"):
    print(k,len(report[k]))
if report["missing"] or report["invalid_json"]:
    raise SystemExit("Catalog integrity failed: missing source or malformed JSON")
