'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  lang: null,            // null = auto-detect from system locale
  theme: 'auto',         // auto | dark | light
  accent: 'blue',        // GitHub-blue by default; teal | violet | pink | blue | green | orange
  outDir: null,          // null = <Downloads>/allfilesZ
  preset: 'balanced',    // high | balanced | tiny | custom
  imageQuality: 82,      // 1..100
  videoCrf: 23,          // 16..30
  videoPreset: 'medium', // ffmpeg preset
  audioBitrate: 192,     // kbps
  archiveLevel: 6,       // 0..9
  overwritePolicy: 'keepBoth', // keepBoth | overwrite
  starred: false,        // repo-bar parody state
  activity: {},          // ISO-date -> conversions done (activity graph)
  character: null,       // miku | teto | neru | luka | rin | gumi | null
  bgName: null           // user background file name inside userData/background
};

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

let cache = null;

function getSettings() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    cache = Object.assign({}, DEFAULTS, JSON.parse(raw));
  } catch (_) {
    cache = Object.assign({}, DEFAULTS);
  }
  return cache;
}

function setSettings(patch) {
  const next = Object.assign({}, getSettings(), patch || {});
  cache = next;
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8');
  } catch (_) { /* best effort */ }
  return next;
}

function defaultOutDir() {
  try {
    return path.join(app.getPath('downloads') || app.getPath('home'), 'allfilesZ');
  } catch (_) {
    return path.join(app.getPath('home'), 'allfilesZ');
  }
}

module.exports = { getSettings, setSettings, defaultOutDir, DEFAULTS };
