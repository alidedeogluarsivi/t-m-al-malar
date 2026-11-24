(() => {
  'use strict';
  const path = './catalog/emlak_gedik_cubuk_sarioglan_1831_1846.ndjson';
  const legacy = /^(?:sivas-ek-2084-|kayseri\|kayse20261119\|)/;
  const key = value => String(value ?? '').toLocaleLowerCase('tr').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]/g, '');
  const stamp = (row, document) => JSON.stringify([
    key(row.il), key(row.ilce), key(document.defter),
    String(document.sayfa ?? document.varak ?? ''), String(document.hane ?? ''),
    String(document.erkek ?? ''),
  ]);
  let pending;
  function load() {
    if (!pending) {
      pending = fetch(path, {signal: AbortSignal.timeout(10000)})
        .then(response => {
          if (!response.ok) throw Error('Harita kayıtları HTTP ' + response.status);
          return response.text();
        })
        .then(text => text.trim().split(/\r?\n/).map(line => JSON.parse(line)))
        .catch(error => {
          pending = null;
          console.warn('Emlak haritasının yerleşim kayıtları yüklenemedi:', error);
          return [];
        });
    }
    return pending;
  }
  function withoutDuplicates(approved) {
    const covered = new Set(approved.flatMap(row => (row.defterler || [])
      .filter(document => document.hane != null || document.erkek != null)
      .map(document => stamp(row, document))));
    return row => {
      if (!legacy.test(row.id || '') || !row.defterler?.length) return row;
      const unique = row.defterler.filter(document => !covered.has(stamp(row, document)));
      if (unique.length === row.defterler.length) return row;
      if (!unique.length && !['sulaleler', 'sulale_kayitlari', 'haneler',
        'gorevli_notlari', 'taramalar', 'yerel_kaynaklar'].some(field => row[field]?.length)) return null;
      return {...row, defterler:unique};
    };
  }
  window.EmlakCensus = {load, withoutDuplicates};
})();
