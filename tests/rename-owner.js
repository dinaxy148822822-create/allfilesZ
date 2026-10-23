'use strict';
// One-off: replace placeholder owner "dinaxy" with the real GitHub login
// passed as argv[2] across the repo's text files.
const fs = require('fs');
const path = require('path');

const NEW = process.argv[2];
if (!NEW) { console.error('usage: node rename-owner.js <login>'); process.exit(1); }
const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['.git', 'node_modules', 'release', 'docs', 'build', 'tests']);

const REPL = [
  ['github.com/dinaxy/allfilesZ', `github.com/${NEW}/allfilesZ`],
  ['dinaxy/allfilesZ', `${NEW}/allfilesZ`],
  ['owner: dinaxy', `owner: ${NEW}`],
  ['io.github.dinaxy.allfilesZ', `io.github.${NEW}.allfilesZ`],
  ['Publisher: dinaxy', `Publisher: ${NEW}`],
  ['PackageIdentifier: dinaxy.allfilesZ', `PackageIdentifier: ${NEW}.allfilesZ`]
];

let changed = 0;
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    if (!/\.(json|yml|yaml|md|js|ps1|sh|desktop|html|css|txt)$/.test(name)) continue;
    let s = fs.readFileSync(p, 'utf8');
    const orig = s;
    for (const [a, b] of REPL) s = s.split(a).join(b);
    if (s !== orig) { fs.writeFileSync(p, s, 'utf8'); changed++; console.log('updated:', path.relative(ROOT, p)); }
  }
}
walk(ROOT);
console.log(`done, ${changed} files updated`);
