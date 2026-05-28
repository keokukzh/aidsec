import assert from 'node:assert/strict';
import test from 'node:test';
import { generateLicenseId, generateInstallSecret } from './lib/order-store.js';

/**
 * License Key System Tests
 *
 * Tests verify:
 * - generateLicenseId() creates correct format: lic_{16-hex-chars}
 * - generateInstallSecret() creates 256-bit base64url secrets
 * - Both functions produce unique values
 * - Prefix validation works correctly
 */

test('generateLicenseId creates correct format with lic_ prefix', () => {
  const licenseId = generateLicenseId();

  // Verify prefix
  assert.ok(licenseId.startsWith('lic_'), `Expected prefix 'lic_', got: ${licenseId}`);

  // Verify format: lic_ + 16 hex characters
  const hexPart = licenseId.slice(4);
  assert.equal(hexPart.length, 16, `Expected 16 hex chars, got ${hexPart.length}: ${licenseId}`);
  assert.ok(/^[0-9a-f]{16}$/.test(hexPart), `Expected hex format, got: ${hexPart}`);
});

test('generateLicenseId produces unique IDs', () => {
  const ids = new Set();
  const count = 100;

  for (let i = 0; i < count; i++) {
    const id = generateLicenseId();
    assert.ok(!ids.has(id), `Duplicate ID generated: ${id}`);
    ids.add(id);
  }

  assert.equal(ids.size, count, `Expected ${count} unique IDs, got ${ids.size}`);
});

test('generateLicenseId generates cryptographically random values', () => {
  const id1 = generateLicenseId();
  const id2 = generateLicenseId();

  // Different calls should produce different results
  assert.notEqual(id1, id2, 'Sequential calls should produce different IDs');
});

test('generateInstallSecret creates 256-bit (43 char base64url) secrets', () => {
  const secret = generateInstallSecret();

  // base64url encoding of 32 bytes = 43 characters (no padding)
  assert.equal(secret.length, 43, `Expected 43 chars for 256-bit secret, got ${secret.length}: ${secret}`);

  // base64url uses A-Z, a-z, 0-9, -, _ (no + or /)
  assert.ok(/^[A-Za-z0-9_-]+$/.test(secret), `Expected base64url format, got: ${secret}`);
  assert.ok(!secret.includes('+') && !secret.includes('/') && !secret.includes('='), 'Should not contain base64 padding or chars');
});

test('generateInstallSecret produces unique secrets', () => {
  const secrets = new Set();
  const count = 100;

  for (let i = 0; i < count; i++) {
    const secret = generateInstallSecret();
    assert.ok(!secrets.has(secret), `Duplicate secret generated`);
    secrets.add(secret);
  }

  assert.equal(secrets.size, count, `Expected ${count} unique secrets, got ${secrets.size}`);
});

test('generateInstallSecret generates cryptographically random values', () => {
  const secret1 = generateInstallSecret();
  const secret2 = generateInstallSecret();

  assert.notEqual(secret1, secret2, 'Sequential calls should produce different secrets');
});

test('license ID and install secret are different formats', () => {
  const licenseId = generateLicenseId();
  const installSecret = generateInstallSecret();

  // License ID: hex format (lic_XXXXXXXXXXXXXXXX)
  // Install Secret: base64url format (43 chars)
  assert.notEqual(licenseId.length, installSecret.length, 'Different formats should have different lengths');
  assert.ok(licenseId.startsWith('lic_'), 'License ID should start with lic_');
  assert.ok(!installSecret.startsWith('lic_'), 'Install secret should not have license prefix');
});

test('multiple license IDs follow same pattern', () => {
  for (let i = 0; i < 10; i++) {
    const id = generateLicenseId();
    assert.ok(id.startsWith('lic_'), `ID ${i} should start with lic_: ${id}`);
    assert.equal(id.length, 20, `ID ${i} should be 20 chars total: ${id}`);
  }
});

test('multiple install secrets follow same pattern', () => {
  for (let i = 0; i < 10; i++) {
    const secret = generateInstallSecret();
    assert.equal(secret.length, 43, `Secret ${i} should be 43 chars: ${secret}`);
    assert.ok(/^[A-Za-z0-9_-]+$/.test(secret), `Secret ${i} should be base64url: ${secret}`);
  }
});