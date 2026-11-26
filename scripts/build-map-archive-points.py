"""Join archival documents to the site's existing settlement coordinates."""
from collections import defaultdict
import json
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "catalog"
NFS = re.compile(r"\bNFS\s*\.?\s*(?:d\s*\.?)?\s*0*(\d+)\b", re.I)
UNCERTAIN = re.compile(r"ADAY|BELIRSIZ|DOGRULANMADI|TEYIT BEKLIYOR|ARASTIRMA BEKLIYOR")


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def normalize(value):
    plain = unicodedata.normalize("NFD", str(value or "").casefold().replace("ı", "i"))
    return "".join(letter for letter in plain if not unicodedata.combining(letter))


def key(value):
    return re.sub(r"[^a-z0-9]", "", normalize(value))


def place_key(value):
    return key(re.sub(r"\s+(?:mahallesi|koyu)$", "", normalize(value).strip()))


def archive_kaza(value):
    name = str(value or "").strip()
    if key(name) in {"", "tarihikazafihristi", "belirtilmedi", "belirsiz", "yok", "nan"}:
        return ""
    return name


def uncertain(row):
    mapping = row.get("guncel_eslesme")
    return (
        row.get("eslesme_kesin") is False
        or isinstance(mapping, dict) and mapping.get("kesin") is False
        or bool(UNCERTAIN.search(normalize(" ".join(str(row.get(field) or "") for field in (
            "EŞLEŞME DURUMU", "yerlesim_eslesme_durumu", "eslesme_durumu",
        ))).upper()))
    )


def documents(row):
    for item in row.get("defterler") or ():
        if isinstance(item, dict):
            yield item.get("defter"), item.get("tarihi_kaza") or row.get("tarihi_kaza"), item.get("tur")
        elif isinstance(item, str):
            yield item, row.get("tarihi_kaza"), ""
    for item in row.get("sulale_kayitlari") or ():
        if isinstance(item, dict) and not item.get("aday"):
            yield item.get("defter"), item.get("tarihi_kaza") or row.get("tarihi_kaza"), item.get("tur")
    yield (row.get("defter") or row.get("DEFTER NO") or row.get("DEFTER NUMARASI"),
           row.get("tarihi_kaza") or row.get("TARİHÎ KAZA"), row.get("tur") or row.get("BELGE TÜRÜ"))


def coordinates(value):
    if isinstance(value, list) and len(value) == 2 and all(isinstance(x, (float, int)) for x in value):
        lon, lat = value
        if 25 <= lon <= 45 and 35 <= lat <= 43:
            return round(lat, 5), round(lon, 5)
    return None


def main():
    provinces = {key(name): plate for plate, name in read(ROOT / "official-addresses/manifest.json")["provinces"].items()}
    provinces["afyon"] = "03"
    district_ids = {}
    district_labels = {}
    province_names = read(ROOT / "official-addresses/manifest.json")["provinces"]
    locations = defaultdict(dict)
    for district in read(ROOT / "districts-local.json"):
        plate, district_id = district["plate_code"], district["id"]
        name_key = key(district["name"])
        district_ids[plate, name_key] = district_id
        district_labels[district_id] = [province_names[plate], district["name"]]
        if provinces.get(name_key) == plate:
            district_ids[plate, "merkez"] = district_id
        file = ROOT / "geo/points" / f"{district_id}.geojson"
        if not file.exists():
            continue
        for feature in read(file)["features"]:
            name = feature["properties"]["name"]
            point = coordinates(feature["geometry"]["coordinates"])
            if point:
                locations[district_id].setdefault(place_key(name), set()).add((name, point))

    entries = {}

    def add(plate, district, name, row, families=()):
        district_id = district_ids.get((plate, key(district)))
        name = str(name or "").strip()
        if not district_id or not name or uncertain(row):
            return
        name_key = place_key(name)
        if plate == "37" and key(district) == "abana" and name_key == "abanamerkez":
            name_key = "abanailcemerkezi"
        if plate == "06" and key(district) == "cubuk" and name_key == "esenbogamerkez":
            name_key = "esenboga"
        matches = locations[district_id].get(name_key, set())
        points = {point for _, point in matches}
        given = coordinates(row.get("konum"))
        if len(points) == 1:
            point = next(iter(points))
            name = min((name for name, _ in matches), key=lambda value: (len(value), value))
        elif given:
            point = given
        else:
            point = None
        identity = district_id, name_key
        card = entries.setdefault(identity, {"name": name, "point": point, "families": set(), "docs": set(), "kazas": set()})
        if point and card["point"] is None:
            card.update(name=name, point=point)
        card["families"].update(name.strip() for name in families if isinstance(name, str) and name.strip())
        for ref, kaza, kind in documents(row):
            if archive_kaza(kaza):
                card["kazas"].add(archive_kaza(kaza))
            numbers = set(NFS.findall(str(ref or "")))
            if not numbers and re.search(r"\bnfs\b|nufus", normalize(kind)) and re.fullmatch(r"\d+", str(ref or "")):
                numbers.add(str(int(ref)))
            card["docs"].update((number, archive_kaza(kaza)) for number in numbers)

    for file in sorted((CATALOG / "il_koy_sulale").glob("[0-9][0-9].json")):
        for district, places in read(file)["districts"].items():
            for row in places.values():
                add(file.stem, district, row["name"], {"defterler": row.get("defterler")}, row.get("families") or ())

    overlays = read(CATALOG / "district_family_overlay.json").get("cards", {})
    for location, row in overlays.items():
        province, district, name = location.split("|", 2)
        add(provinces.get(key(province)), district, name, row, row.get("families") or ())

    paths = sorted(set(ROOT.glob("archive_*.ndjson")) | set(CATALOG.glob("*.ndjson")))
    for path in paths:
        if path.name == "sulale_tum_arsiv.ndjson":
            continue
        with path.open(encoding="utf-8") as source:
            for line in source:
                if not line.strip():
                    continue
                row = json.loads(line)
                province = row.get("il") or row.get("İL")
                district = row.get("ilce") or row.get("İLÇE")
                name = row.get("koy") or row.get("KÖY") or row.get("KÖY/KARYE/MAHALLE")
                if not (province and district and name):
                    continue
                families = list(row.get("sulaleler") or ())
                for field in ("sulale", "sulale_adi", "SÜLALE ADI (STANDART)", "STANDART SÜLALE ADI"):
                    if row.get(field):
                        families.append(row[field])
                families.extend(f.get("ad") for f in row.get("sulale_kayitlari") or ()
                                if isinstance(f, dict) and not f.get("aday"))
                add(provinces.get(key(province)), district, name, row, families)


    groups = defaultdict(list)
    family_places = defaultdict(list)
    missing = nfs_count = family_count = 0
    for (district_id, _), row in sorted(entries.items()):
        if not row["families"] and not row["docs"]:
            continue
        if not row["point"]:
            missing += 1
            continue
        lat, lon = row["point"]
        kazas = {key(kaza): kaza for _, kaza in sorted(row["docs"]) if kaza}
        with_kaza = {number for number, kaza in row["docs"] if kaza}
        refs = sorted({(int(number), kazas.get(key(kaza), "")) for number, kaza in row["docs"]
                       if kaza or number not in with_kaza})
        names = sorted({key(name): name for name in sorted(row["families"])}.values())
        if names:
            family_places[district_id].append([row["name"], lat, lon, names])
        family_names = names if not refs else []
        other_kazas = sorted({key(name): name for name in sorted(row["kazas"])}.values()) if not refs else []
        groups[district_id].append([row["name"], lat, lon, int(bool(row["families"])), refs, family_names, other_kazas])
        nfs_count += bool(refs)
        family_count += bool(not refs and row["families"])
    result = {"nfs": nfs_count, "family": family_count, "unmapped": missing, "districts": groups}
    destination = ROOT / "geo/archive-points.json"
    destination.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    family_index = [[*district_labels[district], rows] for district, rows in family_places.items()]
    destination.with_name("archive-family-points.json").write_text(
        json.dumps(family_index, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    print(f"{nfs_count} NFS, {family_count} family-only, {missing} without coordinates")


if __name__ == "__main__":
    main()
