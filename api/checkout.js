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
    priceChfYearly: 89000,
    priceIdEnv: 'STRIPE_PRICE_MANDAT_MONTHLY',
    priceIdYearlyEnv: 'STRIPE_PRICE_MANDAT_YEARLY',
    mode: 'subscription',
  },
};

const ADD_ONS = {
  'ndsg-compliance-pack': {
    name: 'nDSG Compliance Pack',
    description: 'Website-Audit, Cookie-Consent-Check und nDSG-Massnahmenliste',
    priceChf: 49000,
    priceIdEnv: 'STRIPE_PRICE_ADDON_NDSG',
    mode: 'payment',
    products: ['rapid-header-fix', 'kanzlei-haertung'],
  },
  'email-sicherheit': {
    name: 'E-Mail-Sicherheit',
    description: 'SPF, DKIM und DMARC-Konfiguration fuer eine Domain',
    priceChf: 14900,
    priceIdEnv: 'STRIPE_PRICE_ADDON_EMAIL',
    mode: 'payment',
    products: ['rapid-header-fix', 'kanzlei-haertung'],
  },
  'priority-sla': {
    name: 'Priority-SLA / Notfall-Bereitschaft',
    description: 'Priorisierter Incident-Support als monatliches Add-on zum Cyber-Mandat',
    priceChf: 2900,
    priceIdEnv: 'STRIPE_PRICE_ADDON_PRIORITY_SLA',
    mode: 'subscription',
    products: ['cyber-mandat'],
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
  const useYearly =
    product.mode === 'subscription' &&
    billingPeriod === 'yearly' &&
    Boolean(product.priceChfYearly || product.priceIdYearlyEnv);
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

function normalizeAddOns(rawAddOns) {
  if (!rawAddOns) return [];
  const addOns = Array.isArray(rawAddOns) ? rawAddOns : [rawAddOns];
  return [...new Set(addOns.map((item) => String(item).trim()).filter(Boolean))];
}

function resolveAddOns(productSlug, requestedAddOns) {
  return normalizeAddOns(requestedAddOns).map((slug) => {
    const addOn = ADD_ONS[slug];
    if (!addOn || !addOn.products.includes(productSlug)) {
      throw new Error(`Unbekanntes oder nicht verfuegbares Add-on: ${slug}`);
    }
    return { slug, ...addOn };
  });
}

function buildLineItems(product, billingPeriod, addOns = []) {
  return [buildLineItem(product, billingPeriod), ...addOns.map((addOn) => buildLineItem(addOn, billingPeriod))];
}

async function createStripeSession({ productSlug, customerData, order, billingPeriod, addOns, baseUrl, upsell }) {
  const product = PRODUCTS[productSlug];
  const stripeKey = getEnvFirst(['STRIPE_SECRET_KEY']);

  const upsellQuery = upsell ? `&upsell=${encodeURIComponent(upsell)}` : '';
  const successUrl = `${baseUrl}/onboarding/bestaetigung?session_id={CHECKOUT_SESSION_ID}&order_id=${order.orderId}${upsellQuery}`;
  const cancelUrl = `${baseUrl}/onboarding/${productSlug}`;

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
    addOns: addOns.map((addOn) => addOn.slug).join(','),
  };

  const sessionPayload = {
    mode: product.mode,
    line_items: buildLineItems(product, billingPeriod, addOns),
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
    const subscriptionData = { metadata };
    if (upsell === 'mandat-trial' && productSlug === 'cyber-mandat') {
      subscriptionData.trial_period_days = 30;
    }
    sessionPayload.subscription_data = subscriptionData;
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
  let addOns = [];
  const upsell = body.upsell === 'mandat-trial' ? 'mandat-trial' : undefined;
  const requestOrigin = req.headers?.origin || (req.headers?.host ? `http://${req.headers.host}` : '');
  const baseUrl = !isProduction() && requestOrigin ? requestOrigin : getEnvFirst(['BASE_URL']) || 'https://aidsec.ch';

  if (!productSlug || !customerData.email || !customerData.name) {
    return res.status(400).json({ error: 'Pflichtfelder fehlen', required: ['productSlug', 'name', 'email'] });
  }
  if (!product) {
    return res.status(400).json({ error: 'Unbekanntes Produkt', validProducts: Object.keys(PRODUCTS) });
  }

  try {
    addOns = resolveAddOns(productSlug, body.addOns);
  } catch (err) {
    return res.status(400).json({ error: err.message, validAddOns: Object.keys(ADD_ONS) });
  }

  try {
    const order = await createOrder({
      productSlug,
      billingPeriod,
      addOns: addOns.map((addOn) => addOn.slug),
      customer: customerData,
      website: { url: customerData.websiteUrl },
      status: 'pending_payment',
      paymentStatus: 'unpaid',
    });
    const session = await createStripeSession({ productSlug, customerData, order, billingPeriod, addOns, baseUrl, upsell });
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

export { PRODUCTS, ADD_ONS, buildLineItem, buildLineItems, encodeStripeForm, normalizeAddOns, resolveAddOns };
