(() => {
  'use strict';
  const additions = [
    './catalog/nfs_yeni_belgeler_kart_20261128.ndjson?v=20261128-tire-harsit',
    './catalog/cubuk_kirsehir_1774_3537_koy_sulale_20261127.ndjson?v=20261127-cubuk-kirsehir',
    './catalog/excel_arsiv_son_kontrol_20261127.ndjson?v=20261127-arsiv-son-kontrol',
    './catalog/excel_sulale_son_kontrol_20261127.ndjson?v=20261127-arsiv-son-kontrol',
    './catalog/excel_ceviriyazi_sulale_ekleri_20261127.ndjson?v=20261127-ceviriyazi-sulale',
    './catalog/saray_finike_nfs_20261127.ndjson?v=20261127-saray-finike',
    './catalog/tamamlanan_excel_fihristleri_20261127.ndjson?v=20261127-son-excel',
    './catalog/kaza_yerlesim_eslesmeleri_20261127.ndjson?v=20261127-idari2',
    './catalog/excel_fihrist_ekleri_20261127.ndjson',
    './catalog/eksik_yerlesim_ekleri_20261127.ndjson',
    './catalog/karabuk_eflani_mulayim_asagi_mulayim_nfs_758_760_20261122.ndjson',
    './catalog/denizli_cal_isabey_hacibekirogullari_1832_1855_20261126.ndjson',
  ];
  const paths = [
    ...additions,
    './catalog/oncelikli_ceviriyazi_hane_den_20261126.ndjson?v=kaza-20261126',
    './catalog/ankara_hasanoglan_tarihi_nfs_20261126.ndjson',
    './catalog/oncelikli_kaynak_kontrolu_20261126.ndjson',
    './catalog/emlak_gedik_cubuk_sarioglan_1831_1846.ndjson',
    './catalog/ankara_nfs_eslesmeleri.ndjson',
    './catalog/gerede_1840_nfs707_708_fihristi.ndjson',
    './catalog/kirsehir_1830_1831_nfs3526_122_tarihi_yerlesim_20261125.ndjson?v=site-denetimi-20261125-1',
    './catalog/panli_agacoren_1831_1834_nfs3518_3520_hane_sulale_20261125.ndjson',
    './catalog/karabuk_nfs_full.ndjson?v=site-denetimi-20261125-2',
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
    const publishedIds = new Set(approved.map(row => row.id).filter(Boolean));
    const covered = new Set(approved.filter(row => row.id?.startsWith('harita-1831-1846|')).flatMap(row => (row.defterler || [])
      .filter(document => document.hane != null || document.erkek != null)
      .map(document => stamp(row, document))));
    return row => {
      if (publishedIds.has(row.id)) return null;
      if (!legacy.test(row.id || '') || !row.defterler?.length) return row;
      const unique = row.defterler.filter(document => !covered.has(stamp(row, document)));
      if (unique.length === row.defterler.length) return row;
      if (!unique.length && !['sulaleler', 'sulale_kayitlari', 'haneler',
        'gorevli_notlari', 'taramalar', 'yerel_kaynaklar'].some(field => row[field]?.length)) return null;
      return {...row, defterler:unique};
    };
  }
  window.EmlakCensus = {load, loadAdditions: () => Promise.all(additions.map(loadCatalog)).then(rows => rows.flat()), withoutDuplicates};
})();
