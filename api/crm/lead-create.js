/**
 * AidSec CRM Lead Creation Endpoint
 *
 * POST /api/crm/lead-create
 * Internal auth via X-AidSec-Internal-Secret header
 * Body: { email, name, company, source, score }
 * Returns: { success: true, airtableId: "..." }
 */

import { getEnvFirst } from '../lib/env.js';
import { createLead } from '../lib/airtable.js';

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-AidSec-Internal-Secret');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = requireInternalAuth(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }

  const body = req.body || {};
  const { email, name, company, source, score } = body;

  if (!email || !name) {
    return res.status(400).json({
      error: 'Pflichtfelder fehlen',
      required: ['email', 'name'],
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Ungueltige E-Mail-Adresse' });
  }

  try {
    const result = await createLead({ email, name, company, source, score });

    if (!result.success) {
      return res.status(502).json({ error: 'Lead-Erstellung fehlgeschlagen', details: result.error });
    }

    return res.status(200).json({ success: true, airtableId: result.airtableId });
  } catch (err) {
    console.error('[crm/lead-create] Error:', err.message);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
