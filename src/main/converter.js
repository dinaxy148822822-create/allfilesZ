'use strict';

/**
 * allfilesZ conversion engine.
 *
 * Images   → sharp (libvips): png / jpg / webp / avif / tiff / gif / ico / pdf
 * Audio    → bundled ffmpeg: mp3 / wav / ogg / opus / flac / m4a / aac / wma
 * Video    → bundled ffmpeg: mp4 / mkv / webm / avi / mov / gif
 * Docs     → LibreOffice (if installed): doc(x) / xls(x) / ppt(x) / odf / rtf → pdf
 * PDF      → pdf-lib (merge, images→pdf); Ghostscript (if installed) for compression
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');

// ---------------------------------------------------------------- helpers ---

const extOf = (p) => path.extname(p).toLowerCase().replace('.', '');

const IMAGE_IN = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'tif', 'tiff', 'gif', 'svg', 'bmp', 'heic', 'heif', 'ico']);
const AUDIO_IN = new Set(['mp3', 'wav', 'ogg', 'oga', 'opus', 'flac', 'aac', 'm4a', 'wma', 'aiff', 'aif', 'amr', 'ac3']);
const VIDEO_IN = new Set(['mp4', 'mkv', 'webm', 'avi', 'mov', 'm4v', 'flv', 'wmv', 'mpg', 'mpeg', 'ts', '3gp', 'ogv']);
const DOC_IN = new Set(['doc', 'docx', 'odt', 'rtf', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp', 'txt', 'md', 'csv']);

const FORMATS = {
  image: ['png', 'jpg', 'webp', 'avif', 'tiff', 'gif', 'ico', 'pdf'],
  audio: ['mp3', 'wav', 'ogg', 'opus', 'flac', 'm4a', 'aac', 'wma'],
  video: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'gif'],
  doc: ['pdf']
};

function categoryOf(file) {
  const e = extOf(file);
  if (IMAGE_IN.has(e)) return 'image';
  if (AUDIO_IN.has(e)) return 'audio';
  if (VIDEO_IN.has(e)) return 'video';
  if (DOC_IN.has(e)) return 'doc';
  if (e === 'pdf') return 'pdf';
  return null;
}

function fileTypeLabel(file) {
  const e = extOf(file);
  if (IMAGE_IN.has(e)) return 'image';
  if (AUDIO_IN.has(e)) return 'audio';
  if (VIDEO_IN.has(e)) return 'video';
  if (e === 'pdf') return 'pdf';
  if (DOC_IN.has(e)) return 'document';
  return 'other';
}

let ffmpegBin = null;
function ffmpegPath() {
  if (ffmpegBin) return ffmpegBin;
  let candidate = 'ffmpeg';
  try {
    const staticPath = require('ffmpeg-static');
    if (staticPath) {
      candidate = staticPath;
      // When packaged, the binary is copied to resources/ffmpeg/ (outside asar)
      try {
        const { app } = require('electron');
        if (app && app.isPackaged) {
          const packaged = path.join(process.resourcesPath, 'ffmpeg', path.basename(staticPath));
          if (fs.existsSync(packaged)) candidate = packaged;
        }
      } catch (_) { /* not inside electron */ }
    }
  } catch (_) { /* fall back to PATH */ }
  ffmpegBin = candidate;
  return ffmpegBin;
}

const activeProcs = new Map(); // requestId -> ChildProcess

function cancelJob(requestId) {
  const proc = activeProcs.get(requestId);
  if (proc) {
    try { proc.kill('SIGKILL'); } catch (_) { /* already dead */ }
    activeProcs.delete(requestId);
    return true;
  }
  return false;
}

function runFfmpeg(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      ffmpegPath(),
      ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', ...args, '-progress', 'pipe:1', '-nostats'],
      { windowsHide: true }
    );
    if (opts.requestId) activeProcs.set(opts.requestId, proc);
    let errTail = '';
    proc.stderr.on('data', (d) => { errTail = (errTail + d.toString()).slice(-1200); });
    proc.stdout.on('data', (d) => {
      if (!opts.onProgress || !opts.totalSec) return;
      const matches = [...d.toString().matchAll(/out_time_us=(\d+)/g)];
      const last = matches[matches.length - 1];
      if (last) {
        const pct = Math.max(0, Math.min(99, Math.round((Number(last[1]) / 1e6 / opts.totalSec) * 100)));
        opts.onProgress(pct);
      }
    });
    proc.on('error', (e) => {
      if (opts.requestId) activeProcs.delete(opts.requestId);
      reject(e);
    });
    proc.on('close', (code) => {
      if (opts.requestId) activeProcs.delete(opts.requestId);
      if (code === 0) resolve();
      else reject(new Error(errTail.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

function probeDurationSec(file) {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath(), ['-hide_banner', '-i', file], { windowsHide: true });
    let out = '';
    proc.stderr.on('data', (d) => { out += d.toString(); });
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      const m = out.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return resolve(null);
      resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
    });
  });
}

function tmpFile(ext) {
  return path.join(os.tmpdir(), `allfilesz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
}

/** Unique output path honoring the overwrite policy. */
function resolveOutPath(src, targetExt, outDir, policy) {
  const base = path.basename(src, path.extname(src));
  let out = path.join(outDir, `${base}.${targetExt}`);
  if (policy === 'overwrite' || !fs.existsSync(out)) return out;
  for (let i = 1; i < 1000; i++) {
    out = path.join(outDir, `${base} (${i}).${targetExt}`);
    if (!fs.existsSync(out)) return out;
  }
  return path.join(outDir, `${base}-${Date.now()}.${targetExt}`);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ----------------------------------------------------------------- images ---

/** Wrap a 256×256 PNG buffer into a valid .ico container (PNG-in-ICO). */
function wrapIco(pngBuf) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);   // reserved
  header.writeUInt16LE(1, 2);   // type: icon
  header.writeUInt16LE(1, 4);   // image count
  const entry = Buffer.alloc(16);
  entry[0] = 0;                 // width 256 → 0
  entry[1] = 0;                 // height 256 → 0
  entry[2] = 0;                 // palette
  entry[3] = 0;                 // reserved
  entry.writeUInt16LE(1, 4);    // color planes
  entry.writeUInt16LE(32, 6);   // bits per pixel
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(22, 12);  // data offset: 6 + 16
  return Buffer.concat([header, entry, pngBuf]);
}

/** Normalize exotic inputs (bmp / ico) to PNG in tmp so sharp can read them. */
async function normalizeImageInput(src) {
  const e = extOf(src);
  if (e !== 'bmp' && e !== 'ico') return src;
  const tmp = tmpFile('png');
  await runFfmpeg(['-i', src, '-frames:v', '1', '-y', tmp]);
  return tmp;
}

async function convertImage(src, target, opts, out) {
  const input = await normalizeImageInput(src);
  const animated = extOf(input) === 'gif' && target === 'gif';
  let pipeline = sharp(input, { failOn: 'none', animated });
  if (opts.maxEdge) {
    pipeline = pipeline.resize({ width: opts.maxEdge, height: opts.maxEdge, fit: 'inside', withoutEnlargement: true });
  }
  if (opts.keepMeta !== false) pipeline = pipeline.withMetadata();

  const q = clamp(opts.imageQuality ?? 82, 10, 100);

  if (target === 'jpg' || target === 'jpeg') {
    await pipeline.jpeg({ quality: q, mozjpeg: true, chromaSubsampling: '4:2:0' }).toFile(out);
  } else if (target === 'png') {
    await pipeline.png({ compressionLevel: 9 }).toFile(out);
  } else if (target === 'webp') {
    await pipeline.webp({ quality: q, effort: 5 }).toFile(out);
  } else if (target === 'avif') {
    await pipeline.avif({ quality: clamp(Math.round(q * 0.65), 10, 90), effort: 4 }).toFile(out);
  } else if (target === 'tiff') {
    await pipeline.tiff({ compression: 'lzw' }).toFile(out);
  } else if (target === 'gif') {
    await pipeline.gif().toFile(out);
  } else if (target === 'ico') {
    const pngBuf = await pipeline.resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    await fs.promises.writeFile(out, wrapIco(pngBuf));
  } else if (target === 'pdf') {
    await imagesToPdf([input], out);
  } else {
    throw new Error(`Unsupported image target: ${target}`);
  }
}

// ------------------------------------------------------------------ audio ---

function audioArgs(target, opts) {
  const br = clamp(opts.audioBitrate ?? 192, 32, 320);
  switch (target) {
    case 'mp3': return ['-vn', '-c:a', 'libmp3lame', '-b:a', `${br}k`];
    case 'wav': return ['-vn', '-c:a', 'pcm_s16le'];
    case 'ogg': return ['-vn', '-c:a', 'libvorbis', '-q:a', String(clamp(Math.round(br / 32), 0, 10))];
    case 'opus': return ['-vn', '-c:a', 'libopus', '-b:a', `${br}k`];
    case 'flac': return ['-vn', '-c:a', 'flac', '-compression_level', '8'];
    case 'm4a': return ['-vn', '-c:a', 'aac', '-b:a', `${br}k`];
    case 'aac': return ['-vn', '-c:a', 'aac', '-b:a', `${br}k`];
    case 'wma': return ['-vn', '-c:a', 'wmav2', '-b:a', `${br}k`];
    default: throw new Error(`Unsupported audio target: ${target}`);
  }
}

async function convertAudio(src, target, opts, out, onProgress, requestId) {
  const totalSec = await probeDurationSec(src);
  await runFfmpeg(
    ['-i', src, ...audioArgs(target, opts), out],
    { onProgress, totalSec, requestId }
  );
}

// ------------------------------------------------------------------ video ---

function videoArgs(target, opts) {
  const crf = clamp(opts.videoCrf ?? 23, 14, 34);
  const preset = opts.videoPreset || 'medium';
  const ab = clamp(opts.audioBitrate ?? 160, 48, 320);
  const vf = opts.maxHeight ? [`scale=-2:${clamp(opts.maxHeight, 144, 2160)}`] : [];
  const scaleArgs = vf.length ? ['-vf', vf.join(',')] : [];
  switch (target) {
    case 'mp4':
    case 'mov':
      return ['-c:v', 'libx264', '-crf', String(crf), '-preset', preset, '-pix_fmt', 'yuv420p',
        ...scaleArgs, '-c:a', 'aac', '-b:a', `${ab}k`, '-movflags', '+faststart'];
    case 'mkv':
      return ['-c:v', 'libx264', '-crf', String(crf), '-preset', preset, '-pix_fmt', 'yuv420p',
        ...scaleArgs, '-c:a', 'aac', '-b:a', `${ab}k`];
    case 'webm':
      return ['-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
        ...scaleArgs, '-c:a', 'libopus', '-b:a', `${ab}k`];
    case 'avi':
      return ['-c:v', 'mpeg4', '-q:v', String(clamp(Math.round(crf / 5), 2, 8)),
        ...scaleArgs, '-c:a', 'libmp3lame', '-b:a', `${Math.min(ab, 192)}k`];
    case 'gif':
      return ['-filter_complex',
        `[0:v]fps=${opts.gifFps || 12},scale=${opts.gifWidth || 640}:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
        '-loop', '0', '-an'];
    default: throw new Error(`Unsupported video target: ${target}`);
  }
}

async function convertVideo(src, target, opts, out, onProgress, requestId) {
  const totalSec = await probeDurationSec(src);
  await runFfmpeg(
    ['-i', src, ...videoArgs(target, opts), out],
    { onProgress, totalSec, requestId }
  );
}

// ------------------------------------------------------------------- docs ---

async function convertDocToPdf(src, outDir, sofficePath, onProgress) {
  onProgress(15);
  const out = path.join(outDir, `${path.basename(src, path.extname(src))}.pdf`);
  await new Promise((resolve, reject) => {
    const proc = spawn(sofficePath,
      ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', outDir, src],
      { windowsHide: true });
    let err = '';
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(out)) resolve(out);
      else reject(new Error(err.trim() || 'LibreOffice conversion failed'));
    });
  });
  onProgress(95);
  return out;
}

// -------------------------------------------------------------------- pdf ---

async function imagesToPdf(srcs, outPdf, onProgress) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < srcs.length; i++) {
    const input = await normalizeImageInput(srcs[i]);
    const { width, height } = await sharp(input).metadata();
    const png = await sharp(input, { failOn: 'none' }).png().toBuffer();
    const img = await doc.embedPng(png);
    // px (96dpi) → pt (72dpi)
    const page = doc.addPage([(width || 1000) * 0.75, (height || 1000) * 0.75]);
    page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
    if (onProgress) onProgress(Math.round(((i + 1) / srcs.length) * 90));
  }
  const bytes = await doc.save();
  await fs.promises.writeFile(outPdf, bytes);
  if (onProgress) onProgress(100);
  return outPdf;
}

async function mergePdfs(srcs, outPdf, onProgress) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < srcs.length; i++) {
    const donor = await PDFDocument.load(await fs.promises.readFile(srcs[i]), { ignoreEncryption: true });
    const pages = await doc.copyPages(donor, donor.getPageIndices());
    pages.forEach((p) => doc.addPage(p));
    if (onProgress) onProgress(Math.round(((i + 1) / srcs.length) * 90));
  }
  const bytes = await doc.save();
  await fs.promises.writeFile(outPdf, bytes);
  if (onProgress) onProgress(100);
  return outPdf;
}

/** Ghostscript-based PDF compression. qualityPreset: screen | ebook | printer */
async function compressPdf(src, out, gsPath, qualityPreset, onProgress) {
  if (!gsPath) throw new Error('PDF compression requires Ghostscript');
  onProgress(20);
  await new Promise((resolve, reject) => {
    const proc = spawn(gsPath,
      ['-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5', `-dPDFSETTINGS=/${qualityPreset || 'ebook'}`,
        '-dNOPAUSE', '-dQUIET', '-dBATCH', `-sOutputFile=${out}`, src],
      { windowsHide: true });
    let err = '';
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || 'Ghostscript failed'))));
  });
  onProgress(95);
  return out;
}

// -------------------------------------------------------------- dispatcher --

/**
 * Convert a single file.
 * @returns {Promise<{outPath:string, inSize:number, outSize:number}>}
 */
async function convertFile({ src, target, opts = {}, outDir, policy = 'keepBoth', requestId, onProgress }) {
  const cat = categoryOf(src);
  if (!cat) throw new Error('Unsupported input format');
  if (!target) throw new Error('No target format selected');

  fs.mkdirSync(outDir, { recursive: true });
  onProgress(2);

  // image → pdf handled inside convertImage via imagesToPdf
  let out;
  if (cat === 'image') {
    out = resolveOutPath(src, target === 'jpeg' ? 'jpg' : target, outDir, policy);
    await convertImage(src, target, opts, out);
  } else if (cat === 'audio') {
    out = resolveOutPath(src, target, outDir, policy);
    await convertAudio(src, target, opts, out, onProgress, requestId);
  } else if (cat === 'video') {
    out = resolveOutPath(src, target, outDir, policy);
    await convertVideo(src, target, opts, out, onProgress, requestId);
  } else if (cat === 'doc') {
    if (target !== 'pdf') throw new Error('Documents can only be converted to PDF');
    const { detectLibreOffice } = require('./detectors');
    const soffice = detectLibreOffice();
    if (!soffice) throw new Error('LibreOffice is required for document conversion');
    out = resolveOutPath(src, 'pdf', outDir, policy);
    await convertDocToPdf(src, outDir, soffice, onProgress);
    // LibreOffice may produce "name.pdf" even if policy wanted (1) — rename
    const produced = path.join(outDir, `${path.basename(src, path.extname(src))}.pdf`);
    if (produced !== out && fs.existsSync(produced)) await fs.promises.rename(produced, out);
  } else if (cat === 'pdf') {
    throw new Error('PDF → use PDF tools (merge) on the Archive page, or compress on the Compress page');
  }

  onProgress(100);
  return {
    outPath: out,
    inSize: fs.statSync(src).size,
    outSize: fs.statSync(out).size
  };
}

module.exports = {
  FORMATS,
  categoryOf,
  fileTypeLabel,
  ffmpegPath,
  runFfmpeg,
  probeDurationSec,
  convertFile,
  convertImage,
  convertAudio,
  convertVideo,
  imagesToPdf,
  mergePdfs,
  compressPdf,
  cancelJob,
  clamp,
  tmpFile
};
