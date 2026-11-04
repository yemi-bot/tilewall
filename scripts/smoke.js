// Launches the real app with a throwaway profile, loads some streams, and saves
// screenshots of each layout. Usage: node scripts/smoke.js [url ...]
// Screenshots go to TW_SMOKE_OUT (default: <tmp>/tilewall-smoke).
'use strict';

const { _electron: electron } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const os = require('os');

const OUT = process.env.TW_SMOKE_OUT || path.join(os.tmpdir(), 'tilewall-smoke');
const URLS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'https://www.youtube.com/watch?v=fe8K8AzygU0',
      'https://www.youtube.com/watch?v=AR0mCbzLtnM',
      'youtube.com/@LofiGirl',
      'https://www.twitch.tv/monstercat',
    ];
const SETTLE_MS = Number(process.env.TW_SETTLE_MS || 18000);

let app;

// Shells spawned by editors built on Electron (VS Code) set ELECTRON_RUN_AS_NODE,
// which turns electron.exe into plain node. Drop it for the launch.
function cleanEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

async function shot(name) {
  const b64 = await app.evaluate(async ({ BrowserWindow }) => {
    const img = await BrowserWindow.getAllWindows()[0].capturePage();
    return img.toPNG().toString('base64');
  });
  const file = path.join(OUT, name + '.png');
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log('shot', file);
}

async function tileReport(page) {
  return page.evaluate(async () => {
    const out = [];
    for (const t of window.__tilewall.state.tiles) {
      const rec = window.__tilewall.recs.get(t.id);
      let fill = null;
      try {
        fill = rec.ready ? await rec.wv.executeJavaScript('window.__tw ? window.__tw.status() : null') : 'not ready';
      } catch (e) {
        fill = 'error: ' + e.message;
      }
      out.push({ url: t.url, title: t.title, ready: rec.ready, status: rec.status, rect: rec.rect, fill, now: rec.ready ? rec.wv.getURL() : null });
    }
    return out;
  });
}

async function audioReport() {
  return app.evaluate(({ webContents }) =>
    webContents
      .getAllWebContents()
      .filter((w) => w.getType() === 'webview')
      .map((w) => ({ url: w.getURL().slice(0, 60), muted: w.isAudioMuted() }))
  );
}

// TW_EXE=path\to\Tilewall.exe tests the packaged build instead of the source.
function launch(userData) {
  const env = { ...cleanEnv(), TW_USER_DATA: userData, TW_MUTE_AUDIO: '1', TW_NO_POINTER_POLL: '1', TW_TEST_OFFSCREEN: '1' };
  if (process.env.TW_EXE) return electron.launch({ executablePath: process.env.TW_EXE, args: [], env });
  return electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..')], env });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ud-'));
  app = await launch(userData);
  const errors = [];
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text());
  });

  await page.waitForSelector('#empty:not([hidden])', { timeout: 20000 });
  await page.waitForTimeout(500);
  await shot('01-empty');

  await page.fill('#empty-input', URLS.join('\n'));
  await page.press('#empty-input', 'Enter');
  await page.waitForTimeout(SETTLE_MS);
  await shot('02-grid');
  console.log('TILES', JSON.stringify(await tileReport(page), null, 1));
  console.log('AUDIO', JSON.stringify(await audioReport()));

  // Hover is driven by the OS cursor position. The test feeds fake positions
  // (the real poll is off via TW_NO_POINTER_POLL) and never moves the real mouse.
  const pointer = (x, y, inside = true) => page.evaluate((p) => window.__tilewall.onPointer(p), { x, y, inside, focused: true });
  const shown = () =>
    page.evaluate(() => ({
      bars: [...document.querySelectorAll('.tile')].map((el) => el.classList.contains('bar-show')),
      dock: document.querySelector('#dock').classList.contains('show'),
    }));
  const checks = [];
  const expect = (name, got, want) => checks.push((JSON.stringify(got) === JSON.stringify(want) ? 'PASS ' : 'FAIL ') + name + ' ' + JSON.stringify(got));

  const r2 = await page.evaluate(() => window.__tilewall.recs.get(window.__tilewall.state.tiles[1].id).rect);
  const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  await pointer(r2.x + r2.w / 2, r2.y + 4);
  await page.waitForTimeout(300);
  expect('top edge of tile 2 shows its bar', await shown(), { bars: [false, true, false, false], dock: false });
  await shot('03-tilebar');
  await pointer(r2.x + 40, r2.y + 30); // moving along the bar keeps it
  await page.waitForTimeout(500);
  expect('bar stays while on it', (await shown()).bars[1], true);
  await pointer(r2.x + r2.w / 2, r2.y + r2.h / 2);
  await page.waitForTimeout(500);
  expect('bar hides after leaving', await shown(), { bars: [false, false, false, false], dock: false });

  await pointer(vp.w / 2, vp.h - 3);
  await page.waitForTimeout(400);
  expect('bottom edge shows toolbar', (await shown()).dock, true);
  await shot('04-dock');
  await pointer(vp.w / 2, vp.h - 30); // onto the toolbar itself
  await page.waitForTimeout(700);
  expect('toolbar stays while on it', (await shown()).dock, true);
  await pointer(vp.w / 2, vp.h / 2);
  await page.waitForTimeout(800);
  expect('toolbar hides after leaving', (await shown()).dock, false);
  await pointer(vp.w / 2, vp.h - 3);
  await page.waitForTimeout(400);
  await page.click('#btn-gap');
  await page.click('#btn-gap');
  await page.click('#btn-gap');
  await pointer(vp.w / 2, vp.h / 2);
  await page.waitForTimeout(800);
  expect('toolbar hides after clicking one of its buttons', (await shown()).dock, false);
  await pointer(10, 10);
  await pointer(-5, -5, false);
  await page.waitForTimeout(500);
  expect('leaving the window hides everything', await shown(), { bars: [false, false, false, false], dock: false });
  console.log('HOVER CHECKS\n' + checks.join('\n'));

  // Real key presses go through the main process hotkey filter.
  const audioTileIndex = () =>
    page.evaluate(() => window.__tilewall.state.tiles.findIndex((t) => t.id === window.__tilewall.state.audioId));
  // Synthetic key presses skip Electron's before-input-event, so emit one
  // directly on a tile page: this runs the real main-process key filter.
  const blocked = await app.evaluate(({ webContents }) => {
    const guest = webContents.getAllWebContents().find((w) => w.getType() === 'webview');
    let prevented = false;
    guest.emit('before-input-event', { preventDefault: () => (prevented = true) }, { type: 'keyDown', key: '2', code: 'Digit2', control: true, shift: false, alt: false, meta: false });
    return prevented;
  });
  await page.waitForTimeout(300);
  expect('Ctrl+2 inside a tile is caught', blocked, true);
  expect('Ctrl+2 hears tile 2', await audioTileIndex(), 1);
  await page.evaluate(() => window.__tilewall.onHotkey('audio:3'));
  await page.waitForTimeout(300);
  const audio = await audioReport();
  expect('only one tile unmuted', audio.filter((a) => !a.muted).length, 1);
  expect('the unmuted one is tile 3', audio.find((a) => !a.muted).url.includes('LofiGirl'), true);

  // Twitch and Kick stream H.264; make sure this build can decode it.
  const codecs = await page.evaluate(async () => {
    const rec = window.__tilewall.recs.get(window.__tilewall.state.tiles[0].id);
    return rec.wv.executeJavaScript(
      '({ h264: MediaSource.isTypeSupported(\'video/mp4; codecs="avc1.64001F"\'), aac: MediaSource.isTypeSupported(\'audio/mp4; codecs="mp4a.40.2"\') })'
    );
  });
  expect('H.264 + AAC supported', codecs, { h264: true, aac: true });
  expect('ad blocking on', (await page.evaluate(() => window.tw.adblockStatus())).on, true);

  // A page asking for real fullscreen inside a tile.
  await page.evaluate(() => {
    const rec = window.__tilewall.recs.get(window.__tilewall.state.tiles[1].id);
    return rec.wv.executeJavaScript("document.querySelector('#movie_player').requestFullscreen().then(() => 'ok', (e) => String(e))", true);
  });
  await page.waitForTimeout(1500);
  await shot('04b-html-fullscreen-tile2');
  const fsState = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen());
  console.log('window fullscreen after tile requested it:', fsState);
  await page.evaluate(() => {
    const rec = window.__tilewall.recs.get(window.__tilewall.state.tiles[1].id);
    return rec.wv.executeJavaScript('document.fullscreenElement ? document.exitFullscreen().then(() => "exited") : "none"', true);
  });
  await page.waitForTimeout(1500);
  expect('window back to normal after exit', await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()), false);
  await shot('04c-after-exit-fullscreen');

  await page.evaluate(() => window.__tilewall.setLayout('focus'));
  await page.waitForTimeout(3000);
  await shot('05-focus');

  await page.evaluate(() => window.__tilewall.setLayout('solo'));
  await page.waitForTimeout(3000);
  await shot('06-solo');

  await page.evaluate(() => window.__tilewall.setLayout('grid'));
  await page.waitForTimeout(500);

  // Page mode on tile 1 shows the whole site again.
  await page.evaluate(() => {
    const t = window.__tilewall.state.tiles[0];
    const rec = window.__tilewall.recs.get(t.id);
    rec.el.querySelector('[data-act="mode"]').click();
  });
  await page.waitForTimeout(2500);
  await shot('07-page-mode-tile1');

  // Review fixes. Undo while muted keeps everything muted.
  await page.evaluate(() => window.__tilewall.onHotkey('muteall'));
  await page.evaluate(() => {
    const s = window.__tilewall.state;
    window.__tilewall.recs.get(s.audioId).el.querySelector('[data-act="close"]').click();
  });
  await page.waitForTimeout(200);
  await page.click('#toast-action');
  await page.waitForTimeout(800);
  expect('undo while muted stays muted', (await audioReport()).every((a) => a.muted), true);
  expect('undo restores 4 tiles', await page.evaluate(() => window.__tilewall.state.tiles.length), 4);
  await page.evaluate(() => window.__tilewall.onHotkey('muteall'));

  // Focus layout: dropping a strip tile on the big tile makes it the big one.
  await page.evaluate(() => window.__tilewall.setLayout('focus'));
  await page.waitForTimeout(500);
  const dragOk = await page.evaluate(async () => {
    const { state, recs } = window.__tilewall;
    const mainId = state.mainId;
    const strip = state.tiles.find((t) => t.id !== mainId);
    const src = recs.get(strip.id);
    const dst = recs.get(mainId).rect;
    src.el.querySelector('[data-act="drag"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const shield = document.querySelector('#drag-shield');
    shield.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: dst.x + dst.w / 2, clientY: dst.y + dst.h / 2 }));
    shield.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return state.mainId === strip.id;
  });
  expect('focus drag onto big tile makes it big', dragOk, true);
  await shot('09-focus-after-drag');
  await page.evaluate(() => window.__tilewall.setLayout('grid'));

  // A failed load shows the error card; loading a good page clears it.
  await page.evaluate(() => window.__tilewall.addUrls('https://tilewall-no-such-host.invalid'));
  await page.waitForTimeout(5000);
  const badId = await page.evaluate(() => window.__tilewall.state.tiles[window.__tilewall.state.tiles.length - 1].id);
  expect('bad link shows error card', await page.evaluate((id) => window.__tilewall.recs.get(id).status, badId), 'error');
  await page.evaluate((id) => window.__tilewall.recs.get(id).wv.loadURL('https://example.com').catch(() => {}), badId);
  await page.waitForTimeout(5000);
  expect('good load clears error card', await page.evaluate((id) => window.__tilewall.recs.get(id).status, badId), null);
  await page.evaluate((id) => window.__tilewall.recs.get(id).el.querySelector('[data-act="close"]').click(), badId);
  await page.waitForTimeout(300);

  // Restart with the same profile: tiles, order, modes and audio come back.
  const before = await page.evaluate(() => JSON.stringify(window.__tilewall.state.tiles.map((t) => [t.url, t.mode])));
  const beforeAudio = await audioTileIndex();
  await page.waitForTimeout(600); // let the debounced save land
  await app.close();
  app = await launch(userData);
  const page2 = await app.firstWindow();
  await page2.waitForFunction(() => window.__tilewall && window.__tilewall.state.tiles.length > 0, null, { timeout: 15000 });
  await page2.waitForTimeout(4000);
  const after = await page2.evaluate(() => JSON.stringify(window.__tilewall.state.tiles.map((t) => [t.url, t.mode])));
  expect('tiles restored after restart', after, before);
  expect('audio tile restored', await page2.evaluate(() => window.__tilewall.state.tiles.findIndex((t) => t.id === window.__tilewall.state.audioId)), beforeAudio);
  await shot('08-after-restart');

  console.log('CHECKS\n' + checks.join('\n'));
  console.log('ERRORS', JSON.stringify(errors.slice(0, 30), null, 1));
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true });
  if (checks.some((c) => c.startsWith('FAIL'))) process.exitCode = 1;
})().catch(async (e) => {
  console.error('SMOKE FAILED', e);
  if (app) await app.close().catch(() => {});
  process.exit(1);
});
