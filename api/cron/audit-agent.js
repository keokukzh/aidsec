/**
 * AidSec Website Audit Agent
 * Automatisierte Lead-Analyse: Website checken, Ergebnis speichern, CRM aktualisieren
 *
 * Vercel Cron: POST /api/cron/audit-agent
 * Schedule: 0 9 * * 2-6 (Werktags um 09:00 Uhr)
 */

import { getEnvFirst } from '../lib/env.js';
import { storage } from './storage.js';
import { sendTransactionalEmail } from '../lib/mailer.js';
import { generateMagicToken } from '../lib/order-token.js';

const SECURITY_HEADERS = [
  'strict-transport-security',
  'content-security-policy',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
];

function computeGrade(score) {
  const grades = ['F', 'F', 'E', 'D', 'C', 'B', 'A'];
  return grades[Math.min(score, 6)];
}

function computeLeadScore(grade, websiteUrl) {
  let score = 30;
  const gradeScores = { A: 25, B: 20, C: 15, D: 10, E: 5, F: 0 };
  score += gradeScores[grade.toUpperCase()] || 0;
  if (grade.toUpperCase() === 'F') score += 15;
  if (grade.toUpperCase() === 'A' || grade.toUpperCase() === 'B') score -= 10;
  return Math.max(0, Math.min(100, score));
}

async function checkWebsite(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const apiUrl = `https://${process.env.AUTH_DOMAIN || 'aidsec.ch'}/api/check-headers?url=${encodeURIComponent(url)}`;
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AidSec-AuditAgent/1.0',
        'Accept': 'application/json',
      },
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
      server: data.server || 'unbekannt',
      checkedAt: data.metadata?.checkedAt || new Date().toISOString(),
    };
  } catch (err) {
    clearTimeout(timeout);
    return {
      url,
      grade: 'F',
      score: 0,
      maxScore: SECURITY_HEADERS.length,
      headers: {},
      server: 'error',
      checkedAt: new Date().toISOString(),
      error: err.message,
    };
  }
}

function buildAuditResultEmail(result) {
  const baseUrl = getEnvFirst(['BASE_URL']) || 'https://aidsec.ch';

  return {
    to: result.contactEmail,
    subject: `Ihr kostenloser Security-Check: Note ${result.grade} für ${result.url}`,
    text: [
      `Guten Tag`,
      '',
      `Wir haben einen kostenlosen Security-Check für Ihre Website durchgeführt:`,
      '',
      `Website: ${result.url}`,
      `Note: ${result.grade}`,
      `Score: ${result.score}/${result.maxScore}`,
      '',
      result.grade === 'F' || result.grade === 'E'
        ? 'Ihre Website hat erhebliche Sicherheitslücken. Wir empfehlen eine sofortige Analyse.'
        : result.grade === 'D' || result.grade === 'C'
        ? 'Ihre Website hat Verbesserungspotenzial. Wir zeigen Ihnen gerne, wie Sie das Ranking verbessern.'
        : 'Ihre Website ist gut geschützt. Mit AidSec können Sie dies weiterhin sicherstellen.',
      '',
      result.grade !== 'A'
        ? `Kostenlose Beratung: ${baseUrl}/#kontakt`
        : '',
      '',
      'Freundliche Grüsse',
      'AidSec',
    ].join('\n'),
    html: buildAuditResultEmailHtml(result),
  };
}

function buildAuditResultEmailHtml(result) {
  const gradeColors = {
    F: '#DC2626', E: '#EA580C', D: '#D97706',
    C: '#CA8A04', B: '#65A30D', A: '#16A34A',
  };
  const color = gradeColors[result.grade] || '#6B7280';
  const baseUrl = getEnvFirst(['BASE_URL']) || 'https://aidsec.ch';

  const statusText =
    result.grade === 'F' || result.grade === 'E'
      ? 'Ihre Website hat erhebliche Sicherheitslücken. Wir empfehlen eine sofortige Analyse.'
      : result.grade === 'D' || result.grade === 'C'
      ? 'Ihre Website hat Verbesserungspotenzial. Wir zeigen Ihnen gerne, wie Sie das Ranking verbessern.'
      : 'Ihre Website ist gut geschützt. Mit AidSec können Sie dies weiterhin sicherstellen.';

  return `
  <table cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
    <tr><td style="padding:40px 30px;background:#0b1d3a;color:#fff;text-align:center;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;font-size:24px;color:#c8a84c;">AidSec</h1>
      <p style="margin:8px 0 0;font-size:16px;">Ihr kostenloser Security-Check</p>
    </td></tr>
    <tr><td style="padding:30px;background:#fff;">
      <p style="font-size:16px;color:#333;">Guten Tag,</p>
      <p style="font-size:15px;color:#555;line-height:1.6;">Wir haben einen kostenlosen Security-Check für Ihre Website durchgeführt:</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:4px;">
        <tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;width:140px;">Website</td><td style="padding:12px 16px;font-size:14px;">${result.url}</td></tr>
        <tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Note</td><td style="padding:12px 16px;font-size:20px;font-weight:700;color:${color};">${result.grade}</td></tr>
        <tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Score</td><td style="padding:12px 16px;font-size:14px;border-top:1px solid #e2e8f0;">${result.score}/${result.maxScore}</td></tr>
      </table>
      <p style="font-size:15px;color:#555;line-height:1.6;">${statusText}</p>
      ${result.grade !== 'A' ? `
      <p style="margin:24px 0 0;">
        <a href="${baseUrl}/#kontakt" style="display:inline-block;padding:12px 24px;background:#c8a84c;color:#fff;text-decoration:none;border-radius:4px;font-weight:600;">Kostenlose Beratung</a>
      </p>` : ''}
    </td></tr>
    <tr><td style="padding:20px 30px;background:#f8fafc;text-align:center;font-size:12px;color:#94a3b8;border-radius:0 0 8px 8px;">
      Freundliche Grüsse, AidSec
    </td></tr>
  </table>`;
}

async function loadPendingAudits() {
  try {
    const data = await storage.get('data/pending-audits.json');
    if (data && Array.isArray(data)) return data;
  } catch (_) {}
  return [];
}

async function saveAuditResult(result) {
  try {
    const key = `reports/audit/${new Date().toISOString().split('T')[0]}/${result.url.replace(/[^a-z0-9]/gi, '_')}.json`;
    await storage.put(key, result);
    return key;
  } catch (_) {
    return null;
  }
}

async function runAuditAgent() {
  console.log('[audit-agent] Starte Website Audit Agent...');

  const pending = await loadPendingAudits();
  if (pending.length === 0) {
    console.log('[audit-agent] Keine ausstehenden Audits gefunden.');
    return { success: true, processed: 0 };
  }

  console.log(`[audit-agent] ${pending.length} Websites zu prüfen`);

  const results = [];
  const errors = [];

  for (const item of pending) {
    if (!item.url) continue;

    try {
      console.log(`[audit-agent] Prüfe: ${item.url}`);
      const checkResult = await checkWebsite(item.url);

      const auditResult = {
        ...checkResult,
        contactEmail: item.email || null,
        leadScore: computeLeadScore(checkResult.grade, item.url),
        auditId: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        processedAt: new Date().toISOString(),
      };

      const reportKey = await saveAuditResult(auditResult);
      if (reportKey) auditResult.reportKey = reportKey;

      results.push(auditResult);

      // Send email notification if contact email exists
      if (item.email) {
        try {
          const email = buildAuditResultEmail(auditResult);
          await sendTransactionalEmail(email);
          auditResult.emailSent = true;
        } catch (e) {
          console.error(`[audit-agent] E-Mail-Fehler für ${item.url}:`, e.message);
          auditResult.emailSent = false;
        }
      }

      // Small delay between checks to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (e) {
      console.error(`[audit-agent] Fehler bei ${item.url}:`, e.message);
      errors.push({ url: item.url, error: e.message });
    }
  }

  // Summary
  const summary = {
    total: pending.length,
    processed: results.length,
    errors: errors.length,
    grades: results.reduce((acc, r) => {
      acc[r.grade] = (acc[r.grade] || 0) + 1;
      return acc;
    }, {}),
  };

  console.log('[audit-agent] Ergebnis:', JSON.stringify(summary));

  // Save summary report
  try {
    const summaryKey = `reports/audit/${new Date().toISOString().split('T')[0]}/summary.json`;
    await storage.put(summaryKey, {
      timestamp: new Date().toISOString(),
      apiVersion: '1.0.0',
      ...summary,
      results: results.map((r) => ({
        url: r.url,
        grade: r.grade,
        score: r.score,
        leadScore: r.leadScore,
        emailSent: r.emailSent || false,
      })),
      errors,
    });
  } catch (_) {}

  return { success: true, ...summary };
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
    if (req.method === 'GET' && !isProduction()) {
      console.log('[audit-agent] DEV mode: skipping auth check');
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const result = await runAuditAgent();
    return res.status(200).json(result);
  } catch (error) {
    console.error('[audit-agent] Fatal error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}