import nodemailer from 'nodemailer';

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_REQUESTS = 8;
const rateMap = new Map();

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

function trimValue(value) {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return '';
  return String(value).trim();
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

function buildSubject(payload) {
  const packageLabel = payload.packageName || payload.packageSlug || 'Onboarding-Auftrag';
  const customerName = payload.name || 'Unbekannt';
  return `Neuer Auftrag: ${packageLabel} von ${customerName}`;
}

function buildMailBody(payload, meta) {
  const payment = payload.paymentMethod || 'nicht angegeben';
  const accessLabel = payload.accessOption === 'a' ? 'Jetzt Zugangsdaten angegeben' : 'Später mitteilen';
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
    `- WP Benutzer: ${payload.wpUser || '-'}`,
    `- WP Passwort: ${payload.wpPass || '-'}`,
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
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return {
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
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
  if (!transportConfig) {
    return res.status(500).json({ error: 'SMTP ist nicht konfiguriert.' });
  }

  const toEmail = process.env.ONBOARDING_TO_EMAIL || 'aid.destani@aidsec.ch';
  const fromEmail = process.env.ONBOARDING_FROM_EMAIL || process.env.SMTP_USER;
  const meta = {
    ip,
    userAgent: req.headers['user-agent'] || 'unknown',
  };

  try {
    const transporter = nodemailer.createTransport(transportConfig);
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