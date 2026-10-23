'use strict';

const { app, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
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
