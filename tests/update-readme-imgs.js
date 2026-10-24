'use strict';
const fs = require('fs');
for (const f of ['README.md', 'README.ru.md']) {
  let s = fs.readFileSync(f, 'utf8');
  s = s.split('docs/screenshots/convert-light-ru.png').join('docs/screenshots/convert-dark.png');
  s = s.split('docs/screenshots/compress-dark.png').join('docs/screenshots/settings-light.png');
  s = s.split('alt="allfilesZ — светлая тема"').join('alt="allfilesZ — Convert page"');
  s = s.split('alt="Compress page"').join('alt="Settings — engines and activity graph"');
  fs.writeFileSync(f, s);
}
console.log('readme images updated');
