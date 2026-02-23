import nodemailer from 'nodemailer';
import { createHash } from 'crypto';

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_REQUESTS = 8;
const rateMap = new Map();
const RATE_LIMIT_PREFIX = 'onboarding:rate';
const ALLOWED_ORIGINS = [
  'https://aidsec.ch',
  'https://www.aidsec.ch',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function getClientIp(req) {
  const header = req.headers['x-forwarded-for'];
  if (typeof header === 'string' && header.trim()) {
    return header.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const entries = rateMap.get(ip) || [];
  const recent = entries.filter((timestamp) => now - timestamp < RATE_WINDOW_MS);

  if (recent.length >= RATE_MAX_REQUESTS) {
    rateMap.set(ip, recent);
    return true;
  }

  recent.push(now);
  rateMap.set(ip, recent);
  return false;
}

function hashIdentifier(value) {
  return createHash('sha256').update(value || 'unknown').digest('hex').slice(0, 24);
}

function getRateLimitMode() {
  const mode = getEnvFirst(['ONBOARDING_RATE_LIMIT_MODE']).toLowerCase();
  return mode || 'memory';
}

function parseUpstashResult(data) {
  if (data && typeof data.result !== 'undefined') return Number(data.result);
  return Number.NaN;
}

async function isRateLimitedUpstash(ip) {
  const upstashUrl = getEnvFirst(['UPSTASH_REDIS_REST_URL']);
  const upstashToken = getEnvFirst(['UPSTASH_REDIS_REST_TOKEN']);

  if (!upstashUrl || !upstashToken) {
    return null;
  }

  const ttlSeconds = Math.ceil(RATE_WINDOW_MS / 1000);
  const bucket = Math.floor(Date.now() / RATE_WINDOW_MS);
  const key = `${RATE_LIMIT_PREFIX}:${hashIdentifier(ip)}:${bucket}`;
  const encodedKey = encodeURIComponent(key);

  const incrRes = await fetch(`${upstashUrl}/incr/${encodedKey}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${upstashToken}`,
    },
  });

  if (!incrRes.ok) {
    throw new Error('Upstash INCR failed');
  }

  const incrJson = await incrRes.json();
  const count = parseUpstashResult(incrJson);

  if (!Number.isFinite(count)) {
    throw new Error('Upstash INCR result invalid');
  }

  if (count === 1) {
    await fetch(`${upstashUrl}/expire/${encodedKey}/${ttlSeconds}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${upstashToken}`,
      },
    });
  }

  return count > RATE_MAX_REQUESTS;
}

async function isRateLimitedSafe(ip) {
  if (getRateLimitMode() === 'upstash') {
    try {
      const limited = await isRateLimitedUpstash(ip);
      if (limited !== null) return limited;
      console.warn('Rate limit mode upstash is enabled but Upstash credentials are missing; fallback to memory');
    } catch (error) {
      console.error('Upstash rate limit failed, fallback to memory', error);
    }
  }

  return isRateLimited(ip);
}

function trimValue(value) {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function getEnvFirst(names) {
  const env = process.env || {};

  for (let i = 0; i < names.length; i++) {
    const value = env[names[i]];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    const wanted = names[i].toLowerCase();
    const matchedKey = Object.keys(env).find((key) => key.toLowerCase() === wanted);
    if (matchedKey) {
      const matchedValue = env[matchedKey];
      if (typeof matchedValue === 'string' && matchedValue.trim()) {
        return matchedValue.trim();
      }
    }
  }

  return '';
}

function listVisibleSmtpEnvKeys() {
  return Object.keys(process.env || {}).filter((key) => {
    const k = key.toLowerCase();
    return (
      k.includes('smtp') ||
      k.includes('mail') ||
      k.includes('email_server') ||
      k.includes('onboarding_')
    );
  });
}

function normalizePayload(body) {
  const data = body && typeof body === 'object' ? body : {};
  return {
    packageSlug: trimValue(data.packageSlug),
    packageName: trimValue(data.packageName),
    packagePrice: trimValue(data.packagePrice),
    packagePeriod: trimValue(data.packagePeriod),
    websiteUrl: trimValue(data['website-url'] || data.websiteUrl),
    name: trimValue(data.name),
    company: trimValue(data.company),
    email: trimValue(data.email),
    phone: trimValue(data.phone),
    wpUser: trimValue(data['wp-user'] || data.wpUser),
    wpPass: trimValue(data['wp-pass'] || data.wpPass),
    accessOption: trimValue(data['access-option'] || data.accessOption),
    paymentMethod: trimValue(data['payment-method'] || data.paymentMethod),
    authCheck: trimValue(data['auth-check'] || data.authCheck),
    privacyCheck: trimValue(data['privacy-check'] || data.privacyCheck),
    accessCheck: trimValue(data['access-check'] || data.accessCheck),
    botField: trimValue(data['bot-field'] || data.botField),
    sourcePath: trimValue(data.sourcePath),
  };
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hasValue(value) {
  return value === 'true' || value === 'on' || value === '1' || value === 'yes';
}

function getAllowedOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin || typeof origin !== 'string') return '';

  const configured = getEnvFirst(['ONBOARDING_ALLOWED_ORIGINS']);
  const allowlist = configured
    ? configured
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : ALLOWED_ORIGINS;

  return allowlist.includes(origin) ? origin : '';
}

function buildSubject(payload) {
  const packageLabel = payload.packageName || payload.packageSlug || 'Onboarding-Auftrag';
  const customerName = payload.name || 'Unbekannt';
  return `Neuer Auftrag: ${packageLabel} von ${customerName}`;
}

function buildMailBody(payload, meta) {
  const payment = payload.paymentMethod || 'nicht angegeben';
  const accessLabel = payload.accessOption === 'a' ? 'Jetzt Zugangsdaten angegeben' : 'Später mitteilen';
  const hasWpCredentials = Boolean(payload.wpUser || payload.wpPass);
  const periodLine = payload.packagePeriod ? `\n- Intervall: ${payload.packagePeriod}` : '';

  return [
    'Neuer Auftrag über das AidSec Onboarding',
    '',
    'Paket',
    `- Slug: ${payload.packageSlug || '-'}`,
    `- Name: ${payload.packageName || '-'}`,
    `- Preis: ${payload.packagePrice || '-'}${periodLine}`,
    '',
    'Kundendaten',
    `- Name: ${payload.name || '-'}`,
    `- E-Mail: ${payload.email || '-'}`,
    `- Unternehmen: ${payload.company || '-'}`,
    `- Telefon: ${payload.phone || '-'}`,
    `- Website: ${payload.websiteUrl || '-'}`,
    '',
    'Auftragsdetails',
    `- Zahlungsart: ${payment}`,
    `- Zugangsoption: ${accessLabel}`,
    `- Zugangsdaten Status: ${hasWpCredentials ? 'übermittelt (nicht per E-Mail weitergeleitet)' : 'nicht übermittelt'}`,
    `- AGB/Berechtigung bestätigt: ${hasValue(payload.authCheck) ? 'Ja' : 'Nein'}`,
    `- Datenschutz bestätigt: ${hasValue(payload.privacyCheck) ? 'Ja' : 'Nein'}`,
    `- Access-Hinweis bestätigt: ${hasValue(payload.accessCheck) ? 'Ja' : 'Nein'}`,
    '',
    'Technische Daten',
    `- Quelle: ${payload.sourcePath || '-'}`,
    `- IP: ${meta.ip}`,
    `- User-Agent: ${meta.userAgent}`,
    `- Zeit (UTC): ${new Date().toISOString()}`,
  ].join('\n');
}

function getTransportConfig() {
  const host = getEnvFirst(['SMTP_HOST', 'SMTP_SERVER', 'EMAIL_SERVER_HOST']);
  const portRaw = getEnvFirst(['SMTP_PORT', 'EMAIL_SERVER_PORT']) || '587';
  const port = Number(portRaw);
  const user = getEnvFirst(['SMTP_USER', 'SMTP_USERNAME', 'EMAIL_SERVER_USER']);
  const pass = getEnvFirst(['SMTP_PASS', 'SMTP_PASSWORD', 'EMAIL_SERVER_PASSWORD']);

  const missing = [];
  if (!host) missing.push('SMTP_HOST');
  if (!user) missing.push('SMTP_USER');
  if (!pass) missing.push('SMTP_PASS');
  if (!Number.isFinite(port) || port <= 0) missing.push('SMTP_PORT');

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  return {
    ok: true,
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  };
}

export default async function handler(req, res) {
  const allowedOrigin = getAllowedOrigin(req);
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    if (req.headers?.origin && !allowedOrigin) {
      return res.status(403).json({ error: 'Origin not allowed' });
    }
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.headers?.origin && !allowedOrigin) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  const ip = getClientIp(req);
  if (await isRateLimitedSafe(ip)) {
    return res.status(429).json({ error: 'Zu viele Anfragen. Bitte spaeter erneut versuchen.' });
  }

  const payload = normalizePayload(req.body);

  if (payload.botField) {
    return res.status(200).json({ ok: true });
  }

  if (!payload.name || !payload.email || !payload.websiteUrl || !payload.paymentMethod) {
    return res.status(400).json({ error: 'Pflichtfelder fehlen.' });
  }

  if (!validateEmail(payload.email)) {
    return res.status(400).json({ error: 'Ungueltige E-Mail-Adresse.' });
  }

  if (!hasValue(payload.authCheck) || !hasValue(payload.privacyCheck) || !hasValue(payload.accessCheck)) {
    return res.status(400).json({ error: 'Bitte alle Pflichtbestaetigungen aktivieren.' });
  }

  const transportConfig = getTransportConfig();
  if (!transportConfig.ok) {
    const visible = listVisibleSmtpEnvKeys();
    console.error('SMTP configuration missing', {
      missing: transportConfig.missing,
      visibleKeys: visible,
    });
    return res.status(500).json({
      error: 'Serverseitige E-Mail-Konfiguration ist derzeit nicht verfügbar.',
    });
  }

  const toEmail = getEnvFirst(['ONBOARDING_TO_EMAIL', 'MAIL_TO']) || 'aid.destani@aidsec.ch';
  const fromEmail =
    getEnvFirst(['ONBOARDING_FROM_EMAIL', 'MAIL_FROM']) ||
    getEnvFirst(['SMTP_USER', 'SMTP_USERNAME', 'EMAIL_SERVER_USER']);
  const meta = {
    ip,
    userAgent: req.headers['user-agent'] || 'unknown',
  };

  try {
    const transporter = nodemailer.createTransport({
      host: transportConfig.host,
      port: transportConfig.port,
      secure: transportConfig.secure,
      auth: transportConfig.auth,
    });
    await transporter.sendMail({
      from: fromEmail,
      to: toEmail,
      replyTo: payload.email,
      subject: buildSubject(payload),
      text: buildMailBody(payload, meta),
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('onboarding-submit error:', error);
    return res.status(502).json({ error: 'E-Mail Versand fehlgeschlagen.' });
  }
}