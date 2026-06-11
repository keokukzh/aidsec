/**
 * AidSec Plugin Scan-Result API
 *
 * POST /api/plugin/scan-result (Rewrite in vercel.json)
 * Authorization: Bearer lic_…
 * Body: { url, result: { score, grade, headers? }, plugin_version }
 *
 * Speichert das Nachher-Ergebnis des Plugins am Auftrag (gradeAfter/scoreAfter).
 */

import { getLicense, getOrder, recordOrderEvent, updateOrder } from './lib/order-store.js';

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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const licenseId = bearerToken(req);
  if (!licenseId || !LICENSE_ID_PATTERN.test(licenseId)) {
    return res.status(403).json({ error: 'Lizenz ungueltig' });
  }

  try {
    const license = await getLicense(licenseId);
    if (!license || license.status !== 'active') {
      return res.status(403).json({ error: 'Lizenz ungueltig' });
    }

    const body = req.body || {};
    const result = body.result || {};
    const score = Number.isFinite(Number(result.score)) ? Number(result.score) : null;
    const grade = typeof result.grade === 'string' ? result.grade.slice(0, 2) : null;

    const order = await getOrder(license.orderId);
    if (order && (score !== null || grade)) {
      await updateOrder(order.orderId, {
        results: {
          ...(order.results || {}),
          scoreAfter: score ?? order.results?.scoreAfter ?? null,
          gradeAfter: grade || order.results?.gradeAfter || null,
        },
      });
    }

    await recordOrderEvent(license.orderId, 'plugin.scan_result', {
      licenseId,
      url: typeof body.url === 'string' ? body.url.slice(0, 200) : null,
      score,
      grade,
      pluginVersion: typeof body.plugin_version === 'string' ? body.plugin_version.slice(0, 20) : null,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[plugin-scan-result] Error:', error.message);
    return res.status(500).json({ error: 'Scan-Ergebnis konnte nicht gespeichert werden' });
  }
}
