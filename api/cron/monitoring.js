/**
 * AidSec Cron Monitoring API
 * Monatliches Security-Monitoring für Cyber-Mandat Pro Kunden
 *
 * Vercel Cron: POST /api/cron/monitoring
 * Schedule: 0 8 1 * * (Monatlich am 1. um 08:00 Uhr)
 */

import { storage } from './storage.js';
import { isProduction } from '../lib/env.js';
import { listCustomerMonitoringTargets, recordMonitoringResultForWebsite } from '../lib/order-store.js';

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

/**
 * Check security headers for a URL using fetch (works in Vercel Edge).
 * Falls back to check-headers API for server-side evaluation.
 */
async function checkSecurityHeaders(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    // Use our own check-headers API (Vercel serverless — works here)
    const apiUrl = `https://${process.env.AUTH_DOMAIN || 'aidsec.ch'}/api/check-headers?url=${encodeURIComponent(url)}`;
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AidSec-Monitor/2.0',
        'Accept': 'application/json'
      }
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

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

async function loadCustomers() {
  const customerTargets = await listCustomerMonitoringTargets().catch(() => []);
  if (customerTargets.length > 0) return customerTargets;

  // Try storage first
  try {
    const customers = await storage.get('data/customers.json');
    if (customers && Array.isArray(customers)) return customers;
  } catch (_) {}

  // Fallback: fetch from customers.json in repo (git-tracked data)
  try {
    const res = await fetch(`https://${process.env.AUTH_DOMAIN || 'aidsec.ch'}/data/customers.json`);
    if (res.ok) return await res.json();
  } catch (_) {}

  return [];
}

async function runMonitoring() {
  console.log('[monitoring] Starte monatliches Security-Monitoring...');

  let customers = await loadCustomers();

  if (!customers || customers.length === 0) {
    console.log('[monitoring] Keine Kunden gefunden.');
    return { success: true, customersChecked: 0, issuesFound: 0 };
  }

  // Filter active customers
  customers = customers.filter(c => c.active !== false && c.website?.url);

  console.log(`[monitoring] Prüfe ${customers.length} Kunden...`);

  const results = [];
  const issues = [];

  for (const customer of customers) {
    try {
      const result = await checkSecurityHeaders(customer.website.url);
      result.customerId = customer.id;
      result.customerName = customer.name;
      results.push(result);
      await recordMonitoringResultForWebsite(customer.website.url, result).catch((error) => {
        console.error(`[monitoring] Store update failed for ${customer.website.url}:`, error.message);
      });

      // Track issues
      if (result.grade === 'F' || result.grade === 'E') {
        issues.push({
          customerId: customer.id,
          customerName: customer.name,
          website: customer.website.url,
          severity: 'critical',
          type: 'security_headers',
          message: `Security Header Note: ${result.grade}`,
          score: result.score
        });
      } else if (result.grade !== 'A') {
        issues.push({
          customerId: customer.id,
          customerName: customer.name,
          website: customer.website.url,
          severity: 'warning',
          type: 'security_headers',
          message: `Security Header Note: ${result.grade}`,
          score: result.score
        });
      }
    } catch (e) {
      console.error(`[monitoring] Fehler bei ${customer.website?.url}:`, e.message);
      issues.push({
        customerId: customer.id,
        customerName: customer.name,
        website: customer.website?.url || 'unbekannt',
        severity: 'critical',
        type: 'error',
        message: `Website nicht erreichbar: ${e.message}`
      });
    }
  }

  // Generate summary
  const summary = {
    total: customers.length,
    checked: results.length,
    ok: results.filter(r => r.grade === 'A').length,
    warning: results.filter(r => ['B', 'C', 'D'].includes(r.grade)).length,
    critical: results.filter(r => ['F', 'E'].includes(r.grade)).length,
    errors: customers.length - results.length
  };

  console.log('[monitoring] Ergebnis:', JSON.stringify(summary));
  console.log(`[monitoring] OK: ${summary.ok} | Warnung: ${summary.warning} | Kritisch: ${summary.critical}`);

  // Save report via storage adapter (R2 in prod, local in dev)
  const timestamp = new Date().toISOString().split('T')[0];
  const reportKey = `reports/monthly/${timestamp}.json`;

  const report = {
    timestamp: new Date().toISOString(),
    apiVersion: '2.0.0',
    summary,
    results,
    issues
  };

  try {
    await storage.put(reportKey, report);
    console.log(`[monitoring] Report gespeichert: ${reportKey}`);
  } catch (e) {
    console.error('[monitoring] Storage write failed:', e.message);
    if (isProduction()) {
      throw e;
    }
  }

  // Alert if critical issues found
  const criticalIssues = issues.filter(i => i.severity === 'critical');
  if (criticalIssues.length > 0) {
    console.log(`[monitoring] ⚠️ ${criticalIssues.length} kritische Probleme gefunden`);
    // In production: sendAlertEmail(criticalIssues);
  }

  return {
    success: true,
    customersChecked: summary.checked,
    issuesFound: issues.length,
    summary,
    reportKey
  };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Only allow POST (cron) and GET (manual test)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret (Vercel provides this via Authorization header)
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // In dev without secret, allow GET for testing
    if (req.method === 'GET' && process.env.NODE_ENV !== 'production') {
      console.log('[monitoring] DEV mode: skipping auth check');
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const result = await runMonitoring();
    return res.status(200).json(result);
  } catch (error) {
    console.error('[monitoring] Fatal error:', error);
    return res.status(500).json({
      success: false,
      error: 'Monitoring failed',
      message: error.message
    });
  }
}
