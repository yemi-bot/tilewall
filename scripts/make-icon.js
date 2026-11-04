// Renders the app icon with an invisible offscreen window and writes
// assets/icon.png (256px) and assets/icon.ico (16-256px, PNG entries).
// Run with Electron: electron scripts/make-icon.js
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <rect x="8" y="8" width="240" height="240" rx="56" fill="#121317"/>
  <rect x="8.5" y="8.5" width="239" height="239" rx="55.5" fill="none" stroke="#2a2c34" stroke-width="1"/>
  <rect x="38" y="70" width="84" height="52" rx="9" fill="#f2b544"/>
  <path d="M73 85.5 L93 96 L73 106.5 Z" fill="#1c1505"/>
  <rect x="134" y="70" width="84" height="52" rx="9" fill="#454852"/>
  <rect x="38" y="134" width="84" height="52" rx="9" fill="#454852"/>
  <rect x="134" y="134" width="84" height="52" rx="9" fill="#454852"/>
</svg>`;

const SIZES = [16, 24, 32, 48, 64, 128, 256];

function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)]);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 256,
    height: 256,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true },
  });
  const html = '<html><body style="margin:0;background:transparent">' + SVG + '</body></html>';
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 256, height: 256 });
  const base = img.getSize().width === 256 ? img : img.resize({ width: 256, height: 256, quality: 'best' });
  const outDir = path.join(__dirname, '..', 'assets');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'icon.png'), base.toPNG());
  const pngs = SIZES.map((size) => ({
    size,
    data: size === 256 ? base.toPNG() : base.resize({ width: size, height: size, quality: 'best' }).toPNG(),
  }));
  fs.writeFileSync(path.join(outDir, 'icon.ico'), buildIco(pngs));
  console.log('icon written', base.getSize());
  app.quit();
});
