import crypto from 'crypto';
import { getEnvFirst, isProduction } from './env.js';

const localOrders = new Map();
const localSessionIndex = new Map();
const localEvents = new Set();
const localLicenses = new Map();
const localCustomers = new Map();
const localCustomerEmailIndex = new Map();
const localWebsiteIndex = new Map();
const localOrderEvents = new Map();

export function generateOrderId() {
  return `ord_${crypto.randomBytes(8).toString('hex')}`;
}

export function generateLicenseId() {
  return `lic_${crypto.randomBytes(8).toString('hex')}`;
}

export function generateInstallSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

function normalizeEmail(email = '') {
  return String(email).trim().toLowerCase();
}

function normalizeWebsiteUrl(url = '') {
  const raw = String(url).trim();
  if (!raw) return '';
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '');
  } catch (_) {
    return raw.replace(/\/$/, '');
  }
}

function customerIdForEmail(email) {
  return `cus_${crypto.createHash('sha256').update(normalizeEmail(email)).digest('hex').slice(0, 16)}`;
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
    reportKey: data.reportKey || null,
    reports: data.reports || [],
    monitoring: data.monitoring || null,
    customerId: data.customerId || null,
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

async function redisPushJson(key, value) {
  await upstashCommand(['RPUSH', key, JSON.stringify(value)]);
}

async function redisListJson(key) {
  const result = await upstashCommand(['LRANGE', key, 0, -1]);
  return (result || []).map((item) => (typeof item === 'string' ? JSON.parse(item) : item));
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

export async function recordOrderEvent(orderId, type, payload = {}) {
  if (!orderId || !type) return null;
  const event = {
    id: `evt_${crypto.randomBytes(8).toString('hex')}`,
    orderId,
    type,
    payload,
    createdAt: new Date().toISOString(),
  };

  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) {
    await redisPushJson(`order-events:${orderId}`, event);
  } else {
    const events = localOrderEvents.get(orderId) || [];
    events.push(event);
    localOrderEvents.set(orderId, events);
  }

  return event;
}

async function getOrderEvents(orderId) {
  if (!orderId) return [];
  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) return redisListJson(`order-events:${orderId}`);
  return localOrderEvents.get(orderId) || [];
}

export async function upsertCustomerForOrder(order) {
  requirePersistentStore();
  if (!order?.customer?.email) throw new Error('Cannot create customer without email');

  const now = new Date().toISOString();
  const email = normalizeEmail(order.customer.email);
  const customerId = order.customerId || customerIdForEmail(email);
  const websiteUrl = normalizeWebsiteUrl(order.website?.url);

  const existing = getEnvFirst(['UPSTASH_REDIS_REST_URL'])
    ? await redisGetJson(`customer:${customerId}`)
    : localCustomers.get(customerId);

  const websites = { ...(existing?.websites || {}) };
  if (websiteUrl) {
    websites[websiteUrl] = {
      url: websiteUrl,
      orderId: order.orderId,
      productSlug: order.productSlug,
      status: order.status,
      lastCheckedAt: order.monitoring?.checkedAt || null,
      lastGrade: order.monitoring?.grade || null,
    };
  }

  const reports = [...(existing?.reports || [])];
  if ((order.reportKey || order.reportUrl) && !reports.some((report) => report.orderId === order.orderId)) {
    reports.push({
      orderId: order.orderId,
      key: order.reportKey || null,
      url: order.reportUrl || null,
      label: 'Audit-Report',
      createdAt: order.updatedAt || now,
    });
  }

  const orderIds = Array.from(new Set([...(existing?.orderIds || []), order.orderId]));
  const customer = {
    customerId,
    name: order.customer.name || existing?.name || '',
    email,
    company: order.customer.company || existing?.company || '',
    orderIds,
    websites,
    reports,
    activeProducts: Array.from(new Set([...(existing?.activeProducts || []), order.productSlug].filter(Boolean))),
    updatedAt: now,
    createdAt: existing?.createdAt || now,
  };

  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) {
    await redisSetJson(`customer:${customerId}`, customer);
    await upstashCommand(['SET', `customer-email:${email}`, customerId]);
    if (websiteUrl) await redisSetJson(`website:${websiteUrl}`, { customerId, orderId: order.orderId });
    await upstashCommand(['SADD', 'customer-ids', customerId]);
  } else {
    localCustomers.set(customerId, customer);
    localCustomerEmailIndex.set(email, customerId);
    if (websiteUrl) localWebsiteIndex.set(websiteUrl, { customerId, orderId: order.orderId });
  }

  if (order.customerId !== customerId) await updateOrder(order.orderId, { customerId });
  return customer;
}

export async function getCustomerPortalByOrderId(orderId) {
  const order = await getOrder(orderId);
  if (!order) return null;

  const customer = order.customerId
    ? getEnvFirst(['UPSTASH_REDIS_REST_URL'])
      ? await redisGetJson(`customer:${order.customerId}`)
      : localCustomers.get(order.customerId)
    : await upsertCustomerForOrder(order);

  if (!customer) return null;
  const orders = (await Promise.all((customer.orderIds || []).map((id) => getOrder(id)))).filter(Boolean);
  const events = (await Promise.all(orders.map((item) => getOrderEvents(item.orderId)))).flat();
  const reportsByOrder = orders
    .flatMap((item) => {
      const explicitReports = (item.reports || []).map((report) => ({
        orderId: item.orderId,
        websiteUrl: item.website?.url || null,
        productSlug: item.productSlug,
        key: report.key || null,
        url: report.url || null,
        label: report.label || 'Audit-Report',
        type: report.type || 'audit',
        createdAt: report.createdAt || item.updatedAt,
      }));

      if (!item.reportKey && !item.reportUrl) return explicitReports;

      return [
        ...explicitReports,
        {
          orderId: item.orderId,
          websiteUrl: item.website?.url || null,
          productSlug: item.productSlug,
          key: item.reportKey || null,
          url: item.reportUrl || null,
          label: 'Audit-Report',
          type: 'audit',
          createdAt: item.updatedAt,
        },
      ];
    });

  return {
    customer: {
      customerId: customer.customerId,
      name: customer.name,
      email: customer.email,
      company: customer.company,
    },
    orders: orders.map((item) => ({
      orderId: item.orderId,
      productSlug: item.productSlug,
      package: item.package,
      billingPeriod: item.billingPeriod,
      status: item.status,
      paymentStatus: item.paymentStatus,
      website: item.website,
      results: item.results,
      monitoring: item.monitoring || null,
      licenseId: item.licenseId || null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    websites: Object.values(customer.websites || {}),
    reports: [...(customer.reports || []), ...reportsByOrder].filter(
      (report, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.orderId === report.orderId &&
            (candidate.key || candidate.url || '') === (report.key || report.url || '') &&
            String(candidate.createdAt || '') === String(report.createdAt || ''),
        ) === index,
    ),
    events: events.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 25),
  };
}

export async function recordMonitoringResultForWebsite(websiteUrl, result) {
  const normalized = normalizeWebsiteUrl(websiteUrl);
  const index = getEnvFirst(['UPSTASH_REDIS_REST_URL'])
    ? await redisGetJson(`website:${normalized}`)
    : localWebsiteIndex.get(normalized);
  if (!index?.orderId) return null;

  const order = await updateOrder(index.orderId, {
    monitoring: {
      ...result,
      checkedAt: result.checkedAt || new Date().toISOString(),
    },
  });
  if (!order) return null;
  await upsertCustomerForOrder(order);
  await recordOrderEvent(order.orderId, 'monitoring.completed', {
    websiteUrl: normalized,
    grade: result.grade,
    score: result.score,
  });
  return order;
}

export async function listCustomerMonitoringTargets() {
  const customerIds = getEnvFirst(['UPSTASH_REDIS_REST_URL'])
    ? await upstashCommand(['SMEMBERS', 'customer-ids'])
    : Array.from(localCustomers.keys());
  const customers = (
    await Promise.all(
      (customerIds || []).map((customerId) =>
        getEnvFirst(['UPSTASH_REDIS_REST_URL']) ? redisGetJson(`customer:${customerId}`) : localCustomers.get(customerId),
      ),
    )
  ).filter(Boolean);

  return customers.flatMap((customer) =>
    Object.values(customer.websites || {})
      .filter((website) => website.url)
      .map((website) => ({
        id: `${customer.customerId}:${website.url}`,
        name: customer.name || customer.company || customer.email,
        customerId: customer.customerId,
        orderId: website.orderId,
        customer: {
          name: customer.name,
          email: customer.email,
          company: customer.company,
        },
        website: { url: website.url },
        productSlug: website.productSlug,
        active: true,
      })),
  );
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
  recordOrderEvent,
  upsertCustomerForOrder,
  getCustomerPortalByOrderId,
  recordMonitoringResultForWebsite,
  listCustomerMonitoringTargets,
};
