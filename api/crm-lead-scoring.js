/**
 * AidSec CRM Lead Scoring API
 * Server-seitige Lead-Bewertung basierend auf:
 * - Auftragshistorie
 * - Monitoring-Grade
 * - Zahlungsstatus
 * - Produkttyp
 *
 * GET /api/crm-lead-scoring?orderId=<orderId>
 */

import { getOrder, getCustomerPortalByOrderId } from './lib/order-store.js';
import { getEnvFirst } from './lib/env.js';

export function computeLeadScore(order, monitoringGrade) {
  let score = 0;
  const upsells = [];

  // Payment status (highest weight)
  if (order.paymentStatus === 'paid' || order.status === 'active') {
    score += 25;
  } else if (order.paymentStatus === 'unpaid') {
    score += 5;
  } else {
    score += 10;
  }

  // Product type weighting
  if (order.productSlug === 'cyber-mandat') {
    score += 20; // Ongoing service = high retention value
    upsells.push({
      product: 'cyber-mandat-pro-plus',
      name: 'Cyber-Mandat Pro+',
      reason: 'Mit Ihrem laufenden Cyber-Mandat bieten wir Ihnen erweiterte Incident-Response-Abdeckung.',
      price: 'CHF 129.â€“/Monat'
    });
  } else if (order.productSlug === 'kanzlei-haertung') {
    score += 15;
    upsells.push({
      product: 'cyber-mandat',
      name: 'Cyber-Mandat Pro',
      reason: 'Kanzlei-Haertung ist abgeschlossen. FÃ¼gen Sie laufendes Monitoring hinzu.',
      price: 'CHF 89.â€“/Monat'
    });
  } else if (order.productSlug === 'rapid-header-fix') {
    score += 10;
    upsells.push({
      product: 'kanzlei-haertung',
      name: 'Kanzlei-HÃ¤rtung',
      reason: 'Nach dem Rapid Header Fix bietet die vollstÃ¤ndige Kanzlei-HÃ¤rtung den kompletten Schutz.',
      price: 'CHF 790.â€“'
    });
    upsells.push({
      product: 'cyber-mandat',
      name: 'Cyber-Mandat Pro',
      reason: 'Laufendes Monitoring sichert Ihre Investitionen.',
      price: 'CHF 89.â€“/Monat'
    });
  }

  // Monitoring grade (negative indicator)
  if (monitoringGrade) {
    const gradeScore = { A: 15, B: 12, C: 8, D: 4, E: 2, F: 0 };
    score += gradeScore[monitoringGrade.toUpperCase()] || 0;

    if (monitoringGrade.toUpperCase() === 'F') {
      upsells.unshift({
        product: 'rapid-header-fix',
        name: 'Rapid Header Fix',
        reason: 'Ihre Website hat die Note F â€” schnelle Hilfe ist dringend empfohlen.',
        price: 'CHF 390.â€“'
      });
    }
  } else {
    // No monitoring data yet = opportunity
    score += 5;
  }

  // Order recency (within 30 days = warm lead)
  if (order.createdAt) {
    const daysSince = (Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 7) score += 10;
    else if (daysSince < 30) score += 5;
  }

  // Has events (engagement signal)
  if (order.events && order.events.length > 0) {
    score += 3;
  }

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));

  return { score, upsells };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', getEnvFirst(['ALLOWED_ORIGIN']) || 'https://aidsec.ch');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { orderId } = req.query || {};
    if (!orderId) {
      return res.status(400).json({ error: 'orderId ist erforderlich' });
    }

    const portal = await getCustomerPortalByOrderId(orderId);
    if (!portal) {
      return res.status(404).json({ error: 'Auftrag nicht gefunden' });
    }

    const firstOrder = portal.orders && portal.orders[0];
    if (!firstOrder) {
      return res.status(404).json({ error: 'Keine Auftragsdaten vorhanden' });
    }

    // Get last monitoring grade
    let monitoringGrade = null;
    if (firstOrder.monitoring && firstOrder.monitoring.grade) {
      monitoringGrade = firstOrder.monitoring.grade;
    }

    const { score, upsells } = computeLeadScore(firstOrder, monitoringGrade);

    return res.status(200).json({
      success: true,
      orderId: firstOrder.orderId,
      leadScore: {
        score,
        level: score >= 75 ? 'hoch' : score >= 50 ? 'mittel' : 'niedrig',
        upsells: upsells.slice(0, 3)
      },
      portal: {
        orders: portal.orders,
        websites: portal.websites,
        reports: portal.reports,
        events: portal.events.slice(0, 10),
        customer: portal.customer
      }
    });
  } catch (error) {
    console.error('[crm-lead-scoring] Error:', error.message);
    return res.status(500).json({ error: 'CRM-Daten konnten nicht geladen werden.' });
  }
}
