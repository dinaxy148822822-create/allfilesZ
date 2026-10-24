'use strict';
// One-off: add settings.activity ("Conversion activity") to all language packs.
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'src', 'renderer', 'i18n');

const T = {
  en: 'Conversion activity', ru: 'История конвертаций', uk: 'Історія конвертацій',
  de: 'Konvertierungsaktivität', fr: 'Activité de conversion', es: 'Actividad de conversión',
  it: 'Attività di conversione', pt: 'Atividade de conversão', nl: 'Conversie-activiteit',
  pl: 'Aktywność konwersji', cs: 'Aktivita převodů', sv: 'Konverteringsaktivitet',
  tr: 'Dönüşüm etkinliği', ar: 'نشاط التحويل', he: 'פעילות המרה',
  hi: 'रूपांतरण गतिविधि', id: 'Aktivitas konversi', vi: 'Hoạt động chuyển đổi',
  'zh-CN': '转换动态', 'zh-TW': '轉換動態', ja: '変換アクティビティ', ko: '변환 활동'
};

for (const [code, text] of Object.entries(T)) {
  const file = path.join(DIR, `${code}.json`);
  const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
  pack.settings = pack.settings || {};
  pack.settings.activity = text;
  fs.writeFileSync(file, JSON.stringify(pack, null, 2) + '\n', 'utf8');
}
console.log(`activity key added to ${Object.keys(T).length} packs`);
