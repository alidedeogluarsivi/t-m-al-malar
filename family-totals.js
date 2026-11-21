(function (g) {
  'use strict';
  function key(value) {
    return String(value || '').toLocaleLowerCase('tr-TR').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i')
      .replace(/[^a-z0-9]/g, '').replace(/(?:ogullari|ogullar|oglu)$/, '');
  }
  const format = n => n.toLocaleString('tr-TR');
  let pending;
  function load() {
    if (!pending) pending = fetch('./catalog/sulale_tum_arsiv_rapor.json?v=family-totals-1', {cache: 'no-cache'})
      .then(r => {if (!r.ok) throw Error('Family totals HTTP ' + r.status); return r.json();})
      .then(report => {
        const s = report.family_stats;
        if (!s || s.version !== 1 || !Number.isSafeInteger(s.records) || !Number.isSafeInteger(s.unique_names) || s.records < s.unique_names || s.unique_names < 0) throw Error('Invalid family totals');
        return s;
      });
    return pending;
  }
  async function show() {
    try {
      const s = await load(), count = document.getElementById('familyStat'), names = document.getElementById('familyNameStat'), totals = document.getElementById('familyTotals');
      const unique = document.getElementById('familyUniqueStat');
      if (unique) {unique.textContent = format(s.unique_names); unique.title = s.name_definition;}
      if (count) {count.textContent = format(s.records); count.title = s.record_definition;}
      if (names) {names.textContent = format(s.unique_names) + ' FARKLI SÜLALE ADI'; names.title = s.name_definition;}
      if (totals) {totals.textContent = format(s.records) + ' SÜLALE KAYDI · ' + format(s.unique_names) + ' FARKLI SÜLALE ADI'; totals.title = s.record_definition + ' ' + s.name_definition;}
      return s;
    } catch (error) {
      console.warn('Sülale toplamları yüklenemedi:', error);
      const totals = document.getElementById('familyTotals');
      if (totals) totals.textContent = 'ARŞİV TOPLAM BİLGİSİ YÜKLENEMEDİ.';
      return null;
    }
  }
  g.ArchiveFamilyTotals = {key, load, show};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show, {once: true});
  else show();
})(globalThis);
