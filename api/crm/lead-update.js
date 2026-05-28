/**
 * AidSec CRM Lead Update Endpoint
 *
 * PATCH /api/crm/lead-update
 * Internal auth via X-AidSec-Internal-Secret header
 * Body: { email, ...updates }
 * Returns: { success: true }
 */

import { getEnvFirst } from '../lib/env.js';
import { updateLead } from '../lib/airtable.js';

function requireInternalAuth(req) {
  const secret = getEnvFirst(['AIDSEC_INTERNAL_SECRET', 'INTERNAL_API_SECRET']);
  if (!secret) {
    return { valid: false, error: 'Internal auth not configured' };
  }
  const token = req.headers?.['x-aidsec-internal-secret'];
  if (!token || token !== secret) {
    return { valid: false, error: 'Unauthorized' };
  }
  return { valid: true };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', getEnvFirst(['ALLOWED_ORIGIN']) || 'https://aidsec.ch');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-AidSec-Internal-Secret');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = requireInternalAuth(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }

  const body = req.body || {};
  const { email, ...updates } = body;

  if (!email) {
    return res.status(400).json({ error: 'E-Mail ist erforderlich' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Ungueltige E-Mail-Adresse' });
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Keine Updates angegeben' });
  }

  try {
    const result = await updateLead(email, updates);

    if (!result.success) {
      if (result.error === 'Lead not found') {
        return res.status(404).json({ error: 'Lead nicht gefunden' });
      }
      return res.status(502).json({ error: 'Lead-Update fehlgeschlagen', details: result.error });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[crm/lead-update] Error:', err.message);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
