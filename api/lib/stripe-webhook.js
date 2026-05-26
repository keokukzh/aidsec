import crypto from 'crypto';

export function getRawBody(req) {
  if (typeof req.rawBody === 'string' || Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) return req.body;
  return JSON.stringify(req.body || {});
}

export function verifyStripeSignature(rawBody, signatureHeader, webhookSecret, toleranceSeconds = 300) {
  if (!signatureHeader || !webhookSecret) return { valid: false, reason: 'Stripe signature configuration missing' };

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((item) => {
      const [key, value] = item.split('=');
      return [key, value];
    }),
  );
  const timestamp = Number.parseInt(parts.t || '', 10);
  const providedSig = parts.v1;

  if (!Number.isFinite(timestamp) || !providedSig) {
    return { valid: false, reason: 'Invalid Stripe signature header' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return { valid: false, reason: 'Stripe signature timestamp outside tolerance' };
  }

  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  const expectedSig = crypto.createHmac('sha256', webhookSecret).update(`${timestamp}.${payload}`).digest('hex');
  const provided = Buffer.from(providedSig, 'hex');
  const expected = Buffer.from(expectedSig, 'hex');

  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { valid: false, reason: 'Invalid Stripe signature' };
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch (_) {
    return { valid: false, reason: 'Invalid Stripe JSON payload' };
  }

  return { valid: true, event };
}
