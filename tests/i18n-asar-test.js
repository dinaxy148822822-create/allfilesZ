'use strict';
// Verifies i18n JSONs are readable inside the packaged asar (Electron fs patch).
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(() => {
  const dir = path.join(__dirname, '..', 'release', 'win-unpacked', 'resources', 'app.asar', 'src', 'renderer', 'i18n');
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    console.log('ASAR_I18N_OK files=' + files.length);
  } catch (e) {
    console.log('ASAR_I18N_FAIL: ' + e.message);
  }
  app.exit(0);
});
