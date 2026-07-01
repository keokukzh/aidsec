/**
 * AidSec Dashboard Status API
 *
 * GET /api/dashboard-status?orderId={orderId}&token={token}
 *
 * Returns customer dashboard data including orders, licenses,
 * and Stripe invoice URL for the customer portal.
 */

import { getEnvFirst, isProduction } from './lib/env.js';
import { getCustomerPortalByOrderId } from './lib/order-store.js';
import { verifyDemoMagicToken, verifyMagicToken } from './lib/order-token.js';
import { createStripePortalSession } from './lib/stripe-portal.js';

function safeCustomerInfo(customer) {
  return {
    email: customer?.email || null,
    name: customer?.name || null,
    company: customer?.company || null,
  };
}

function publicOrders(orders) {
  return (orders || []).map((order) => ({
    orderId: order.orderId,
    productSlug: order.productSlug,
    status: order.status,
    package: order.package,
    billingPeriod: order.billingPeriod,
    website: order.website?.url || null,
    licenseId: order.licenseId || null,
    results: order.results || null,
    createdAt: order.createdAt,
  }));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', getEnvFirst(['ALLOWED_ORIGIN']) || 'https://aidsec.ch');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { orderId, token } = req.query || {};

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

    // Verify magic-link token (try demo first, then production)
    let authResult = verifyDemoMagicToken(token, null);
    if (!authResult.valid) {
      authResult = verifyMagicToken(token, null);
    }

    if (!authResult.valid) {
      return res.status(401).json({
        error: 'Ungueltiger oder abgelaufener Link',
        reason: authResult.reason,
      });
    }

    // Verify token matches the requested orderId
    if (authResult.orderId !== orderId) {
      return res.status(403).json({
        error: 'Token und Auftrags-ID stimmen nicht ueberein',
      });
    }

    // Fetch customer portal data
    const portalData = await getCustomerPortalByOrderId(orderId);

    if (!portalData) {
      return res.status(404).json({
        error: 'Auftrag nicht gefunden',
        orderId,
      });
    }

    // Get the order that was used for authentication to find Stripe customer ID
    const authenticatedOrder = portalData.orders?.find((o) => o.orderId === orderId);
    const stripeCustomerId = authenticatedOrder?.stripeCustomerId || null;

    let stripeInvoiceUrl = null;
    if (stripeCustomerId) {
      const requestOrigin = req.headers?.origin || (req.headers?.host ? `http://${req.headers.host}` : '');
      const baseUrl = !isProduction() && requestOrigin ? requestOrigin : getEnvFirst(['BASE_URL']) || 'https://aidsec.ch';
      const returnUrl = `${baseUrl}/dashboard.html?orderId=${orderId}&token=${token}`;
      try {
        const portalSession = await createStripePortalSession({ stripeCustomerId, returnUrl });
        stripeInvoiceUrl = portalSession.url || null;
      } catch (err) {
        console.error('[dashboard-status] Failed to create Stripe portal session:', err.message);
      }
    }

    // Build response
    const response = {
      success: true,
      customer: safeCustomerInfo(portalData.customer),
      orders: publicOrders(portalData.orders),
      licenseIds: portalData.orders
        .map((o) => o.licenseId)
        .filter(Boolean),
      stripeInvoiceUrl,
      _meta: {
        checkedAt: new Date().toISOString(),
        apiVersion: '1.0.0-dashboard-status',
      },
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('[dashboard-status] Error:', error.message);
    return res.status(503).json({
      error: 'Service voruebergehend nicht verfuegbar',
      hint: 'Bitte versuchen Sie es in einigen Minuten erneut',
    });
  }
}