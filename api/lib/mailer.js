import nodemailer from 'nodemailer';
import { getEnvFirst, isProduction } from './env.js';
import { generateMagicToken, signInternalAction } from './order-token.js';

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

function parseAddress(value, fallbackName = '') {
  const raw = String(value || '').trim();
  const match = raw.match(/^(.*?)<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^"|"$/g, '') || fallbackName,
      email: match[2].trim(),
    };
  }
  return { name: fallbackName, email: raw };
}

function emailProvider() {
  const provider = String(getEnvFirst(['EMAIL_PROVIDER']) || 'auto').trim().toLowerCase();
  if (['auto', 'brevo', 'smtp'].includes(provider)) return provider;
  throw new Error('EMAIL_PROVIDER must be one of: auto, brevo, smtp');
}

export async function sendTransactionalEmail(message) {
  const config = smtpConfig();
  const brevoApiKey = getEnvFirst(['BREVO_API_KEY']);
  const provider = emailProvider();

  if ((provider === 'auto' || provider === 'brevo') && brevoApiKey) {
    const sender = parseAddress(config.from, 'AidSec');
    const recipient = parseAddress(message.to);
    const bodyPayload = {
      sender,
      to: [recipient],
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text,
    };

    if (message.attachments && Array.isArray(message.attachments)) {
      bodyPayload.attachment = message.attachments.map((att) => {
        const base64Content = Buffer.isBuffer(att.content)
          ? att.content.toString('base64')
          : typeof att.content === 'string'
            ? Buffer.from(att.content).toString('base64')
            : att.content;
        return {
          name: att.filename,
          content: base64Content,
        };
      });
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'api-key': brevoApiKey,
      },
      body: JSON.stringify(bodyPayload),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(`Brevo email failed: ${payload.message || response.status}`);
    }

    const payload = await response.json().catch(() => ({}));
    return { sent: true, provider: 'brevo', messageId: payload.messageId || null };
  }

  if (provider === 'brevo') {
    if (isProduction()) throw new Error('BREVO_API_KEY is required when EMAIL_PROVIDER=brevo');
    return { simulated: true, message };
  }

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
    attachments: message.attachments || [],
  });
  return { sent: true, provider: 'smtp', messageId: result.messageId };
}

function customerName(order) {
  return order.customer?.name || 'Guten Tag';
}

// === Payment Confirmation ===

export function buildPaymentConfirmationEmail(order) {
  const baseUrl = getEnvFirst(['BASE_URL']) || 'https://aidsec.ch';
  const token = generateMagicToken(order.orderId, order.customer.email);
  const orderStatusUrl = `${baseUrl}/dashboard?order_id=${encodeURIComponent(order.orderId)}&token=${encodeURIComponent(token)}`;
  const proofCenterUrl = `${baseUrl}/proof-center.html?orderId=${encodeURIComponent(order.orderId)}&token=${encodeURIComponent(token)}`;

  return {
    to: order.customer.email,
    subject: `AidSec Auftrag bestätigt: ${order.orderId}`,
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
      'Freundliche Grüße',
      'AidSec',
    ].join('\n'),
  };
}

function buildPaymentConfirmationHtml(order, statusUrl, proofUrl) {
  return `
  <table cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
    <tr><td style="padding:40px 30px;background:#0b1d3a;color:#fff;text-align:center;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;font-size:24px;color:#c8a84c;">AidSec</h1>
      <p style="margin:8px 0 0;font-size:16px;">Auftrag bestätigt</p>
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
  const message = buildPaymentConfirmationEmail(order);
  return sendTransactionalEmail(message);
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
        <a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:#c8a84c;color:#fff;text-decoration:none;border-radius:4px;font-weight:600;">Proof Center öffnen</a>
      </p>
      <p style="margin:16px 0 0;font-size:13px;color:#64748b;">Dieser Link ist zeitlich begrenzt und nur für Ihren Auftrag gültig.</p>
    </td></tr>
    <tr><td style="padding:20px 30px;background:#f8fafc;text-align:center;font-size:12px;color:#94a3b8;border-radius:0 0 8px 8px;">
      Freundliche Grüße, AidSec
    </td></tr>
  </table>`,
    text: [
      `Hallo ${customerName(order)}`,
      '',
      'Hier ist Ihr sicherer Zugang zum AidSec Proof Center.',
      '',
      `Proof Center: ${portalUrl}`,
      '',
      'Dieser Link ist zeitlich begrenzt und nur für Ihren Auftrag gültig.',
      '',
      'Freundliche Grüße',
      'AidSec',
    ].join('\n'),
  };
}

export async function sendMagicLinkEmail(order) {
  const message = buildMagicLinkEmail(order);
  return sendTransactionalEmail(message);
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
      'Freundliche Grüße',
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
      <ol style="font-size:14px;color:#333;line-height:1.8;padding-left:20px;margin:0 0 12px;">
        <li><a href="${baseUrl}/assets/downloads/aidsec-security.zip">AidSec Security Plugin herunterladen</a></li>
        <li>WordPress-Admin &rarr; Plugins &rarr; Installieren &rarr; Plugin hochladen &rarr; ZIP auswaehlen &rarr; Aktivieren</li>
        <li>AidSec Security &rarr; Einstellungen &rarr; Lizenz-Schluessel <strong>${order.licenseId || '(siehe unten)'}</strong> eintragen und speichern</li>
        <li>Das Plugin setzt die Sicherheits-Header automatisch. Ergebnis pruefen:
          <a href="${baseUrl}/api/check-headers?url=${encodeURIComponent(order.website?.url || '')}">Header-Check</a></li>
      </ol>`;
  }
  if (productSlug === 'kanzlei-haertung') {
    return `
      <h3 style="color:#0b1d3a;margin:0 0 8px;">Kanzlei-Härtung — Einrichtungsanleitung</h3>
      <p style="font-size:14px;color:#333;line-height:1.6;">
        Die vollständige Website-Härtung wurde durchgeführt. Die Details finden Sie in Ihrem<br>
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
      Freundliche Grüße, AidSec
    </td></tr>
  </table>`;
}

export async function sendDeliveryEmail(order) {
  const message = buildDeliveryEmail(order);
  return sendTransactionalEmail(message);
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
      `Geprüft am: ${order.monitoring?.checkedAt ? new Date(order.monitoring.checkedAt).toLocaleDateString('de-CH') : 'N/A'}`,
      '',
      `Kundenportal: ${portalUrl}`,
      '',
      'Freundliche Grüße',
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
      Freundliche Grüße, AidSec
    </td></tr>
  </table>`,
  };
}

export async function sendReAuditEmail(order) {
  const message = buildReAuditEmail(order);
  return sendTransactionalEmail(message);
}

// === Interne Ops-Mails ===

function opsRecipient() {
  return getEnvFirst(['ONBOARDING_TO_EMAIL', 'MAIL_TO']) || 'aid.destani@aidsec.ch';
}

export async function sendOpsEmail(subject, lines = []) {
  const text = (Array.isArray(lines) ? lines : [String(lines)]).join('\n');
  return sendTransactionalEmail({
    to: opsRecipient(),
    subject: `[AidSec Ops] ${subject}`,
    text,
    html: `<pre style="font-family:monospace;font-size:13px;">${text.replace(/</g, '&lt;')}</pre>`,
  });
}

export async function sendOpsReviewEmail(order, workflow) {
  const baseUrl = getEnvFirst(['BASE_URL']) || 'https://aidsec.ch';
  const sig = signInternalAction(workflow.workflowId);
  const approveUrl = `${baseUrl}/api/internal/workflow-runner?action=approve&workflowId=${encodeURIComponent(workflow.workflowId)}&sig=${encodeURIComponent(sig)}`;

  return sendTransactionalEmail({
    to: opsRecipient(),
    subject: `[AidSec Ops] Haertungsfreigabe noetig: ${order.orderId}`,
    text: [
      `Auftrag ${order.orderId} (${order.productSlug}) wartet auf die Haertungsfreigabe.`,
      '',
      `Kunde: ${order.customer?.name || '-'} <${order.customer?.email || '-'}>`,
      `Firma: ${order.customer?.company || '-'}`,
      `Website: ${order.website?.url || '-'}`,
      `Baseline: Note ${order.results?.gradeBefore || order.monitoring?.grade || '?'} (Score ${order.results?.scoreBefore ?? order.monitoring?.score ?? '?'}/6)`,
      '',
      'Nach durchgefuehrter Haertung hier freigeben (loest Liefer-Mail + Monitoring aus):',
      approveUrl,
    ].join('\n'),
    html: `
  <table cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
    <tr><td style="padding:30px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;">
      <h2 style="margin:0 0 16px;color:#0b1d3a;">Haertungsfreigabe noetig</h2>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;border:1px solid #e2e8f0;border-radius:4px;">
        <tr><td style="padding:10px 14px;background:#f8fafc;font-size:13px;color:#64748b;width:120px;">Auftrag</td><td style="padding:10px 14px;font-size:14px;font-weight:600;">${order.orderId}</td></tr>
        <tr><td style="padding:10px 14px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Kunde</td><td style="padding:10px 14px;font-size:14px;border-top:1px solid #e2e8f0;">${order.customer?.name || '-'} &lt;${order.customer?.email || '-'}&gt;</td></tr>
        <tr><td style="padding:10px 14px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Website</td><td style="padding:10px 14px;font-size:14px;border-top:1px solid #e2e8f0;">${order.website?.url || '-'}</td></tr>
        <tr><td style="padding:10px 14px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Baseline</td><td style="padding:10px 14px;font-size:14px;border-top:1px solid #e2e8f0;">Note ${order.results?.gradeBefore || '?'} (Score ${order.results?.scoreBefore ?? '?'}/6)</td></tr>
      </table>
      <p style="font-size:14px;color:#555;">Nach durchgefuehrter Haertung freigeben — das loest Liefer-Mail und Monitoring aus:</p>
      <p style="margin:16px 0 0;">
        <a href="${approveUrl}" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:4px;font-weight:600;">Haertung freigeben</a>
      </p>
    </td></tr>
  </table>`,
  });
}

// === Dunning (Zahlung fehlgeschlagen) ===

export async function sendPaymentFailedEmail(order) {
  const baseUrl = getEnvFirst(['BASE_URL']) || 'https://aidsec.ch';
  return sendTransactionalEmail({
    to: order.customer.email,
    subject: `Zahlung fehlgeschlagen — AidSec Auftrag ${order.orderId}`,
    text: [
      `Hallo ${customerName(order)}`,
      '',
      `Die Abbuchung fuer Ihr AidSec Abo (Auftrag ${order.orderId}) ist fehlgeschlagen.`,
      'Bitte aktualisieren Sie Ihre Zahlungsmethode, damit Monitoring und Compliance-Nachweis aktiv bleiben.',
      '',
      `Bei Fragen erreichen Sie uns unter info@aidsec.ch oder ${baseUrl}.`,
      '',
      'Freundliche Grüße',
      'AidSec',
    ].join('\n'),
    html: `
  <table cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
    <tr><td style="padding:40px 30px;background:#0b1d3a;color:#fff;text-align:center;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;font-size:24px;color:#c8a84c;">AidSec</h1>
      <p style="margin:8px 0 0;font-size:16px;">Zahlung fehlgeschlagen</p>
    </td></tr>
    <tr><td style="padding:30px;background:#fff;">
      <p style="font-size:16px;color:#333;">Hallo ${customerName(order)},</p>
      <p style="font-size:15px;color:#555;line-height:1.6;">Die Abbuchung fuer Ihr AidSec Abo (Auftrag <strong>${order.orderId}</strong>) ist fehlgeschlagen. Bitte aktualisieren Sie Ihre Zahlungsmethode, damit Monitoring und Compliance-Nachweis aktiv bleiben.</p>
      <p style="font-size:13px;color:#64748b;">Bei Fragen erreichen Sie uns unter info@aidsec.ch.</p>
    </td></tr>
    <tr><td style="padding:20px 30px;background:#f8fafc;text-align:center;font-size:12px;color:#94a3b8;border-radius:0 0 8px 8px;">
      Freundliche Grüße, AidSec
    </td></tr>
  </table>`,
  });
}
