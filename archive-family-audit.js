/* Family-specific evidence retained after checking the Alidedeoğulları imports. */
(() => {
  'use strict';
  const name = 'ALİDEDEOĞULLARI';
  const fold = value => String(value ?? '').toLocaleLowerCase('tr').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]/g, '');
  const isReviewed = value => /^alidede(?:ogullari|ogullar|oglu)$/.test(fold(value));
  const records = [
    {il:'Samsun', ilce:'Alaçam', koy:'Alidede Bölmesi', kaza:'Alaçam', refs:'NFS.d.979 / NFS.d.990 / NFS.d.992',
      year:'1834', source:'Alaçam 1834 Yılı Soykütüğü', entries:[{house:'8', page:'383'}], coords:[41.48846,35.58685]},
    {il:'Samsun', ilce:'Alaçam', koy:'Gökçeağaç Oymağı', kaza:'Alaçam', refs:'NFS.d.979 / NFS.d.990 / NFS.d.992',
      year:'1834', source:'Alaçam 1834 Yılı Soykütüğü', entries:[{house:'17', page:'348'}], coords:[41.47509,35.61387]},
    {il:'Samsun', ilce:'Alaçam', koy:'Göçkün', kaza:'Alaçam', refs:'NFS.d.979 / NFS.d.990 / NFS.d.992',
      year:'1834', source:'Alaçam 1834 Yılı Soykütüğü', entries:[{house:'3', page:'434'},{house:'20', page:'437'}], coords:[41.62761,35.63227]},
    {il:'Samsun', ilce:'Bafra', koy:'Hacı Şaban', kaza:'Bafra', refs:'NFS.d.972',
      source:'Hacı Şaban Mahallesi seçilmiş hane tercümesi', entries:[{house:'19'}], historical:true},
    {il:'Sinop', ilce:'Boyabat', koy:'Gökdere Mahallesi', kaza:'Boyabad', refs:'NFS.d.852',
      year:'1837', source:'1837 Boyabad–Saraydüzü sülale cetveli, satır 2739', entries:[{house:'51'}], coords:[41.46247,34.76305]},
    {il:'Sinop', ilce:'Saraydüzü', koy:'Depe (tarihî kayıt)', kaza:'Boyabad', refs:'NFS.d.851',
      year:'1837', source:'1837 Boyabad–Saraydüzü sülale cetveli, satır 4193', entries:[{house:'36'}], historical:true},
    {il:'Tokat', ilce:'Niksar', koy:'Şeyhler', tarihiAd:'Şeyhler nâm-ı diğer Halidin', kaza:'Niksar', refs:'NFS.d.2387',
      year:'1838', source:'Şeyhler (Halidin) Nüfus Defteri tercümesi', entries:[{house:'10', page:'6'},{page:'8'}], coords:[40.63369,36.92884]},
    {il:'Bursa', ilce:'İnegöl', koy:'Cuma Mahallesi', kaza:'İnegöl', refs:'NFS.d.1444',
      source:'Hatice Uzer, tez no. 585419, s. 28', entries:[{}], coords:[40.07648,29.51138]},
    {il:'Yozgat', ilce:'Sorgun', koy:'Alibâr (tarihî kayıt)', kaza:'Sorgun', refs:'NFS.d.2101',
      year:'1840–1841', source:'2101 ve 2105 Numaralı Sorgun Nüfus Defterleri, Ek-1, s. 106', entries:[{}], historical:true},
  ];
  function filterNames(values) {
    return values.filter(value => !isReviewed(value));
  }
  function scrub(record) {
    for (const field of ['sulaleler','overlayCandidates','candidate_families']) {
      if (Array.isArray(record[field])) record[field] = filterNames(record[field]);
    }
    if (Array.isArray(record.sulale_kayitlari)) {
      record.sulale_kayitlari = record.sulale_kayitlari.filter(entry => !isReviewed(entry?.ad));
    }
    for (const field of ['haneler','defterler']) {
      for (const entry of Array.isArray(record[field]) ? record[field] : []) {
        if (isReviewed(entry?.sulale)) delete entry.sulale;
      }
    }
    if (Array.isArray(record.durumlar)) {
      record.durumlar = record.durumlar.filter(value =>
        !isReviewed(String(value).split(':')[0]) && !/^alidedeogullarikaydi/.test(fold(value)));
    }
    return record;
  }
  function archiveRows() {
    return records.map(({il,ilce,koy,tarihiAd,kaza,refs,year,source,entries,historical}) => ({
      il, ilce, koy, yerlesim_anahtari_sabit:!!historical, sulaleler:[name],
      sulale_kayitlari:entries.map(entry => ({
        ad:name, defter:refs, tarihi_kaza:kaza, karye:tarihiAd||koy, yil:year, hane:entry.house,
        kaynak:source + (entry.page ? ', PDF s. ' + entry.page : ''), aday:!!historical
      }))
    }));
  }
  window.ArchiveFamilyAudit = {name, records, isReviewed, filterNames, scrub, archiveRows};
})();
