import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = process.cwd();

function readProjectFile(path) {
  return readFileSync(join(root, path), 'utf8');
}

test('conversion image assets are present as webp files', () => {
  const requiredAssets = [
    'assets/images/hero_security_check_swiss_office.webp',
    'assets/images/industry_treuhand_security.webp',
    'assets/images/industry_kanzlei_security.webp',
    'assets/images/industry_praxis_security.webp',
    'assets/images/proof_center_dashboard_preview.webp',
    'assets/images/roi_risk_snapshot.webp',
  ];

  for (const asset of requiredAssets) {
    assert.equal(existsSync(join(root, asset)), true, `${asset} should exist`);
  }
});

test('remotion preview video assets and posters are present', () => {
  const requiredAssets = [
    'assets/videos/aidsec-proof-center.mp4',
    'assets/videos/aidsec-hardening-flow.mp4',
    'assets/videos/aidsec-treuhand-security.mp4',
    'assets/videos/aidsec-portal-walkthrough.mp4',
    'assets/videos/aidsec-roi-snapshot.mp4',
    'assets/videos/posters/aidsec-proof-center.webp',
    'assets/videos/posters/aidsec-hardening-flow.webp',
    'assets/videos/posters/aidsec-treuhand-security.webp',
  ];

  for (const asset of requiredAssets) {
    assert.equal(existsSync(join(root, asset)), true, `${asset} should exist`);
  }
});

test('homepage exposes conversion paths, proof visuals, and treuhand ROI option', () => {
  const html = readProjectFile('index.html');

  assert.match(html, /hero_security_check_swiss_office\.webp/);
  assert.match(html, /proof_center_dashboard_preview\.webp/);
  assert.match(html, /roi_risk_snapshot\.webp/);
  assert.match(html, /Security Check f(?:&uuml;|ü)r Schweizer Kanzleien, Praxen, Treuhand/);
  assert.match(html, /Proof Center ansehen/);
  assert.match(html, /href="\/branchen\/treuhand\.html"/);
  assert.match(html, /<option value="treuhand">Treuhand/);
});

test('treuhand page has industry visual, proof block, and check-scope panel', () => {
  const html = readProjectFile('branchen/treuhand.html');

  assert.match(html, /assets\/videos\/aidsec-treuhand-security\.mp4/);
  assert.match(html, /data-video-embed="treuhand-hero"/);
  assert.match(html, /Steuerdaten/);
  assert.match(html, /Fristen/);
  assert.match(html, /Phishing/);
  assert.match(html, /Was wird gepr(?:&uuml;|ü)ft/);
});

test('homepage and proof center embed lightweight autoplay preview videos', () => {
  const home = readProjectFile('index.html');
  const proof = readProjectFile('proof-center.html');

  assert.match(home, /data-video-embed="hardening-flow"/);
  assert.match(home, /assets\/videos\/aidsec-hardening-flow\.mp4/);
  assert.match(home, /muted/);
  assert.match(home, /playsinline/);
  assert.match(proof, /data-video-embed="proof-center"/);
  assert.match(proof, /assets\/videos\/aidsec-proof-center\.mp4/);
  assert.match(proof, /preload="metadata"/);
});

test('video assets are cached long-term and lazy-pause observes current preview classes', () => {
  const config = JSON.parse(readProjectFile('vercel.json'));
  const mainJs = readProjectFile('js/main.js');
  const videoHeader = config.headers.find((entry) => entry.source === '/assets/videos/(.*)');

  assert.ok(videoHeader, 'video cache header should exist');
  assert.deepEqual(videoHeader.headers, [
    {
      key: 'Cache-Control',
      value: 'public, max-age=31536000, immutable',
    },
  ]);
  assert.match(mainJs, /process-video__media/);
  assert.match(mainJs, /trust-video__media/);
  assert.match(mainJs, /industry-hero__video/);
});
