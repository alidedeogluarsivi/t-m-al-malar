"""Public dictionary totals, using the dictionary's searchable row identity."""
import re
import unicodedata

def clean(value):
    return ' '.join(str(value or '').split())

def upper(value):
    return clean(value).replace('i', 'İ').replace('ı', 'I').upper()

def norm(value):
    return ''.join(c for c in unicodedata.normalize('NFD', upper(value))
                   if unicodedata.category(c) != 'Mn').replace('İ', 'I').replace('ı', 'I')

def family_key(value):
    s = norm(value).lower().replace('ı', 'i')
    s = re.sub(r'[^a-z0-9]', '', s)
    return re.sub(r'(?:ogullari|ogullar|oglu)$', '', s)

def label(value):
    s = upper(value)
    # JavaScript word boundaries use ASCII letters, digits and underscore.
    for suffix in ['OĞLU', 'OĞULLAR']:
        if re.search(r'(?<![A-Za-z0-9_])' + suffix + r'$', s):
            return s[:-len(suffix)] + 'OĞULLARI'
    return s

def references(value):
    result = []
    for match in re.finditer(r'(?:BOA\s*)?(NFS\s*\.\s*d\s*\.|ML\s*\.\s*VRD\s*\.\s*TMT\s*\.\s*d\s*\.)\s*(\d+)', str(value or ''), re.I):
        ref = 'BOA ' + ('NFS.d.' if match[1].upper().startswith('NFS') else 'ML.VRD.TMT.d.') + match[2]
        if ref not in result:
            result.append(ref)
    return ', '.join(result)

def family_totals(records):
    row_keys, names, places = set(), set(), set()
    for row in records:
        name = label(row.get('SÜLALE ADI (STANDART)'))
        if not name or norm(name) in {'NULL', 'BELIRSIZ', 'YOK', 'BILINMIYOR', '-'}:
            continue
        place = tuple(norm(row.get(k)) for k in ['İL', 'İLÇE', 'KÖY', 'KÖY ALTI', 'SOKAK', 'CADDE'])
        row_keys.add(place + (norm(name), norm(references(row.get('DEFTER NO'))),
                              norm(row.get('DEFTER YILI')), norm(row.get('HANE NO'))))
        key = family_key(name)
        if key:
            names.add(key)
        places.add(place)
    return {'version': 1, 'records': len(row_keys), 'unique_names': len(names),
            'source_rows': len(records), 'places': len(places),
            'record_definition': 'AYNI YER, SÜLALE ADI, BOA KÜNYESİ, YIL VE HANE TEKRARLARI BİRLEŞTİRİLMİŞ SORGULAMA KAYDI.',
            'name_definition': 'AD YAZIMINDAKİ BÜYÜK/KÜÇÜK HARF, TÜRKÇE HARF, BOŞLUK VE OĞLU/OĞULLARI FARKLARI AYIKLANIR; AYNI AD FARKLI KÖYLERDE BİR KEZ SAYILIR. BU SAYI BAĞIMSIZ SOY SAYISI DEĞİLDİR.'}
