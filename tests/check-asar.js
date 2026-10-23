'use strict';
// Usage: npx asar list <asar> | node tests/check-asar.js
let d = '';
process.stdin.on('data', (c) => { d += c; });
process.stdin.on('end', () => {
  const ls = d.split('\n').map((s) => s.trim()).filter(Boolean);
  const has = (p) => ls.includes(p);
  const needed = [
    'archiver-utils', 'zip-stream', 'tar-stream', 'async', 'readable-stream',
    'buffer-crc32', 'readdir-glob', 'compress-commons', 'crc32-stream', 'lazystream',
    'archiver', 'pdf-lib', 'sharp'
  ];
  let bad = 0;
  for (const m of needed) {
    const ok = has(`\\node_modules\\${m}\\package.json`);
    if (!ok) { bad++; console.log('MISSING top-level:', m); }
  }
  console.log(bad ? `${bad} missing` : 'ALL runtime deps hoisted in asar ✔');
  process.exit(bad ? 1 : 0);
});
