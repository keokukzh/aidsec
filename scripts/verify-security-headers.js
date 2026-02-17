#!/usr/bin/env node
/**
 * AidSec — Security Headers prüfen
 * Ruft SecurityHeaders.com-API auf und zeigt das Ergebnis.
 * Nach Deployment ausführen: npm run verify-headers
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let url = 'https://aidsec.ch';
const configPath = join(root, 'config.json');
if (existsSync(configPath)) {
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (config.securityHeadersUrl) url = config.securityHeadersUrl;
  } catch (_) {}
}

console.log(`Prüfe Security Headers für: ${url}\n`);

try {
  const res = await fetch(
    `https://securityheaders.com/?q=${encodeURIComponent(url)}&hide=on&followRedirects=on`
  );
  const html = await res.text();
  const gradeMatch =
    html.match(/Grade:?\s*([A-F][+-]?)/i) || html.match(/class="grade[^"]*">([A-F][+-]?)/i);
  const grade = gradeMatch ? gradeMatch[1] : '?';
  console.log(`SecurityHeaders.com Note: ${grade}`);
  console.log(`\nVollständiger Bericht: https://securityheaders.com/?q=${encodeURIComponent(url)}`);
  if (grade !== 'A' && grade !== 'A+') {
    console.warn('\n⚠ Ziel ist Note A. Prüfen Sie _headers in netlify.toml (Netlify).');
  }
} catch (err) {
  console.error('Fehler beim Abrufen:', err.message);
  console.log('\nManuell prüfen: https://securityheaders.com/?q=' + encodeURIComponent(url));
}
