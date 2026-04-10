/**
 * AidSec Cron Monitoring API
 * Monatliches Security-Monitoring für Cyber-Mandat Pro Kunden
 * 
 * Vercel Cron: POST /api/cron/monitoring
 * Schedule: 0 8 1 * * (Monatlich am 1. um 08:00 Uhr)
 */

import { checkCustomer } from './monitorlib.js';
import fs from 'fs';
import path from 'path';

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
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AidSec-Monitor/1.0' }
    }, (res) => {
      clearTimeout(timeout);
      let score = 0;
      const headers = {};

      SECURITY_HEADERS.forEach(key => {
        const value = res.headers[key];
        const present = value !== undefined && value !== null;
        if (present) score++;
        headers[key] = { present, value: value || null };
      });

      resolve({
        url,
        grade: computeGrade(score),
        score,
        maxScore: SECURITY_HEADERS.length,
        headers,
        checkedAt: new Date().toISOString()
      });
    }).on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function runMonitoring() {
  console.log('Starte monatliches Monitoring...');

  // Load customers
  const customersPath = path.join(process.cwd(), 'data', 'customers.json');
  let customers = [];

  try {
    if (fs.existsSync(customersPath)) {
      customers = JSON.parse(fs.readFileSync(customersPath, 'utf8'));
    }
  } catch (e) {
    console.error('Fehler beim Laden der Kunden:', e.message);
  }

  if (customers.length === 0) {
    console.log('Keine Kunden gefunden.');
    return { success: true, customersChecked: 0, issuesFound: 0 };
  }

  console.log(`Prüfe ${customers.length} Kunden...`);

  const results = [];
  const issues = [];

  for (const customer of customers) {
    // Skip inactive customers
    if (customer.active === false) continue;

    try {
      const result = await checkSecurityHeaders(customer.website.url);
      result.customerId = customer.id;
      result.customerName = customer.name;
      results.push(result);

      // Check for issues
      if (result.grade === 'F' || result.grade === 'E') {
        issues.push({
          customerId: customer.id,
          customerName: customer.name,
          website: customer.website.url,
          severity: 'critical',
          type: 'security_headers',
          message: `Security Header Note: ${result.grade}`
        });
      } else if (result.grade !== 'A') {
        issues.push({
          customerId: customer.id,
          customerName: customer.name,
          website: customer.website.url,
          severity: 'warning',
          type: 'security_headers',
          message: `Security Header Note: ${result.grade}`
        });
      }
    } catch (e) {
      console.error(`Fehler bei ${customer.website.url}:`, e.message);
      issues.push({
        customerId: customer.id,
        customerName: customer.name,
        website: customer.website.url,
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
    errors: results.length - results.length // simplified
  };

  console.log('\n=== Monitoring Ergebnis ===');
  console.log(`OK: ${summary.ok} | Warnung: ${summary.warning} | Kritisch: ${summary.critical}`);
  console.log(`Probleme gefunden: ${issues.length}`);

  // Save results
  const reportDir = path.join(process.cwd(), 'reports', 'monthly');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const reportFile = path.join(reportDir, `${timestamp}.json`);

  const report = {
    timestamp: new Date().toISOString(),
    summary,
    results,
    issues
  };

  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

  // Alert if critical issues found
  const criticalIssues = issues.filter(i => i.severity === 'critical');
  if (criticalIssues.length > 0) {
    console.log('\n⚠️ Kritische Probleme gefunden - E-Mail-Benachrichtigung wäre fällig');
    // In Produktion: sendAlertEmail(criticalIssues);
  }

  return {
    success: true,
    customersChecked: summary.checked,
    issuesFound: issues.length,
    summary,
    reportUrl: `/reports/monthly/${timestamp}.json`
  };
}

export default async function handler(req, res) {
  // Only allow POST and cron
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret (Vercel provides this)
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await runMonitoring();
    return res.status(200).json(result);
  } catch (error) {
    console.error('Monitoring Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Monitoring failed',
      message: error.message
    });
  }
}
