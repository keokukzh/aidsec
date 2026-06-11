import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { consumeRateLimit, getClientIp, rateLimitHeaders } from './lib/rate-limit.js';

/**
 * Tests fuer das Rate-Limit-Helper.
 *
 * Deckt ab:
 *   - getClientIp respektiert x-forwarded-for / socket / Fallback "unknown"
 *   - Memory-Backend: Limit, Reset, saemtliche Identifier bleiben getrennt
 *   - rateLimitHeaders liefert X-RateLimit-* in Sekunden
 *
 * WICHTIG: Upstash-Credentials werden in den Env-Vars gemockt-leer gesetzt, damit
 * die Memory-Branch greift. Sonst wuerden Tests gegen die echte Upstash-Instanz
 * laufen und Production-Daten mutieren.
 */

describe('rate-limit helper', () => {
  let originalUrl;
  let originalToken;

  beforeEach(() => {
    originalUrl = process.env.UPSTASH_REDIS_REST_URL;
    originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    // Upstash-Pfad hart ausschalten — wir testen die Memory-Branch, nicht Produktion.
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    if (originalUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  });

  describe('getClientIp', () => {
    it('returns first x-forwarded-for entry', () => {
      const req = { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } };
      expect(getClientIp(req)).toBe('1.2.3.4');
    });

    it('falls back to socket.remoteAddress', () => {
      const req = { headers: {}, socket: { remoteAddress: '5.6.7.8' } };
      expect(getClientIp(req)).toBe('5.6.7.8');
    });

    it('returns "unknown" when nothing is set', () => {
      const req = { headers: {} };
      expect(getClientIp(req)).toBe('unknown');
    });
  });

  describe('memory backend', () => {
    it('allows up to the limit, then blocks', async () => {
      const opts = { bucket: 'unit-mem', limit: 3, windowMs: 1000, identifier: '1.1.1.1' };
      const r1 = await consumeRateLimit(opts);
      const r2 = await consumeRateLimit(opts);
      const r3 = await consumeRateLimit(opts);
      const r4 = await consumeRateLimit(opts);
      expect(r1.limited).toBe(false);
      expect(r2.limited).toBe(false);
      expect(r3.limited).toBe(false);
      expect(r4.limited).toBe(true);
      expect(r4.remaining).toBe(0);
    });

    it('resets the window after the time passes', async () => {
      const opts = { bucket: 'unit-mem-reset', limit: 1, windowMs: 100, identifier: '2.2.2.2' };
      const r1 = await consumeRateLimit(opts);
      const r2 = await consumeRateLimit(opts);
      // Sleep grosszuegig dimensioniert: setTimeout hat auf manchen Plattformen
      // 10-30ms Granularitaet, daher deutlich ueber windowMs warten.
      await new Promise((r) => setTimeout(r, 250));
      const r3 = await consumeRateLimit(opts);
      expect(r1.limited).toBe(false);
      expect(r2.limited).toBe(true);
      expect(r3.limited).toBe(false);
    });

    it('keeps identifiers independent', async () => {
      const base = { bucket: 'unit-mem-iso', limit: 1, windowMs: 1000 };
      expect((await consumeRateLimit({ ...base, identifier: 'a' })).limited).toBe(false);
      expect((await consumeRateLimit({ ...base, identifier: 'b' })).limited).toBe(false);
      expect((await consumeRateLimit({ ...base, identifier: 'a' })).limited).toBe(true);
    });
  });

  describe('rateLimitHeaders', () => {
    it('returns X-RateLimit-* headers in seconds', () => {
      const headers = rateLimitHeaders({ remaining: 7, resetMs: 12_345 }, 10, 60_000);
      expect(headers['X-RateLimit-Limit']).toBe('10');
      expect(headers['X-RateLimit-Remaining']).toBe('7');
      expect(headers['X-RateLimit-Reset']).toBe('13');
    });

    it('handles missing resetMs gracefully', () => {
      const headers = rateLimitHeaders({ remaining: 0, resetMs: 0 }, 5, 1000);
      expect(headers['X-RateLimit-Reset']).toBe('0');
    });
  });
});
