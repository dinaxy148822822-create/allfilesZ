'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

function which(bin) {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    const r = spawnSync(cmd, [bin], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    if (r.status === 0) {
      const first = String(r.stdout || '').split(/\r?\n/)[0].trim();
      if (first) return first;
    }
  } catch (_) { /* not found */ }
  return null;
}

function firstExisting(candidates) {
  for (const c of candidates) {
    if (c.includes('/') || c.includes('\\')) {
      try { if (fs.existsSync(c)) return c; } catch (_) { /* skip */ }
    } else {
      const found = which(c);
      if (found) return found;
    }
  }
  return null;
}

const PROGRAM_FILES = process.env['ProgramFiles'] || 'C:\\Program Files';
const PROGRAM_FILES_X86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

function detectLibreOffice() {
  return firstExisting([
    process.platform === 'win32' ? `${PROGRAM_FILES}\\LibreOffice\\program\\soffice.exe` : null,
    process.platform === 'win32' ? `${PROGRAM_FILES_X86}\\LibreOffice\\program\\soffice.exe` : null,
    process.platform === 'darwin' ? '/Applications/LibreOffice.app/Contents/MacOS/soffice' : null,
    'soffice',
    'libreoffice'
  ].filter(Boolean));
}

function detectGhostscript() {
  return firstExisting([
    process.platform === 'win32' ? `${PROGRAM_FILES}\\gs\\gs*\\bin\\gswin64c.exe`.replace('gs*\\bin', '') : null, // glob not supported, keep PATH fallback
    'gswin64c',
    'gswin32c',
    'gs'
  ].filter(Boolean));
}

/**
 * Detect optional external engines. ffmpeg is always bundled with allfilesZ.
 * @param {string} bundledFfmpeg absolute path to the bundled ffmpeg binary
 */
function detectAll(bundledFfmpeg) {
  return {
    ffmpeg: { name: 'ffmpeg', found: true, bundled: true, path: bundledFfmpeg },
    libreoffice: { name: 'LibreOffice', found: Boolean(detectLibreOffice()), path: detectLibreOffice() },
    ghostscript: { name: 'Ghostscript', found: Boolean(detectGhostscript()), path: detectGhostscript() }
  };
}

module.exports = { detectAll, detectLibreOffice, detectGhostscript, which };
