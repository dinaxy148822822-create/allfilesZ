'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('allfilesZ', {
  isElectron: true,

  // app
  info: () => ipcRenderer.invoke('app:info'),
  i18nList: () => ipcRenderer.invoke('i18n:list'),
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (patch) => ipcRenderer.invoke('settings:set', patch),

  // dialogs & shell
  pickFiles: () => ipcRenderer.invoke('dialog:files'),
  pickDir: () => ipcRenderer.invoke('dialog:dir'),
  showInFolder: (p) => ipcRenderer.invoke('shell:show', p),
  pathForFile: (file) => webUtils.getPathForFile(file),
  fileInfo: (paths) => ipcRenderer.invoke('paths:info', paths),

  // engines
  convertFile: (payload) => ipcRenderer.invoke('convert:file', payload),
  compressFile: (payload) => ipcRenderer.invoke('compress:file', payload),
  archiveCreate: (payload) => ipcRenderer.invoke('archive:create', payload),
  pdfMerge: (payload) => ipcRenderer.invoke('pdf:merge', payload),
  pdfFromImages: (payload) => ipcRenderer.invoke('pdf:from-images', payload),
  detectTools: () => ipcRenderer.invoke('tools:detect'),
  cancelJob: (requestId) => ipcRenderer.invoke('jobs:cancel', requestId),

  // window controls (custom titlebar)
  winControl: (action) => ipcRenderer.send(`win:${action}`),

  // events
  onProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('job:progress', listener);
    return () => ipcRenderer.removeListener('job:progress', listener);
  },
  onMaximized: (cb) => {
    const listener = (_e, v) => cb(v);
    ipcRenderer.on('win:maximized', listener);
    return () => ipcRenderer.removeListener('win:maximized', listener);
  },
  onSmokeCheck: (cb) => ipcRenderer.on('smoke:check', cb),
  smokeOk: () => ipcRenderer.send('smoke:ok')
});
