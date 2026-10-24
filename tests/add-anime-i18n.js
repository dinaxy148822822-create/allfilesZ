'use strict';
// One-off: add character-theme / background i18n keys to every language pack.
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'src', 'renderer', 'i18n');

const T = {
  en:      ['Character themes', 'Background (photo/GIF)', 'Choose…', 'Remove', 'Background updated', 'Background removed'],
  ru:      ['Темы персонажей', 'Фон (фото/GIF)', 'Выбрать…', 'Убрать', 'Фон обновлён', 'Фон убран'],
  uk:      ['Теми персонажів', 'Фон (фото/GIF)', 'Вибрати…', 'Прибрати', 'Фон оновлено', 'Фон прибрано'],
  de:      ['Charakter-Themes', 'Hintergrund (Foto/GIF)', 'Auswählen…', 'Entfernen', 'Hintergrund aktualisiert', 'Hintergrund entfernt'],
  fr:      ['Thèmes de personnages', 'Arrière-plan (photo/GIF)', 'Choisir…', 'Retirer', 'Arrière-plan mis à jour', 'Arrière-plan retiré'],
  es:      ['Temas de personajes', 'Fondo (foto/GIF)', 'Elegir…', 'Quitar', 'Fondo actualizado', 'Fondo eliminado'],
  it:      ['Temi personaggi', 'Sfondo (foto/GIF)', 'Scegli…', 'Rimuovi', 'Sfondo aggiornato', 'Sfondo rimosso'],
  pt:      ['Temas de personagens', 'Fundo (foto/GIF)', 'Escolher…', 'Remover', 'Fundo atualizado', 'Fundo removido'],
  nl:      ['Personage-thema’s', 'Achtergrond (foto/GIF)', 'Kiezen…', 'Verwijderen', 'Achtergrond bijgewerkt', 'Achtergrond verwijderd'],
  pl:      ['Motywy postaci', 'Tło (zdjęcie/GIF)', 'Wybierz…', 'Usuń', 'Tło zaktualizowane', 'Tło usunięte'],
  cs:      ['Témata postav', 'Pozadí (foto/GIF)', 'Vybrat…', 'Odebrat', 'Pozadí aktualizováno', 'Pozadí odebráno'],
  sv:      ['Karaktärsteman', 'Bakgrund (foto/GIF)', 'Välj…', 'Ta bort', 'Bakgrund uppdaterad', 'Bakgrund borttagen'],
  tr:      ['Karakter temaları', 'Arka plan (foto/GIF)', 'Seç…', 'Kaldır', 'Arka plan güncellendi', 'Arka plan kaldırıldı'],
  ar:      ['ثيمات الشخصيات', 'الخلفية (صورة/GIF)', 'اختيار…', 'إزالة', 'تم تحديث الخلفية', 'تمت إزالة الخلفية'],
  he:      ['ערכות נושא של דמויות', 'רקע (תמונה/GIF)', 'בחירה…', 'הסרה', 'הרקע עודכן', 'הרקע הוסר'],
  hi:      ['किरदार थीम', 'बैकग्राउंड (फ़ोटो/GIF)', 'चुनें…', 'हटाएँ', 'बैकग्राउंड बदला गया', 'बैकग्राउंड हटाया गया'],
  id:      ['Tema karakter', 'Latar belakang (foto/GIF)', 'Pilih…', 'Hapus', 'Latar diperbarui', 'Latar dihapus'],
  vi:      ['Chủ đề nhân vật', 'Nền (ảnh/GIF)', 'Chọn…', 'Xóa', 'Đã đổi nền', 'Đã xóa nền'],
  'zh-CN': ['角色主题', '背景（图片/GIF）', '选择…', '移除', '背景已更新', '背景已移除'],
  'zh-TW': ['角色主題', '背景（圖片/GIF）', '選擇…', '移除', '背景已更新', '背景已移除'],
  ja:      ['キャラクターテーマ', '背景（写真/GIF）', '選択…', '削除', '背景を更新しました', '背景を削除しました'],
  ko:      ['캐릭터 테마', '배경 (사진/GIF)', '선택…', '제거', '배경이 업데이트됨', '배경이 제거됨']
};

for (const [code, [ct, bg, choose, remove, setT, rmT]] of Object.entries(T)) {
  const file = path.join(DIR, `${code}.json`);
  const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
  pack.settings.characterTheme = ct;
  pack.settings.background = bg;
  pack.settings.chooseBg = choose;
  pack.settings.clearBg = remove;
  pack.toast = pack.toast || {};
  pack.toast.bgSet = setT;
  pack.toast.bgRemoved = rmT;
  fs.writeFileSync(file, JSON.stringify(pack, null, 2) + '\n', 'utf8');
}
console.log(`anime keys added to ${Object.keys(T).length} packs`);
