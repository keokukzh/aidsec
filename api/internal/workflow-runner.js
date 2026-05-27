import { getEnvFirst, isProduction } from '../lib/env.js';
import { runDeliveryWorkflowBatch } from '../lib/delivery-workflow.js';

function isAuthorized(req) {
  if (!isProduction()) return true;
  const expected = getEnvFirst(['INTERNAL_WORKFLOW_SECRET', 'INTERNAL_API_SECRET']);
  const provided = req.headers?.['x-aidsec-internal-secret'];
  return Boolean(expected && provided === expected);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-AidSec-Internal-Secret');
    return res.status(204).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const limit = Number.parseInt(req.body?.limit || '5', 10);
    const result = await runDeliveryWorkflowBatch({ limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 20) : 5 });
    return res.status(200).json(result);
  } catch (error) {
    console.error('[workflow-runner] Fatal error:', error);
    return res.status(500).json({ success: false, error: 'Workflow runner failed', message: error.message });
  }
}
