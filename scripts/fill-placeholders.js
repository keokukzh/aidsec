#!/usr/bin/env node
/**
 * AidSec — Platzhalter ausfüllen
 * Kopieren Sie config.example.json nach config.json und füllen Sie die Werte ein.
 * Dann: node scripts/fill-placeholders.js
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const configPath = join(root, 'config.json');
if (!existsSync(configPath)) {
  console.error('Fehler: config.json nicht gefunden.');
  console.error('Kopieren Sie config.example.json nach config.json und füllen Sie die Werte ein.');
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, 'utf8'));

const replacements = [
  {
    file: 'index.html',
    from: 'data-hcaptcha-sitekey=""',
    to: config.hCaptchaSiteKey
      ? `data-hcaptcha-sitekey="${config.hCaptchaSiteKey}"`
      : 'data-hcaptcha-sitekey=""',
  },
  {
    file: 'impressum.html',
    from: '-->AidSec</strong',
    to: '-->' + (config.impressum?.firma || 'AidSec') + '</strong',
  },
  { file: 'impressum.html', from: '[Strasse Hausnummer]', to: config.impressum?.strasse },
  { file: 'impressum.html', from: '[PLZ Ort]', to: config.impressum?.plzOrt },
  { file: 'impressum.html', from: '[UID-Nummer]', to: config.impressum?.uid },
  {
    file: 'impressum.html',
    from: '[Handelsregistereintrag]',
    to: config.impressum?.handelsregister,
  },
  {
    file: 'impressum.html',
    from: '[MwSt-Nummer oder "Nicht MwSt-pflichtig"]',
    to: config.impressum?.mwst,
  },
];

let hasPlaceholder = false;
for (const { file, from, to } of replacements) {
  const path = join(root, file);
  if (!existsSync(path)) continue;
  let content = readFileSync(path, 'utf8');
  if (content.includes(from)) {
    if (from.includes('PLATZHALTER') && to.includes('PLATZHALTER')) {
      hasPlaceholder = true;
    }
    content = content.split(from).join(to);
    writeFileSync(path, content);
    console.log(`✓ ${file}: ${from} → ${to}`);
  }
}

// Plausible Analytics: Wenn plausibleDomain gesetzt, Script aktivieren und Domain ersetzen
const plausibleDomain = config.plausibleDomain?.trim();
if (plausibleDomain && plausibleDomain !== 'PLATZHALTER_DOMAIN') {
  const indexPath = join(root, 'index.html');
  if (existsSync(indexPath)) {
    let content = readFileSync(indexPath, 'utf8');
    const commentedScript =
      '<!-- <script defer data-domain="PLATZHALTER_DOMAIN" src="/js/plausible.js"></script> -->';
    const activeScript =
      '<script defer data-domain="' + plausibleDomain + '" src="/js/plausible.js"></script>';
    if (content.includes(commentedScript)) {
      content = content.replace(commentedScript, activeScript);
      writeFileSync(indexPath, content);
      console.log('✓ index.html: Plausible Analytics aktiviert (Domain: ' + plausibleDomain + ')');
    }
  }
} else if (
  plausibleDomain === 'PLATZHALTER_DOMAIN' ||
  (plausibleDomain && plausibleDomain.includes('PLATZHALTER'))
) {
  hasPlaceholder = true;
}

if (hasPlaceholder) {
  console.warn(
    '\n⚠ Achtung: Einige Platzhalter sind noch nicht ausgefüllt. Prüfen Sie config.json.'
  );
}

console.log('\nPlatzhalter wurden ersetzt.');
