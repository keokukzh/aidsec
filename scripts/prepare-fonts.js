#!/usr/bin/env node
/**
 * AidSec — Fonts für Self-Hosting vorbereiten
 * Kopiert Font-Dateien aus node_modules nach css/fonts/ und erstellt fonts.css
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const fontsDir = join(root, 'css', 'fonts');
const nm = join(root, 'node_modules', '@fontsource');

mkdirSync(fontsDir, { recursive: true });

const config = [
  { pkg: 'instrument-serif', cssFiles: ['index.css', '400-italic.css'] },
  { pkg: 'plus-jakarta-sans', cssFiles: ['300.css', 'index.css', '500.css', '600.css', '700.css'] },
];

let css = '/* AidSec — Self-hosted Fonts (nDSG-optimiert, keine Google-Requests) */\n\n';

for (const { pkg, cssFiles } of config) {
  const pkgPath = join(nm, pkg);
  if (!existsSync(pkgPath)) continue;

  const filesDir = join(pkgPath, 'files');
  if (existsSync(filesDir)) {
    const files = readdirSync(filesDir).filter((f) => f.endsWith('.woff2'));
    for (const file of files) {
      copyFileSync(join(filesDir, file), join(fontsDir, file));
    }
  }

  for (const cssFile of cssFiles) {
    const path = join(pkgPath, cssFile);
    if (!existsSync(path)) continue;
    let content = readFileSync(path, 'utf8');
    content = content.replace(/url\(\.\/files\/([^)]+)\)/g, 'url(fonts/$1)');
    css += content + '\n';
  }
}

writeFileSync(join(root, 'css', 'fonts.css'), css);
console.log('Fonts vorbereitet: css/fonts.css, css/fonts/');
