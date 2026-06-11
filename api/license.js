/**
 * AidSec License API — wird vom WordPress-Plugin aufgerufen.
 *
 * Rewrites (vercel.json):
 *   GET /api/health           → Verbindungstest (keine Auth)
 *   GET /api/license/status   → Lizenzstatus, Authorization: Bearer lic_…
 */

import { getLicense, getOrder, recordOrderEvent } from './lib/order-store.js';

const LICENSE_ID_PATTERN = /^lic_[0-9a-f]{16}$/;

function bearerToken(req) {
  const header = req.headers?.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if ((req.url || '').includes('/health')) {
    return res.status(200).json({ ok: true, service: 'aidsec-api', time: new Date().toISOString() });
  }

  const licenseId = bearerToken(req);
  if (!licenseId || !LICENSE_ID_PATTERN.test(licenseId)) {
    return res.status(403).json({ error: 'Lizenz ungueltig', active: false });
  }

  try {
    const license = await getLicense(licenseId);
    if (!license || license.status !== 'active') {
      return res.status(403).json({ error: 'Lizenz ungueltig', active: false });
    }

    const order = await getOrder(license.orderId);
    await recordOrderEvent(license.orderId, 'license.checked', {
      licenseId,
      pluginUserAgent: req.headers?.['user-agent'] || null,
    });

    return res.status(200).json({
      active: true,
      licenseId: license.licenseId,
      status: license.status,
      tokenVersion: license.tokenVersion,
      orderId: license.orderId,
      productSlug: order?.productSlug || null,
      websiteUrl: order?.website?.url || null,
      createdAt: license.createdAt,
    });
  } catch (error) {
    console.error('[license] Status error:', error.message);
    return res.status(500).json({ error: 'Lizenzpruefung fehlgeschlagen', active: false });
  }
}
