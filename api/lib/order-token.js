import crypto from 'crypto';
import { getEnvFirst, isProduction } from './env.js';

const TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60;
const DEMO_TOKEN_SECRET = 'demo-secret-for-testing-only';

function signPayload(payloadB64, secret) {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

function timingSafeStringEqual(a, b, encoding = 'base64url') {
  const aBuffer = Buffer.from(a || '', encoding);
  const bBuffer = Buffer.from(b || '', encoding);
  return aBuffer.length === bBuffer.length && crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function generateMagicToken(orderId, email, options = {}) {
  const secret = options.secret || getEnvFirst(['ORDER_TOKEN_SECRET']) || 'dev-secret-change-in-production';
  const expiry = options.expiry || Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;
  const payloadB64 = Buffer.from(JSON.stringify({ orderId, email, expiry })).toString('base64url');
  return `${payloadB64}.${signPayload(payloadB64, secret)}`;
}

export function verifyMagicToken(token, providedEmail = null, options = {}) {
  if (!token || typeof token !== 'string') return { valid: false, reason: 'Token fehlt' };

  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false, reason: 'Ungueltiges Token-Format' };

  const [payloadB64, providedSig] = parts;
  const secret = options.secret || getEnvFirst(['ORDER_TOKEN_SECRET']) || 'dev-secret-change-in-production';
  const expectedSig = signPayload(payloadB64, secret);

  if (!timingSafeStringEqual(providedSig, expectedSig)) {
    return { valid: false, reason: 'Ungueltige Signatur' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (_) {
    return { valid: false, reason: 'Token-Daten beschaedigt' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.expiry && payload.expiry < now) return { valid: false, reason: 'Token abgelaufen' };
  if (providedEmail && payload.email !== providedEmail) return { valid: false, reason: 'E-Mail stimmt nicht ueberein' };

  return { valid: true, orderId: payload.orderId, email: payload.email };
}

export function verifyDemoMagicToken(token, providedEmail = null, env = process.env || {}) {
  if (isProduction(env)) return { valid: false, reason: 'Demo-Token in Produktion deaktiviert' };
  return verifyMagicToken(token, providedEmail, { secret: DEMO_TOKEN_SECRET });
}
