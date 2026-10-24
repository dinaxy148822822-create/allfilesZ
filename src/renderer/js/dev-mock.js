'use strict';

/**
 * Browser demo mode: when the Electron bridge is absent (plain http preview),
 * fake the bridge so the UI can be explored and screenshotted without the app.
 * Conversions are simulated — no real encoding happens in the browser.
 */
(function () {
  if (window.allfilesZ) return; // real Electron bridge present

  const FAKE_FILES = [
    { name: 'photo_mountains.jpg', size: 4_812_337, type: 'image' },
    { name: 'track_demo.mp3', size: 8_233_000, type: 'audio' },
    { name: 'clip_holiday.mp4', size: 52_113_000, type: 'video' },
    { name: 'vector_logo.svg', size: 12_400, type: 'image' },
    { name: 'report_final.docx', size: 340_000, type: 'doc' }
  ];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  window.__demoSeed = (listEl) => {
    // used for README screenshots: populate the convert list with fake files
    const ev = new CustomEvent('demo-add', { detail: FAKE_FILES });
    window.dispatchEvent(ev);
  };

  window.allfilesZ = {
    isElectron: false,
    info: async () => ({
      version: '1.0.0', platform: 'demo', arch: '-', locale: navigator.language,
      cpus: navigator.hardwareConcurrency || 4,
      outDirDefault: '~/Downloads/allfilesZ', isPackaged: false
    }),
    i18nList: async () => {
      const out = {};
      const codes = [
        'en', 'ru', 'uk', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'cs', 'sv',
        'tr', 'ar', 'he', 'hi', 'id', 'vi', 'zh-CN', 'zh-TW', 'ja', 'ko'
      ];
      for (const c of codes) {
        try {
          const r = await fetch(`i18n/${c}.json`);
          if (r.ok) out[c] = await r.json();
        } catch (_) { /* ignore */ }
      }
      return out;
    },
    settingsGet: async () => window.__demoSettings || { lang: null, theme: 'auto', accent: 'teal', overwritePolicy: 'keepBoth' },
    settingsSet: async (patch) => { window.__demoSettings = Object.assign({}, window.__demoSettings || {}, patch); return window.__demoSettings; },
    pickFiles: async () => {
      // return a couple of demo files with fake absolute paths
      return FAKE_FILES.slice(0, 3).map((f, i) => `/home/user/Documents/${f.name}`);
    },
    pickDir: async () => '/home/user/Downloads',
    showInFolder: async () => {},
    pathForFile: (file) => file.name,
    fileInfo: async (paths) => {
      return paths.map((p) => {
        const known = FAKE_FILES.find((f) => p.endsWith(f.name));
        const name = p.split(/[\\/]/).pop();
        return { path: p, name, size: known ? known.size : 100_000 + name.length * 7_777, isDir: false };
      });
    },
    convertFile: async ({ requestId }) => {
      for (let pct = 0; pct <= 100; pct += 4 + Math.floor(Math.random() * 9)) {
        await sleep(60);
        window.dispatchEvent(new CustomEvent('demo-progress', { detail: { requestId, percent: Math.min(pct, 99) } }));
      }
      const shrink = 0.4 + Math.random() * 0.4;
      return { ok: true, outPath: '/home/user/Downloads/allfilesZ/demo_out', inSize: 1_000_000, outSize: Math.round(1_000_000 * shrink) };
    },
    compressFile: async ({ requestId }) => {
      for (let pct = 0; pct <= 100; pct += 5 + Math.floor(Math.random() * 10)) {
        await sleep(55);
        window.dispatchEvent(new CustomEvent('demo-progress', { detail: { requestId, percent: Math.min(pct, 99) } }));
      }
      const shrink = 0.3 + Math.random() * 0.35;
      return { ok: true, skipped: false, outPath: '/home/user/Downloads/allfilesZ/demo_out', inSize: 1_000_000, outSize: Math.round(1_000_000 * shrink) };
    },
    archiveCreate: async ({ requestId }) => {
      for (let pct = 0; pct <= 100; pct += 8) {
        await sleep(50);
        window.dispatchEvent(new CustomEvent('demo-progress', { detail: { requestId, percent: Math.min(pct, 99) } }));
      }
      return { ok: true, outPath: '/home/user/Downloads/allfilesZ/archive.zip', outSize: 2_400_000 };
    },
    pdfMerge: async () => ({ ok: true, outPath: '/home/user/Downloads/allfilesZ/merged.pdf', outSize: 900_000 }),
    pdfFromImages: async () => ({ ok: true, outPath: '/home/user/Downloads/allfilesZ/images.pdf', outSize: 700_000 }),
    detectTools: async () => ({
      ffmpeg: { name: 'ffmpeg', found: true, bundled: true },
      libreoffice: { name: 'LibreOffice', found: false },
      ghostscript: { name: 'Ghostscript', found: true }
    }),
    installEngine: async (engine) => {
      await sleep(1500);
      return { ok: true, tools: { ffmpeg: { found: true }, libreoffice: { found: engine === 'libreoffice' }, ghostscript: { found: true } } };
    },
    bgChoose: async () => {
      // demo: generate a teal→pink gradient "wallpaper" data URL
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const g = c.getContext('2d').createLinearGradient(0, 0, 64, 64);
      g.addColorStop(0, '#39c5bb');
      g.addColorStop(1, '#f4a7c3');
      c.getContext('2d').fillStyle = g;
      c.getContext('2d').fillRect(0, 0, 64, 64);
      window.__demoBg = c.toDataURL();
      return { ok: true, dataUrl: window.__demoBg };
    },
    bgGet: async () => window.__demoBg || null,
    bgClear: async () => { window.__demoBg = null; return { ok: true }; },
    cancelJob: async () => true,
    winControl: () => {},
    onProgress: (cb) => {
      const l = (e) => cb(e.detail);
      window.addEventListener('demo-progress', l);
      return () => window.removeEventListener('demo-progress', l);
    },
    onMaximized: () => () => {},
    onSmokeCheck: () => {},
    smokeOk: () => {}
  };

  window.addEventListener('DOMContentLoaded', () => {
    const badge = document.getElementById('demoBadge');
    if (badge) badge.classList.remove('hidden');
  });
})();
