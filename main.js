'use strict';

const { app, BrowserWindow, ipcMain, session, shell, Menu, clipboard, screen, nativeTheme, webContents, webFrameMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { hotkeyFor, forwardKeyCode, isPrintable } = require('./hotkeys');
const { stayLive } = require('./stay-live');
const PKG = require('./package.json');

const PARTITION = 'persist:tilewall';
const ALLOWED_PERMISSIONS = new Set(['fullscreen', 'clipboard-sanitized-write']);
const ADBLOCK_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const isWebUrl = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);

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

// A second launch just focuses the first one (see 'second-instance') and exits now.
const GOT_LOCK = !!process.env.TW_USER_DATA || app.requestSingleInstanceLock();
if (!GOT_LOCK) app.exit(0);

let win = null;
let pointerTimer = null;
let blocker = null;
let blockerPromise = null;
let blockerOn = false;
let blockerWanted = false;
let blockerError = null;
let stayLiveOn = true;
let globalKeysFailed = [];


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
    // Windows can briefly lock the file (antivirus, indexer); wait a moment between tries.
    for (let i = 0; i < 5; i++) {
      try {
        fs.renameSync(tmp, file);
        return;
      } catch (e) {
        if (i === 4) throw e;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60);
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

// Any cached engine loads instantly so tiles are protected from the first
// load; one older than 3 days is refreshed in the background for next launch.
// With no cache yet (first launch), download the lists now.
async function buildBlocker() {
  // test hook: simulate a slow first download of the block lists
  if (process.env.TW_ADBLOCK_DELAY_MS) await new Promise((r) => setTimeout(r, Number(process.env.TW_ADBLOCK_DELAY_MS)));
  const { ElectronBlocker } = require('@ghostery/adblocker-electron');
  const cache = path.join(app.getPath('userData'), 'adblock-engine.bin');
  let age = Infinity;
  try {
    age = Date.now() - fs.statSync(cache).mtimeMs;
  } catch (e) {
    /* no cache yet */
  }
  const fromCache = () => ElectronBlocker.deserialize(new Uint8Array(fs.readFileSync(cache)));
  const download = async () => {
    const fresh = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
    try {
      fs.writeFileSync(cache, fresh.serialize());
    } catch (e) {
      /* cache is optional */
    }
    return fresh;
  };
  if (age !== Infinity) {
    try {
      const cached = fromCache();
      if (age >= ADBLOCK_MAX_AGE_MS) download().catch(() => {});
      return cached;
    } catch (e) {
      /* corrupt cache: download below */
    }
  }
  return download();
}

// Built once; every caller shares the same promise, so overlapping clicks
// can never create two engines.
function getBlocker() {
  if (!blockerPromise) {
    blockerPromise = buildBlocker().then(
      (b) => (blocker = b),
      (e) => {
        blockerPromise = null;
        throw e;
      }
    );
  }
  return blockerPromise;
}

function adblockStatus() {
  return { on: blockerOn, wanted: blockerWanted, error: blockerError };
}

// YouTube-specific layer (tile-preload.js): strips ad slots from the player
// data before the player reads it. Applies to pages loaded after the switch.
const AD_FIX = !process.env.TW_NO_YT_ADFIX;
let shieldId = null;
function setYtShield(on) {
  const ses = session.fromPartition(PARTITION);
  if (on && AD_FIX && !shieldId) {
    shieldId = ses.registerPreloadScript({ type: 'frame', id: 'tilewall-yt-shield', filePath: path.join(__dirname, 'tile-preload.js') });
  } else if (!on && shieldId) {
    ses.unregisterPreloadScript(shieldId);
    shieldId = null;
  }
}

async function setAdblock(on) {
  const ses = session.fromPartition(PARTITION);
  blockerWanted = !!on;
  setYtShield(blockerWanted);
  try {
    if (on) {
      const b = await getBlocker();
      // the user may have switched it off while the lists were loading
      if (blockerWanted && !blockerOn) {
        b.enableBlockingInSession(ses);
        blockerOn = true;
      }
    } else if (blocker && blockerOn) {
      blocker.disableBlockingInSession(ses);
      blockerOn = false;
    }
    blockerError = null;
  } catch (e) {
    blockerError = String(e.message || e);
    console.error('[tilewall] ad block failed:', blockerError);
  }
  sendToApp('adblock', adblockStatus());
  return { ok: !blockerError, ...adblockStatus() };
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

function tileMenuItems(wc, p) {
  const items = [];
  if (p.linkURL && /^https?:/i.test(p.linkURL)) {
    items.push(
      { label: 'Open link in this tile', click: () => wc.loadURL(p.linkURL).catch(() => {}) },
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
    { label: 'Open page in your browser', enabled: isWebUrl(wc.getURL()), click: () => shell.openExternal(wc.getURL()) },
    { label: 'Copy page link', click: () => clipboard.writeText(wc.getURL()) },
    { type: 'separator' },
    { label: 'Close this tile', accelerator: 'Ctrl+W', registerAccelerator: false, click: () => sendToApp('close-tile', wc.id) }
  );
  return items;
}

function guestContextMenu(wc, p) {
  Menu.buildFromTemplate(tileMenuItems(wc, p)).popup({ window: win });
}

// The smoke test clicks a menu item through this (it cannot open a real menu).
global.__twTileMenuClick = (id, label) => {
  const wc = liveTile(id);
  const item = wc && tileMenuItems(wc, {}).find((i) => i.label === label);
  if (!item) return false;
  item.click();
  return true;
};

// ---------- picked tile for keys ----------
// Real keys go to whichever tile Chromium thinks has focus (the one clicked
// last), and code cannot reliably move that focus between tiles. So Tilewall
// keeps its own picked tile: Ctrl+1-9 picks one, a click inside a tile picks
// that one, and player keys (F, space, arrows...) that land in another tile
// are handed to the picked tile.

let keyTargetId = null;

function liveTile(id) {
  if (id == null || !win || win.isDestroyed()) return null;
  const wc = webContents.fromId(id);
  if (!wc || wc.isDestroyed() || wc.getType() !== 'webview' || wc.hostWebContents !== win.webContents) return null;
  return wc;
}

function forwardKey(fromWc, input) {
  if (fromWc.getType() !== 'webview' || keyTargetId === fromWc.id) return false;
  const code = forwardKeyCode(input);
  if (!code) return false;
  const target = liveTile(keyTargetId);
  if (!target) return false;
  const modifiers = input.shift ? ['shift'] : [];
  if (input.type === 'keyDown') {
    target.sendInputEvent({ type: 'keyDown', keyCode: code, modifiers });
    if (isPrintable(code)) target.sendInputEvent({ type: 'char', keyCode: code, modifiers });
  } else {
    target.sendInputEvent({ type: 'keyUp', keyCode: code, modifiers });
  }
  return true;
}

global.__twKeyTarget = () => keyTargetId; // read by the smoke test

// ---------- stay live ----------
// Injected into every frame of every tile, because the player on many sports
// sites lives in an embedded frame that the tile page itself cannot reach.

const STAY_LIVE_SRC = '(' + stayLive.toString() + ')';

function injectStayLive(frame) {
  if (!frame || frame.isDestroyed?.() || !isWebUrl(frame.url)) return;
  frame.executeJavaScript(STAY_LIVE_SRC + '(' + (stayLiveOn ? 'true' : 'false') + ')').catch(() => {});
}

function setStayLive(on) {
  stayLiveOn = !!on;
  for (const wc of webContents.getAllWebContents()) {
    if (wc.getType() !== 'webview' || wc.isDestroyed()) continue;
    for (const frame of wc.mainFrame.framesInSubtree) injectStayLive(frame);
  }
  return stayLiveOn;
}

// ---------- hotkeys that work in any app ----------
// Ctrl+Alt so they never clash with games, chat or typing elsewhere.
// Ctrl+Alt+Tab cannot be used: Windows keeps it for its own task switcher.

const GLOBAL_KEYS = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ['CommandOrControl+Alt+' + n, 'audio:' + n]),
  ['CommandOrControl+Alt+Right', 'next'],
  ['CommandOrControl+Alt+Left', 'prev'],
  ['CommandOrControl+Alt+0', 'muteall'],
  ['CommandOrControl+Alt+M', 'muteall'],
  ['CommandOrControl+Alt+F', 'solo'],
  ['CommandOrControl+Alt+L', 'layout'],
];

function onGlobalKey(hk) {
  sendToApp('hotkey', hk);
}
global.__twGlobalKey = (accelerator) => {
  const hit = GLOBAL_KEYS.find(([acc]) => acc === accelerator);
  if (hit) onGlobalKey(hit[1]);
  return !!hit;
}; // used by the smoke test instead of real keys

function registerGlobalKeys() {
  // Test runs never grab system-wide keys from the person using the machine.
  if (process.env.TW_USER_DATA) return;
  globalKeysFailed = [];
  for (const [acc, hk] of GLOBAL_KEYS) {
    let ok = false;
    try {
      ok = globalShortcut.register(acc, () => onGlobalKey(hk));
    } catch (e) {
      ok = false;
    }
    if (!ok) globalKeysFailed.push(acc.replace('CommandOrControl', 'Ctrl'));
  }
  if (globalKeysFailed.length) console.warn('[tilewall] taken by another app:', globalKeysFailed.join(', '));
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('before-input-event', (event, input) => {
    if (input.key === 'Control' && !input.isAutoRepeat) {
      sendToApp('ctrl', input.type === 'keyDown');
      return;
    }
    const hk = hotkeyFor(input);
    if (!hk) {
      if (forwardKey(wc, input)) event.preventDefault();
      return;
    }
    event.preventDefault();
    if (hk === 'close') {
      // The picked tile (last clicked, or Ctrl+1-9), else the tile the key landed in.
      const target = liveTile(keyTargetId) || (wc.getType() === 'webview' ? wc : null);
      return sendToApp('close-tile', target ? target.id : null);
    }
    if (hk === 'fullscreen') return toggleFullscreen();
    if (hk === 'devtools') return win && win.webContents.toggleDevTools();
    // Typing into the app's own fields needs focus pulled out of the tile.
    if ((hk === 'add' || hk === 'help') && win) win.webContents.focus();
    sendToApp('hotkey', hk);
  });

  if (wc.getType() === 'webview') {
    wc.on('did-frame-finish-load', (_ev, _isMain, processId, routingId) => {
      injectStayLive(webFrameMain.fromId(processId, routingId));
    });
    // Popups would steal a tile or spam the browser. Links open through the right-click menu.
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('context-menu', (_ev, params) => guestContextMenu(wc, params));
    // Clicking inside a tile picks it for keys, like a normal click would.
    wc.on('before-mouse-event', (_ev, mouse) => {
      if (mouse.type === 'mouseDown') keyTargetId = wc.id;
    });
    // Tiles stay on the web (no file:// from a file dropped onto a tile).
    wc.on('will-navigate', (ev, url) => {
      if (!isWebUrl(url) && url !== 'about:blank') ev.preventDefault();
    });
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
    opts.focusable = !!process.env.TW_TEST_FOCUSABLE; // focusable only for key-routing tests; still never activated
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

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: { adfix: AD_FIX ? '1' : '0' } });
  startPointerPoll();
}

// ---------- updates ----------

// Copies installed with the Setup file check GitHub Releases for a newer
// version, download it quietly and install it when Tilewall closes (or right
// away from the message). Builds without app-update.yml (npm start,
// npm run package) never check.
const UPDATE_CHECK_MS = 6 * 60 * 60 * 1000;
let updater = null;

function startUpdates() {
  const test = !!process.env.TW_UPDATE_TEST;
  if (process.env.TW_USER_DATA && !test) return;
  if (!app.isPackaged || !fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))) return;
  try {
    updater = require('electron-updater').autoUpdater;
  } catch (e) {
    return;
  }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = !test; // a test run must never install anything
  updater.on('error', () => {}); // offline or GitHub down: the next check tries again
  updater.on('update-downloaded', (info) => sendToApp('update-ready', info && info.version));
  const check = () => updater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, UPDATE_CHECK_MS);
}

// ---------- ipc ----------

ipcMain.handle('app:info', () => ({ version: app.getVersion(), home: PKG.homepage }));
ipcMain.on('update:install', () => {
  if (!updater) return;
  rememberWindow();
  writeStateNow();
  updater.quitAndInstall(true, true);
});
ipcMain.handle('state:load', () => saved.app || null);
ipcMain.on('state:save', (_e, data) => {
  if (data && typeof data === 'object') {
    saved.app = data;
    scheduleSave();
  }
});
// Sent while the app page unloads (window closing), so the last change is never lost.
ipcMain.on('state:save-now', (e, data) => {
  if (data && typeof data === 'object') saved.app = data;
  rememberWindow();
  writeStateNow();
  e.returnValue = true;
});
ipcMain.handle('adblock:set', (_e, on) => setAdblock(!!on));
ipcMain.handle('adblock:status', () => adblockStatus());
ipcMain.handle('win:is-fullscreen', () => !!(win && win.isFullScreen()));
ipcMain.handle('stay-live:set', (_e, on) => setStayLive(on));
ipcMain.handle('global-keys:status', () => ({ failed: globalKeysFailed }));
ipcMain.on('win:fullscreen', () => toggleFullscreen());
// Give keyboard focus to one of this window's tiles.
ipcMain.on('tile:focus', (_e, id) => {
  const wc = webContents.fromId(id);
  if (!wc || wc.isDestroyed() || wc.getType() !== 'webview' || !win || wc.hostWebContents !== win.webContents) return;
  keyTargetId = id;
  // Only when Tilewall is the active window: a Ctrl+Alt key pressed while you
  // are in a game must not pull Tilewall to the front.
  if (win.isFocused()) wc.focus();
});
ipcMain.on('open-external', (_e, url) => {
  if (isWebUrl(url)) shell.openExternal(url);
});

// ---------- startup ----------

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

if (GOT_LOCK) {
  app.whenReady().then(async () => {
    // Sites that follow the system theme (YouTube, Twitch) render dark, so no white flashes.
    nativeTheme.themeSource = 'dark';
    const ses = session.fromPartition(PARTITION);
    ses.setUserAgent(app.userAgentFallback);
    ses.setPermissionRequestHandler((_wc, permission, cb) => cb(ALLOWED_PERMISSIONS.has(permission)));

    // Start blocking before any tile loads, but never hold the window up for long.
    // If the lists are slow, blocking switches on when they arrive and the app is told.
    const wantAdblock = !saved.app || saved.app.adblock !== false;
    if (wantAdblock) await withTimeout(setAdblock(true), 6000);

    stayLiveOn = !saved.app || saved.app.stayLive !== false;
    registerGlobalKeys();
    createWindow();
    startUpdates();
  });
}

app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('before-quit', () => {
  rememberWindow();
  writeStateNow();
});

app.on('window-all-closed', () => app.quit());
