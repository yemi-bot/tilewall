// Builds dist/Tilewall-win32-x64/Tilewall.exe. Usage: npm run package
'use strict';

const { packager } = require('@electron/packager');
const path = require('path');

const root = path.join(__dirname, '..');

packager({
  dir: root,
  out: path.join(root, 'dist'),
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
})
  .then((paths) => console.log('built', paths.join(', ')))
  .catch((e) => {
    console.error('package failed:', e);
    process.exit(1);
  });
