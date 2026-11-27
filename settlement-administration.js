(() => {
  'use strict';
  const assetBase = document.currentScript.src;
  const dataURL = new URL('./geo/settlement-administration.json?v=20261127', assetBase);
  const catalogURL = new URL('./geo/nfs-settlement-catalog.json?v=20261127-saray-finike', assetBase);
  const labels = ['VİLAYET / EYALET', 'SANCAK', 'KAZA'];
  const normalize = value => String(value ?? '').trim().toLocaleLowerCase('tr')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
  const key = value => normalize(value).replace(/[^a-z0-9]/g, '');
  const unitKey = value => key(normalize(value).replace(/\s+(?:kazasi|sancagi|eyaleti|vilayeti)$/, ''));
  const citationKey = value => key(normalize(value).replace(/^boa\s+/, ''));
  const registerPattern = /\bNFS\s*\.?\s*(?:D\s*\.?)?\s*0*(\d+)\b/gi;
  const districtKey = value => {
    const name = unitKey(String(value || '').replace(/\s*\(.*$/, '').replace(/\s+(?:nahiyesi|merkez)$/iu, ''));
    return ({
      boyabad:'boyabat', kengiri:'cankiri', kopru:'kedegara', vezirkopru:'kedegara',
      kedagra:'kedegara', kedegra:'kedegara', gedegra:'kedegara', inegol:'inegolibursa', adranos:'atranos',
      gumusmadeni:'gumus', gumusmadenihumayunu:'gumus', kureihadit:'kureihadid',
    })[name] || name;
  };
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

  async function getJSON(url) {
    const response = await fetch(url, {signal: AbortSignal.timeout(12000)});
    if (!response.ok) throw Error('HTTP ' + response.status);
    return response.json();
  }

  function loadIndex() {
    if (!indexRequest) {
      indexRequest = Promise.all([getJSON(dataURL), getJSON(catalogURL)]).then(([index, extra]) => ({
        places:index.places, registers:{...index.registers, ...extra},
      })).catch(error => {
        indexRequest = null;
        throw error;
      });
    }
    return indexRequest;
  }

  function citations(value, type = '') {
    const text = String(value ?? '').trim();
    if (!text) return [];
    const explicit = [...text.matchAll(registerPattern)];
    const simple = text.replace(registerPattern, match => ' ' + match.match(/\d+$/)[0]);
    if ((explicit.length || /nfs|nufus/.test(normalize(type))) && /^[\d\s,;/+]+$/.test(simple)) {
      const numbers = simple.match(/\d+/g) || [];
      return [...new Set(numbers.map(n => 'BOA NFS.d.' + Number(n)))];
    }
    return [text];
  }

  function compatibleDistrict(district, candidates) {
    if (!district || !candidates.length) return true;
    const wanted = district.split(/\s*\/\s*/).map(districtKey).filter(Boolean);
    const known = new Set(candidates.map(districtKey));
    return wanted.length > 0 && wanted.every(name => known.has(name));
  }

  function enrich(rows, registers) {
    return rows.map(row => {
      const [province, sanjak, district, refs] = row;
      const code = refs.length === 1 && refs[0].match(/^BOA NFS\.d\.(\d+)$/)?.[1];
      if (!code || !registers[code]) return row;
      const [catalogProvince, catalogSanjak, districts] = registers[code];
      if (!compatibleDistrict(district, districts) ||
          (province && catalogProvince && unitKey(province) !== unitKey(catalogProvince)) ||
          (sanjak && catalogSanjak && unitKey(sanjak) !== unitKey(catalogSanjak))) return row;
      return [province || catalogProvince, sanjak || catalogSanjak,
        district || (districts.length === 1 ? districts[0] : ''), refs];
    });
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
        citations(doc.defter, doc.tur),
      ]);
    });
  }

  function summarize(rows) {
    const groups = new Map();
    for (const [province, sanjak, district, refs] of rows) {
      const fields = [province, sanjak, district].map(value =>
        ['', 'belirsiz', 'belirtilmedi', 'belirtilmemis', 'bilinmiyor', 'nan', 'none', 'yok'].includes(key(value)) ? '' : String(value).trim());
      const keys = [unitKey(fields[0]), unitKey(fields[1]), districtKey(fields[2])];
      if (!keys.some(Boolean)) continue;
      const signature = keys.join('|');
      const group = groups.get(signature) || {fields, keys, refs: new Map()};
      for (const ref of refs) group.refs.set(citationKey(ref), ref);
      groups.set(signature, group);
    }
    const entries = [...groups.values()].map(group => ({
      ...group, size:group.keys.filter(Boolean).length,
    }));
    const otherRefs = new Map();
    const visible = entries.filter(entry => {
      const better = entries.filter(other => other.size > entry.size &&
        entry.keys.every((field, index) => !field || field === other.keys[index]));
      const repeated = better.some(other => [...entry.refs.keys()].every(ref => other.refs.has(ref)));
      if (repeated) return false;
      // The catalog can establish the chain through one register while another
      // source names only the same kaza. Keep the latter citation at card level.
      if (entry.keys[2] && better.some(other => other.size === 3)) {
        for (const ref of entry.refs) otherRefs.set(...ref);
        return false;
      }
      return true;
    }).sort((a, b) => b.size - a.size);
    const visibleCitations = new Set(visible.flatMap(entry => [...entry.refs.keys()]));
    return {entries:visible, otherRefs:[...otherRefs].filter(([ref]) => !visibleCitations.has(ref)).map(([,ref]) => ref)};
  }

  function append(root, place, records = []) {
    const section = document.createElement('section');
    section.className = 'settlement-administration';
    section.innerHTML = '<h3>TARİHÎ İDARÎ BAĞLILIK</h3><div aria-live="polite"></div>';
    root.prepend(section);
    const content = section.lastElementChild;
    const direct = fromRecords(records, place.historical).flatMap(([province,sanjak,district,refs]) =>
      refs.length ? refs.map(ref => [province,sanjak,district,[ref]]) : [[province,sanjak,district,[]]]);
    const markerRows = (place.refs || []).map(([number, district]) => ['', '', district, citations('NFS.d.' + number)]);
    const id = !place.historical && identity(place.il, place.ilce, place.name);
    function draw(rows, loading = false, failed = false) {
      const {entries, otherRefs} = summarize(rows);
      content.replaceChildren();
      if (!entries.length) {
        content.textContent = loading ? 'Yükleniyor…' : failed ? 'Veri yüklenemedi' : 'Tarihî idarî kayıt henüz eşleştirilmedi.';
        return;
      }
      for (const {fields, refs} of entries) {
        const group = document.createElement('div');
        const list = document.createElement('dl');
        labels.forEach((label, index) => {
          if (!fields[index]) return;
          const term = document.createElement('dt'), detail = document.createElement('dd');
          term.textContent = label;
          detail.textContent = fields[index];
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
      if (otherRefs.length) {
        const source = document.createElement('small');
        source.textContent = 'Diğer defterler · ' + otherRefs.join(' · ');
        content.append(source);
      }
    }
    const rows = [...direct, ...markerRows];
    draw(rows, Boolean(id || place.historical));
    if (id || place.historical) void loadIndex().then(({places, registers}) => {
      const indexed = (places[id] || []).flatMap(([province, sanjak, district, refs]) =>
        refs.length ? refs.flatMap(ref => citations(ref).map(citation => [province, sanjak, district, [citation]])) :
          [[province, sanjak, district, []]]);
      const sourceRows = [...indexed, ...direct];
      const documentedKazas = new Set(sourceRows.filter(row => row[2]).flatMap(row => row[3].map(citationKey)));
      const markers = markerRows.filter(row => !documentedKazas.has(citationKey(row[3][0])));
      const documented = sourceRows.filter(row => row[2] || row[3].every(ref => !documentedKazas.has(citationKey(ref))));
      draw(enrich([...documented, ...markers], registers));
    }).catch(() => draw(rows, false, true));
  }

  window.SettlementAdministration = {append};
})();
