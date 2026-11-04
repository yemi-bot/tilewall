// Builds the app into its own folder (dist/build-<stamp>/Tilewall-win32-x64),
// so a build never collides with a copy that is running. Then points the
// Desktop and Start menu shortcuts at it, writes dist/LATEST.txt, and removes
// older builds that are not in use. Usage: npm run package
'use strict';

const { packager } = require('@electron/packager');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

function pointShortcuts(exe) {
  const ps = `
$exe = '${exe.replace(/'/g, "''")}'
$ws = New-Object -ComObject WScript.Shell
$dirs = @([Environment]::GetFolderPath('Desktop'), (Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs'))
foreach ($dir in $dirs) {
  $s = $ws.CreateShortcut((Join-Path $dir 'Tilewall.lnk'))
  $s.TargetPath = $exe
  $s.WorkingDirectory = Split-Path $exe
  $s.IconLocation = "$exe,0"
  $s.Description = 'Watch several streams at once, each filling its own tile'
  $s.Save()
}`;
  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'inherit' });
}

(async () => {
  const name = 'build-' + stamp();
  const out = path.join(dist, name);
  await packager({
    dir: root,
    out,
    overwrite: true,
    platform: 'win32',
    arch: 'x64',
    name: 'Tilewall',
    executableName: 'Tilewall',
    icon: path.join(root, 'assets', 'icon.ico'),
    asar: true,
    prune: true,
    ignore: [/^\/test($|\/)/, /^\/scripts($|\/)/, /^\/dist($|\/)/, /^\/docs($|\/)/, /^\/\.git/, /^\/README\.md$/],
    win32metadata: {
      CompanyName: 'Tilewall',
      FileDescription: 'Tilewall',
      ProductName: 'Tilewall',
      InternalName: 'Tilewall',
    },
  });
  const exe = path.join(out, 'Tilewall-win32-x64', 'Tilewall.exe');
  if (!fs.existsSync(exe)) throw new Error('build finished but ' + exe + ' is missing');
  fs.writeFileSync(path.join(dist, 'LATEST.txt'), exe);
  if (!process.env.TW_NO_SHORTCUTS) pointShortcuts(exe);

  // Old builds go away unless a running copy still holds them.
  for (const d of fs.readdirSync(dist)) {
    const full = path.join(dist, d);
    if (d === name || !fs.statSync(full).isDirectory()) continue;
    if (!/^build-\d{8}-\d{6}(\.trash)?$/.test(d) && d !== 'Tilewall-win32-x64') continue;
    // Windows refuses to rename a folder while a running app holds files in it,
    // so a successful rename means nothing is using it and it is safe to delete.
    const trash = full + '.trash';
    try {
      fs.renameSync(full, trash);
    } catch (e) {
      console.log('kept old build (in use):', d);
      continue;
    }
    fs.rmSync(trash, { recursive: true, force: true });
    console.log('removed old build', d);
  }
  console.log('built', exe);
  console.log(process.env.TW_NO_SHORTCUTS ? 'shortcuts unchanged' : 'Desktop and Start menu shortcuts now open this build');
})().catch((e) => {
  console.error('package failed:', e);
  process.exit(1);
});
