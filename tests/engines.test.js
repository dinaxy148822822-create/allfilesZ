'use strict';

/**
 * Engine tests — run with plain Node (no Electron needed):
 *   npm test
 * Generates sample media in tests/tmp, converts it through the real engines
 * (sharp + bundled ffmpeg), and checks the outputs.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// The main-process modules require('electron') only lazily/optionally,
// so stub what they touch before requiring.
process.env.ELECTRON_RUN_AS_NODE = '1';
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'electron') {
    return path.join(__dirname, 'electron-stub.js');
  }
  return origResolve.call(this, request, ...rest);
};

const sharp = require('sharp');
const converter = require('../src/main/converter');
const { compressFile } = require('../src/main/compress');
const { createArchive } = require('../src/main/archive');

  const TMP = path.join(__dirname, 'tmp');
  const OUT = path.join(TMP, 'out');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✘ ${name}${detail ? ' — ' + detail : ''}`); }
}
const size = (p) => fs.statSync(p).size;

async function makeSamples() {
  // PNG (synthetic gradient photo-like)
  const png = path.join(TMP, 'sample.png');
  await sharp({ create: { width: 1200, height: 800, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 60 } } })
    .png().toFile(png);

  // JPG
  const jpg = path.join(TMP, 'sample.jpg');
  await sharp(png).jpeg({ quality: 100 }).toFile(jpg);

  // WAV (2s sine)
  const wav = path.join(TMP, 'sample.wav');
  execFileSync(converter.ffmpegPath(), [
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
    '-c:a', 'pcm_s16le', '-y', wav
  ], { stdio: 'ignore', windowsHide: true });

  // MP4 (1s test pattern with sound)
  const mp4 = path.join(TMP, 'sample.mp4');
  execFileSync(converter.ffmpegPath(), [
    '-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=12',
    '-f', 'lavfi', '-i', 'sine=frequency=880:duration=1',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', '-y', mp4
  ], { stdio: 'ignore', windowsHide: true });

  return { png, jpg, wav, mp4 };
}

(async () => {
  console.log('— allfilesZ engine tests —\n');

  const { png, jpg, wav, mp4 } = await makeSamples();

  console.log('[ffmpeg]');
  console.log('  bundled at:', converter.ffmpegPath());
  check('ffmpeg binary exists', fs.existsSync(converter.ffmpegPath()));

  console.log('\n[image conversions]');
  for (const target of ['png', 'jpg', 'webp', 'avif', 'tiff', 'gif', 'ico']) {
    const out = path.join(TMP, `out.${target}`);
    try {
      await converter.convertImage(png, target, { imageQuality: 82 }, out);
      check(`png → ${target}`, fs.existsSync(out) && size(out) > 100, `${out} ${size(out)}B`);
    } catch (e) { check(`png → ${target}`, false, e.message); }
  }

  console.log('\n[image → pdf]');
  {
    const out = path.join(TMP, 'images.pdf');
    try {
      await converter.imagesToPdf([png, jpg], out);
      check('png+jpg → pdf', fs.existsSync(out) && size(out) > 1000);
    } catch (e) { check('png+jpg → pdf', false, e.message); }
  }

  console.log('\n[audio conversions]');
  for (const target of ['mp3', 'ogg', 'opus', 'flac', 'm4a', 'aac', 'wma']) {
    const out = path.join(TMP, `out.${target}`);
    try {
      await converter.convertAudio(wav, target, { audioBitrate: 128 }, out);
      check(`wav → ${target}`, fs.existsSync(out) && size(out) > 1000);
    } catch (e) { check(`wav → ${target}`, false, e.message); }
  }

  console.log('\n[video conversions]');
  for (const target of ['mp4', 'webm', 'mkv', 'avi', 'mov']) {
    const out = path.join(TMP, `vout.${target}`);
    try {
      await converter.convertVideo(mp4, target, { videoCrf: 28, videoPreset: 'ultrafast', audioBitrate: 96 }, out);
      check(`mp4 → ${target}`, fs.existsSync(out) && size(out) > 1000);
    } catch (e) { check(`mp4 → ${target}`, false, e.message); }
  }

  console.log('\n[compression]');
  {
    const bigJpg = path.join(TMP, 'big.jpg');
    await sharp(png).jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toFile(bigJpg);
    try {
      const r = await compressFile({ src: bigJpg, opts: { imageQuality: 60 }, outDir: OUT, policy: 'overwrite' });
      check(`jpeg compress ${r.inSize} → ${r.outSize} (${Math.round((1 - r.outSize / r.inSize) * 100)}% saved)`,
        !r.skipped && r.outSize < r.inSize);
    } catch (e) { check('jpeg compress', false, e.message); }
  }
  {
    try {
      const r = await compressFile({ src: wav, opts: { imageQuality: 82, audioBitrate: 128, videoCrf: 23 }, outDir: OUT, policy: 'overwrite' });
      check('wav compress (→ flac)', !r.skipped && r.outSize < r.inSize, JSON.stringify(r).slice(0, 120));
    } catch (e) { check('wav compress', false, e.message); }
  }
  {
    try {
      const r = await compressFile({ src: mp4, opts: { videoCrf: 30, videoPreset: 'veryfast', audioBitrate: 64 }, outDir: OUT, policy: 'overwrite' });
      check(`mp4 compress ${r.inSize} → ${r.outSize}`, r.outSize < r.inSize || r.skipped === true);
    } catch (e) { check('mp4 compress', false, e.message); }
  }

  console.log('\n[archives]');
  for (const fmt of ['zip', 'tar', 'tar.gz']) {
    const out = path.join(TMP, `arch.${fmt}`);
    try {
      await createArchive({ files: [png, wav], outPath: out, format: fmt, level: 6 });
      check(fmt + ' archive', fs.existsSync(out) && size(out) > 500);
    } catch (e) { check(fmt + ' archive', false, e.message); }
  }

  console.log('\n[pdf merge]');
  {
    const p1 = path.join(TMP, 'images.pdf');
    const out = path.join(TMP, 'merged.pdf');
    try {
      await converter.mergePdfs([p1, p1], out);
      check('pdf merge', fs.existsSync(out) && size(out) > 1500);
    } catch (e) { check('pdf merge', false, e.message); }
  }

  console.log(`\n— done: ${passed} passed, ${failed} failed —`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
