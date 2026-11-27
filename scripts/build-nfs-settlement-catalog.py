"""Collect administrative fields from the complete NFS catalogue exports."""
import argparse
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
ENTRY = re.compile(
    r"^NFS\.d\.\.\s+(\d+) \| Tarih: [^\n]* \| Kaynak satır: \d+\s*\n(?:Özet: )?([^\n]+)",
    re.M,
)
REGISTER = re.compile(r"\bNFS\s*\.?\s*(?:d\s*\.?)?\s*0*(\d+)\b", re.I)


def trim_unit(value):
    value = value.strip(" ,")
    return value[1:-1].strip() if value.startswith("(") and value.endswith(")") and value.count("(") == 1 else value


def administration(summary):
    lead = re.split(r"\b(?:müslim|müslüman|gayrimüslim|gayr-i|reaya|nüfus defteri)\b", summary, 1, flags=re.I)[0]
    province = re.search(r"([^,;]+?)\s+(?:ey[âa]leti|vil[âa]yeti)\b", lead, re.I)
    sanjak = re.search(r"([^,;]+?)\s+(?:sanca[ğg][ıi]|liv[âa]s[ıi])\b", lead, re.I)
    tail = lead[max((m.end() for m in (province, sanjak) if m), default=0):].strip(", ")
    suffix = re.search(r"\s+(?:kaza(?:lar[ıi]|s[ıi])?(?:n[ıi]n|ndak[iı]|nda|na)?)(?:\b|$)", tail, re.I)
    names = []
    if suffix:
        clause = tail[:suffix.start()]
        clause = re.split(r"\b(?:muhass[ıa]ll[ıi][ğg][ıi]|nahiyesi)\s*,", clause, flags=re.I)[-1]
        names = [trim_unit(name) for name in re.split(r",\s*(?![^()]*\))|\s+(?:ve|ile)\s+", clause)
                 if trim_unit(name)]
        names = [name for name in names if len(name) < 75 and not re.search(
            r"\b(?:tabi|nahiyes[iı]|karyes[iı]|aşireti|sakin)\b", name, re.I)]
    return [trim_unit(province[1]) if province else "", trim_unit(sanjak[1]) if sanjak else "", names]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("exports", nargs="+", type=Path, help="NFS catalogue text files, preferred source first")
    args = parser.parse_args()
    index = json.loads((ROOT / "geo/settlement-administration.json").read_text())
    points = json.loads((ROOT / "geo/archive-points.json").read_text())["districts"]
    used = {int(n) for villages in points.values() for place in villages for n, _ in place[4]}
    for places in index["places"].values():
        for _, _, _, citations in places:
            used.update(int(n) for citation in citations for n in REGISTER.findall(citation))
    catalog = {}
    for path in args.exports:
        for number, summary in ENTRY.findall(path.read_text()):
            code = int(number)
            if code not in used or str(code) in index["registers"]:
                continue
            result = administration(summary)
            if (result[0] or result[1]) and code not in catalog:
                catalog[code] = result

    # The numbered defters are identified in the cited transcriptions. Closely
    # related catalogue fiches for Gelingiras and Merzifon corroborate the parents.
    catalog.update({
        2072: ["Ankara", "Bozok", ["Budaközü"], "NFS.d.2070–2071; Budaközü yerleşim fihristi"],
        2074: ["Ankara", "Bozok", ["Budaközü"], "NFS.d.2070–2071; Budaközü yerleşim fihristi"],
        2149: ["Sivas", "Amasya", ["Akdağ"], "NFS.d.2148; Amasya Akdağ fihristi"],
        2176: ["Sivas", "Amasya", ["Gelingiras"], "https://portal.amasya.edu.tr/songul.kurt/Yonetilen-Tezler"],
        2184: ["Sivas", "Amasya", ["Gümüş"], "NFS.d.2183; Amasya Gümüş fihristi"],
        2198: ["Sivas", "Amasya", ["Hacıköy"], "https://openaccess.amasya.edu.tr/xmlui/handle/20.500.12450/3811"],
        2223: ["Sivas", "Amasya", ["Kedegara"], "NFS.d.2220–2222; Vezirköprü fihristi"],
        2224: ["Sivas", "Amasya", ["Kedegara"], "NFS.d.2220–2222; Vezirköprü fihristi"],
        2234: ["Sivas", "Amasya", ["Lâdik"], "https://avesis.istanbul.edu.tr/yonetilen-tez/0bf2c4c0-7ad1-4852-bbd6-71d2d73fb956/ladik-nufus-defteri-1846-tarihli-transkripsiyon-ve-degerlendirme"],
        2243: ["Sivas", "Amasya", ["Merzifon"], "https://dergipark.org.tr/en/pub/juhis/article/773850"],
        2257: ["Sivas", "Amasya", ["Zeytun"], "NFS.d.2253–2256; Zeytun 1846 fihristi"],
    })
    (ROOT / "geo/nfs-settlement-catalog.json").write_text(
        json.dumps(dict(sorted(catalog.items())), ensure_ascii=False, separators=(",", ":")) + "\n"
    )
    print(f"{len(used)} referenced NFS codes, {len(catalog)} supplemental fiches")


if __name__ == "__main__":
    main()
