import nodemailer from 'nodemailer';
import { getEnvFirst, isProduction } from './env.js';
import { generateMagicToken } from './order-token.js';

function smtpConfig() {
  return {
    host: getEnvFirst(['SMTP_HOST']),
    port: Number.parseInt(getEnvFirst(['SMTP_PORT']) || '587', 10),
    secure: getEnvFirst(['SMTP_SECURE']) === 'true',
    user: getEnvFirst(['SMTP_USER']),
    pass: getEnvFirst(['SMTP_PASS']),
    from: getEnvFirst(['ONBOARDING_FROM_EMAIL', 'EMAIL_FROM']) || 'AidSec <info@aidsec.ch>',
  };
}

function customerName(order) {
  return order.customer?.name || 'Guten Tag';
}

// === Payment Confirmation ===

export function buildPaymentConfirmationEmail(order) {
  const baseUrl = getEnvFirst(['BASE_URL']) || 'https://aidsec.ch';
  const token = generateMagicToken(order.orderId, order.customer.email);
  const orderStatusUrl = `${baseUrl}/auftrag/${order.orderId}?token=${token}`;
  const proofCenterUrl = `${baseUrl}/proof-center.html?orderId=${encodeURIComponent(order.orderId)}&token=${encodeURIComponent(token)}`;

  return {
    to: order.customer.email,
    subject: `AidSec Auftrag bestaetigt: ${order.orderId}`,
    html: buildPaymentConfirmationHtml(order, orderStatusUrl, proofCenterUrl),
    text: [
      `Hallo ${customerName(order)}`,
      '',
      'Ihre Zahlung ist eingegangen. Der AidSec Auftrag ist jetzt aktiv.',
      '',
      `Auftrag: ${order.orderId}`,
      `Website: ${order.website?.url || '-'}`,
      `Paket: ${order.package || order.productSlug}`,
      '',
      `Status: ${orderStatusUrl}`,
      `Proof Center: ${proofCenterUrl}`,
      '',
      'Freundliche Gruesse',
      'AidSec',
    ].join('\n'),
  };
}

function buildPaymentConfirmationHtml(order, statusUrl, proofUrl) {
  return `
  <table cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
    <tr><td style="padding:40px 30px;background:#0b1d3a;color:#fff;text-align:center;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;font-size:24px;color:#c8a84c;">AidSec</h1>
      <p style="margin:8px 0 0;font-size:16px;">Auftrag bestaetigt</p>
    </td></tr>
    <tr><td style="padding:30px;background:#fff;">
      <p style="font-size:16px;color:#333;">Hallo ${customerName(order)},</p>
      <p style="font-size:15px;color:#555;line-height:1.6;">Ihre Zahlung ist eingegangen. Der AidSec Auftrag ist jetzt aktiv.</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:4px;">
        <tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;width:140px;">Auftrag</td><td style="padding:12px 16px;font-size:14px;font-weight:600;">${order.orderId}</td></tr>
        <tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Website</td><td style="padding:12px 16px;font-size:14px;border-top:1px solid #e2e8f0;">${order.website?.url || '-'}</td></tr>
        <tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Paket</td><td style="padding:12px 16px;font-size:14px;border-top:1px solid #e2e8f0;">${order.package || order.productSlug}</td></tr>
      </table>
      <p style="margin:24px 0 0;">
        <a href="${statusUrl}" style="display:inline-block;padding:12px 24px;background:#c8a84c;color:#fff;text-decoration:none;border-radius:4px;font-weight:600;">Auftragsstatus ansehen</a>
      </p>
      <p style="margin:12px 0 0;font-size:13px;color:#64748b;">
        <a href="${proofUrl}" style="color:#0b1d3a;">Proof Center (Kundenportal)</a>
      </p>
    </td></tr>
    <tr><td style="padding:20px 30px;background:#f8fafc;text-align:center;font-size:12px;color:#94a3b8;border-radius:0 0 8px 8px;">
      Freunliche Gruesse, AidSec
    </td></tr>
  </table>`;
}

export async function sendPaymentConfirmationEmail(order) {
  const config = smtpConfig();
  const message = buildPaymentConfirmationEmail(order);

  if (!config.host || !config.user || !config.pass) {
    if (isProduction()) throw new Error('SMTP is not configured');
    return { simulated: true, message };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });

  const result = await transporter.sendMail({
    from: config.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  return { sent: true, messageId: result.messageId };
}

// === Magic Link Email ===

export function buildMagicLinkEmail(order) {
  const baseUrl = getEnvFirst(['BASE_URL']) || 'https://aidsec.ch';
  const token = generateMagicToken(order.orderId, order.customer.email);
  const portalUrl = `${baseUrl}/proof-center.html?orderId=${encodeURIComponent(order.orderId)}&token=${encodeURIComponent(token)}`;

  return {
    to: order.customer.email,
    subject: `Ihr AidSec Proof-Center-Zugang: ${order.orderId}`,
    html: `
  <table cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
    <tr><td style="padding:40px 30px;background:#0b1d3a;color:#fff;text-align:center;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;font-size:24px;color:#c8a84c;">AidSec</h1>
      <p style="margin:8px 0 0;font-size:16px;">Proof-Center-Zugang</p>
    </td></tr>
    <tr><td style="padding:30px;background:#fff;">
      <p style="font-size:16px;color:#333;">Hallo ${customerName(order)},</p>
      <p style="font-size:15px;color:#555;line-height:1.6;">Hier ist Ihr sicherer Zugang zum AidSec Proof Center.</p>
      <p style="margin:24px 0 0;">
        <a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:#c8a84c;color:#fff;text-decoration:none;border-radius:4px;font-weight:600;">Proof Center oeffnen</a>
      </p>
      <p style="margin:16px 0 0;font-size:13px;color:#64748b;">Dieser Link ist zeitlich begrenzt und nur fuer Ihren Auftrag gueltig.</p>
    </td></tr>
    <tr><td style="padding:20px 30px;background:#f8fafc;text-align:center;font-size:12px;color:#94a3b8;border-radius:0 0 8px 8px;">
      Freundliche Gruesse, AidSec
    </td></tr>
  </table>`,
    text: [
      `Hallo ${customerName(order)}`,
      '',
      'Hier ist Ihr sicherer Zugang zum AidSec Proof Center.',
      '',
      `Proof Center: ${portalUrl}`,
      '',
      'Dieser Link ist zeitlich begrenzt und nur fuer Ihren Auftrag gueltig.',
      '',
      'Freundliche Gruesse',
      'AidSec',
    ].join('\n'),
  };
}

export async function sendMagicLinkEmail(order) {
  const config = smtpConfig();
  const message = buildMagicLinkEmail(order);

  if (!config.host || !config.user || !config.pass) {
    if (isProduction()) throw new Error('SMTP is not configured');
    return { simulated: true, message };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });

  const result = await transporter.sendMail({
    from: config.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  return { sent: true, messageId: result.messageId };
}

// === Delivery Email ===

export function buildDeliveryEmail(order) {
  const baseUrl = getEnvFirst(['BASE_URL']) || 'https://aidsec.ch';
  const token = generateMagicToken(order.orderId, order.customer.email);
  const portalUrl = `${baseUrl}/proof-center.html?orderId=${encodeURIComponent(order.orderId)}&token=${encodeURIComponent(token)}`;

  const productInstructions = getProductInstructions(order, baseUrl);

  return {
    to: order.customer.email,
    subject: `Ihre ${order.package} — jetzt in Betrieb nehmen`,
    text: [
      `Hallo ${customerName(order)}`,
      '',
      `Ihre ${order.package} ist bereit. Hier ist Ihre Einrichtungsanleitung:`,
      '',
      productInstructions,
      '',
      `Proof Center: ${portalUrl}`,
      '',
      'Freundliche Gruesse',
      'AidSec',
    ].join('\n'),
    html: buildDeliveryHtml(order, productInstructions, portalUrl),
  };
}

function getProductInstructions(order, baseUrl) {
  const productSlug = order.productSlug;
  if (productSlug === 'rapid-header-fix') {
    return `
      <h3 style="color:#0b1d3a;margin:0 0 8px;">Rapid Header Fix — Schnelleinstieg</h3>
      <p style="font-size:14px;color:#333;line-height:1.6;">
        Die Sicherheits-Header wurden fuer Ihre Website vorbereitet. Bitte pruefen Sie das Ergebnis<br>
        im <a href="${baseUrl}/api/check-headers?url=${encodeURIComponent(order.website?.url || '')}">Header-Check</a>.
      </p>`;
  }
  if (productSlug === 'kanzlei-haertung') {
    return `
      <h3 style="color:#0b1d3a;margin:0 0 8px;">Kanzlei-Haertung — Einrichtungsanleitung</h3>
      <p style="font-size:14px;color:#333;line-height:1.6;">
        Die vollständige Website-Haertung wurde durchgefuehrt. Die Details finden Sie in Ihrem<br>
        <a href="${baseUrl}/proof-center.html">Proof Center</a>.
      </p>`;
  }
  if (productSlug === 'cyber-mandat') {
    return `
      <h3 style="color:#0b1d3a;margin:0 0 8px;">Cyber-Mandat Pro — Aktivierung</h3>
      <p style="font-size:14px;color:#333;line-height:1.6;">
        Ihr Cyber-Mandat ist aktiv. Monatliches Monitoring, DMARC-Audit und Incident-Response<br>
        sind ab sofort in Betrieb. Zugang zum Kundenportal:
      </p>`;
  }
  return '';
}

function buildDeliveryHtml(order, instructions, portalUrl) {
  return `
  <table cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
    <tr><td style="padding:40px 30px;background:#0b1d3a;color:#fff;text-align:center;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;font-size:24px;color:#c8a84c;">AidSec</h1>
      <p style="margin:8px 0 0;font-size:16px;">Ihr Paket: ${order.package}</p>
    </td></tr>
    <tr><td style="padding:30px;background:#fff;">
      <p style="font-size:16px;color:#333;">Hallo ${customerName(order)},</p>
      <p style="font-size:15px;color:#555;line-height:1.6;">Ihre ${order.package} ist bereit. Hier ist Ihre Einrichtungsanleitung:</p>
      ${instructions}
      <table cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:4px;">
        <tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;width:140px;">Auftrag</td><td style="padding:12px 16px;font-size:14px;font-weight:600;">${order.orderId}</td></tr>
        <tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Lizenz</td><td style="padding:12px 16px;font-size:14px;border-top:1px solid #e2e8f0;">${order.licenseId || '-'}</td></tr>
        <tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Status</td><td style="padding:12px 16px;font-size:14px;border-top:1px solid #e2e8f0;">Aktiv</td></tr>
      </table>
      <p style="margin:24px 0 0;">
        <a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:#c8a84c;color:#fff;text-decoration:none;border-radius:4px;font-weight:600;">Kundenportal oeffnen</a>
      </p>
    </td></tr>
    <tr><td style="padding:20px 30px;background:#f8fafc;text-align:center;font-size:12px;color:#94a3b8;border-radius:0 0 8px 8px;">
      Freundliche Gruesse, AidSec
    </td></tr>
  </table>`;
}

export async function sendDeliveryEmail(order) {
  const config = smtpConfig();
  const message = buildDeliveryEmail(order);

  if (!config.host || !config.user || !config.pass) {
    if (isProduction()) throw new Error('SMTP is not configured');
    return { simulated: true, message };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });

  const result = await transporter.sendMail({
    from: config.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  return { sent: true, messageId: result.messageId };
}

// === Re-Audit Email ===

export function buildReAuditEmail(order) {
  const baseUrl = getEnvFirst(['BASE_URL']) || 'https://aidsec.ch';
  const token = generateMagicToken(order.orderId, order.customer.email);
  const portalUrl = `${baseUrl}/proof-center.html?orderId=${encodeURIComponent(order.orderId)}&token=${encodeURIComponent(token)}`;

  return {
    to: order.customer.email,
    subject: `Re-Audit fuer ${order.package} — ${order.website?.url || 'Ihre Website'}`,
    text: [
      `Hallo ${customerName(order)}`,
      '',
      `Ihr monatliches Re-Audit fuer "${order.package}" ist abgeschlossen.`,
      '',
      `Website: ${order.website?.url || '-'}`,
      `Note: ${order.monitoring?.grade || 'N/A'}`,
      `Geprueft am: ${order.monitoring?.checkedAt ? new Date(order.monitoring.checkedAt).toLocaleDateString('de-CH') : 'N/A'}`,
      '',
      `Kundenportal: ${portalUrl}`,
      '',
      'Freundliche Gruesse',
      'AidSec',
    ].join('\n'),
    html: `
  <table cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
    <tr><td style="padding:40px 30px;background:#0b1d3a;color:#fff;text-align:center;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;font-size:24px;color:#c8a84c;">AidSec</h1>
      <p style="margin:8px 0 0;font-size:16px;">Re-Audit abgeschlossen</p>
    </td></tr>
    <tr><td style="padding:30px;background:#fff;">
      <p style="font-size:16px;color:#333;">Hallo ${customerName(order)},</p>
      <p style="font-size:15px;color:#555;line-height:1.6;">Ihr monatliches Re-Audit fuer "${order.package}" ist abgeschlossen.</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:4px;">
        <tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;width:140px;">Website</td><td style="padding:12px 16px;font-size:14px;">${order.website?.url || '-'}</td></tr>
        <tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Note</td><td style="padding:12px 16px;font-size:14px;font-weight:700;color:#${order.monitoring?.grade === 'A' ? '16a34a' : order.monitoring?.grade === 'F' ? 'dc2626' : 'c8a84c'};">${order.monitoring?.grade || 'N/A'}</td></tr>
        <tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Geprueft am</td><td style="padding:12px 16px;font-size:14px;border-top:1px solid #e2e8f0;">${order.monitoring?.checkedAt ? new Date(order.monitoring.checkedAt).toLocaleDateString('de-CH') : 'N/A'}</td></tr>
      </table>
      <p style="margin:24px 0 0;">
        <a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:#c8a84c;color:#fff;text-decoration:none;border-radius:4px;font-weight:600;">Details im Kundenportal</a>
      </p>
    </td></tr>
    <tr><td style="padding:20px 30px;background:#f8fafc;text-align:center;font-size:12px;color:#94a3b8;border-radius:0 0 8px 8px;">
      Freundliche Gruesse, AidSec
    </td></tr>
  </table>`,
  };
}

export async function sendReAuditEmail(order) {
  const config = smtpConfig();
  const message = buildReAuditEmail(order);

  if (!config.host || !config.user || !config.pass) {
    if (isProduction()) throw new Error('SMTP is not configured');
    return { simulated: true, message };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });

  const result = await transporter.sendMail({
    from: config.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  return { sent: true, messageId: result.messageId };
}
