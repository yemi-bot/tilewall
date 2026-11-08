// Publishes a new version: builds the installer and uploads it to GitHub
// Releases, where installed copies find it and update themselves.
// First bump "version" in package.json and commit. Usage: npm run release
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = require('../package.json');
const tag = 'v' + pkg.version;
const out = path.join(root, 'dist', 'release');

const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });
const read = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8' }).trim();

if (read('git', ['status', '--porcelain'])) throw new Error('Commit your changes first.');
if (read('git', ['tag', '--list', tag])) throw new Error(tag + ' already exists. Bump "version" in package.json first.');

fs.rmSync(out, { recursive: true, force: true });
run(process.execPath, [path.join(root, 'node_modules', 'electron-builder', 'cli.js'), '--win', '--publish', 'never']);

const exe = 'Tilewall-Setup-' + pkg.version + '.exe';
const files = [exe, exe + '.blockmap', 'latest.yml'].map((f) => path.join(out, f));
for (const f of files) if (!fs.existsSync(f)) throw new Error('Build finished but ' + f + ' is missing.');

const notes = [
  'Download **' + exe + '** below and run it. It installs for your Windows user, no admin needed.',
  '',
  'Windows may say "Windows protected your PC" because Tilewall is not code-signed yet. Click **More info**, then **Run anyway**.',
  '',
  'Already installed? Tilewall updates itself: the new version downloads in the background and installs when you close the app.',
].join('\n');

run('git', ['tag', tag]);
run('git', ['push', 'origin', 'HEAD', tag]);
run('gh', ['release', 'create', tag, ...files, '--title', 'Tilewall ' + pkg.version, '--notes', notes, '--generate-notes']);
console.log('Released ' + tag);
