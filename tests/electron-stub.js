'use strict';

/**
 * Minimal electron module stub for running main-process engine code under
 * plain Node (tests). Only what converter/compress/settings touch.
 */

const path = require('path');

module.exports = {
  app: {
    isPackaged: false,
    getPath: (name) => {
      const map = {
        userData: path.join(process.env.TEMP || '/tmp', 'allfilesz-test'),
        downloads: process.env.USERPROFILE || process.env.HOME || '.',
        home: process.env.USERPROFILE || process.env.HOME || '.'
      };
      return map[name] || '.';
    },
    getLocale: () => 'en-US',
    getVersion: () => '1.0.0',
    commandLine: { appendSwitch: () => {} }
  },
  BrowserWindow: class {},
  ipcMain: { handle: () => {}, on: () => {} },
  ipcRenderer: {},
  dialog: {},
  shell: {},
  webUtils: {}
};
