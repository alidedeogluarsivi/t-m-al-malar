(() => {
  'use strict';
  const dataURL = new URL('./geo/settlement-administration.json?v=20261127', document.currentScript.src);
  const labels = ['VİLAYET / EYALET', 'SANCAK', 'KAZA'];
  const normalize = value => String(value ?? '').trim().toLocaleLowerCase('tr')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
  const key = value => normalize(value).replace(/[^a-z0-9]/g, '');
  const unitKey = value => key(normalize(value).replace(/\s+(?:kazasi|sancagi|eyaleti|vilayeti)$/, ''));
  const citationKey = value => key(normalize(value).replace(/^boa\s+/, ''));
  let indexRequest;

  function identity(il, ilce, name) {
    let province = key(il), district = key(ilce);
    if (province === 'afyon') province = 'afyonkarahisar';
    if (district === province || (province === 'afyonkarahisar' && district === 'afyon')) district = 'merkez';
    let place = key(normalize(name).replace(/\s+(?:mahallesi|koyu)$/, ''));
    if (province === 'kastamonu' && district === 'abana' && place === 'abanamerkez') place = 'abanailcemerkezi';
    if (province === 'ankara' && district === 'cubuk' && place === 'esenbogamerkez') place = 'esenboga';
    return province && district && place ? [province, district, place].join('|') : '';
  }

  function loadIndex() {
    if (!indexRequest) {
      indexRequest = fetch(dataURL, {signal: AbortSignal.timeout(12000)}).then(response => {
        if (!response.ok) throw Error('HTTP ' + response.status);
        return response.json();
      }).catch(error => {
        indexRequest = null;
        throw error;
      });
    }
    return indexRequest;
  }

  function uncertain(row) {
    return row.eslesme_kesin === false || row.guncel_eslesme?.kesin === false || row.aday ||
      [row.eslesme_durumu, row.yerlesim_eslesme_durumu, row.kaynak_eslesme_durumu].some(status =>
        /aday|belirsiz|bekliyor|arastiriliyor|dogrulanmadi|kesinlesmedi|guclu|supheli/.test(normalize(status)));
  }

  function fromRecords(rows, historical) {
    return rows.flatMap(row => {
      if (!row || (!historical && (uncertain(row) || row.tarihi_yerlesim_kaydi ||
          row.durumlar?.includes('GÜNCEL YERLEŞİM EŞLEŞMESİ KONTROL EDİLECEK')))) return [];
      return [row, ...(row.defterler || [])].filter(doc => doc && (historical || !uncertain(doc))).map(doc => [
        doc.tarihi_vilayet || doc.vilayet || doc.tarihi_eyalet || doc.eyalet || row.tarihi_vilayet || row.vilayet || row.tarihi_eyalet || row.eyalet,
        doc.tarihi_sancak || doc.sancak || row.tarihi_sancak || row.sancak,
        doc.tarihi_kaza || doc.kaza || row.tarihi_kaza || row.kaza,
        doc.defter ? [String(doc.defter)] : [],
      ]);
    });
  }

  function summarize(rows) {
    const groups = new Map();
    for (const [province, sanjak, district, refs] of rows) {
      const fields = [province, sanjak, district].map(value =>
        ['', 'belirsiz', 'belirtilmedi', 'belirtilmemis', 'bilinmiyor', 'nan', 'none', 'yok'].includes(key(value)) ? '' : String(value).trim());
      const keys = fields.map(unitKey);
      if (!keys.some(Boolean)) continue;
      const signature = keys.join('|');
      const group = groups.get(signature) || {fields, keys, refs: new Map()};
      for (const ref of refs) group.refs.set(citationKey(ref), ref);
      groups.set(signature, group);
    }
    const entries = [...groups.values()];
    return entries.filter(entry => {
      const fuller = entries.filter(other => other !== entry &&
        other.keys.filter(Boolean).length > entry.keys.filter(Boolean).length &&
        entry.keys.every((value, index) => !value || value === other.keys[index]));
      return !fuller.length || [...entry.refs.keys()].some(ref => fuller.every(other => !other.refs.has(ref)));
    }).sort((a, b) => b.keys.filter(Boolean).length - a.keys.filter(Boolean).length);
  }

  function append(root, place, records = []) {
    const section = document.createElement('section');
    section.className = 'settlement-administration';
    section.innerHTML = '<h3>TARİHÎ İDARÎ BAĞLILIK</h3><div aria-live="polite"></div>';
    root.prepend(section);
    const content = section.lastElementChild;
    const direct = fromRecords(records, place.historical);
    function draw(rows, loading = false, failed = false) {
      const entries = summarize(rows);
      content.replaceChildren();
      for (const {fields, refs} of entries.length ? entries : [{fields: [], refs: new Map()}]) {
        const group = document.createElement('div');
        const list = document.createElement('dl');
        labels.forEach((label, index) => {
          const term = document.createElement('dt'), detail = document.createElement('dd');
          term.textContent = label;
          detail.textContent = fields[index] || (loading ? 'Yükleniyor…' : failed ? 'Veri yüklenemedi' : 'Belirtilmemiş');
          list.append(term, detail);
        });
        group.append(list);
        if (refs.size) {
          const source = document.createElement('small');
          source.textContent = [...refs.values()].join(' · ');
          group.append(source);
        }
        content.append(group);
      }
    }
    const id = !place.historical && identity(place.il, place.ilce, place.name);
    draw(direct, Boolean(id || place.historical));
    if (id || place.historical) void loadIndex().then(({places, registers}) => {
      const enriched = direct.map(([province, sanjak, district, refs]) => {
        const number = refs.length === 1 && refs[0].match(/^(?:BOA\s+)?NFS\s*\.?\s*(?:D\s*\.?)?\s*0*(\d+)$/i)?.[1];
        const reg = number && registers[number];
        if (!reg) return [province, sanjak, district, refs];
        const [catalogProvince, catalogSanjak, districts] = reg;
        const districtMatches = district ? districts.some(name => unitKey(name) === unitKey(district)) : districts.length === 1;
        if (!districtMatches || (province && catalogProvince && unitKey(province) !== unitKey(catalogProvince)) ||
            (sanjak && catalogSanjak && unitKey(sanjak) !== unitKey(catalogSanjak))) return [province, sanjak, district, refs];
        return [province || catalogProvince, sanjak || catalogSanjak, district || districts[0], refs];
      });
      draw([...(places[id] || []), ...enriched]);
    }).catch(() => draw(direct, false, true));
  }

  window.SettlementAdministration = {append};
})();
