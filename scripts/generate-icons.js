'use strict';

/**
 * Generates app icons from a hand-drawn SVG (no fonts used → deterministic):
 *   build/icon.png      1024×1024  (electron-builder: win + mac)
 *   build/icons/*.png   512/256/128/64/32 (linux)
 *   build/icon.ico      multi-size ICO for Windows
 * Run: npm run icons
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const BUILD = path.join(__dirname, '..', 'build');
const ICONS = path.join(BUILD, 'icons');
fs.mkdirSync(ICONS, { recursive: true });

// Logo: glassy squircle, deep-space gradient, teal→violet "Z" drawn as a
// single transform path with arrowheads on both bars (no fonts → deterministic).
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#101427"/>
      <stop offset="0.55" stop-color="#141a33"/>
      <stop offset="1" stop-color="#0d1020"/>
    </linearGradient>
    <linearGradient id="acc" x1="0.15" y1="1" x2="0.85" y2="0">
      <stop offset="0" stop-color="#2dd4bf"/>
      <stop offset="0.55" stop-color="#60a5fa"/>
      <stop offset="1" stop-color="#a78bfa"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.3" cy="0.25" r="0.9">
      <stop offset="0" stop-color="#2dd4bf" stop-opacity="0.20"/>
      <stop offset="0.5" stop-color="#a78bfa" stop-opacity="0.10"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect x="8" y="8" width="1008" height="1008" rx="232" fill="url(#bg)"/>
  <rect x="8" y="8" width="1008" height="1008" rx="232" fill="url(#glow)"/>
  <rect x="8" y="8" width="1008" height="1008" rx="232" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="6"/>

  <!-- Z: one continuous stroke, rounded joins -->
  <path d="M 316 356 H 700 L 316 668 H 646"
        fill="none" stroke="url(#acc)" stroke-width="76"
        stroke-linecap="round" stroke-linejoin="round"/>

  <!-- arrowheads: top bar (right) + bottom bar (right) -->
  <path d="M 762 356 L 668 302 L 668 410 Z" fill="url(#acc)"/>
  <path d="M 716 668 L 622 614 L 622 722 Z" fill="url(#acc)"/>

  <!-- exchange arrows badge, bottom-left: ⇄ -->
  <g stroke="#2dd4bf" stroke-width="30" stroke-linecap="round" fill="none" opacity="0.95">
    <path d="M 258 782 h 108"/>
    <path d="M 338 752 l 40 30 -40 30"/>
  </g>
  <g stroke="#a78bfa" stroke-width="30" stroke-linecap="round" fill="none" opacity="0.95">
    <path d="M 258 866 h 108" transform="translate(148,0) scale(-1,1) translate(-148,0)"/>
    <path d="M 258 866 h 108" opacity="0"/>
  </g>
  <path d="M 366 866 h -108" stroke="#a78bfa" stroke-width="30" stroke-linecap="round" fill="none" opacity="0.95"/>
  <path d="M 286 836 l -40 30 40 30" stroke="#a78bfa" stroke-width="30" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.95"/>
</svg>`;

// PNG-in-ICO wrapper (same trick the app uses at runtime)
function icoEntry(png, size) {
  const e = Buffer.alloc(16);
  e[0] = size >= 256 ? 0 : size;
  e[1] = size >= 256 ? 0 : size;
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(png.length, 8);
  return e;
}
function wrapIco(entries) { // entries: [{size, png}]
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + 16 * entries.length;
  const dir = Buffer.concat(entries.map((en, i) => {
    const e = icoEntry(en.png, en.size);
    e.writeUInt32LE(offset, 12);
    offset += en.png.length;
    return e;
  }));
  return Buffer.concat([header, dir, ...entries.map((en) => en.png)]);
}

(async () => {
  await sharp(Buffer.from(SVG)).resize(1024, 1024).png().toFile(path.join(BUILD, 'icon.png'));
  const sizes = [512, 256, 128, 64, 32];
  const entries = [];
  for (const s of sizes) {
    await sharp(Buffer.from(SVG)).resize(s, s).png().toFile(path.join(ICONS, `${s}x${s}.png`));
  }
  // ICO: include 256 for large views + smaller sizes
  for (const s of [256, 64, 48, 32, 16]) {
    entries.push({ size: s, png: await sharp(Buffer.from(SVG)).resize(s, s).png().toBuffer() });
  }
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), wrapIco(entries));
  console.log('icons written to build/ (icon.png, icon.ico, icons/*.png)');
})().catch((e) => { console.error(e); process.exit(1); });
