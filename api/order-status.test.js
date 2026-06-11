import { describe, expect, it, vi } from 'vitest';

/**
 * Order Status — confirmation snippet tests
 *
 * Verifies the public confirmation-page GET branch:
 * - Without token + source=confirmation: returns limited, PII-free snippet
 * - Without token and no source: 401
 * - 404 when order does not exist
 * - Strips PII (no customer/email/licenseId/reportUrl)
 */

const validOrder = {
  orderId: 'ord_test_123',
  status: 'paid',
  productSlug: 'rapid-header-fix',
  package: { name: 'Rapid Header Fix' },
  productName: 'Rapid Header Fix (Auftrag)',
  billingPeriod: 'once',
  addOns: ['email-sicherheit'],
  customer: { email: 'private@example.com', name: 'Private Person' },
  licenseId: 'lic_SECRET',
  reportUrl: '/secret/report.pdf',
  website: { url: 'https://kanzlei.example.ch' },
};

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function makeReq({ method = 'GET', query = {}, body = null, headers = {} } = {}) {
  return { method, query, body, headers };
}

vi.mock('./lib/order-store.js', () => ({
  getOrder: vi.fn(async (orderId) => (orderId === validOrder.orderId ? validOrder : null)),
  createOrder: vi.fn(),
  upsertCustomerForOrder: vi.fn(),
}));

vi.mock('./lib/order-token.js', () => ({
  verifyDemoMagicToken: vi.fn(() => ({ valid: false })),
  verifyMagicToken: vi.fn(() => ({ valid: false })),
  generateMagicToken: vi.fn(() => 'tok'),
}));

vi.mock('./lib/mailer.js', () => ({
  sendMagicLinkEmail: vi.fn(),
}));

vi.mock('./lib/env.js', () => ({
  getEnvFirst: vi.fn(() => ''),
  isProduction: vi.fn(() => false),
}));

const handler = (await import('./order-status.js')).default;

describe('order-status confirmation branch', () => {
  it('returns a PII-free snippet for source=confirmation', async () => {
    const req = makeReq({ query: { orderId: validOrder.orderId, source: 'confirmation' } });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.order.orderId).toBe(validOrder.orderId);
    expect(res.body.order.productSlug).toBe('rapid-header-fix');
    expect(res.body.order.status).toBe('paid');
    expect(res.body.order.addOns).toEqual(['email-sicherheit']);
    // PII / secrets MUST NOT leak
    expect(res.body.order.customer).toBeUndefined();
    expect(res.body.order.licenseId).toBeUndefined();
    expect(res.body.order.reportUrl).toBeUndefined();
    expect(res.body.order.website).toBeUndefined();
  });

  it('falls back to productName when no package name is set', async () => {
    const req = makeReq({ query: { orderId: 'ord_test_456', source: 'confirmation' } });
    const res = makeRes();
    // Override mocked getOrder to return a different shape
    const { getOrder } = await import('./lib/order-store.js');
    getOrder.mockResolvedValueOnce({
      orderId: 'ord_test_456',
      status: 'paid',
      productSlug: 'cyber-mandat',
      billingPeriod: 'monthly',
      addOns: [],
    });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.order.productSlug).toBe('cyber-mandat');
    expect(res.body.order.productName).toBe('Cyber-Mandat Pro');
  });

  it('returns 401 when no token and no source', async () => {
    const req = makeReq({ query: { orderId: validOrder.orderId } });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when order does not exist (confirmation mode)', async () => {
    const req = makeReq({ query: { orderId: 'unknown', source: 'confirmation' } });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(404);
  });
});
