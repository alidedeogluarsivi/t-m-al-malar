(() => {
  'use strict';
  const settlementCount = document.getElementById('mappedStat') || document.getElementById('placeStat');
  const pdfCount = document.getElementById('pdfStat');
  const salesCount = document.getElementById('pageStat');

  function show(element, value) {
    if (element && Number.isSafeInteger(value) && value >= 0) {
      element.textContent = value.toLocaleString('tr-TR');
    }
  }

  async function read(path) {
    const response = await fetch(path, {cache: 'no-cache'});
    if (!response.ok) throw new Error(path + ' HTTP ' + response.status);
    return response.json();
  }

  read('./catalog/settlement-totals.json').then(totals => {
    show(settlementCount, totals.settlement_cards);
    show(pdfCount, totals.archive_pdfs);
    if (settlementCount) settlementCount.title = 'NFS, TMT veya sülale kaydı bulunan tekil il, ilçe ve yerleşim kartları';
  }).catch(error => console.warn('Arşiv sayaçları yüklenemedi:', error));

  read('./sales_catalog.json').then(catalog => {
    if (Array.isArray(catalog.items)) show(salesCount, catalog.items.length);
  }).catch(error => console.warn('E-satış sayacı yüklenemedi:', error));
})();
