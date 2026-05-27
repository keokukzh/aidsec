import { runDeliveryWorkflowBatch } from '../lib/delivery-workflow.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers?.authorization;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    if (req.method === 'GET' && process.env.NODE_ENV !== 'production') {
      console.log('[workflow-runner-cron] DEV mode: skipping auth check');
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const result = await runDeliveryWorkflowBatch({ limit: 10 });
    return res.status(200).json(result);
  } catch (error) {
    console.error('[workflow-runner-cron] Fatal error:', error);
    return res.status(500).json({ success: false, error: 'Workflow runner failed', message: error.message });
  }
}
