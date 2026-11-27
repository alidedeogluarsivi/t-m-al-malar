"""Index archival administrative affiliations by published settlement identity."""
import base64
from collections import defaultdict
import gzip
import json
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
PERIOD = ROOT / "historical/nfs"
AMBIGUOUS = re.compile(r"aday|belirsiz|bekliyor|arastiriliyor|dogrulanmadi|kesinlesmedi|guclu|supheli")
REGISTER = re.compile(r"\bNFS\s*\.?\s*(?:d\s*\.?)?\s*0*(\d+)\b", re.I)


def normalize(value):
    text = unicodedata.normalize("NFD", str(value or "").casefold().replace("ı", "i"))
    return "".join(c for c in text if not unicodedata.combining(c)).strip()


def key(value):
    return re.sub(r"[^a-z0-9]", "", normalize(value))


def identity(province, district, village):
    p, d = key(province), key(district)
    v = key(re.sub(r"\s+(?:mahallesi|koyu)$", "", normalize(village)))
    if not all((p, d, v)) or v in {"belirtilmemis", "belirsiz", "yok", "nan"}:
        return None
    if p == "afyon":
        p = "afyonkarahisar"
    if d == p or (p == "afyonkarahisar" and d == "afyon"):
        d = "merkez"
    v = {("kastamonu", "abana", "abanamerkez"): "abanailcemerkezi",
         ("ankara", "cubuk", "esenbogamerkez"): "esenboga"}.get((p, d, v), v)
    return "|".join((p, d, v))


def label(value):
    text = " ".join(str(value or "").split())
    if key(text) in {"", "yok", "bilinmiyor", "belirsiz", "belirtilmedi", "belirtilmemis", "nan", "none", "kazasi", "sancagi"}:
        return ""
    return text


def name_key(value):
    return key(re.sub(r"\s+(?:kazasi|sancagi|eyaleti|vilayeti)$", "", normalize(value)))


def ambiguous(record):
    mapping = record.get("guncel_eslesme")
    return (record.get("eslesme_kesin") is False or record.get("aday")
            or isinstance(mapping, dict) and mapping.get("kesin") is False
            or any(AMBIGUOUS.search(normalize(record.get(field))) for field in (
                "eslesme_durumu", "yerlesim_eslesme_durumu", "kaynak_eslesme_durumu", "EŞLEŞME DURUMU"
            )) or "GÜNCEL YERLEŞİM EŞLEŞMESİ KONTROL EDİLECEK" in (record.get("durumlar") or ()))


def read_period(path):
    return json.loads(gzip.decompress(base64.b64decode(path.read_bytes())))


def main():
    registers = {row[0]: row for path in PERIOD.glob("defter-*.txt") for row in read_period(path)}
    places = defaultdict(lambda: defaultdict(set))

    def add(location, fields, citations):
        fields = tuple(map(label, fields))
        if location and any(fields):
            places[location][fields].update(c for c in citations if c)

    paths = sorted(set(ROOT.glob("archive_*.ndjson")) | set((ROOT / "catalog").glob("*.ndjson")))
    for path in paths:
        if path.name == "sulale_tum_arsiv.ndjson":
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            if ambiguous(row) or row.get("tarihi_yerlesim_kaydi"):
                continue
            location = identity(
                row.get("bugunku_il") or row.get("il") or row.get("İL"),
                row.get("bugunku_ilce") or row.get("ilce") or row.get("İLÇE"),
                row.get("bugunku_koy") or row.get("koy") or row.get("KÖY") or row.get("KÖY/KARYE/MAHALLE"),
            )
            if not location:
                continue
            for doc in [*(row.get("defterler") or ()), *(row.get("sulale_kayitlari") or ()), row]:
                if not isinstance(doc, dict) or ambiguous(doc):
                    continue

                def field(*names):
                    return next((value for data in (doc, row) for n in names if (value := label(data.get(n)))), "")

                ref = label(doc.get("defter") or doc.get("DEFTER NO") or doc.get("DEFTER NUMARASI"))
                province = field("tarihi_vilayet", "vilayet", "tarihi_eyalet", "eyalet")
                sanjak = field("tarihi_sancak", "sancak")
                district = field("tarihi_kaza", "kaza", "BELGEDE KAZA", "TARİHÎ KAZA")
                numbers = {int(number) for number in REGISTER.findall(ref)}
                if len(numbers) == 1:
                    reg = registers.get(next(iter(numbers)))
                    if reg and reg[5] and (name_key(district) in {name_key(n) for n in reg[5]}
                                           or not district and len(reg[5]) == 1):
                        agrees = ((not province or not reg[3] or name_key(province) == name_key(reg[3]))
                                  and (not sanjak or not reg[4] or name_key(sanjak) == name_key(reg[4])))
                        if agrees:
                            province, sanjak = province or reg[3], sanjak or reg[4]
                            district = district or reg[5][0]
                add(location, (province, sanjak, district), [ref])

    for path in sorted(PERIOD.glob("18*.txt")):
        for row in read_period(path)["records"]:
            # Grade 2 is explicitly user approved. For grade 1, require corroboration
            # from an existing settlement entry with the same historical district.
            number, _, province, sanjak, district, _, il, ilce, village = row[:9]
            location = identity(il, ilce, village)
            known = places.get(location, {})
            if row[14] == 2 or (row[14] == 1 and district and any(
                    name_key(fields[2]) == name_key(district) and any(
                        str(number) in REGISTER.findall(ref) for ref in refs
                    ) for fields, refs in known.items())):
                add(location, (province, sanjak, district), [f"NFS.d.{number}"])

    output = {location: [[*fields, sorted(refs)] for fields, refs in sorted(rows.items())]
              for location, rows in sorted(places.items())}
    catalog = {number: [reg[3], reg[4], reg[5]] for number, reg in sorted(registers.items())
               if reg[5] and (reg[3] or reg[4])}
    (ROOT / "geo/settlement-administration.json").write_text(
        json.dumps({"places": output, "registers": catalog}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(output)} settlements, {sum(any(all(r[:3]) for r in rows) for rows in output.values())} with all three fields")


if __name__ == "__main__":
    main()
