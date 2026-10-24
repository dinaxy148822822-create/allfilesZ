'use strict';

const { app, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const converter = require('./converter');
const { compressFile, PRESETS } = require('./compress');
const { createArchive } = require('./archive');
const { getSettings, setSettings, defaultOutDir } = require('./settings');
const { detectAll } = require('./detectors');

const I18N_DIR = path.join(__dirname, '..', 'renderer', 'i18n');

module.exports = function registerIpc(_unused, getWin) {
  const send = (channel, payload) => {
    const win = getWin && getWin();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    locale: app.getLocale(),
    cpus: os.cpus().length,
    outDirDefault: defaultOutDir(),
    isPackaged: app.isPackaged
  }));

  ipcMain.handle('i18n:list', () => {
    const out = {};
    for (const f of fs.readdirSync(I18N_DIR)) {
      if (!f.endsWith('.json')) continue;
      try {
        out[f.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(I18N_DIR, f), 'utf8'));
      } catch (_) { /* skip broken file */ }
    }
    return out;
  });

  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:set', (_e, patch) => setSettings(patch));

  ipcMain.handle('dialog:files', async () => {
    const win = getWin && getWin();
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections']
    });
    return r.canceled ? [] : r.filePaths;
  });

  ipcMain.handle('dialog:dir', async () => {
    const win = getWin && getWin();
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('shell:show', (_e, p) => shell.showItemInFolder(p));

  ipcMain.handle('paths:info', (_e, paths) => {
    return paths.map((p) => {
      try {
        const st = fs.statSync(p);
        return { path: p, size: st.size, isDir: st.isDirectory(), name: path.basename(p) };
      } catch (_) {
        return { path: p, size: 0, isDir: false, name: path.basename(p) };
      }
    });
  });

  ipcMain.handle('convert:file', async (_e, payload) => {
    const { requestId, src, target, opts, outDir, policy } = payload;
    const onProgress = (percent) => send('job:progress', { requestId, percent });
    try {
      const result = await converter.convertFile({
        src, target, opts, outDir, policy: policy || 'keepBoth', requestId, onProgress
      });
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  });

  ipcMain.handle('compress:file', async (_e, payload) => {
    const { requestId, src, preset, opts, outDir, policy } = payload;
    const merged = Object.assign({}, PRESETS[preset] || PRESETS.balanced, opts || {});
    const onProgress = (percent) => send('job:progress', { requestId, percent });
    try {
      const result = await compressFile({
        src, opts: merged, outDir, policy: policy || 'keepBoth', requestId, onProgress
      });
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  });

  ipcMain.handle('archive:create', async (_e, payload) => {
    const { requestId, files, outDir, name, format, level } = payload;
    const onProgress = (percent) => send('job:progress', { requestId, percent });
    try {
      fs.mkdirSync(outDir, { recursive: true });
      const ext = format === 'tar.gz' ? 'tar.gz' : format;
      const outPath = uniquePath(path.join(outDir, `${name || 'archive'}.${ext}`));
      await createArchive({ files, outPath, format, level: level ?? 6, onProgress });
      return {
        ok: true,
        outPath,
        inSize: fs.statSync(outPath).size,
        outSize: fs.statSync(outPath).size
      };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  });

  ipcMain.handle('pdf:merge', async (_e, payload) => {
    const { requestId, files, outDir } = payload;
    const onProgress = (percent) => send('job:progress', { requestId, percent });
    try {
      fs.mkdirSync(outDir, { recursive: true });
      const outPath = uniquePath(path.join(outDir, 'merged.pdf'));
      await converter.mergePdfs(files, outPath, onProgress);
      return { ok: true, outPath, outSize: fs.statSync(outPath).size };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  });

  ipcMain.handle('pdf:from-images', async (_e, payload) => {
    const { requestId, files, outDir } = payload;
    const onProgress = (percent) => send('job:progress', { requestId, percent });
    try {
      fs.mkdirSync(outDir, { recursive: true });
      const outPath = uniquePath(path.join(outDir, 'images.pdf'));
      await converter.imagesToPdf(files, outPath, onProgress);
      return { ok: true, outPath, outSize: fs.statSync(outPath).size };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  });

  ipcMain.handle('tools:detect', () => detectAll(converter.ffmpegPath()));

  // ---- user background (photo or animated GIF) -----------------------------
  const BG_DIR = () => path.join(app.getPath('userData'), 'background');
  const BG_MAX = 20 * 1024 * 1024; // 20 MB
  const BG_TYPES = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.avif': 'image/avif'
  };

  ipcMain.handle('bg:choose', async () => {
    const win = getWin && getWin();
    const r = await dialog.showOpenDialog(win, {
      title: 'allfilesZ — background',
      properties: ['openFile'],
      filters: [{ name: 'Images / GIF', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'] }]
    });
    if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };
    const src = r.filePaths[0];
    try {
      const st = fs.statSync(src);
      if (st.size > BG_MAX) return { ok: false, error: `max ${Math.round(BG_MAX / 1024 / 1024)} MB` };
      const ext = path.extname(src).toLowerCase();
      if (!BG_TYPES[ext]) return { ok: false, error: 'unsupported type' };
      fs.mkdirSync(BG_DIR(), { recursive: true });
      const dest = path.join(BG_DIR(), `bg${ext}`);
      fs.copyFileSync(src, dest);
      // drop any previous background with another extension
      for (const f of fs.readdirSync(BG_DIR())) {
        if (f.startsWith('bg.') && path.join(BG_DIR(), f) !== dest) {
          try { fs.unlinkSync(path.join(BG_DIR(), f)); } catch (_) { /* ignore */ }
        }
      }
      setSettings({ bgName: `bg${ext}` });
      const dataUrl = `data:${BG_TYPES[ext]};base64,${fs.readFileSync(dest).toString('base64')}`;
      return { ok: true, dataUrl };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  });

  ipcMain.handle('bg:get', () => {
    try {
      const name = getSettings().bgName;
      if (!name) return null;
      const p = path.join(BG_DIR(), name);
      if (!fs.existsSync(p)) return null;
      const ext = path.extname(p).toLowerCase();
      if (!BG_TYPES[ext]) return null;
      return `data:${BG_TYPES[ext]};base64,${fs.readFileSync(p).toString('base64')}`;
    } catch (_) { return null; }
  });

  ipcMain.handle('bg:clear', () => {
    try {
      fs.rmSync(BG_DIR(), { recursive: true, force: true });
    } catch (_) { /* ignore */ }
    setSettings({ bgName: null });
    return { ok: true };
  });

  // One-click optional engine install (Windows): LibreOffice via winget,
  // Ghostscript via the official Artifex installer. Explicit user action —
  // the only feature that touches the network.
  ipcMain.handle('engines:install', async (_e, { engine }) => {
    if (process.platform !== 'win32') {
      return { ok: false, error: 'Install via your package manager: ghostscript / libreoffice (see README)' };
    }
    try {
      if (engine === 'libreoffice') {
        await runToCompletion('winget', [
          'install', '--id', 'TheDocumentFoundation.LibreOffice',
          '--silent', '--accept-package-agreements', '--accept-source-agreements',
          '--disable-interactivity'
        ], 20 * 60 * 1000);
      } else if (engine === 'ghostscript') {
        const url = await latestGhostscriptUrl();
        const tmp = path.join(os.tmpdir(), path.basename(url));
        await downloadTo(url, tmp);
        // Ghostscript uses an NSIS installer: /S = silent
        await runToCompletion(tmp, ['/S'], 10 * 60 * 1000);
        try { fs.unlinkSync(tmp); } catch (_) { /* best effort */ }
      } else {
        return { ok: false, error: `Unknown engine: ${engine}` };
      }
      return { ok: true, tools: detectAll(converter.ffmpegPath()) };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  });

  ipcMain.handle('jobs:cancel', (_e, requestId) => converter.cancelJob(requestId));

  ipcMain.on('win:min', () => { const w = getWin && getWin(); if (w) w.minimize(); });
  ipcMain.on('win:max', () => {
    const w = getWin && getWin();
    if (!w) return;
    if (w.isMaximized()) w.unmaximize(); else w.maximize();
  });
  ipcMain.on('win:close', () => { const w = getWin && getWin(); if (w) w.close(); });
};

function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const dir = path.dirname(p);
  const ext = path.extname(p);
  const base = path.basename(p, ext);
  for (let i = 1; i < 999; i++) {
    const c = path.join(dir, `${base} (${i})${ext}`);
    if (!fs.existsSync(c)) return c;
  }
  return path.join(dir, `${base}-${Date.now()}${ext}`);
}

function friendlyError(err) {
  const msg = String((err && err.message) || err || 'Unknown error');
  // Trim noisy ffmpeg tails
  return msg.split('\n').filter(Boolean).slice(-3).join(' ').slice(0, 400);
}

function runToCompletion(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    let out = '';
    let settled = false;
    const proc = spawn(cmd, args, { windowsHide: true });
    const timer = setTimeout(() => {
      if (!settled) { settled = true; try { proc.kill('SIGKILL'); } catch (_) {} reject(new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s: ${out.slice(-200)}`)); }
    }, timeoutMs);
    proc.stdout && proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr && proc.stderr.on('data', (d) => { out += d.toString(); });
    proc.on('error', (e) => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(out.trim().slice(-300) || `exited with code ${code}`));
    });
  });
}

async function latestGhostscriptUrl() {
  const res = await fetch('https://api.github.com/repos/ArtifexSoftware/ghostpdl-downloads/releases/latest', {
    headers: { 'User-Agent': 'allfilesZ' }
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const rel = await res.json();
  const asset = (rel.assets || []).find((a) => /w64\.exe$/.test(a.name));
  if (!asset) throw new Error('No Windows installer found in the latest Ghostscript release');
  return asset.browser_download_url;
}

function downloadTo(url, dest) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'allfilesZ' } });
      if (!res.ok) return reject(new Error(`Download failed: HTTP ${res.status}`));
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buf);
      resolve(dest);
    } catch (e) { reject(e); }
  });
}
