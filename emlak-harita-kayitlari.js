(() => {
  'use strict';
  const paths = [
    './catalog/emlak_gedik_cubuk_sarioglan_1831_1846.ndjson',
    './catalog/ankara_nfs_eslesmeleri.ndjson',
    './catalog/gerede_1840_nfs707_708_fihristi.ndjson',
  ];
  const legacy = /^(?:sivas-ek-2084-|kayseri\|kayse20261119\|)/;
  const key = value => String(value ?? '').toLocaleLowerCase('tr').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]/g, '');
  const stamp = (row, document) => JSON.stringify([
    key(row.il), key(row.ilce), key(document.defter),
    String(document.sayfa ?? document.varak ?? ''), String(document.hane ?? ''),
    String(document.erkek ?? ''),
  ]);
  const pending = new Map();
  function loadCatalog(path) {
    if (!pending.has(path)) {
      pending.set(path, fetch(path, {signal: AbortSignal.timeout(10000)})
        .then(response => {
          if (!response.ok) throw Error('Harita kayıtları HTTP ' + response.status);
          return response.text();
        })
        .then(text => text.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line)))
        .catch(error => {
          pending.delete(path);
          console.warn('Yerleşim kayıtları yüklenemedi:', path, error);
          return [];
        }));
    }
    return pending.get(path);
  }
  async function load() {
    const catalogs = await Promise.all(paths.map(loadCatalog));
    return catalogs.flat();
  }
  function withoutDuplicates(approved) {
    const covered = new Set(approved.filter(row => row.id?.startsWith('harita-1831-1846|')).flatMap(row => (row.defterler || [])
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
