/**
 * AidSec Re-Audit Cron
 * Fuehrt monatliches Re-Audit durch und sendet Re-Audit Emails an Kunden
 *
 * Vercel Cron: POST /api/cron/reaudit
 * Schedule: 0 9 15 * * (15. jedes Monat um 09:00 Uhr)
 */

import { storage } from './storage.js';
import { isProduction } from '../lib/env.js';
import { listCustomerMonitoringTargets, recordMonitoringResultForWebsite, getOrder } from '../lib/order-store.js';
import { sendReAuditEmail } from '../lib/mailer.js';

const SECURITY_HEADERS = [
  'strict-transport-security',
  'content-security-policy',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy'
];

function computeGrade(score) {
  const grades = ['F', 'F', 'E', 'D', 'C', 'B', 'A'];
  return grades[Math.min(score, 6)];
}

async function checkSecurityHeaders(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const apiUrl = `https://${process.env.AUTH_DOMAIN || 'aidsec.ch'}/api/check-headers?url=${encodeURIComponent(url)}`;
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AidSec-ReAudit/1.0', 'Accept': 'application/json' }
    });

    clearTimeout(timeout);

    if (!response.ok) throw new Error(`API returned ${response.status}`);

    const data = await response.json();

    return {
      url,
      grade: data.grade || 'F',
      score: data.score || 0,
      maxScore: SECURITY_HEADERS.length,
      headers: data.headers || {},
      checkedAt: data.metadata?.checkedAt || new Date().toISOString()
    };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function runReAudit() {
  console.log('[reaudit] Starte monatliches Re-Audit...');

  const customerTargets = await listCustomerMonitoringTargets().catch(() => []);

  if (customerTargets.length === 0) {
    console.log('[reaudit] Keine Kunden mit Monitoring-Target gefunden.');
    return { success: true, auditsCompleted: 0, emailsSent: 0 };
  }

  const audits = [];
  const errors = [];
  let emailsSent = 0;

  for (const target of customerTargets) {
    try {
      const result = await checkSecurityHeaders(target.website.url);
      result.customerId = target.customerId;
      result.customerName = target.name;

      const updatedOrder = await recordMonitoringResultForWebsite(target.website.url, result).catch((e) => {
        console.error(`[reaudit] Store update failed for ${target.website.url}:`, e.message);
        return null;
      });

      audits.push(result);

      try {
        const order = updatedOrder || await getOrder(target.orderId);
        if (!order?.customer?.email && !target.customer?.email) {
          throw new Error('No customer email available for re-audit notification');
        }
        const emailResult = await sendReAuditEmail({
          ...order,
          orderId: order?.orderId || target.orderId,
          customer: {
            ...(order?.customer || {}),
            ...(target.customer || {}),
          },
          package: order?.package || order?.productSlug || 'Cyber-Mandat Pro',
          website: { url: target.website.url },
          monitoring: result
        }).catch(() => null);
        if (emailResult?.sent || emailResult?.simulated) {
          emailsSent += 1;
          console.log(`[reaudit] Re-Audit-E-Mail gesendet fuer ${target.website.url}`);
        }
      } catch (e) {
        console.error(`[reaudit] Email send failed for ${target.website.url}:`, e.message);
      }
    } catch (e) {
      console.error(`[reaudit] Fehler bei ${target.website?.url}:`, e.message);
      errors.push({
        website: target.website?.url,
        customerId: target.customerId,
        orderId: target.orderId,
        error: e.message
      });
    }
  }

  const summary = {
    total: customerTargets.length,
    audited: audits.length,
    ok: audits.filter(r => r.grade === 'A').length,
    warning: audits.filter(r => ['B', 'C', 'D'].includes(r.grade)).length,
    critical: audits.filter(r => ['F', 'E'].includes(r.grade)).length,
    errors: errors.length
  };

  console.log('[reaudit] Ergebnis:', JSON.stringify(summary));

  const timestamp = new Date().toISOString().split('T')[0];
  const reportKey = `reports/reaudit/${timestamp}.json`;
  const report = {
    timestamp: new Date().toISOString(),
    apiVersion: '2.0.0',
    summary,
    audits,
    errors,
    type: 'reaudit'
  };

  try {
    await storage.put(reportKey, report);
    console.log(`[reaudit] Report gespeichert: ${reportKey}`);
  } catch (e) {
    console.error('[reaudit] Storage write failed:', e.message);
    if (isProduction()) throw e;
  }

  return {
    success: true,
    auditsCompleted: audits.length,
    emailsSent,
    summary,
    reportKey
  };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    if (req.method === 'GET' && process.env.NODE_ENV !== 'production') {
      console.log('[reaudit] DEV mode: skipping auth check');
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const result = await runReAudit();
    return res.status(200).json(result);
  } catch (error) {
    console.error('[reaudit] Fatal error:', error);
    return res.status(500).json({
      success: false,
      error: 'Re-Audit failed',
      message: error.message
    });
  }
}
