import { describe, expect, it, vi } from 'vitest';

// Mocks for env variables
vi.mock('./lib/env.js', () => ({
  getEnvFirst: vi.fn((keys) => {
    if (keys.includes('STRIPE_SECRET_KEY')) return 'sk_test_mock';
    if (keys.includes('BASE_URL')) return 'https://aidsec.test';
    return '';
  }),
  isProduction: vi.fn(() => false),
}));

// Mock fetch for Stripe Customer Portal API
const globalFetch = global.fetch;

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function mockReq({ method = 'GET', query = {}, body = null, headers = {} } = {}) {
  return { method, query, body, headers };
}

describe('WordPress Plugin Update API', () => {
  it('returns plugin update metadata in WordPress-compatible format', async () => {
    const handler = (await import('./plugin/update.js')).default;
    const req = mockReq({ method: 'GET' });
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.slug).toBe('aidsec-security');
    expect(res.body.version).toBe('2.0.0');
    expect(res.body.download_url).toBe('https://aidsec.ch/assets/downloads/aidsec-security.zip');
    expect(res.body.sections.description).toBeDefined();
    expect(res.body.sections.changelog).toBeDefined();
  });

  it('rejects POST requests with 405', async () => {
    const handler = (await import('./plugin/update.js')).default;
    const req = mockReq({ method: 'POST' });
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(405);
  });
});

describe('Stripe Billing Portal Helper', () => {
  it('calls Stripe API and returns session URL', async () => {
    const { createStripePortalSession } = await import('./lib/stripe-portal.js');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'pts_test', url: 'https://billing.stripe.com/p/session/test' }),
    });

    const session = await createStripePortalSession({
      stripeCustomerId: 'cus_test_123',
      returnUrl: 'https://aidsec.test/dashboard',
    });

    expect(session.id).toBe('pts_test');
    expect(session.url).toBe('https://billing.stripe.com/p/session/test');
    expect(global.fetch).toHaveBeenCalled();

    global.fetch = globalFetch;
  });
});

describe('Reputation Monitoring', () => {
  it('resolves hostname and returns clean state in checkDomainReputation', async () => {
    const { checkDomainReputation } = await import('./lib/reputation.js');

    const reputation = await checkDomainReputation('https://aidsec.ch');
    
    expect(reputation.hostname).toBe('aidsec.ch');
    expect(reputation.isClean).toBe(true);
    expect(reputation.safeBrowsing.safe).toBe(true);
  });
});

describe('PDF Report Generator Fallback', () => {
  it('generates a fallback PDF buffer even if Puppeteer is not fully loaded', async () => {
    const { generatePdfBufferForOrder } = await import('./lib/pdf-generator.js');

    const order = {
      orderId: 'ord_test_pdf',
      customer: { name: 'Muster', email: 'test@example.ch' },
      website: { url: 'https://example.ch' },
      results: { gradeBefore: 'F', gradeAfter: 'A', scoreBefore: 0, scoreAfter: 6 }
    };

    const pdfBuffer = await generatePdfBufferForOrder(order);

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.toString('utf8')).toContain('%PDF-1.4');
  });
});
