import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.ended = true;
      return this;
    },
    end(payload) {
      this.body = payload;
      this.ended = true;
      return this;
    },
  };
}

function demoOrderToken() {
  const payload = JSON.stringify({
    orderId: 'ord_demo_001',
    email: 'm.muster@muster-kanzlei.ch',
    expiry: Math.floor(Date.now() / 1000) + 3600,
  });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', 'demo-secret-for-testing-only').update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

test('order-status rejects demo magic tokens in production', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const { default: handler } = await import('../api/order-status.js');
  const res = createResponse();

  await handler(
    {
      method: 'GET',
      headers: {},
      query: {
        orderId: 'ord_demo_001',
        email: 'm.muster@muster-kanzlei.ch',
        token: demoOrderToken(),
      },
    },
    res,
  );

  process.env.NODE_ENV = previousNodeEnv;
  assert.equal(res.statusCode, 401);
});

test('checkout creates Stripe session with real orderId metadata before redirect', async () => {
  const previousFetch = global.fetch;
  const previousStripeKey = process.env.STRIPE_SECRET_KEY;
  const previousBaseUrl = process.env.BASE_URL;
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.BASE_URL = 'https://aidsec.ch';
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, body: String(options.body) });
    return {
      ok: true,
      async json() {
        return { id: 'cs_test_123', url: 'https://checkout.stripe.test/session' };
      },
    };
  };

  const { default: handler } = await import('../api/checkout.js');
  const res = createResponse();
  await handler(
    {
      method: 'POST',
      url: '/api/checkout',
      headers: {},
      body: {
        productSlug: 'rapid-header-fix',
        name: 'Ada Lovelace',
        email: 'ada@example.ch',
        websiteUrl: 'https://example.ch',
      },
    },
    res,
  );

  global.fetch = previousFetch;
  process.env.STRIPE_SECRET_KEY = previousStripeKey;
  process.env.BASE_URL = previousBaseUrl;

  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].body, /metadata%5BorderId%5D=ord_/);
  assert.doesNotMatch(calls[0].body, /metadata%5BorderId%5D=pending/);
  assert.match(calls[0].body, /success_url=.*order_id%3Dord_/);
});

test('checkout webhook rejects invalid Stripe signatures', async () => {
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
  const { default: handler } = await import('../api/checkout.js');
  const res = createResponse();

  await handler(
    {
      method: 'POST',
      url: '/api/checkout/webhook',
      headers: { 'stripe-signature': 't=1,v1=bad' },
      body: { type: 'checkout.session.completed', data: { object: { id: 'cs_test_missing' } } },
    },
    res,
  );

  process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
  assert.equal(res.statusCode, 400);
});

test('check-headers blocks non-standard HTTP ports before fetching', async () => {
  const previousFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return { ok: true, headers: new Headers() };
  };
  const { default: handler } = await import('../api/check-headers.js');
  const res = createResponse();

  await handler({ method: 'GET', headers: {}, query: { url: 'https://example.ch:8443' } }, res);

  global.fetch = previousFetch;
  assert.equal(res.statusCode, 403);
  assert.equal(fetchCalled, false);
});

test('storage exposes JSON and signed URL methods and rejects unconfigured production writes', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const { storage } = await import('../api/cron/storage.js?test=production-contract');

  assert.equal(typeof storage.putJson, 'function');
  assert.equal(typeof storage.getJson, 'function');
  assert.equal(typeof storage.createSignedReadUrl, 'function');
  await assert.rejects(() => storage.putJson('reports/test.json', { ok: true }), /Object storage is not configured/);

  process.env.NODE_ENV = previousNodeEnv;
});

test('storage signs R2 read URLs without SDK presigner dependencies', async () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: process.env.R2_BUCKET,
  };
  process.env.NODE_ENV = 'production';
  process.env.R2_ACCOUNT_ID = 'test-account';
  process.env.R2_ACCESS_KEY_ID = 'test-access-key';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
  process.env.R2_BUCKET = 'aidsec-test-bucket';

  const { storage } = await import('../api/cron/storage.js?test=r2-signed-url');
  const signedUrl = await storage.createSignedReadUrl('reports/orders/report with space.json', 900);
  const parsed = new URL(signedUrl);

  Object.entries(previous).forEach(([key, value]) => {
    if (typeof value === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
  assert.equal(parsed.hostname, 'test-account.r2.cloudflarestorage.com');
  assert.equal(parsed.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
  assert.equal(parsed.searchParams.get('X-Amz-SignedHeaders'), 'host');
  assert.equal(parsed.searchParams.get('X-Amz-Expires'), '900');
  assert.match(parsed.pathname, /\/aidsec-test-bucket\/reports\/orders\/report%20with%20space\.json$/);
  assert.match(parsed.searchParams.get('X-Amz-Signature'), /^[a-f0-9]{64}$/);
});

test('object storage and production smoke do not depend on AWS SDK packages', () => {
  const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const storageSource = fs.readFileSync(new URL('../api/cron/storage.js', import.meta.url), 'utf8');
  const smokeSource = fs.readFileSync(new URL('../scripts/production-smoke.mjs', import.meta.url), 'utf8');

  assert.equal(packageJson.dependencies['@aws-sdk/client-s3'], undefined);
  assert.doesNotMatch(storageSource, /@aws-sdk\/client-s3/);
  assert.doesNotMatch(smokeSource, /@aws-sdk\/client-s3/);
});

test('plugin relay requires licenseId even when HMAC signature is valid', async () => {
  const previousSecret = process.env.PLUGIN_SHARED_SECRET;
  const previousFetch = global.fetch;
  process.env.PLUGIN_SHARED_SECRET = 'test-plugin-secret';
  global.fetch = async () => ({ ok: true, status: 200 });
  const payload = { event: 'plugin_activated', site_url: 'https://example.ch', tokenVersion: 1 };
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = crypto.createHmac('sha256', process.env.PLUGIN_SHARED_SECRET).update(JSON.stringify(payload) + ts).digest('base64');
  const { default: handler } = await import('../api/plugin-webhook-relay.js');
  const res = createResponse();

  await handler(
    {
      method: 'POST',
      headers: { 'x-aidsec-sig': sig, 'x-aidsec-ts': ts },
      body: payload,
    },
    res,
  );

  process.env.PLUGIN_SHARED_SECRET = previousSecret;
  global.fetch = previousFetch;
  assert.equal(res.statusCode, 400);
});

test('checkout webhook creates a customer portal backbone after paid checkout', async () => {
  const { createOrder, getCustomerPortalByOrderId } = await import('../api/lib/order-store.js');
  const { handleStripeEvent } = await import('../api/checkout-webhook.js');
  const order = await createOrder({
    productSlug: 'cyber-mandat',
    billingPeriod: 'monthly',
    customer: { name: 'Dr. Portal', email: 'portal@example.ch', company: 'Portal AG' },
    website: { url: 'https://portal.example.ch' },
    status: 'pending_payment',
    paymentStatus: 'unpaid',
  });

  const result = await handleStripeEvent({
    id: `evt_${order.orderId}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_${order.orderId}`,
        customer: 'cus_stripe',
        subscription: 'sub_stripe',
        payment_status: 'paid',
        metadata: { orderId: order.orderId },
      },
    },
  });
  const portal = await getCustomerPortalByOrderId(order.orderId);

  assert.equal(result.handled, true);
  assert.equal(portal.customer.email, 'portal@example.ch');
  assert.equal(portal.orders[0].orderId, order.orderId);
  assert.equal(portal.websites[0].url, 'https://portal.example.ch');
  assert.equal(portal.websites[0].productSlug, 'cyber-mandat');
  assert.equal(portal.events.some((event) => event.type === 'checkout.session.completed'), true);
  assert.equal(portal.events.some((event) => event.type === 'license.created'), true);
  assert.equal(portal.events.some((event) => event.type === 'onboarding.task.created'), true);
  assert.equal(portal.events.some((event) => event.type === 'report.placeholder.created'), true);
  assert.equal(portal.events.some((event) => event.type === 'email.magic_link'), true);
  assert.equal(portal.reports.some((report) => report.type === 'pending_delivery' && report.label === 'Delivery Report in Vorbereitung'), true);
});

test('customer backbone exposes stable website and report records', async () => {
  const {
    createOrder,
    updateOrder,
    upsertCustomerForOrder,
    getCustomerPortalByOrderId,
    getWebsiteRecordByUrl,
    getReportRecord,
  } = await import('../api/lib/order-store.js?backbone-records');
  const order = await createOrder({
    productSlug: 'kanzlei-haertung',
    customer: { name: 'Backbone User', email: 'backbone@example.ch', company: 'Backbone AG' },
    website: { url: 'backbone.example.ch/path/?utm=ignored#section' },
    status: 'active',
    paymentStatus: 'paid',
    reports: [
      {
        key: 'reports/orders/backbone-report.json',
        label: 'Backbone Audit',
        type: 'audit',
        createdAt: '2026-05-01T08:00:00.000Z',
      },
    ],
  });
  const updatedOrder = await updateOrder(order.orderId, { reports: order.reports });
  await upsertCustomerForOrder(updatedOrder);

  const portal = await getCustomerPortalByOrderId(order.orderId);
  const website = portal.websites[0];
  const report = portal.reports.find((item) => item.key === 'reports/orders/backbone-report.json');
  const websiteRecord = await getWebsiteRecordByUrl('https://backbone.example.ch/path/');
  const reportRecord = await getReportRecord(report.reportId);

  assert.match(portal.customer.customerId, /^cus_/);
  assert.match(website.websiteId, /^web_/);
  assert.equal(website.url, 'https://backbone.example.ch/path');
  assert.equal(website.customerId, portal.customer.customerId);
  assert.deepEqual(website.orderIds, [order.orderId]);
  assert.equal(website.activeMonitoring, true);
  assert.match(report.reportId, /^rep_/);
  assert.equal(report.customerId, portal.customer.customerId);
  assert.equal(report.websiteId, website.websiteId);
  assert.equal(websiteRecord.websiteId, website.websiteId);
  assert.equal(websiteRecord.normalizedUrl, 'https://backbone.example.ch/path');
  assert.equal(reportRecord.reportId, report.reportId);
  assert.equal(reportRecord.storageKey, 'reports/orders/backbone-report.json');
});

test('proof center report history keeps stable backbone identifiers', async () => {
  const previousSecret = process.env.ORDER_TOKEN_SECRET;
  process.env.ORDER_TOKEN_SECRET = 'test-order-token-secret-with-32-chars';
  const { createOrder, updateOrder, upsertCustomerForOrder } = await import('../api/lib/order-store.js');
  const { generateMagicToken } = await import('../api/lib/order-token.js');
  const { default: handler } = await import('../api/proof-center-status.js?history-backbone');
  const order = await createOrder({
    productSlug: 'rapid-header-fix',
    customer: { name: 'Backbone History', email: 'backbone-history@example.ch', company: 'Backbone AG' },
    website: { url: 'https://backbone-history.example.ch' },
    status: 'complete',
    paymentStatus: 'paid',
    reports: [
      {
        key: 'reports/orders/backbone-history.json',
        label: 'Backbone History Audit',
        type: 'audit',
        createdAt: '2026-05-02T08:00:00.000Z',
      },
    ],
  });
  const updatedOrder = await updateOrder(order.orderId, { reports: order.reports });
  const customer = await upsertCustomerForOrder(updatedOrder);
  const token = generateMagicToken(order.orderId, 'backbone-history@example.ch');
  const res = createResponse();

  await handler({ method: 'GET', headers: {}, query: { orderId: order.orderId, token } }, res);

  process.env.ORDER_TOKEN_SECRET = previousSecret;
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.portal.reportHistory[0].customerId, customer.customerId);
  assert.match(res.body.portal.reportHistory[0].reportId, /^rep_/);
  assert.match(res.body.portal.reportHistory[0].websiteId, /^web_/);
  assert.equal(res.body.portal.reportHistory[0].storageKey, 'reports/orders/backbone-history.json');
});

test('proof center signed report links avoid importing the cron storage adapter', () => {
  const proofSource = fs.readFileSync(new URL('../api/proof-center-status.js', import.meta.url), 'utf8');

  assert.doesNotMatch(proofSource, /cron\/storage/);
  assert.match(proofSource, /signed-storage-url/);
});

test('proof center returns authenticated customer portal data with signed report links', async () => {
  const previousSecret = process.env.ORDER_TOKEN_SECRET;
  process.env.ORDER_TOKEN_SECRET = 'test-order-token-secret-with-32-chars';
  const { createOrder, updateOrder, upsertCustomerForOrder } = await import('../api/lib/order-store.js');
  const { generateMagicToken } = await import('../api/lib/order-token.js');
  const { default: handler } = await import('../api/proof-center-status.js');
  const order = await createOrder({
    productSlug: 'rapid-header-fix',
    customer: { name: 'Report User', email: 'report@example.ch', company: 'Report AG' },
    website: { url: 'https://report.example.ch' },
    status: 'complete',
    paymentStatus: 'paid',
    reportKey: 'reports/orders/report-test.json',
  });
  const updatedOrder = await updateOrder(order.orderId, { reportKey: 'reports/orders/report-test.json' });
  await upsertCustomerForOrder(updatedOrder);
  const token = generateMagicToken(order.orderId, 'report@example.ch');
  const res = createResponse();

  await handler({ method: 'GET', headers: {}, query: { orderId: order.orderId, token } }, res);

  process.env.ORDER_TOKEN_SECRET = previousSecret;
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.portal.customer.email, 'report@example.ch');
  assert.equal(res.body.portal.reports[0].orderId, order.orderId);
  assert.match(res.body.portal.reports[0].url, /reports\/orders\/report-test\.json|report-test/);
});

test('delivery email can be built for all paid products without undefined variables', async () => {
  const { buildDeliveryEmail } = await import('../api/lib/mailer.js');
  const baseOrder = {
    orderId: 'ord_delivery_test',
    customer: { name: 'Delivery User', email: 'delivery@example.ch' },
    website: { url: 'https://delivery.example.ch' },
    package: 'AidSec Paket',
    licenseId: 'lic_delivery',
  };

  for (const productSlug of ['rapid-header-fix', 'kanzlei-haertung', 'cyber-mandat']) {
    const message = buildDeliveryEmail({ ...baseOrder, productSlug });
    assert.equal(message.to, 'delivery@example.ch');
    assert.match(message.text, /Proof Center/);
    assert.match(message.html, /Kundenportal|Header-Check|Proof Center/);
  }
});

test('crm lead scoring requires a magic-link token before returning portal data', async () => {
  const { createOrder, upsertCustomerForOrder } = await import('../api/lib/order-store.js');
  const { default: handler } = await import('../api/crm-lead-scoring.js');
  const order = await createOrder({
    productSlug: 'cyber-mandat',
    customer: { name: 'CRM User', email: 'crm@example.ch', company: 'CRM AG' },
    website: { url: 'https://crm.example.ch' },
    status: 'active',
    paymentStatus: 'paid',
  });
  await upsertCustomerForOrder(order);
  const res = createResponse();

  await handler({ method: 'GET', headers: {}, query: { orderId: order.orderId } }, res);

  assert.equal(res.statusCode, 401);
});

test('monitoring targets include real order and customer contact data for re-audit emails', async () => {
  const { createOrder, upsertCustomerForOrder, listCustomerMonitoringTargets } = await import('../api/lib/order-store.js');
  const order = await createOrder({
    productSlug: 'cyber-mandat',
    customer: { name: 'Audit User', email: 'audit@example.ch', company: 'Audit AG' },
    website: { url: 'https://audit.example.ch' },
    status: 'active',
    paymentStatus: 'paid',
  });
  await upsertCustomerForOrder(order);

  const targets = await listCustomerMonitoringTargets();
  const target = targets.find((item) => item.website.url === 'https://audit.example.ch');

  assert.equal(target.orderId, order.orderId);
  assert.equal(target.customer.email, 'audit@example.ch');
  assert.equal(target.productSlug, 'cyber-mandat');
});

test('portal can request a magic link for an existing order without exposing the token', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const { createOrder } = await import('../api/lib/order-store.js');
  const { default: handler } = await import('../api/order-status.js');
  const order = await createOrder({
    productSlug: 'rapid-header-fix',
    customer: { name: 'Magic User', email: 'magic@example.ch', company: 'Magic AG' },
    website: { url: 'https://magic.example.ch' },
    status: 'active',
    paymentStatus: 'paid',
  });
  const res = createResponse();

  await handler({
    method: 'POST',
    headers: {},
    body: { action: 'send_magic_link', orderId: order.orderId, email: 'magic@example.ch' },
  }, res);

  process.env.NODE_ENV = previousNodeEnv;
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.sent, true);
  assert.equal(res.body.token, undefined);
  assert.equal(res.body.magicLink, undefined);
});

test('magic-link request is enumeration-safe in production for unknown orders', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const { default: handler } = await import('../api/order-status.js');
  const res = createResponse();

  await handler({
    method: 'POST',
    headers: {},
    body: { action: 'send_magic_link', orderId: 'ord_not_real', email: 'nobody@example.ch' },
  }, res);

  process.env.NODE_ENV = previousNodeEnv;
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.sent, true);
  assert.equal(res.body.token, undefined);
});

test('vercel API rewrites target function routes instead of static js files', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const checkoutWebhook = config.rewrites.find((rewrite) => rewrite.source === '/api/checkout/webhook');
  const pluginRelay = config.rewrites.find((rewrite) => rewrite.source === '/api/plugin-webhook-relay/(.*)');

  assert.equal(checkoutWebhook.destination, '/api/checkout-webhook');
  assert.equal(pluginRelay.destination, '/api/plugin-webhook-relay');
});

test('transactional emails use Brevo API in production when configured', async () => {
  const previousFetch = global.fetch;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousProvider = process.env.EMAIL_PROVIDER;
  const previousBrevo = process.env.BREVO_API_KEY;
  const previousSmtpHost = process.env.SMTP_HOST;
  const previousSmtpUser = process.env.SMTP_USER;
  const previousSmtpPass = process.env.SMTP_PASS;
  process.env.NODE_ENV = 'production';
  delete process.env.EMAIL_PROVIDER;
  process.env.BREVO_API_KEY = 'brevo_test_key';
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, headers: options.headers, body: JSON.parse(options.body) });
    return {
      ok: true,
      async json() {
        return { messageId: 'brevo-message-id' };
      },
    };
  };

  const { sendMagicLinkEmail } = await import('../api/lib/mailer.js?brevo-test');
  const result = await sendMagicLinkEmail({
    orderId: 'ord_brevo_test',
    customer: { name: 'Brevo User', email: 'brevo@example.ch' },
  });

  global.fetch = previousFetch;
  process.env.NODE_ENV = previousNodeEnv;
  process.env.EMAIL_PROVIDER = previousProvider;
  process.env.BREVO_API_KEY = previousBrevo;
  process.env.SMTP_HOST = previousSmtpHost;
  process.env.SMTP_USER = previousSmtpUser;
  process.env.SMTP_PASS = previousSmtpPass;

  assert.equal(result.sent, true);
  assert.equal(result.provider, 'brevo');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(calls[0].body.to[0].email, 'brevo@example.ch');
});

test('transactional emails can force SMTP in production even when Brevo is configured', async () => {
  const previousFetch = global.fetch;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousProvider = process.env.EMAIL_PROVIDER;
  const previousBrevo = process.env.BREVO_API_KEY;
  const previousSmtpHost = process.env.SMTP_HOST;
  const previousSmtpPort = process.env.SMTP_PORT;
  const previousSmtpSecure = process.env.SMTP_SECURE;
  const previousSmtpUser = process.env.SMTP_USER;
  const previousSmtpPass = process.env.SMTP_PASS;
  const previousFrom = process.env.EMAIL_FROM;
  process.env.NODE_ENV = 'production';
  process.env.EMAIL_PROVIDER = 'smtp';
  process.env.BREVO_API_KEY = 'brevo_test_key';
  process.env.SMTP_HOST = 'smtp.office365.com';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_SECURE = 'false';
  process.env.SMTP_USER = 'info@aidsec.ch';
  process.env.SMTP_PASS = 'smtp-test-password';
  process.env.EMAIL_FROM = 'AidSec <info@aidsec.ch>';
  const fetchCalls = [];
  let smtpConfig;
  let smtpMessage;
  global.fetch = async (url) => {
    fetchCalls.push(url);
    throw new Error('Brevo should not be called when EMAIL_PROVIDER=smtp');
  };

  const nodemailer = await import('nodemailer');
  const previousCreateTransport = nodemailer.default.createTransport;
  nodemailer.default.createTransport = (config) => {
    smtpConfig = config;
    return {
      async sendMail(message) {
        smtpMessage = message;
        return { messageId: 'smtp-message-id' };
      },
    };
  };

  let result;
  try {
    const { sendMagicLinkEmail } = await import('../api/lib/mailer.js?smtp-provider-test');
    result = await sendMagicLinkEmail({
      orderId: 'ord_smtp_test',
      customer: { name: 'SMTP User', email: 'smtp-user@example.ch' },
    });
  } finally {
    nodemailer.default.createTransport = previousCreateTransport;
    global.fetch = previousFetch;
    process.env.NODE_ENV = previousNodeEnv;
    process.env.EMAIL_PROVIDER = previousProvider;
    process.env.BREVO_API_KEY = previousBrevo;
    process.env.SMTP_HOST = previousSmtpHost;
    process.env.SMTP_PORT = previousSmtpPort;
    process.env.SMTP_SECURE = previousSmtpSecure;
    process.env.SMTP_USER = previousSmtpUser;
    process.env.SMTP_PASS = previousSmtpPass;
    process.env.EMAIL_FROM = previousFrom;
  }

  assert.equal(result.provider, 'smtp');
  assert.equal(smtpConfig.host, 'smtp.office365.com');
  assert.equal(smtpConfig.auth.user, 'info@aidsec.ch');
  assert.equal(smtpMessage.to, 'smtp-user@example.ch');
  assert.equal(fetchCalls.length, 0);
});

test('production smoke supports real recipient override and explicit email check', () => {
  const smokeScript = fs.readFileSync(new URL('../scripts/production-smoke.mjs', import.meta.url), 'utf8');

  assert.match(smokeScript, /process\.env\.SMOKE_EMAIL/);
  assert.match(smokeScript, /email:transactional-delivery/);
  assert.doesNotMatch(smokeScript, /aidsec\.smoke\+\$\{runId\}@example\.com/);
});

test('contact form requires hCaptcha token when server secret is configured', async () => {
  const previousSecret = process.env.HCAPTCHA_SECRET;
  process.env.HCAPTCHA_SECRET = 'test-hcaptcha-secret';
  const { default: handler } = await import('../api/contact-submit.js?hcaptcha-missing');
  const res = createResponse();

  await handler(
    {
      method: 'POST',
      headers: { origin: 'https://aidsec.ch' },
      socket: { remoteAddress: '203.0.113.10' },
      body: {
        name: 'Captcha User',
        email: 'captcha@example.ch',
        websiteUrl: 'https://captcha.example.ch',
        agb: 'true',
      },
    },
    res,
  );

  process.env.HCAPTCHA_SECRET = previousSecret;
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Captcha|hCaptcha/i);
});

test('onboarding form accepts valid hCaptcha token before sending mail', async () => {
  const previousFetch = global.fetch;
  const previousSecret = process.env.HCAPTCHA_SECRET;
  const previousSmtpHost = process.env.SMTP_HOST;
  const previousSmtpPort = process.env.SMTP_PORT;
  const previousSmtpUser = process.env.SMTP_USER;
  const previousSmtpPass = process.env.SMTP_PASS;
  const previousFrom = process.env.ONBOARDING_FROM_EMAIL;
  const previousTo = process.env.ONBOARDING_TO_EMAIL;
  process.env.HCAPTCHA_SECRET = 'test-hcaptcha-secret';
  process.env.SMTP_HOST = 'smtp.example.test';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'sender@example.ch';
  process.env.SMTP_PASS = 'smtp-test-password';
  process.env.ONBOARDING_FROM_EMAIL = 'AidSec <sender@example.ch>';
  process.env.ONBOARDING_TO_EMAIL = 'ops@example.ch';
  const captchaCalls = [];
  global.fetch = async (url, options) => {
    captchaCalls.push({ url, body: String(options.body) });
    return {
      ok: true,
      async json() {
        return { success: true };
      },
    };
  };
  const nodemailer = await import('nodemailer');
  const previousCreateTransport = nodemailer.default.createTransport;
  let smtpMessage;
  nodemailer.default.createTransport = () => ({
    async sendMail(message) {
      smtpMessage = message;
      return { messageId: 'smtp-message-id' };
    },
  });
  const { default: handler } = await import('../api/onboarding-submit.js?hcaptcha-valid');
  const res = createResponse();

  try {
    await handler(
      {
        method: 'POST',
        headers: { origin: 'https://aidsec.ch', 'user-agent': 'test-agent' },
        socket: { remoteAddress: '203.0.113.11' },
        body: {
          packageSlug: 'rapid-header-fix',
          packageName: 'Rapid Header Fix',
          packagePrice: '390',
          websiteUrl: 'https://onboarding.example.ch',
          name: 'Onboarding User',
          email: 'onboarding@example.ch',
          paymentMethod: 'card',
          authCheck: 'true',
          privacyCheck: 'true',
          accessCheck: 'true',
          hCaptchaToken: 'valid-token',
        },
      },
      res,
    );
  } finally {
    nodemailer.default.createTransport = previousCreateTransport;
    global.fetch = previousFetch;
    process.env.HCAPTCHA_SECRET = previousSecret;
    process.env.SMTP_HOST = previousSmtpHost;
    process.env.SMTP_PORT = previousSmtpPort;
    process.env.SMTP_USER = previousSmtpUser;
    process.env.SMTP_PASS = previousSmtpPass;
    process.env.ONBOARDING_FROM_EMAIL = previousFrom;
    process.env.ONBOARDING_TO_EMAIL = previousTo;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(captchaCalls.length, 1);
  assert.match(captchaCalls[0].url, /hcaptcha\.com\/siteverify/);
  assert.match(captchaCalls[0].body, /valid-token/);
  assert.equal(smtpMessage.to, 'ops@example.ch');
});

test('proof center returns chronological report and monitoring history', async () => {
  const previousSecret = process.env.ORDER_TOKEN_SECRET;
  process.env.ORDER_TOKEN_SECRET = 'test-order-token-secret-with-32-chars';
  const {
    createOrder,
    updateOrder,
    upsertCustomerForOrder,
    recordMonitoringResultForWebsite,
  } = await import('../api/lib/order-store.js');
  const { generateMagicToken } = await import('../api/lib/order-token.js');
  const { default: handler } = await import('../api/proof-center-status.js?history-test');
  const order = await createOrder({
    productSlug: 'cyber-mandat',
    customer: { name: 'History User', email: 'history@example.ch', company: 'History AG' },
    website: { url: 'https://history.example.ch' },
    status: 'active',
    paymentStatus: 'paid',
    reports: [
      {
        key: 'reports/orders/history-old.json',
        label: 'Initial Audit',
        type: 'audit',
        createdAt: '2026-01-10T08:00:00.000Z',
      },
      {
        key: 'reports/orders/history-new.json',
        label: 'Re-Audit',
        type: 'reaudit',
        createdAt: '2026-02-10T08:00:00.000Z',
      },
    ],
  });
  const updatedOrder = await updateOrder(order.orderId, {
    reports: order.reports,
  });
  await upsertCustomerForOrder(updatedOrder);
  await recordMonitoringResultForWebsite('https://history.example.ch', {
    grade: 'C',
    score: 4,
    checkedAt: '2026-02-10T09:00:00.000Z',
  });
  await recordMonitoringResultForWebsite('https://history.example.ch', {
    grade: 'B',
    score: 6,
    checkedAt: '2026-02-11T09:00:00.000Z',
  });
  const token = generateMagicToken(order.orderId, 'history@example.ch');
  const res = createResponse();

  await handler({ method: 'GET', headers: {}, query: { orderId: order.orderId, token } }, res);

  process.env.ORDER_TOKEN_SECRET = previousSecret;
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.portal.orders[0].monitoring.grade, 'B');
  assert.equal(res.body.portal.reportHistory.length, 2);
  assert.equal(res.body.portal.reportHistory[0].label, 'Re-Audit');
  assert.equal(res.body.portal.reportHistory[0].type, 'reaudit');
  assert.match(res.body.portal.reportHistory[0].url, /history-new\.json/);
  assert.equal(res.body.portal.monitoringHistory.length, 2);
  assert.equal(res.body.portal.monitoringHistory[0].grade, 'B');
  assert.equal(res.body.portal.monitoringHistory[0].score, 6);
  assert.equal(res.body.portal.monitoringHistory[1].grade, 'C');
  assert.equal(res.body.portal.monitoringHistory[1].score, 4);
  assert.equal(res.body.portal.monitoringHistory[0].websiteUrl, 'https://history.example.ch');
  assert.equal(res.body.portal.events.some((event) => event.type === 'monitoring.completed'), true);
});

test('monitoring results become customer-visible events with newest event first', async () => {
  const {
    createOrder,
    upsertCustomerForOrder,
    recordMonitoringResultForWebsite,
    getCustomerPortalByOrderId,
  } = await import('../api/lib/order-store.js?monitoring-event-test');
  const order = await createOrder({
    productSlug: 'cyber-mandat',
    customer: { name: 'Event User', email: 'event@example.ch', company: 'Event AG' },
    website: { url: 'https://events.example.ch' },
    status: 'active',
    paymentStatus: 'paid',
  });
  await upsertCustomerForOrder(order);
  await recordMonitoringResultForWebsite('https://events.example.ch', {
    grade: 'C',
    score: 4,
    checkedAt: '2026-05-01T09:00:00.000Z',
  });
  await recordMonitoringResultForWebsite('https://events.example.ch', {
    grade: 'A',
    score: 6,
    checkedAt: '2026-05-02T09:00:00.000Z',
  });

  const portal = await getCustomerPortalByOrderId(order.orderId);
  const monitoringEvents = portal.events.filter((event) => event.type === 'monitoring.completed');

  assert.equal(monitoringEvents.length, 2);
  assert.equal(monitoringEvents[0].payload.grade, 'A');
  assert.equal(monitoringEvents[0].payload.score, 6);
  assert.equal(monitoringEvents[1].payload.grade, 'C');
});

test('re-audit cron records email automation outcomes as order events', () => {
  const reauditSource = fs.readFileSync(new URL('../api/cron/reaudit.js', import.meta.url), 'utf8');

  assert.match(reauditSource, /recordOrderEvent/);
  assert.match(reauditSource, /email\.reaudit/);
  assert.match(reauditSource, /email\.reaudit_failed/);
});

test('order-status lazily migrates legacy paid orders on access', async () => {
  const previousSecret = process.env.ORDER_TOKEN_SECRET;
  process.env.ORDER_TOKEN_SECRET = 'test-order-token-secret-with-32-chars';
  
  const { createOrder, getOrder, getCustomerPortalByOrderId } = await import('../api/lib/order-store.js');
  const { generateMagicToken } = await import('../api/lib/order-token.js');
  const { default: handler } = await import('../api/order-status.js?lazy-migration-test');

  const order = await createOrder({
    productSlug: 'kanzlei-haertung',
    customer: { name: 'Legacy Migrant', email: 'legacy@example.ch', company: 'Legacy GmbH' },
    website: { url: 'https://legacy.example.ch' },
    status: 'active',
    paymentStatus: 'paid',
  });

  assert.equal(order.customerId, null);

  const token = generateMagicToken(order.orderId, 'legacy@example.ch');
  const res = createResponse();

  await handler(
    {
      method: 'GET',
      headers: {},
      query: {
        orderId: order.orderId,
        token: token,
      },
    },
    res,
  );

  process.env.ORDER_TOKEN_SECRET = previousSecret;

  assert.equal(res.statusCode, 200);
  
  const reloaded = await getOrder(order.orderId);
  assert.match(reloaded.customerId, /^cus_/);

  const portal = await getCustomerPortalByOrderId(order.orderId);
  assert.equal(portal.customer.email, 'legacy@example.ch');
  assert.equal(portal.websites[0].url, 'https://legacy.example.ch');
});

test('crm-lookup API requires internal secret and returns customer details by email/website/orderId', async () => {
  const previousSecret = process.env.INTERNAL_API_SECRET;
  const previousOrderSecret = process.env.ORDER_TOKEN_SECRET;
  const previousVercelEnv = process.env.VERCEL_ENV;
  process.env.INTERNAL_API_SECRET = 'crm-secret-token';
  process.env.ORDER_TOKEN_SECRET = 'test-order-token-secret-with-32-chars';

  const { createOrder, upsertCustomerForOrder } = await import('../api/lib/order-store.js');
  const { default: handler } = await import('../api/admin/crm-lookup.js');

  const order = await createOrder({
    productSlug: 'rapid-header-fix',
    customer: { name: 'CRM Query User', email: 'crmquery@example.ch', company: 'CRM Query AG' },
    website: { url: 'https://crmquery.example.ch' },
    status: 'complete',
    paymentStatus: 'paid',
  });
  await upsertCustomerForOrder(order);

  // Set VERCEL_ENV to production to force secret checks in validateInternalRequest
  process.env.VERCEL_ENV = 'production';

  const res1 = createResponse();
  await handler({ method: 'GET', headers: {}, query: { email: 'crmquery@example.ch' } }, res1);
  assert.equal(res1.statusCode, 401);

  const res2 = createResponse();
  await handler({
    method: 'GET',
    headers: { 'x-aidsec-internal-secret': 'crm-secret-token' },
    query: { email: 'crmquery@example.ch' }
  }, res2);
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.body.customer.email, 'crmquery@example.ch');
  assert.match(res2.body.portalLinks[0].portalUrl, /proof-center\.html/);

  const res3 = createResponse();
  await handler({
    method: 'GET',
    headers: { 'x-aidsec-internal-secret': 'crm-secret-token' },
    query: { website: 'https://crmquery.example.ch' }
  }, res3);
  assert.equal(res3.statusCode, 200);
  assert.equal(res3.body.customer.email, 'crmquery@example.ch');

  const res4 = createResponse();
  await handler({
    method: 'GET',
    headers: { 'x-aidsec-internal-secret': 'crm-secret-token' },
    query: { orderId: order.orderId }
  }, res4);
  assert.equal(res4.statusCode, 200);
  assert.equal(res4.body.customer.email, 'crmquery@example.ch');

  process.env.INTERNAL_API_SECRET = previousSecret;
  process.env.ORDER_TOKEN_SECRET = previousOrderSecret;
  if (previousVercelEnv === undefined) {
    delete process.env.VERCEL_ENV;
  } else {
    process.env.VERCEL_ENV = previousVercelEnv;
  }
});
