'use strict';

const { app, BrowserWindow, ipcMain, session, shell, Menu, clipboard, screen, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { hotkeyFor } = require('./hotkeys');

const PARTITION = 'persist:tilewall';
const ALLOWED_PERMISSIONS = new Set(['fullscreen', 'clipboard-sanitized-write']);
const ADBLOCK_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

// Test runs point userData at a throwaway folder so they never touch real state.
if (process.env.TW_USER_DATA) app.setPath('userData', process.env.TW_USER_DATA);
if (process.env.TW_MUTE_AUDIO) app.commandLine.appendSwitch('mute-audio');
const TEST_OFFSCREEN = !!process.env.TW_TEST_OFFSCREEN;
if (TEST_OFFSCREEN) {
  // keep painting even though the window sits off screen
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}

// Streams should start on their own, and sites should see a normal Chrome.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.userAgentFallback = app.userAgentFallback.replace(/\s(Electron|tilewall)\/\S+/gi, '');

if (!process.env.TW_USER_DATA && !app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let pointerTimer = null;
let blocker = null;
let blockerOn = false;

// ---------- saved state ----------

const statePath = () => path.join(app.getPath('userData'), 'state.json');
let saved = readState();
let saveTimer = null;

function readState() {
  try {
    const data = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch (e) {
    return {};
  }
}

function writeStateNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const file = statePath();
  const tmp = file + '.tmp';
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(saved, null, 2), 'utf8');
    for (let i = 0; i < 5; i++) {
      try {
        fs.renameSync(tmp, file);
        return;
      } catch (e) {
        if (i === 4) throw e;
      }
    }
  } catch (e) {
    console.error('[tilewall] could not save state:', e.message);
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeStateNow, 400);
}

function rememberWindow() {
  if (!win || win.isDestroyed()) return;
  saved.window = {
    ...win.getNormalBounds(),
    maximized: win.isMaximized(),
    fullscreen: win.isFullScreen(),
  };
}

// ---------- ad blocking ----------

async function setAdblock(on) {
  const ses = session.fromPartition(PARTITION);
  try {
    if (on) {
      if (!blocker) {
        const { ElectronBlocker } = require('@ghostery/adblocker-electron');
        const cache = path.join(app.getPath('userData'), 'adblock-engine.bin');
        try {
          if (Date.now() - fs.statSync(cache).mtimeMs > ADBLOCK_MAX_AGE_MS) fs.unlinkSync(cache);
        } catch (e) {
          /* no cache yet */
        }
        blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
          path: cache,
          read: fs.promises.readFile,
          write: fs.promises.writeFile,
        });
      }
      if (!blockerOn) {
        blocker.enableBlockingInSession(ses);
        blockerOn = true;
      }
    } else if (blocker && blockerOn) {
      blocker.disableBlockingInSession(ses);
      blockerOn = false;
    }
    return { ok: true, on: blockerOn };
  } catch (e) {
    console.error('[tilewall] ad block failed:', e.message);
    return { ok: false, on: blockerOn, error: String(e.message || e) };
  }
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true }), ms))]);
}

// ---------- hotkeys (caught in every page, including inside tiles) ----------


function sendToApp(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function toggleFullscreen() {
  if (!win) return;
  win.setFullScreen(!win.isFullScreen());
}

function guestContextMenu(wc, p) {
  const items = [];
  if (p.linkURL && /^https?:/i.test(p.linkURL)) {
    items.push(
      { label: 'Open link in this tile', click: () => wc.loadURL(p.linkURL) },
      { label: 'Open link in your browser', click: () => shell.openExternal(p.linkURL) },
      { label: 'Copy link', click: () => clipboard.writeText(p.linkURL) },
      { type: 'separator' }
    );
  }
  if (p.isEditable) {
    items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' });
  } else if (p.selectionText) {
    items.push({ role: 'copy' }, { type: 'separator' });
  }
  const nav = wc.navigationHistory;
  items.push(
    { label: 'Back', enabled: nav.canGoBack(), click: () => nav.goBack() },
    { label: 'Forward', enabled: nav.canGoForward(), click: () => nav.goForward() },
    { label: 'Reload', click: () => wc.reload() },
    { type: 'separator' },
    { label: 'Open page in your browser', click: () => shell.openExternal(wc.getURL()) },
    { label: 'Copy page link', click: () => clipboard.writeText(wc.getURL()) }
  );
  Menu.buildFromTemplate(items).popup({ window: win });
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('before-input-event', (event, input) => {
    if (input.key === 'Control' && !input.isAutoRepeat) {
      sendToApp('ctrl', input.type === 'keyDown');
      return;
    }
    const hk = hotkeyFor(input);
    if (!hk) return;
    event.preventDefault();
    if (hk === 'fullscreen') return toggleFullscreen();
    if (hk === 'devtools') return win && win.webContents.toggleDevTools();
    // Typing into the app's own fields needs focus pulled out of the tile.
    if ((hk === 'add' || hk === 'help') && win) win.webContents.focus();
    sendToApp('hotkey', hk);
  });

  if (wc.getType() === 'webview') {
    // Popups would steal a tile or spam the browser. Links open through the right-click menu.
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('context-menu', (_ev, params) => guestContextMenu(wc, params));
  }
});

// ---------- pointer tracking ----------
// Mouse events stop reaching the app page once the cursor is over a tile's
// page, so hover bars and follow-the-mouse audio use the OS cursor instead.

let lastPointer = '';

function startPointerPoll() {
  if (process.env.TW_NO_POINTER_POLL) return;
  clearInterval(pointerTimer);
  pointerTimer = setInterval(() => {
    if (!win || win.isDestroyed() || win.isMinimized() || !win.isVisible()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getContentBounds();
    const x = p.x - b.x;
    const y = p.y - b.y;
    const inside = x >= 0 && y >= 0 && x < b.width && y < b.height;
    const focused = win.isFocused();
    const key = inside ? x + ',' + y + ',' + focused : 'out';
    if (key === lastPointer) return;
    lastPointer = key;
    sendToApp('pointer', { x, y, inside, focused });
  }, 80);
}

// ---------- window ----------

function visibleOnSomeDisplay(b) {
  if (typeof b.x !== 'number' || typeof b.y !== 'number') return false;
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x + 100 > a.x && b.x < a.x + a.width - 100 && b.y + 50 > a.y && b.y < a.y + a.height - 50;
  });
}

function createWindow() {
  const b = saved.window || {};
  const opts = {
    width: b.width || 1600,
    height: b.height || 900,
    minWidth: 480,
    minHeight: 300,
    backgroundColor: '#000000',
    title: 'Tilewall',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  };
  if (TEST_OFFSCREEN) {
    // Automated runs: park the window off every screen and never take focus.
    opts.x = -20000;
    opts.y = 0;
    opts.width = 1600;
    opts.height = 900;
    opts.focusable = false;
  } else if (visibleOnSomeDisplay(b)) {
    opts.x = b.x;
    opts.y = b.y;
  }
  win = new BrowserWindow(opts);
  Menu.setApplicationMenu(null);

  win.once('ready-to-show', () => {
    if (TEST_OFFSCREEN) {
      win.showInactive();
      return;
    }
    if (b.maximized) win.maximize();
    win.show();
    if (b.fullscreen && !process.env.TW_USER_DATA) win.setFullScreen(true);
  });

  win.on('enter-full-screen', () => sendToApp('fullscreen', true));
  win.on('leave-full-screen', () => sendToApp('fullscreen', false));
  win.on('close', () => {
    rememberWindow();
    writeStateNow();
  });
  win.on('closed', () => {
    win = null;
    clearInterval(pointerTimer);
  });

  // Lock down every tile: no node, no foreign preload, our session only, web pages only.
  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    if (params.partition !== PARTITION || !/^https?:\/\//i.test(params.src || '')) event.preventDefault();
  });
  // New tiles start silent; the app unmutes the one you pick.
  win.webContents.on('did-attach-webview', (_e, guest) => guest.setAudioMuted(true));
  // The app page itself never navigates away.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  startPointerPoll();
}

// ---------- ipc ----------

ipcMain.handle('state:load', () => saved.app || null);
ipcMain.on('state:save', (_e, data) => {
  if (data && typeof data === 'object') {
    saved.app = data;
    scheduleSave();
  }
});
ipcMain.handle('adblock:set', (_e, on) => setAdblock(!!on));
ipcMain.handle('adblock:status', () => ({ on: blockerOn }));
ipcMain.handle('win:is-fullscreen', () => !!(win && win.isFullScreen()));
ipcMain.on('win:fullscreen', () => toggleFullscreen());
ipcMain.on('open-external', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
});

// ---------- startup ----------

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(async () => {
  // Sites that follow the system theme (YouTube, Twitch) render dark, so no white flashes.
  nativeTheme.themeSource = 'dark';
  const ses = session.fromPartition(PARTITION);
  ses.setUserAgent(app.userAgentFallback);
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(ALLOWED_PERMISSIONS.has(permission)));

  // Start blocking before any tile loads, but never hold the window up for long.
  const wantAdblock = !saved.app || saved.app.adblock !== false;
  if (wantAdblock) await withTimeout(setAdblock(true), 6000);

  createWindow();
});

app.on('before-quit', () => {
  rememberWindow();
  writeStateNow();
});

app.on('window-all-closed', () => app.quit());
