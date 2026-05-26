import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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
