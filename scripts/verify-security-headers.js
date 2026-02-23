#!/usr/bin/env node
/**
 * AidSec — Security Headers prüfen
 * Ruft SecurityHeaders.com-API auf und zeigt das Ergebnis.
 * Nach Deployment ausführen: npm run verify-headers
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const SECURITY_HEADERS = [
  'strict-transport-security',
  'content-security-policy',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
];

const GRADE_MAP = ['F', 'F', 'E', 'D', 'C', 'B', 'A'];

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

function extractGradeFromHtml(html) {
  if (!html || typeof html !== 'string') return '';

  const patterns = [
    /Grade:?\s*([A-F][+-]?)/i,
    /class="grade[^"\\n]*"[^>]*>\s*([A-F][+-]?)\s*</i,
    /"grade"\s*:\s*"([A-F][+-]?)"/i,
    /aria-label="Grade\s*([A-F][+-]?)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) return match[1].toUpperCase();
  }

  return '';
}

async function estimateGradeFromHeaders(targetUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  const fetchOpts = {
    signal: controller.signal,
    redirect: 'follow',
    headers: {
      'User-Agent': 'AidSec-VerifyHeaders/1.0 (+https://aidsec.ch)',
    },
  };

  try {
    let response = await fetch(targetUrl, { ...fetchOpts, method: 'HEAD' });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(targetUrl, { ...fetchOpts, method: 'GET' });
    }

    let score = 0;
    let hstsValue = '';

    for (const key of SECURITY_HEADERS) {
      const value = response.headers.get(key);
      const present = value !== null && value !== '';
      if (present) score++;
      if (key === 'strict-transport-security') hstsValue = value || '';
    }

    let grade = GRADE_MAP[Math.min(score, 6)];
    if (score === 6 && /preload/i.test(hstsValue)) {
      grade = 'A+';
    }

    return { grade, score, maxScore: SECURITY_HEADERS.length };
  } finally {
    clearTimeout(timeout);
  }
}

try {
  const res = await fetch(
    `https://securityheaders.com/?q=${encodeURIComponent(url)}&hide=on&followRedirects=on`
  );
  const html = await res.text();
  let grade = extractGradeFromHtml(html);
  let gradeSource = 'securityheaders.com';

  if (!grade) {
    const estimate = await estimateGradeFromHeaders(url);
    grade = estimate.grade;
    gradeSource = `lokale Schätzung (${estimate.score}/${estimate.maxScore} Header)`;
  }

  console.log(`SecurityHeaders.com Note: ${grade} (${gradeSource})`);
  console.log(`\nVollständiger Bericht: https://securityheaders.com/?q=${encodeURIComponent(url)}`);
  if (grade !== 'A' && grade !== 'A+') {
    console.warn('\n⚠ Ziel ist Note A. Prüfen Sie vercel.json (Vercel) oder _headers/netlify.toml (Netlify).');
  }
} catch (err) {
  console.error('Fehler beim Abrufen:', err.message);
  console.log('\nManuell prüfen: https://securityheaders.com/?q=' + encodeURIComponent(url));
}
