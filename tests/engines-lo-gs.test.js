'use strict';
// Functional test for the optional system engines: LibreOffice (docs→PDF)
// and Ghostscript (PDF compression). Run: node tests/engines-lo-gs.test.js
const Module = require('module');
const path = require('path');
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'electron') return path.join(__dirname, 'electron-stub.js');
  return orig.call(this, request, ...rest);
};

const fs = require('fs');
const converter = require('../src/main/converter');
const { compressFile } = require('../src/main/compress');
const { detectLibreOffice, detectGhostscript } = require('../src/main/detectors');

(async () => {
  const tmp = path.join(__dirname, 'tmp');
  const out = path.join(tmp, 'out');
  fs.mkdirSync(out, { recursive: true });

  console.log('LibreOffice:', detectLibreOffice() || 'NOT FOUND');
  console.log('Ghostscript:', detectGhostscript() || 'NOT FOUND');

  let failed = 0;

  if (detectLibreOffice()) {
    try {
      fs.writeFileSync(path.join(tmp, 'doc.txt'), 'allfilesZ engine test — документ конвертация тест тест');
      const r = await converter.convertFile({
        src: path.join(tmp, 'doc.txt'), target: 'pdf', opts: {},
        outDir: out, policy: 'keepBoth', onProgress: () => {}
      });
      console.log('✔ DOC->PDF:', path.basename(r.outPath), r.outSize, 'bytes');
    } catch (e) { failed++; console.error('✘ DOC->PDF failed:', e.message); }
  }

  if (detectGhostscript()) {
    try {
      const { PDFDocument, rgb } = require('pdf-lib');
      const doc = await PDFDocument.create();
      for (let i = 0; i < 10; i++) {
        const p = doc.addPage([1200, 1600]);
        p.drawRectangle({ x: 0, y: 0, width: 1200, height: 1600, color: rgb(0.1 + i * 0.04, 0.3, 0.7) });
      }
      const src = path.join(tmp, 'engine-big.pdf');
      fs.writeFileSync(src, await doc.save());
      const r = await compressFile({
        src, opts: { pdfLevel: 'ebook' }, outDir: out, policy: 'keepBoth', onProgress: () => {}
      });
      const saved = Math.round((1 - r.outSize / r.inSize) * 100);
      console.log(`✔ PDF COMPRESS: ${r.inSize} -> ${r.outSize} bytes (−${saved}%)`);
    } catch (e) { failed++; console.error('✘ PDF compress failed:', e.message); }
  }

  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
