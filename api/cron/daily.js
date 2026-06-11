/**
 * AidSec Daily Cron Dispatcher
 *
 * Vercel Hobby erlaubt nur wenige Cron-Jobs — dieser eine taegliche Einstieg
 * verarbeitet immer die Delivery-Workflow-Queue (Retry-Fallback zum Webhook)
 * und triggert an den Stichtagen die monatlichen Jobs:
 *   - 1. des Monats: /api/cron/monitoring
 *   - 15. des Monats: /api/cron/reaudit
 */

import { runDeliveryWorkflowBatch } from '../lib/delivery-workflow.js';
import { getEnvFirst } from '../lib/env.js';

export const config = { maxDuration: 300 };

async function triggerSibling(path) {
  const baseUrl = getEnvFirst(['BASE_URL']) || 'https://aidsec.ch';
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET || ''}` },
    });
    const payload = await response.json().catch(() => ({}));
    return { path, status: response.status, ok: response.ok, payload };
  } catch (error) {
    return { path, ok: false, error: error.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers?.authorization;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const dayOfMonth = new Date().getUTCDate();
  const result = { success: true, dayOfMonth, workflows: null, monitoring: null, reaudit: null };

  try {
    result.workflows = await runDeliveryWorkflowBatch({ limit: 10 });
  } catch (error) {
    console.error('[cron-daily] Workflow batch failed:', error);
    result.success = false;
    result.workflows = { error: error.message };
  }

  if (dayOfMonth === 1) result.monitoring = await triggerSibling('/api/cron/monitoring');
  if (dayOfMonth === 15) result.reaudit = await triggerSibling('/api/cron/reaudit');

  return res.status(200).json(result);
}
