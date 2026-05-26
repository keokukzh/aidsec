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

export function buildPaymentConfirmationEmail(order) {
  const baseUrl = getEnvFirst(['BASE_URL']) || 'https://aidsec.ch';
  const token = generateMagicToken(order.orderId, order.customer.email);
  const orderStatusUrl = `${baseUrl}/auftrag/${order.orderId}?token=${token}`;
  const proofCenterUrl = `${baseUrl}/proof-center.html?orderId=${encodeURIComponent(order.orderId)}&token=${encodeURIComponent(token)}`;

  return {
    to: order.customer.email,
    subject: `AidSec Auftrag bestaetigt: ${order.orderId}`,
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
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  const result = await transporter.sendMail({
    from: config.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
  return { sent: true, messageId: result.messageId };
}
