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

  assert.match(html, /industry_treuhand_security\.webp/);
  assert.match(html, /Steuerdaten/);
  assert.match(html, /Fristen/);
  assert.match(html, /Phishing/);
  assert.match(html, /Was wird gepr(?:&uuml;|ü)ft/);
});
