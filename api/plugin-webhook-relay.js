/**
 * AidSec Plugin Webhook Relay — SECURE
 *
 * Receives signed plugin activation events from AidSec WordPress plugin,
 * verifies HMAC signature, then relays to Make.com webhook.
 *
 * Token System:
 *  - licenseId: identifies the purchased installation
 *  - installSecret: per-license HMAC signing key stored server-side
 *  - Token rotation: Plugin sends `tokenVersion` field; if version < current, reject + rotate
 */

import crypto from 'crypto';
import { getLicense } from './lib/order-store.js';

const MAKE_WEBHOOK_URL = process.env.PLUGIN_MAKE_WEBHOOK_URL || 'https://hook.eu1.make.com/h6sbfnewo9cf03j3lk8umcyxnlkabk8c';
const CURRENT_TOKEN_VERSION = parseInt(process.env.PLUGIN_TOKEN_VERSION || '1', 10);

/**
 * Verify HMAC-SHA256 signature from plugin.
 * Signature = HMAC-SHA256(requestBody + timestamp, SHARED_SECRET)
 * Header: X-AidSec-Sig = base64(signature)
 * Header: X-AidSec-Ts   = unix timestamp (seconds)
 */
function verifyPluginSignature(req, installSecret) {
  const sig = req.headers['x-aidsec-sig'];
  const ts = req.headers['x-aidsec-ts'];

  if (!sig || !ts) {
    return { valid: false, reason: 'Signature headers missing (X-AidSec-Sig, X-AidSec-Ts)' };
  }

  // Check timestamp freshness (prevent replay attacks)
  const now = Math.floor(Date.now() / 1000);
  const tsNum = parseInt(ts, 10);
  if (isNaN(tsNum)) {
    return { valid: false, reason: 'Invalid timestamp' };
  }
  if (Math.abs(now - tsNum) > 300) { // 5 minute window
    return { valid: false, reason: 'Request too old (replay attack protection)' };
  }

  // Compute expected signature
  const body = JSON.stringify(req.body || {});
  const payload = body + ts;
  const expectedSig = crypto
    .createHmac('sha256', installSecret)
    .update(payload)
    .digest('base64');

  const sigBuffer = Buffer.from(sig, 'base64');
  const expectedBuffer = Buffer.from(expectedSig, 'base64');

  if (sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, reason: 'Invalid signature' };
  }

  return { valid: true };
}

/**
 * Verify token version (rotation check).
 */
function verifyTokenVersion(data) {
  const clientVersion = parseInt(data.tokenVersion || '0', 10);

  if (isNaN(clientVersion) || clientVersion < 1) {
    return { valid: false, reason: 'Invalid token version', rotate: true };
  }

  if (clientVersion < CURRENT_TOKEN_VERSION) {
    return {
      valid: false,
      reason: `Token version ${clientVersion} is outdated. Please update plugin to version ${CURRENT_TOKEN_VERSION}.`,
      rotate: true,
      newVersion: CURRENT_TOKEN_VERSION
    };
  }

  if (clientVersion > CURRENT_TOKEN_VERSION) {
    return { valid: false, reason: 'Unknown token version' };
  }

  return { valid: true };
}

/**
 * Relay verified payload to Make.com webhook.
 */
async function relayToMake(payload) {
  const response = await fetch(MAKE_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AidSec-Source': 'api-relay-v2',
      'X-AidSec-Relay': new Date().toISOString()
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Make.com relay failed: ${response.status}`);
  }

  return { relayed: true, makeStatus: response.status };
}

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Parse and validate payload before signature lookup
  const data = req.body || {};
  if (!data.event || !data.site_url || !data.licenseId) {
    return res.status(400).json({
      error: 'Invalid payload: event, site_url and licenseId required'
    });
  }

  const license = await getLicense(data.licenseId);
  if (!license || license.status !== 'active' || !license.installSecret) {
    return res.status(401).json({
      error: 'Authentication failed',
      reason: 'Unknown or inactive license',
      code: 'LICENSE_INVALID'
    });
  }

  // 2. Verify HMAC signature with the per-installation secret
  const sigResult = verifyPluginSignature(req, license.installSecret);
  if (!sigResult.valid) {
    console.warn('[plugin-webhook] Signature failed:', sigResult.reason);
    return res.status(401).json({
      error: 'Authentication failed',
      reason: sigResult.reason,
      code: 'AUTH_FAILED'
    });
  }

  // 3. Check token version (rotation)
  const versionResult = verifyTokenVersion(data);
  if (!versionResult.valid) {
    return res.status(403).json({
      error: 'Token rotation required',
      reason: versionResult.reason,
      code: 'TOKEN_ROTATION',
      newVersion: versionResult.newVersion,
      hint: 'Update your AidSec plugin to receive a new signing key'
    });
  }

  // 4. Add server-side metadata
  const enrichedPayload = {
    ...data,
    _relayMeta: {
      receivedAt: new Date().toISOString(),
      apiVersion: '2.0.0',
      relayVersion: CURRENT_TOKEN_VERSION,
      source: 'aidsec-plugin-relay',
      orderId: license.orderId,
      licenseId: license.licenseId
    }
  };

  // 5. Relay to Make.com
  try {
    await relayToMake(enrichedPayload);
  } catch (err) {
    console.error('[plugin-webhook] Relay error:', err.message);
    // Don't expose Make.com errors to client
    return res.status(502).json({
      error: 'Relay to downstream service failed',
      code: 'RELAY_ERROR'
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Plugin activation received and relayed',
    timestamp: new Date().toISOString()
  });
}
