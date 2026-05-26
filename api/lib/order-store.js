import crypto from 'crypto';
import { getEnvFirst, isProduction } from './env.js';

const localOrders = new Map();
const localSessionIndex = new Map();
const localEvents = new Set();
const localLicenses = new Map();

export function generateOrderId() {
  return `ord_${crypto.randomBytes(8).toString('hex')}`;
}

export function generateLicenseId() {
  return `lic_${crypto.randomBytes(8).toString('hex')}`;
}

export function generateInstallSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

function buildOrder(data) {
  const now = new Date().toISOString();
  return {
    orderId: data.orderId || generateOrderId(),
    stripeSessionId: data.stripeSessionId || null,
    stripeCustomerId: data.stripeCustomerId || null,
    stripeSubscriptionId: data.stripeSubscriptionId || null,
    productSlug: data.productSlug,
    package: data.package || data.productSlug,
    billingPeriod: data.billingPeriod || null,
    customer: {
      name: data.customer?.name || data.name || '',
      email: data.customer?.email || data.email || '',
      company: data.customer?.company || data.company || '',
    },
    website: {
      url: data.website?.url || data.websiteUrl || '',
    },
    status: data.status || 'pending_payment',
    paymentStatus: data.paymentStatus || 'unpaid',
    timeline: data.timeline || {
      ordered: { time: now, label: 'Auftrag angelegt', step: 1 },
      payment: { time: null, label: 'Zahlung ausstehend', step: 2 },
      analysis: { time: null, label: 'Analyse laeuft', step: 3 },
      implementation: { time: null, label: 'Umsetzung', step: 4 },
      complete: { time: null, label: 'Abgeschlossen', step: 5 },
    },
    results: data.results || {
      gradeBefore: null,
      gradeAfter: null,
      scoreBefore: null,
      scoreAfter: null,
    },
    reportUrl: data.reportUrl || null,
    licenseId: data.licenseId || null,
    createdAt: data.createdAt || now,
    updatedAt: now,
  };
}

async function upstashCommand(args) {
  const url = getEnvFirst(['UPSTASH_REDIS_REST_URL']);
  const token = getEnvFirst(['UPSTASH_REDIS_REST_TOKEN']);
  if (!url || !token) return null;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) throw new Error(`Upstash command failed: ${response.status}`);
  const data = await response.json();
  return data.result;
}

function requirePersistentStore() {
  if (isProduction() && (!getEnvFirst(['UPSTASH_REDIS_REST_URL']) || !getEnvFirst(['UPSTASH_REDIS_REST_TOKEN']))) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production');
  }
}

async function redisGetJson(key) {
  const result = await upstashCommand(['GET', key]);
  if (!result) return null;
  return typeof result === 'string' ? JSON.parse(result) : result;
}

async function redisSetJson(key, value) {
  await upstashCommand(['SET', key, JSON.stringify(value)]);
}

export async function createOrder(data) {
  requirePersistentStore();
  const order = buildOrder(data);
  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) {
    await redisSetJson(`order:${order.orderId}`, order);
    if (order.stripeSessionId) await upstashCommand(['SET', `stripe-session:${order.stripeSessionId}`, order.orderId]);
  } else {
    localOrders.set(order.orderId, order);
    if (order.stripeSessionId) localSessionIndex.set(order.stripeSessionId, order.orderId);
  }
  return order;
}

export async function getOrder(orderId) {
  if (!orderId) return null;
  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) return redisGetJson(`order:${orderId}`);
  return localOrders.get(orderId) || null;
}

export async function updateOrder(orderId, updates) {
  const order = await getOrder(orderId);
  if (!order) return null;

  const updated = {
    ...order,
    ...updates,
    customer: { ...order.customer, ...(updates.customer || {}) },
    website: { ...order.website, ...(updates.website || {}) },
    timeline: { ...order.timeline, ...(updates.timeline || {}) },
    results: { ...order.results, ...(updates.results || {}) },
    updatedAt: new Date().toISOString(),
  };

  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) {
    await redisSetJson(`order:${orderId}`, updated);
    if (updated.stripeSessionId) await upstashCommand(['SET', `stripe-session:${updated.stripeSessionId}`, orderId]);
  } else {
    localOrders.set(orderId, updated);
    if (updated.stripeSessionId) localSessionIndex.set(updated.stripeSessionId, orderId);
  }

  return updated;
}

export async function getOrderBySessionId(sessionId) {
  if (!sessionId) return null;
  let orderId;
  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) {
    orderId = await upstashCommand(['GET', `stripe-session:${sessionId}`]);
  } else {
    orderId = localSessionIndex.get(sessionId);
  }
  return orderId ? getOrder(orderId) : null;
}

export async function markEventProcessed(eventId) {
  if (!eventId) return false;
  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) {
    const result = await upstashCommand(['SET', `stripe-event:${eventId}`, '1', 'NX', 'EX', 60 * 60 * 24 * 30]);
    return result === 'OK';
  }
  if (localEvents.has(eventId)) return false;
  localEvents.add(eventId);
  return true;
}

export async function createLicenseForOrder(orderId) {
  const license = {
    licenseId: generateLicenseId(),
    installSecret: generateInstallSecret(),
    orderId,
    status: 'active',
    tokenVersion: Number.parseInt(getEnvFirst(['PLUGIN_TOKEN_VERSION']) || '1', 10),
    createdAt: new Date().toISOString(),
  };

  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) {
    await redisSetJson(`license:${license.licenseId}`, license);
  } else {
    localLicenses.set(license.licenseId, license);
  }
  await updateOrder(orderId, { licenseId: license.licenseId });
  return license;
}

export async function getLicense(licenseId) {
  if (!licenseId) return null;
  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) return redisGetJson(`license:${licenseId}`);
  return localLicenses.get(licenseId) || null;
}

export const orderStore = {
  createOrder,
  getOrder,
  updateOrder,
  getOrderBySessionId,
  markEventProcessed,
  createLicenseForOrder,
  getLicense,
};
