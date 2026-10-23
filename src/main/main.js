'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');

// --- Desktop environment friendliness -------------------------------------
// Native Wayland/X11 auto-detection (Hyprland, Sway, KDE Wayland, GNOME Wayland)
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  app.commandLine.appendSwitch('enable-wayland-ime');
}
app.commandLine.appendSwitch('smooth-scrolling', '1');
app.commandLine.appendSwitch('force_color_profile', 'srgb');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1020,
    minHeight: 660,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0b0e1a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  // Real OS-level blur where the platform supports it; the CSS glass works
  // everywhere regardless.
  if (process.platform === 'win32') {
    try { win.setBackgroundMaterial('acrylic'); } catch (_) { /* pre-Win11 */ }
  } else if (process.platform === 'darwin') {
    try { win.setVibrancy('under-window'); } catch (_) { /* older macOS */ }
  }

  win.once('ready-to-show', () => {
    win.show();
    if (process.argv.includes('--smoke')) {
      // Automated smoke test: renderer answers, then we exit cleanly.
      const t = setTimeout(() => app.exit(1), 15000);
      win.webContents.once('ipc-message', (_e, channel) => {
        if (channel === 'smoke:ok') { clearTimeout(t); app.exit(0); }
      });
      setTimeout(() => win.webContents.send('smoke:check'), 1200);
    }
  });

  win.on('maximize', () => win.webContents.send('win:maximized', true));
  win.on('unmaximize', () => win.webContents.send('win:maximized', false));
  win.on('closed', () => { win = null; });

  // External links open in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) { require('electron').shell.openExternal(url); }
    return { action: 'deny' };
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  require('./ipc')(null, () => win);
  createWindow();
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.on('activate', () => { if (win === null) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
