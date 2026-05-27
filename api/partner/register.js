/**
 * AidSec Partner Registration API
 *
 * POST /api/partner/register
 * Registers a new partner and sends notification email
 */

import { getEnvFirst } from '../lib/env.js';
import { sendTransactionalEmail } from '../lib/mailer.js';
import crypto from 'crypto';

function generatePartnerId() {
  return `partner_${crypto.randomBytes(6).toString('hex')}`;
}

function buildPartnerApplicationEmail(data) {
  const baseUrl = getEnvFirst(['BASE_URL']) || 'https://aidsec.ch';

  return {
    to: 'partner@aidsec.ch',
    subject: `Neue Partner-Anmeldung: ${data.name} (${data.partnerType})`,
    text: [
      `Neue Partner-Anmeldung`,
      '',
      `Name: ${data.name}`,
      `E-Mail: ${data.email}`,
      `Firma: ${data.company || '-'}`,
      `Website: ${data.website || '-'}`,
      `Art: ${data.partnerType}`,
      `Nachricht: ${data.message || '-'}`,
      '',
      `Partner-ID: ${data.partnerId}`,
      `Datum: ${new Date().toISOString()}`,
    ].join('\n'),
    html: `
    <table cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
      <tr><td style="padding:40px 30px;background:#0b1d3a;color:#fff;text-align:center;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:24px;color:#c8a84c;">AidSec</h1>
        <p style="margin:8px 0 0;font-size:16px;">Neue Partner-Anmeldung</p>
      </td></tr>
      <tr><td style="padding:30px;background:#fff;">
        <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;">
          <tr><td style="padding:10px 0;border-bottom:1px solid #eee;font-size:13px;color:#64748b;width:120px;">Name</td><td style="padding:10px 0;border-bottom:1px solid #eee;font-weight:600;">${data.name}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #eee;font-size:13px;color:#64748b;">E-Mail</td><td style="padding:10px 0;border-bottom:1px solid #eee;"><a href="mailto:${data.email}">${data.email}</a></td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #eee;font-size:13px;color:#64748b;">Firma</td><td style="padding:10px 0;border-bottom:1px solid #eee;">${data.company || '-'}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #eee;font-size:13px;color:#64748b;">Website</td><td style="padding:10px 0;border-bottom:1px solid #eee;">${data.website || '-'}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #eee;font-size:13px;color:#64748b;">Partnerschaft</td><td style="padding:10px 0;border-bottom:1px solid #eee;font-weight:600;">${data.partnerType}</td></tr>
        </table>
        ${data.message ? `<p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 20px;"><strong>Nachricht:</strong><br>${data.message}</p>` : ''}
        <p style="font-size:12px;color:#94a3b8;margin:0;">Partner-ID: ${data.partnerId} | Datum: ${new Date().toLocaleString('de-CH')}</p>
      </td></tr>
    </table>`,
  };
}

function buildPartnerConfirmationEmail(data) {
  return {
    to: data.email,
    subject: `Willkommen bei AidSec — Ihre Partner-Anmeldung`,
    text: [
      `Guten Tag ${data.name}`,
      '',
      'vielen Dank für Ihre Anmeldung zum AidSec Partner-Programm.',
      '',
      'Wir prüfen Ihre Anmeldung und melden uns innerhalb von 48 Stunden.',
      '',
      'Was Sie erwartet:',
      '- Persönlicher Partner-Link',
      '- Marketing-Material',
      '- Zugang zum Partner-Dashboard',
      '',
      'Freundliche Grüsse',
      'AidSec',
    ].join('\n'),
    html: `
    <table cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
      <tr><td style="padding:40px 30px;background:#0b1d3a;color:#fff;text-align:center;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:24px;color:#c8a84c;">AidSec</h1>
        <p style="margin:8px 0 0;font-size:16px;">Partner-Anmeldung</p>
      </td></tr>
      <tr><td style="padding:30px;background:#fff;">
        <p style="font-size:16px;color:#333;">Guten Tag ${data.name},</p>
        <p style="font-size:15px;color:#555;line-height:1.6;">vielen Dank für Ihre Anmeldung zum AidSec Partner-Programm.</p>
        <p style="font-size:15px;color:#555;line-height:1.6;">Wir prüfen Ihre Anmeldung und melden uns innerhalb von 48 Stunden mit Ihrem persönlichen Partner-Link.</p>
        <div style="background:#f8fafc;border-radius:8px;padding:20px;margin:20px 0;">
          <h3 style="margin:0 0 12px;font-size:1rem;color:#0b1d3a;">Was Sie erwartet:</h3>
          <ul style="margin:0;padding:0 0 0 20px;font-size:14px;color:#555;">
            <li>Persönlicher Partner-Link</li>
            <li>Marketing-Material (Flyer, E-Mail-Vorlagen)</li>
            <li>Zugang zum Partner-Dashboard</li>
            <li>15–25% Provision pro Empfehlung</li>
          </ul>
        </div>
        <p style="font-size:15px;color:#555;line-height:1.6;">Bei Fragen: partner@aidsec.ch</p>
      </td></tr>
      <tr><td style="padding:20px 30px;background:#f8fafc;text-align:center;font-size:12px;color:#94a3b8;border-radius:0 0 8px 8px;">
        Freundliche Grüsse, AidSec
      </td></tr>
    </table>`,
  };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', getEnvFirst(['ALLOWED_ORIGIN']) || 'https://aidsec.ch');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.body || {};

    if (!data.name || !data.email || !data.partnerType) {
      return res.status(400).json({
        error: 'Pflichtfelder fehlen',
        required: ['name', 'email', 'partnerType'],
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
    }

    const validTypes = ['anwalt', 'treuhand', 'berater', 'it', 'marketing', 'other'];
    if (!validTypes.includes(data.partnerType)) {
      return res.status(400).json({
        error: 'Ungültige Partner-Art',
        validTypes,
      });
    }

    const partnerData = {
      partnerId: generatePartnerId(),
      name: String(data.name).trim(),
      email: String(data.email).trim().toLowerCase(),
      company: String(data.company || '').trim(),
      website: String(data.website || '').trim(),
      partnerType: data.partnerType,
      message: String(data.message || '').trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    // Send notification to AidSec
    try {
      const notification = buildPartnerApplicationEmail(partnerData);
      await sendTransactionalEmail(notification);
    } catch (e) {
      console.error('[partner] Failed to send notification:', e.message);
    }

    // Send confirmation to partner
    try {
      const confirmation = buildPartnerConfirmationEmail(partnerData);
      await sendTransactionalEmail(confirmation);
    } catch (e) {
      console.error('[partner] Failed to send confirmation:', e.message);
    }

    return res.status(201).json({
      success: true,
      partnerId: partnerData.partnerId,
      message: 'Anmeldung erfolgreich. Bestätigung per E-Mail gesendet.',
    });
  } catch (error) {
    console.error('[partner] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}