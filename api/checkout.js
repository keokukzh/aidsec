/**
 * AidSec Unified Checkout API
 *
 * POST /api/checkout creates a persistent order first, then creates a
 * Stripe Checkout Session with the real orderId in metadata and success URL.
 */

import checkoutWebhookHandler from './checkout-webhook.js';
import { getEnvFirst, isProduction } from './lib/env.js';
import { createOrder, updateOrder } from './lib/order-store.js';

const PRODUCTS = {
  'rapid-header-fix': {
    name: 'AidSec Rapid Header Fix',
    description: 'WordPress Security Header Optimierung - Note F zu A in 24 Stunden',
    priceChf: 39000,
    priceIdEnv: 'STRIPE_PRICE_RAPID',
    mode: 'payment',
  },
  'kanzlei-haertung': {
    name: 'AidSec Kanzlei-Haertung',
    description: 'Komplette WordPress-Haertung inkl. Security Headers, Firewall-Konfiguration und nDSG-Protokoll',
    priceChf: 79000,
    priceIdEnv: 'STRIPE_PRICE_HAERTUNG',
    mode: 'payment',
  },
  'cyber-mandat': {
    name: 'AidSec Cyber-Mandat Pro',
    description: 'Laufendes Compliance-Monitoring, monatliche Reports und Re-Audits',
    priceChf: 8900,
    priceChfYearly: 106800,
    priceIdEnv: 'STRIPE_PRICE_MANDAT_MONTHLY',
    priceIdYearlyEnv: 'STRIPE_PRICE_MANDAT_YEARLY',
    mode: 'subscription',
  },
};

function appendFormValue(params, key, value) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => appendFormValue(params, `${key}[${index}]`, item));
    return;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([childKey, childValue]) => appendFormValue(params, `${key}[${childKey}]`, childValue));
    return;
  }
  params.append(key, String(value));
}

function encodeStripeForm(payload) {
  const params = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => appendFormValue(params, key, value));
  return params;
}

function buildLineItem(product, billingPeriod) {
  const useYearly = product.mode === 'subscription' && billingPeriod === 'yearly';
  const priceEnv = useYearly ? product.priceIdYearlyEnv : product.priceIdEnv;
  const price = getEnvFirst([priceEnv]);

  if (price) return { price, quantity: 1 };

  const priceData = {
    currency: 'chf',
    product_data: {
      name: product.name,
      description: product.description,
    },
    unit_amount: useYearly ? product.priceChfYearly : product.priceChf,
  };

  if (product.mode === 'subscription') {
    priceData.recurring = { interval: useYearly ? 'year' : 'month' };
  }

  return { price_data: priceData, quantity: 1 };
}

async function createStripeSession({ productSlug, customerData, order, billingPeriod, baseUrl }) {
  const product = PRODUCTS[productSlug];
  const stripeKey = getEnvFirst(['STRIPE_SECRET_KEY']);

  const successUrl = `${baseUrl}/onboarding/bestaetigung/?session_id={CHECKOUT_SESSION_ID}&order_id=${order.orderId}`;
  const cancelUrl = `${baseUrl}/onboarding/${productSlug}/`;

  if (!stripeKey) {
    if (isProduction()) throw new Error('STRIPE_SECRET_KEY not configured');
    return {
      id: `cs_dev_${order.orderId}`,
      url: successUrl.replace('{CHECKOUT_SESSION_ID}', `cs_dev_${order.orderId}`),
    };
  }
  const metadata = {
    orderId: order.orderId,
    productSlug,
    websiteUrl: customerData.websiteUrl || '',
    billingPeriod: billingPeriod || 'once',
  };

  const sessionPayload = {
    mode: product.mode,
    line_items: [buildLineItem(product, billingPeriod)],
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: customerData.email,
    locale: 'de',
    metadata,
    billing_address_collection: 'auto',
    tax_id_collection: { enabled: false },
    custom_text: {
      submit: {
        message: 'Nach erfolgreicher Zahlung erhalten Sie Zugangsdaten und ein Protokoll per E-Mail.',
      },
    },
  };

  if (product.mode === 'subscription') {
    sessionPayload.subscription_data = { metadata };
  } else {
    sessionPayload.payment_intent_data = { metadata };
  }

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encodeStripeForm(sessionPayload).toString(),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(`Stripe error: ${errorPayload.error?.message || response.status}`);
  }

  return response.json();
}

function normalizeCustomerData(body) {
  return {
    name: body.name || body.customer?.name || '',
    email: body.email || body.customer?.email || '',
    company: body.company || body.customer?.company || '',
    websiteUrl: body.websiteUrl || body.website?.url || '',
  };
}

export default async function handler(req, res) {
  if (req.url?.includes('webhook')) return checkoutWebhookHandler(req, res);

  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', getEnvFirst(['ALLOWED_ORIGIN']) || 'https://aidsec.ch');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const productSlug = body.productSlug || body.package;
  const product = PRODUCTS[productSlug];
  const customerData = normalizeCustomerData(body);
  const billingPeriod = body.billingPeriod === 'yearly' ? 'yearly' : productSlug === 'cyber-mandat' ? 'monthly' : 'once';
  const requestOrigin = req.headers?.origin || (req.headers?.host ? `http://${req.headers.host}` : '');
  const baseUrl = !isProduction() && requestOrigin ? requestOrigin : getEnvFirst(['BASE_URL']) || 'https://aidsec.ch';

  if (!productSlug || !customerData.email || !customerData.name) {
    return res.status(400).json({ error: 'Pflichtfelder fehlen', required: ['productSlug', 'name', 'email'] });
  }
  if (!product) {
    return res.status(400).json({ error: 'Unbekanntes Produkt', validProducts: Object.keys(PRODUCTS) });
  }

  try {
    const order = await createOrder({
      productSlug,
      billingPeriod,
      customer: customerData,
      website: { url: customerData.websiteUrl },
      status: 'pending_payment',
      paymentStatus: 'unpaid',
    });
    const session = await createStripeSession({ productSlug, customerData, order, billingPeriod, baseUrl });
    await updateOrder(order.orderId, { stripeSessionId: session.id });

    return res.status(200).json({
      success: true,
      sessionId: session.id,
      url: session.url,
      orderId: order.orderId,
    });
  } catch (err) {
    console.error('[checkout] Create session error:', err.message);
    return res.status(500).json({
      error: 'Checkout konnte nicht initialisiert werden',
      message: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}

export { PRODUCTS, buildLineItem, encodeStripeForm };
