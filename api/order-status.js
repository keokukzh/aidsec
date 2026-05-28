/**
 * AidSec Order Status API
 *
 * GET is customer-facing and always requires a signed magic-link token.
 * POST is internal/dev-only; checkout creates persistent orders directly.
 */

import { getEnvFirst, isProduction } from './lib/env.js';
import { createOrder, getOrder, upsertCustomerForOrder } from './lib/order-store.js';
import { generateMagicToken, verifyDemoMagicToken, verifyMagicToken } from './lib/order-token.js';
import { sendMagicLinkEmail } from './lib/mailer.js';

function formatTimeline(timeline = {}) {
  return Object.entries(timeline).map(([key, value]) => ({ key, ...value }));
}

function publicOrder(order) {
  return {
    orderId: order.orderId,
    status: order.status,
    statusLabel:
      {
        pending_payment: 'Zahlung ausstehend',
        pending: 'Ausstehend',
        active: 'In Bearbeitung',
        complete: 'Abgeschlossen',
        expired: 'Abgelaufen',
        error: 'Fehler',
      }[order.status] || order.status,
    website: order.website,
    package: order.package || order.productSlug,
    productSlug: order.productSlug,
    billingPeriod: order.billingPeriod,
    timeline: formatTimeline(order.timeline),
    results: order.results,
    reportUrl: order.reportUrl,
    licenseId: order.licenseId || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function validateInternalPost(req) {
  if (!isProduction()) return true;
  const expected = getEnvFirst(['INTERNAL_API_SECRET']);
  const provided = req.headers?.['x-aidsec-internal-secret'];
  return !!expected && provided === expected;
}

function normalizeEmail(email = '') {
  return String(email).trim().toLowerCase();
}

async function handleMagicLinkRequest(req, res) {
  const data = req.body || {};
  const orderId = String(data.orderId || '').trim();
  const email = normalizeEmail(data.email);

  if (!orderId || !email) {
    return res.status(400).json({ error: 'orderId und email sind erforderlich' });
  }

  const neutralResponse = {
    success: true,
    sent: true,
    message: 'Falls Auftrag und E-Mail uebereinstimmen, wurde ein Zugangslink versendet.',
  };

  try {
    const order = await getOrder(orderId);
    if (!order || normalizeEmail(order.customer?.email) !== email) {
      return res.status(202).json(neutralResponse);
    }

    await sendMagicLinkEmail(order);
    return res.status(202).json(neutralResponse);
  } catch (error) {
    console.error('[order-status] Magic-link email error:', error.message);
    return res.status(500).json({ error: 'Zugangslink konnte nicht versendet werden' });
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', getEnvFirst(['ALLOWED_ORIGIN']) || 'https://aidsec.ch');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-AidSec-Internal-Secret');
    return res.status(204).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.method === 'GET') {
    const { orderId, token, email } = req.query || {};
    if (!orderId) {
      return res.status(400).json({
        error: 'orderId Parameter erforderlich',
        hint: 'Nutzen Sie den Link aus Ihrer Bestaetigungs-E-Mail',
      });
    }
    if (!token) {
      return res.status(401).json({
        error: 'Authentifizierung erforderlich',
        hint: 'Bitte nutzen Sie den Link aus Ihrer Bestaetigungs-E-Mail',
      });
    }

    let authResult = verifyDemoMagicToken(token, email || null);
    if (!authResult.valid) authResult = verifyMagicToken(token, email || null);

    if (!authResult.valid) {
      return res.status(401).json({
        error: 'Ungueltiger oder abgelaufener Link',
        reason: authResult.reason,
      });
    }

    if (authResult.orderId !== orderId) {
      return res.status(403).json({ error: 'Token und Auftrags-ID stimmen nicht ueberein' });
    }

    let order = await getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Auftrag nicht gefunden', orderId });

    if (order.paymentStatus === 'paid' && !order.customerId && order.customer?.email) {
      await upsertCustomerForOrder(order);
      order = await getOrder(orderId);
    }

    return res.status(200).json({
      success: true,
      order: publicOrder(order),
      _meta: {
        checkedAt: new Date().toISOString(),
        apiVersion: '3.0.0-magiclink-persistent',
      },
    });
  }

  if ((req.body || {}).action === 'send_magic_link') {
    return handleMagicLinkRequest(req, res);
  }

  if (!validateInternalPost(req)) {
    return res.status(403).json({ error: 'Internal endpoint only' });
  }

  try {
    const data = req.body || {};
    const email = data.customer?.email || data.email;
    const websiteUrl = data.website?.url || data.websiteUrl;
    const productSlug = data.productSlug || data.package;

    if (!email || !websiteUrl || !productSlug) {
      return res.status(400).json({
        error: 'Pflichtfelder fehlen',
        required: ['customer.email', 'website.url', 'productSlug'],
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Ungueltige E-Mail-Adresse' });
    }

    const order = await createOrder({
      productSlug,
      package: data.package,
      customer: {
        name: data.customer?.name || data.name || '',
        email,
        company: data.customer?.company || data.company || '',
      },
      website: { url: websiteUrl },
      status: 'pending',
    });
    const token = generateMagicToken(order.orderId, email);
    const magicLink = `${getEnvFirst(['BASE_URL']) || 'https://aidsec.ch'}/auftrag/${order.orderId}?token=${token}`;

    return res.status(201).json({
      success: true,
      order: {
        orderId: order.orderId,
        status: order.status,
        message: 'Auftrag erfolgreich erstellt',
      },
      ...(isProduction() ? {} : { _dev: { magicLink, token } }),
    });
  } catch (error) {
    console.error('[order-status] Create order error:', error);
    return res.status(500).json({ error: 'Fehler beim Erstellen des Auftrags' });
  }
}
