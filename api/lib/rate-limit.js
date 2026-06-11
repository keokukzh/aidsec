/**
 * AidSec Rate Limit Helper
 *
 * Wird von Public-Endpoints genutzt, die ohne Login missbraucht werden koennten
 * (Header-Check, Magic-Link, etc.). Strategie:
 *   1. Production + Vercel: Upstash-Redis (INCR + EXPIRE) — durable, serverless-safe
 *   2. Dev oder ohne Upstash-Credentials: in-Memory Map — reicht fuer lokale Tests
 *
 * Bei Ueberschreitung gibt `consume` `{ limited: true, remaining: 0, resetMs }` zurueck
 * — der Aufrufer entscheidet, ob er 429 oder 200 mit Null-Ergebnis sendet.
 */

import { createHash } from 'crypto';
import { getEnvFirst, isProduction } from './env.js';

const RATE_PREFIX = 'ratelimit';

function hashIdentifier(value) {
  return createHash('sha256').update(value || 'unknown').digest('hex').slice(0, 24);
}

function getClientIp(req) {
  const header = req.headers?.['x-forwarded-for'];
  if (typeof header === 'string' && header.trim()) {
    return header.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * @param {object} options
 * @param {string} options.bucket   Eindeutiger Name (z.B. "check-headers"), wird Teil des Keys
 * @param {number} options.limit    Max. Aufrufe pro Fenster
 * @param {number} options.windowMs Fenstergroesse in Millisekunden
 * @param {string} options.identifier Eindeutige ID (IP-Adresse, licenseId, etc.)
 */
export async function consumeRateLimit({ bucket, limit, windowMs, identifier }) {
  const safeLimit = Math.max(1, Number(limit) || 10);
  // Mindestfenster 100ms, um Missbrauch durch zu kurze Windows zu verhindern
  // (z.B. 10 Calls in 1ms). Tests duerfen kleinere Werte einsetzen.
  const safeWindow = Math.max(100, Number(windowMs) || 60_000);
  const id = hashIdentifier(identifier);

  // Upstash-Pfad: in Production bevorzugt, fallback zu Memory wenn keine Credentials.
  const upstashUrl = getEnvFirst(['UPSTASH_REDIS_REST_URL']);
  const upstashToken = getEnvFirst(['UPSTASH_REDIS_REST_TOKEN']);

  if (upstashUrl && upstashToken) {
    try {
      return await consumeUpstash({ bucket, limit: safeLimit, windowMs: safeWindow, id, upstashUrl, upstashToken });
    } catch (error) {
      if (isProduction()) {
        // In Production lieber failen als ungebremst durchlassen.
        throw error;
      }
      console.warn('[rate-limit] Upstash failed, fallback to memory:', error.message);
    }
  } else if (isProduction()) {
    console.warn('[rate-limit] Upstash credentials missing in production; using in-memory fallback (will reset on cold start).');
  }

  return consumeMemory({ bucket, limit: safeLimit, windowMs: safeWindow, id });
}

async function consumeUpstash({ bucket, limit, windowMs, id, upstashUrl, upstashToken }) {
  const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const bucketWindow = Math.floor(Date.now() / windowMs);
  const key = `${RATE_PREFIX}:${bucket}:${id}:${bucketWindow}`;
  const encodedKey = encodeURIComponent(key);

  const incrRes = await fetch(`${upstashUrl}/incr/${encodedKey}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${upstashToken}` },
  });
  if (!incrRes.ok) throw new Error(`Upstash INCR failed (${incrRes.status})`);
  const incrJson = await incrRes.json();
  const count = Number(incrJson?.result);
  if (!Number.isFinite(count)) throw new Error('Upstash INCR result invalid');

  if (count === 1) {
    await fetch(`${upstashUrl}/expire/${encodedKey}/${ttlSeconds}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${upstashToken}` },
    }).catch(() => {
      // EXPIRE schlaegt nur fehl, wenn der Key schon weg ist — egal.
    });
  }

  return {
    limited: count > limit,
    count,
    remaining: Math.max(0, limit - count),
    resetMs: (bucketWindow + 1) * windowMs - Date.now(),
  };
}

// In-Memory: pro bucket+id ein Array von Timestamps.
const memoryBuckets = new Map();

function consumeMemory({ bucket, limit, windowMs, id }) {
  const key = `${bucket}:${id}`;
  const now = Date.now();
  const cutoff = now - windowMs;
  const entries = (memoryBuckets.get(key) || []).filter((t) => t > cutoff);
  entries.push(now);
  memoryBuckets.set(key, entries);

  // Gelegentlich aufraeumen, damit die Map nicht waechst.
  if (memoryBuckets.size > 5000) {
    for (const [k, list] of memoryBuckets.entries()) {
      if (list.every((t) => t <= cutoff)) memoryBuckets.delete(k);
    }
  }

  return {
    limited: entries.length > limit,
    count: entries.length,
    remaining: Math.max(0, limit - entries.length),
    resetMs: windowMs - (now - (entries[0] || now)),
  };
}

/**
 * Convenience: erzeugt die passenden HTTP-Header (X-RateLimit-*) fuer ein 200- oder 429-Response.
 */
export function rateLimitHeaders(result, limit, windowMs) {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil((result.resetMs || 0) / 1000)),
  };
}

export { getClientIp };
