'use strict';

/**
 * Archive engine: zip / tar / tar.gz — pure streams, no external binaries.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const archiver = require('archiver');

function totalSize(files) {
  let sum = 0;
  const walk = (p) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) fs.readdirSync(p).forEach((c) => walk(path.join(p, c)));
    else sum += st.size;
  };
  files.forEach(walk);
  return sum;
}

/**
 * Create an archive.
 * @param {object} p { files: string[], outPath, format: 'zip'|'tar'|'tar.gz', level: 0..9, onProgress }
 */
function createArchive({ files, outPath, format = 'zip', level = 6, onProgress }) {
  return new Promise((resolve, reject) => {
    const total = totalSize(files) || 1;
    const output = fs.createWriteStream(outPath);
    let archive;
    if (format === 'zip') {
      archive = archiver('zip', { zlib: { level: clampLevel(level) } });
    } else {
      archive = archiver('tar', {});
      if (format === 'tar.gz') {
        const gzip = zlib.createGzip({ level: clampLevel(level) });
        archive.pipe(gzip).pipe(output);
      } else {
        archive.pipe(output);
      }
    }

    let done = false;
    const fail = (err) => { if (!done) { done = true; reject(err); } };

    if (format === 'zip') archive.pipe(output);
    output.on('close', () => { if (!done) { done = true; onProgress && onProgress(100); resolve(outPath); } });
    output.on('error', fail);
    archive.on('error', fail);
    archive.on('progress', (data) => {
      if (onProgress) {
        const pct = Math.min(99, Math.round((data.fs.processedBytes / total) * 100));
        onProgress(pct);
      }
    });

    for (const f of files) {
      const name = path.basename(f);
      if (fs.statSync(f).isDirectory()) archive.directory(f, name);
      else archive.file(f, { name });
    }
    archive.finalize().catch(fail);
  });
}

function clampLevel(level) {
  return Math.max(0, Math.min(9, Number(level) || 6));
}

module.exports = { createArchive };
