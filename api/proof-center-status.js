/**
 * AidSec Proof Center Status API
 * Returns demo data for public visitors, customer portal data for authenticated users
 *
 * GET /api/proof-center-status (public demo)
 * GET /api/proof-center-status?orderId=<id>&token=<token> (authenticated portal)
 */

import { storage } from './cron/storage.js';
import { getCustomerPortalByOrderId } from './lib/order-store.js';
import { computeLeadScore } from './crm-lead-scoring.js';
import { verifyMagicToken } from './lib/order-token.js';

async function loadSiteData() {
  const baseUrl = process.env.BASE_URL || (process.env.NODE_ENV === 'production'
    ? 'https://aidsec.ch'
    : 'http://localhost:5173');

  const response = await fetch(`${baseUrl}/data/site-data.json`, {
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Failed to load site-data: ${response.status}`);
  }

  return response.json();
}

async function withSignedReportUrls(portal) {
  const reports = await Promise.all(
    (portal.reports || []).map(async (report) => {
      if (!report.key) return report;
      try {
        return {
          ...report,
          url: await storage.createSignedReadUrl(report.key, 60 * 60),
          expiresInSeconds: 60 * 60,
        };
      } catch (_) {
        return {
          ...report,
          url: report.url || `/reports/${report.key}`,
        };
      }
    }),
  );
  return { ...portal, reports };
}

function publicDemoResponse(siteData) {
  return {
    updatedAt: siteData.updatedAt,
    packages: siteData.packages,
    proofCenter: siteData.proofCenter,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://aidsec.ch');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { orderId, token } = req.query || {};
    if (orderId || token) {
      if (!orderId || !token) {
        return res.status(401).json({ error: 'Proof Center Link unvollstaendig' });
      }
      const authResult = verifyMagicToken(token);
      if (!authResult.valid || authResult.orderId !== orderId) {
        return res.status(401).json({ error: 'Ungueltiger oder abgelaufener Proof Center Link' });
      }
      const portal = await getCustomerPortalByOrderId(orderId);
      if (!portal) return res.status(404).json({ error: 'Kundenportal nicht gefunden' });

      // Compute CRM lead score
      var firstOrder = portal.orders && portal.orders[0];
      var monitoringGrade = null;
      if (firstOrder && firstOrder.monitoring && firstOrder.monitoring.grade) {
        monitoringGrade = firstOrder.monitoring.grade;
      }
      var ls = computeLeadScore(firstOrder, monitoringGrade);

      var enhancedPortal = await withSignedReportUrls({
        ...portal,
        leadScore: { score: ls.score, level: ls.score >= 75 ? 'hoch' : ls.score >= 50 ? 'mittel' : 'niedrig' },
        upsellRecommendation: ls.upsells && ls.upsells[0] ? ls.upsells[0].reason : null,
      });

      return res.status(200).json({
        success: true,
        updatedAt: new Date().toISOString(),
        portal: enhancedPortal,
      });
    }

    const siteData = await loadSiteData();
    return res.status(200).json(publicDemoResponse(siteData));
  } catch (_) {
    return res.status(500).json({
      error: 'Proof-Center-Daten konnten nicht geladen werden.',
    });
  }
}
