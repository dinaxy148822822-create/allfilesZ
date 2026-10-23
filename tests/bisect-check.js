'use strict';
const fs = require('fs');
const cp = require('child_process');

const file = process.argv[2];
const lines = fs.readFileSync(file, 'utf8').split('\n');

for (let n = 5; n <= lines.length; n++) {
  fs.writeFileSync('tmpchk.js', lines.slice(0, n).join('\n'));
  const r = cp.spawnSync(process.execPath, ['--check', 'tmpchk.js'], { encoding: 'utf8' });
  const err = r.stderr || '';
  // incomplete prefixes naturally end with these; anything else is a real error
  if (err && !/Unexpected end of input|Unexpected token/m.test(err)) {
    console.log('FIRST REAL ERROR at prefix line', n, '→ source line:', JSON.stringify(lines[n - 1]));
    console.log(err.split('\n').slice(0, 8).join('\n'));
    break;
  }
}
try { fs.unlinkSync('tmpchk.js'); } catch (_) {}
