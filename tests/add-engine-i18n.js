'use strict';
// One-off: inject engine-install i18n keys into every language pack.
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'src', 'renderer', 'i18n');

const T = {
  en:      { install: 'Install',              installing: 'Installing…',              installed: '{name} installed',                failed: 'Could not install {name}' },
  ru:      { install: 'Установить',           installing: 'Установка…',               installed: '{name} установлен',               failed: 'Не удалось установить {name}' },
  uk:      { install: 'Встановити',           installing: 'Встановлення…',           installed: '{name} встановлено',              failed: 'Не вдалося встановити {name}' },
  de:      { install: 'Installieren',         installing: 'Wird installiert…',       installed: '{name} installiert',              failed: '{name} konnte nicht installiert werden' },
  fr:      { install: 'Installer',            installing: 'Installation…',           installed: '{name} installé',                 failed: 'Impossible d’installer {name}' },
  es:      { install: 'Instalar',             installing: 'Instalando…',             installed: '{name} instalado',                failed: 'No se pudo instalar {name}' },
  it:      { install: 'Installa',             installing: 'Installazione…',          installed: '{name} installato',               failed: 'Impossibile installare {name}' },
  pt:      { install: 'Instalar',             installing: 'Instalando…',             installed: '{name} instalado',                failed: 'Não foi possível instalar {name}' },
  nl:      { install: 'Installeren',          installing: 'Installeren…',            installed: '{name} geïnstalleerd',            failed: 'Kan {name} niet installeren' },
  pl:      { install: 'Zainstaluj',           installing: 'Instalowanie…',           installed: 'Zainstalowano: {name}',           failed: 'Nie udało się zainstalować: {name}' },
  cs:      { install: 'Nainstalovat',         installing: 'Instalace…',              installed: '{name} nainstalován',             failed: 'Nepodařilo se nainstalovat: {name}' },
  sv:      { install: 'Installera',           installing: 'Installerar…',            installed: '{name} installerad',              failed: 'Kunde inte installera {name}' },
  tr:      { install: 'Yükle',                installing: 'Yükleniyor…',             installed: '{name} yüklendi',                 failed: '{name} yüklenemedi' },
  ar:      { install: 'تثبيت',                installing: 'جارٍ التثبيت…',            installed: 'تم تثبيت {name}',                 failed: 'تعذر تثبيت {name}' },
  he:      { install: 'התקנה',                installing: 'מתקין…',                  installed: '{name} הותקן',                    failed: 'לא ניתן להתקין את {name}' },
  hi:      { install: 'इंस्टॉल करें',          installing: 'इंस्टॉल हो रहा है…',        installed: '{name} इंस्टॉल हुआ',              failed: '{name} इंस्टॉल नहीं हो सका' },
  id:      { install: 'Pasang',               installing: 'Memasang…',               installed: '{name} terpasang',                failed: 'Gagal memasang {name}' },
  vi:      { install: 'Cài đặt',              installing: 'Đang cài đặt…',           installed: 'Đã cài đặt {name}',              failed: 'Không thể cài đặt {name}' },
  'zh-CN': { install: '安装',                 installing: '安装中…',                  installed: '已安装 {name}',                   failed: '无法安装 {name}' },
  'zh-TW': { install: '安裝',                 installing: '安裝中…',                  installed: '已安裝 {name}',                   failed: '無法安裝 {name}' },
  ja:      { install: 'インストール',          installing: 'インストール中…',           installed: '{name} をインストールしました',      failed: '{name} をインストールできませんでした' },
  ko:      { install: '설치',                 installing: '설치 중…',                 installed: '{name} 설치됨',                    failed: '{name} 설치 실패' }
};

for (const [code, tr] of Object.entries(T)) {
  const file = path.join(DIR, `${code}.json`);
  const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
  pack.settings = pack.settings || {};
  pack.settings.install = tr.install;
  pack.settings.installing = tr.installing;
  pack.toast = pack.toast || {};
  pack.toast.engineInstalled = tr.installed;
  pack.toast.engineInstallFailed = tr.failed;
  fs.writeFileSync(file, JSON.stringify(pack, null, 2) + '\n', 'utf8');
}
console.log(`injected engine-install keys into ${Object.keys(T).length} packs`);
