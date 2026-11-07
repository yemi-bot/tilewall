'use strict';

// Bridge for the app page only. Tile pages never get this.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tw', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (data) => ipcRenderer.send('state:save', data),
  saveStateNow: (data) => ipcRenderer.sendSync('state:save-now', data),
  setAdblock: (on) => ipcRenderer.invoke('adblock:set', !!on),
  adblockStatus: () => ipcRenderer.invoke('adblock:status'),
  isFullscreen: () => ipcRenderer.invoke('win:is-fullscreen'),
  toggleFullscreen: () => ipcRenderer.send('win:fullscreen'),
  openExternal: (url) => ipcRenderer.send('open-external', String(url)),
  onHotkey: (cb) => ipcRenderer.on('hotkey', (_e, key) => cb(key)),
  onCtrl: (cb) => ipcRenderer.on('ctrl', (_e, down) => cb(!!down)),
  onPointer: (cb) => ipcRenderer.on('pointer', (_e, p) => cb(p)),
  onFullscreen: (cb) => ipcRenderer.on('fullscreen', (_e, on) => cb(!!on)),
  onAdblock: (cb) => ipcRenderer.on('adblock', (_e, s) => cb(s)),
  onCloseTile: (cb) => ipcRenderer.on('close-tile', (_e, wcId) => cb(wcId)),
  focusTile: (id) => ipcRenderer.send('tile:focus', Number(id)),
  setStayLive: (on) => ipcRenderer.invoke('stay-live:set', !!on),
  globalKeysStatus: () => ipcRenderer.invoke('global-keys:status'),
});
