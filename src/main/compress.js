'use strict';

/**
 * Compression engine — shrink files with no visible/audible difference.
 * Presets tune quality so the output stays perceptually identical:
 *   high     → visually lossless (q≈92, CRF 20, 224 kbps)
 *   balanced → default, excellent quality (q≈82, CRF 23, 192 kbps)
 *   tiny     → maximum shrink, slight quality trade-off (q≈60, CRF 28, 128 kbps)
 * If re-encoding would make the file bigger, the original is kept and the
 * file is reported as "already optimal".
 */

const fs = require('fs');
const path = require('path');
const { clamp, convertImage, compressPdf, runFfmpeg, probeDurationSec } = require('./converter');

const PRESETS = {
  high:     { imageQuality: 92, videoCrf: 20, audioBitrate: 224, pdfLevel: 'printer' },
  balanced: { imageQuality: 82, videoCrf: 23, audioBitrate: 192, pdfLevel: 'ebook' },
  tiny:     { imageQuality: 60, videoCrf: 28, audioBitrate: 128, pdfLevel: 'screen' }
};

const extOf = (p) => path.extname(p).toLowerCase().replace('.', '');

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'tif', 'tiff', 'gif']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'oga', 'opus', 'flac', 'aac', 'm4a', 'wma']);
const VIDEO_EXT = new Set(['mp4', 'mkv', 'webm', 'avi', 'mov', 'm4v', 'flv', 'wmv', 'mpg', 'mpeg', 'ts', '3gp', 'ogv']);

async function compressImage(src, opts, out) {
  const e = extOf(src);
  const target = e === 'jpeg' ? 'jpg' : e; // same format, smarter encoder
  const o = { imageQuality: opts.imageQuality, keepMeta: true };
  if (target === 'png' && opts.imageQuality < 70) {
    // tiny preset: palette quantization (visually fine for UI/graphic PNGs)
    await require('sharp')(src, { failOn: 'none' })
      .png({ palette: true, quality: opts.imageQuality, compressionLevel: 9 })
      .toFile(out);
    return;
  }
  await convertImage(src, target, o, out);
}

async function compressAudio(src, opts, out, onProgress, requestId) {
  const e = extOf(src);
  const br = clamp(opts.audioBitrate, 48, 320);
  let args;
  if (e === 'wav' || e === 'aiff' || e === 'aif') {
    args = ['-vn', '-c:a', 'flac', '-compression_level', '8', out]; // lossless shrink
  } else if (e === 'flac') {
    args = ['-vn', '-c:a', 'flac', '-compression_level', '12', out];
  } else if (e === 'mp3') {
    args = ['-vn', '-c:a', 'libmp3lame', '-b:a', `${br}k`, out];
  } else if (e === 'm4a' || e === 'aac') {
    args = ['-vn', '-c:a', 'aac', '-b:a', `${br}k`, out];
  } else if (e === 'ogg' || e === 'oga') {
    args = ['-vn', '-c:a', 'libvorbis', '-q:a', String(clamp(Math.round(br / 32), 0, 10)), out];
  } else if (e === 'opus') {
    args = ['-vn', '-c:a', 'libopus', '-b:a', `${br}k`, out];
  } else if (e === 'wma') {
    args = ['-vn', '-c:a', 'wmav2', '-b:a', `${br}k`, out];
  } else {
    throw new Error('Unsupported audio format');
  }
  const totalSec = await probeDurationSec(src);
  await runFfmpeg(['-i', src, ...args], { onProgress, totalSec, requestId });
}

async function compressVideo(src, opts, out, onProgress, requestId) {
  const e = extOf(src);
  const crf = clamp(opts.videoCrf, 14, 34);
  const ab = clamp(opts.audioBitrate, 48, 256);
  const common = ['-c:v', 'libx264', '-crf', String(crf), '-preset', opts.videoPreset || 'medium',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', `${Math.min(ab, 192)}k`];
  let args;
  if (e === 'webm') {
    args = ['-i', src, '-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-row-mt', '1',
      '-deadline', 'good', '-cpu-used', '2', '-c:a', 'libopus', '-b:a', `${Math.min(ab, 192)}k`, out];
  } else if (e === 'gif') {
    args = ['-i', src, '-filter_complex',
      `[0:v]fps=12,scale=800:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
      '-loop', '0', '-an', out];
  } else {
    const movFlag = out.endsWith('.mp4') ? ['-movflags', '+faststart'] : [];
    args = ['-i', src, ...common, ...movFlag, out];
  }
  const totalSec = await probeDurationSec(src);
  await runFfmpeg(args, { onProgress, totalSec, requestId });
}

function outExtFor(src) {
  const e = extOf(src);
  if (e === 'jpeg') return 'jpg';
  if (e === 'wav' || e === 'aiff' || e === 'aif') return 'flac'; // lossless shrink
  if (!['mp4', 'mkv', 'webm'].includes(e) && VIDEO_EXT.has(e)) return 'mp4'; // avi/wmv/flv → modern mp4
  return e;
}

/**
 * Compress one file. Returns { skipped:true } when the original is already
 * smaller than the re-encoded result (nothing to gain).
 */
async function compressFile({ src, opts = {}, outDir, policy = 'keepBoth', requestId, onProgress = () => {} }) {
  const e = extOf(src);
  const isImage = IMAGE_EXT.has(e);
  const isAudio = AUDIO_EXT.has(e);
  const isVideo = VIDEO_EXT.has(e);
  const isPdf = e === 'pdf';
  const isSvg = e === 'svg' || e === 'bmp' || e === 'ico' || e === 'heic' || e === 'heif';

  if (!isImage && !isAudio && !isVideo && !isPdf && !isSvg) {
    throw new Error('This file type cannot be recompressed — put it in an archive (Archive page) instead');
  }

  fs.mkdirSync(outDir, { recursive: true });
  const outExt = isPdf ? 'pdf' : isSvg ? 'webp' : outExtFor(src);
  let out = path.join(outDir, path.basename(src, path.extname(src)) + '.' + outExt);
  // Never overwrite the original — compression must not be destructive.
  if (path.resolve(out) === path.resolve(src)) {
    out = out.replace(/(\.[^.]+)$/, ' — compressed$1');
  } else if (policy !== 'overwrite') {
    out = out.replace(/(\.[^.]+)$/, ' — compressed$1');
    let candidate = out;
    for (let i = 1; fs.existsSync(candidate) && i < 999; i++) {
      candidate = out.replace(/(\.[^.]+)$/, ` (${i})$1`);
    }
    out = candidate;
  }

  onProgress(2);
  const inSize = fs.statSync(src).size;

  if (isPdf) {
    const { detectGhostscript } = require('./detectors');
    const gs = detectGhostscript();
    if (!gs) throw new Error('PDF compression needs Ghostscript installed (see Settings → Engines)');
    await compressPdf(src, out, gs, opts.pdfLevel, onProgress);
  } else if (isImage || isSvg) {
    if (isSvg) {
      await convertImage(src, 'webp', { imageQuality: opts.imageQuality, keepMeta: false }, out);
    } else {
      await compressImage(src, opts, out);
    }
    onProgress(90);
  } else if (isAudio) {
    await compressAudio(src, opts, out, onProgress, requestId);
  } else {
    await compressVideo(src, opts, out, onProgress, requestId);
  }

  const outSize = fs.statSync(out).size;
  if (outSize >= inSize) {
    // Recompression gained nothing → keep the original, remove our attempt.
    try { fs.unlinkSync(out); } catch (_) { /* ignore */ }
    onProgress(100);
    return { skipped: true, outPath: src, inSize, outSize: inSize };
  }
  onProgress(100);
  return { skipped: false, outPath: out, inSize, outSize };
}

module.exports = { compressFile, PRESETS };
