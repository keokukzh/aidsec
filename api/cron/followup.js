/**
 * AidSec Follow-up & Upsell Agent
 * Automatische Follow-up und Upsell-E-Mails basierend auf Lead-Score und Order-Status
 *
 * Vercel Cron: POST /api/cron/followup
 * Schedule: 0 10 * * 1 (Montags um 10:00 Uhr)
 */

import { getEnvFirst, isProduction } from '../lib/env.js';
import { listCustomerMonitoringTargets, getOrder, recordOrderEvent } from '../lib/order-store.js';
import { computeLeadScore } from '../crm-lead-scoring.js';
import { sendTransactionalEmail } from '../lib/mailer.js';
import { generateMagicToken } from '../lib/order-token.js';

// Airtable CRM integration (lazy import to avoid circular deps)
async function getAirtableModule() {
  if (!process.env.AIRTABLE_API_KEY) return null;
  try {
    return await import('../lib/airtable.js');
  } catch (_) {
    return null;
  }
}

function buildFollowUpEmail(order, followUpType) {
  const baseUrl = getEnvFirst(['BASE_URL']) || 'https://aidsec.ch';
  const token = generateMagicToken(order.orderId, order.customer.email);
  const portalUrl = `${baseUrl}/proof-center.html?orderId=${encodeURIComponent(order.orderId)}&token=${encodeURIComponent(token)}`;

  if (followUpType === 'unpaid_reminder') {
    return {
      to: order.customer.email,
      subject: `Erinnerung: Ihr AidSec Auftrag wartet auf Zahlung`,
      text: [
        `Hallo ${order.customer?.name || 'Guten Tag'}`,
        '',
        'Wir haben festgestellt, dass Ihr AidSec Auftrag noch nicht bezahlt wurde.',
        '',
        `Auftrag: ${order.orderId}`,
        `Paket: ${order.package || order.productSlug}`,
        '',
        'Ihre Zahlung kann hier abgeschlossen werden:',
        `${baseUrl}/auftrag/${order.orderId}?token=${token}`,
        '',
        'Bei Fragen stehen wir Ihnen gerne zur Verfügung.',
        '',
        'Freundliche Grüsse',
        'AidSec',
      ].join('\n'),
      html: buildUnpaidReminderHtml(order, portalUrl),
    };
  }

  if (followUpType === 'upsell') {
    const { score, upsells } = computeLeadScore(order, order.monitoring?.grade);
    const topUpsell = upsells?.[0];

    return {
      to: order.customer.email,
      subject: `Ihr AidSec Schutz — noch mehr Sicherheit möglich`,
      text: [
        `Hallo ${order.customer?.name || 'Guten Tag'}`,
        '',
        'Wir freuen uns, dass Sie mit AidSec geschützt sind.',
        '',
        topUpsell
          ? `Wir haben eine Empfehlung für Sie: ${topUpsell.name}`
          : 'Nutzen Sie die Möglichkeit, Ihren Schutz zu erweitern.',
        '',
        topUpsell ? `Mehr Infos: ${topUpsell.reason}` : '',
        '',
        `Ihr Kundenportal: ${portalUrl}`,
        '',
        'Freundliche Grüsse',
        'AidSec',
      ].join('\n'),
      html: buildUpsellEmailHtml(order, topUpsell, portalUrl),
    };
  }

  return null;
}

function buildUnpaidReminderHtml(order, portalUrl) {
  return `
  <table cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
    <tr><td style="padding:40px 30px;background:#0b1d3a;color:#fff;text-align:center;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;font-size:24px;color:#c8a84c;">AidSec</h1>
      <p style="margin:8px 0 0;font-size:16px;">Zahlungserinnerung</p>
    </td></tr>
    <tr><td style="padding:30px;background:#fff;">
      <p style="font-size:16px;color:#333;">Hallo ${order.customer?.name || 'Guten Tag'},</p>
      <p style="font-size:15px;color:#555;line-height:1.6;">Wir möchten Sie daran erinnern, dass Ihr AidSec Auftrag noch auf Zahlung wartet.</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:4px;">
        <tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;width:140px;">Auftrag</td><td style="padding:12px 16px;font-size:14px;font-weight:600;">${order.orderId}</td></tr>
        <tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Paket</td><td style="padding:12px 16px;font-size:14px;border-top:1px solid #e2e8f0;">${order.package || order.productSlug}</td></tr>
      </table>
      <p style="margin:24px 0 0;">
        <a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:#c8a84c;color:#fff;text-decoration:none;border-radius:4px;font-weight:600;">Jetzt bezahlen</a>
      </p>
    </td></tr>
    <tr><td style="padding:20px 30px;background:#f8fafc;text-align:center;font-size:12px;color:#94a3b8;border-radius:0 0 8px 8px;">
      Freundliche Grüsse, AidSec
    </td></tr>
  </table>`;
}

function buildUpsellEmailHtml(order, upsell, portalUrl) {
  return `
  <table cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
    <tr><td style="padding:40px 30px;background:#0b1d3a;color:#fff;text-align:center;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;font-size:24px;color:#c8a84c;">AidSec</h1>
      <p style="margin:8px 0 0;font-size:16px;">Ihre Sicherheit — verbessert</p>
    </td></tr>
    <tr><td style="padding:30px;background:#fff;">
      <p style="font-size:16px;color:#333;">Hallo ${order.customer?.name || 'Guten Tag'},</p>
      <p style="font-size:15px;color:#555;line-height:1.6;">Wir freuen uns, dass Sie mit AidSec geschützt sind. Hier ist eine Empfehlung, um Ihren Schutz zu erweitern:</p>
      ${upsell ? `
      <table cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
        <tr><td style="padding:20px;">
          <h3 style="margin:0 0 8px;color:#0b1d3a;font-size:16px;">${upsell.name}</h3>
          <p style="margin:0 0 12px;font-size:14px;color:#555;line-height:1.5;">${upsell.reason}</p>
          <p style="margin:0;font-size:15px;font-weight:600;color:#c8a84c;">${upsell.price}</p>
        </td></tr>
      </table>` : ''}
      <p style="margin:24px 0 0;">
        <a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:#c8a84c;color:#fff;text-decoration:none;border-radius:4px;font-weight:600;">Mehr erfahren</a>
      </p>
    </td></tr>
    <tr><td style="padding:20px 30px;background:#f8fafc;text-align:center;font-size:12px;color:#94a3b8;border-radius:0 0 8px 8px;">
      Freundliche Grüsse, AidSec
    </td></tr>
  </table>`;
}

async function getUnpaidOrders() {
  const customers = await listCustomerMonitoringTargets().catch(() => []);
  const unpaidOrders = [];

  for (const customer of customers) {
    if (!customer.orderId) continue;
    try {
      const order = await getOrder(customer.orderId);
      if (order && order.paymentStatus === 'unpaid' && order.status !== 'expired') {
        const daysSinceCreation = (Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceCreation >= 3) {
          unpaidOrders.push(order);
        }
      }
    } catch (_) {}
  }

  return unpaidOrders;
}

async function getUpsellCandidates() {
  const customers = await listCustomerMonitoringTargets().catch(() => []);
  const candidates = [];

  for (const customer of customers) {
    if (!customer.orderId) continue;
    try {
      const order = await getOrder(customer.orderId);
      if (!order || order.paymentStatus !== 'paid' || order.status !== 'active') continue;

      const { score, upsells } = computeLeadScore(order, order.monitoring?.grade);
      if (score >= 50 && upsells && upsells.length > 0) {
        candidates.push({ order, score, upsells });
      }
    } catch (_) {}
  }

  return candidates.sort((a, b) => b.score - a.score);
}

async function runFollowUp() {
  console.log('[followup] Starte Follow-up Agent...');

  const results = {
    unpaidReminders: 0,
    upsellEmails: 0,
    errors: 0,
  };

  // 1. unpaid Reminder Emails
  const unpaidOrders = await getUnpaidOrders();
  console.log(`[followup] ${unpaidOrders.length} unbezahlte Aufträge gefunden`);

  for (const order of unpaidOrders) {
    try {
      const email = buildFollowUpEmail(order, 'unpaid_reminder');
      if (email) {
        await sendTransactionalEmail(email);
        await recordOrderEvent(order.orderId, 'email.followup.unpaid_reminder', {
          customerEmail: order.customer?.email,
        });
        // Update Airtable CRM: mark lead as contacted
        const airtable = await getAirtableModule();
        if (airtable) {
          airtable.updateLead(order.customer.email, {
            status: 'contacted',
            'Last Follow-up': new Date().toISOString(),
          }).catch((e) => console.warn('[followup] Airtable update failed:', e.message));
        }
        results.unpaidReminders++;
        console.log(`[followup] Erinnerung gesendet für ${order.orderId}`);
      }
    } catch (e) {
      console.error(`[followup] Fehler bei ${order.orderId}:`, e.message);
      results.errors++;
    }
  }

  // 2. Upsell Emails (nur für aktive Kunden mit Lead-Score >= 50)
  const candidates = await getUpsellCandidates();
  console.log(`[followup] ${candidates.length} Upsell-Kandidaten gefunden`);

  for (const { order } of candidates) {
    try {
      const email = buildFollowUpEmail(order, 'upsell');
      if (email) {
        await sendTransactionalEmail(email);
        await recordOrderEvent(order.orderId, 'email.followup.upsell', {
          customerEmail: order.customer?.email,
        });
        // Update Airtable CRM: mark lead as contacted + update score
        const airtable = await getAirtableModule();
        if (airtable) {
          airtable.updateLead(order.customer.email, {
            status: 'contacted',
            score: score,
            'Last Follow-up': new Date().toISOString(),
          }).catch((e) => console.warn('[followup] Airtable update failed:', e.message));
        }
        results.upsellEmails++;
        console.log(`[followup] Upsell-E-Mail gesendet für ${order.orderId}`);
      }
    } catch (e) {
      console.error(`[followup] Upsell-Fehler bei ${order.orderId}:`, e.message);
      results.errors++;
    }
  }

  console.log('[followup] Ergebnis:', JSON.stringify(results));
  return { success: true, ...results };
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
      console.log('[followup] DEV mode: skipping auth check');
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const result = await runFollowUp();
    return res.status(200).json(result);
  } catch (error) {
    console.error('[followup] Fatal error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}