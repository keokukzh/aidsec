import { describe, it, expect } from 'vitest';
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

describe('license system', () => {
  it('generateLicenseId creates correct format with lic_ prefix', () => {
    const licenseId = generateLicenseId();

    // Verify prefix
    expect(licenseId.startsWith('lic_')).toBeTruthy();

    // Verify format: lic_ + 16 hex characters
    const hexPart = licenseId.slice(4);
    expect(hexPart.length).toBe(16);
    expect(/^[0-9a-f]{16}$/.test(hexPart)).toBeTruthy();
  });

  it('generateLicenseId produces unique IDs', () => {
    const ids = new Set();
    const count = 100;

    for (let i = 0; i < count; i++) {
      const id = generateLicenseId();
      expect(ids.has(id)).not.toBeTruthy();
      ids.add(id);
    }

    expect(ids.size).toBe(count);
  });

  it('generateLicenseId generates cryptographically random values', () => {
    const id1 = generateLicenseId();
    const id2 = generateLicenseId();

    // Different calls should produce different results
    expect(id1).not.toBe(id2);
  });

  it('generateInstallSecret creates 256-bit (43 char base64url) secrets', () => {
    const secret = generateInstallSecret();

    // base64url encoding of 32 bytes = 43 characters (no padding)
    expect(secret.length).toBe(43);

    // base64url uses A-Z, a-z, 0-9, -, _ (no + or /)
    expect(/^[A-Za-z0-9_-]+$/.test(secret)).toBeTruthy();
    expect(!secret.includes('+') && !secret.includes('/') && !secret.includes('=')).toBeTruthy();
  });

  it('generateInstallSecret produces unique secrets', () => {
    const secrets = new Set();
    const count = 100;

    for (let i = 0; i < count; i++) {
      const secret = generateInstallSecret();
      expect(secrets.has(secret)).not.toBeTruthy();
      secrets.add(secret);
    }

    expect(secrets.size).toBe(count);
  });

  it('generateInstallSecret generates cryptographically random values', () => {
    const secret1 = generateInstallSecret();
    const secret2 = generateInstallSecret();

    expect(secret1).not.toBe(secret2);
  });

  it('license ID and install secret are different formats', () => {
    const licenseId = generateLicenseId();
    const installSecret = generateInstallSecret();

    // License ID: hex format (lic_XXXXXXXXXXXXXXXX)
    // Install Secret: base64url format (43 chars)
    expect(licenseId.length).not.toBe(installSecret.length);
    expect(licenseId.startsWith('lic_')).toBeTruthy();
    expect(!installSecret.startsWith('lic_')).toBeTruthy();
  });

  it('multiple license IDs follow same pattern', () => {
    for (let i = 0; i < 10; i++) {
      const id = generateLicenseId();
      expect(id.startsWith('lic_')).toBeTruthy();
      expect(id.length).toBe(20);
    }
  });

  it('multiple install secrets follow same pattern', () => {
    for (let i = 0; i < 10; i++) {
      const secret = generateInstallSecret();
      expect(secret.length).toBe(43);
      expect(/^[A-Za-z0-9_-]+$/.test(secret)).toBeTruthy();
    }
  });
});
