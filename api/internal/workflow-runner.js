import { getEnvFirst, isProduction } from '../lib/env.js';
import { processDeliveryWorkflow, runDeliveryWorkflowBatch } from '../lib/delivery-workflow.js';
import { recordOrderEvent } from '../lib/order-store.js';
import { verifyInternalAction } from '../lib/order-token.js';
import { enqueueWorkflowJob, getWorkflow, updateWorkflow } from '../lib/workflow-store.js';

export const config = { maxDuration: 60 };

function isAuthorized(req) {
  if (!isProduction()) return true;
  const expected = getEnvFirst(['INTERNAL_WORKFLOW_SECRET', 'INTERNAL_API_SECRET']);
  const provided = req.headers?.['x-aidsec-internal-secret'];
  return Boolean(expected && provided === expected);
}

function approvalPage(title, message, ok) {
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>${title} — AidSec Ops</title></head>
<body style="font-family:Arial,sans-serif;background:#0b1d3a;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
  <div style="background:#fff;border-radius:8px;padding:40px;max-width:480px;text-align:center;">
    <h1 style="color:${ok ? '#16a34a' : '#dc2626'};font-size:22px;margin:0 0 12px;">${title}</h1>
    <p style="color:#555;font-size:15px;line-height:1.6;">${message}</p>
  </div>
</body></html>`;
}

/**
 * GET ?action=approve&workflowId=wf_…&sig=… — Freigabe-Link aus der Ops-Mail.
 * Die HMAC-Signatur (INTERNAL_API_SECRET) ersetzt den Header-Secret-Check,
 * damit die Freigabe per Klick aus dem Mail-Client funktioniert.
 */
async function handleApprove(req, res) {
  const { workflowId, sig } = req.query || {};
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!workflowId || !verifyInternalAction(workflowId, sig)) {
    return res.status(403).send(approvalPage('Freigabe abgelehnt', 'Ungueltiger oder abgelaufener Freigabe-Link.', false));
  }

  const workflow = await getWorkflow(workflowId);
  if (!workflow) {
    return res.status(404).send(approvalPage('Nicht gefunden', `Workflow ${workflowId} existiert nicht.`, false));
  }
  if (workflow.status === 'delivered') {
    return res.status(200).send(approvalPage('Bereits abgeschlossen', `Workflow ${workflowId} wurde bereits ausgeliefert.`, true));
  }

  await updateWorkflow(workflowId, { status: 'queued', approvalRequired: false, lastError: null });
  await recordOrderEvent(workflow.orderId, 'workflow.approved', { workflowId, via: 'ops_email_link' });
  await enqueueWorkflowJob(workflowId);

  let result = null;
  try {
    result = await processDeliveryWorkflow(workflowId);
  } catch (error) {
    console.error('[workflow-runner] Approve processing failed:', error);
  }

  const status = result?.status || 'queued';
  const delivered = status === 'delivered';
  return res
    .status(200)
    .send(
      approvalPage(
        delivered ? 'Freigabe erteilt' : 'Freigabe registriert',
        delivered
          ? `Auftrag ${workflow.orderId} wurde ausgeliefert: Liefer-Mail versendet, Monitoring aktiviert.`
          : `Workflow-Status: ${status}. Die restlichen Schritte laufen automatisch (Retry via Cron).`,
        true,
      ),
    );
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-AidSec-Internal-Secret');
    return res.status(204).end();
  }

  if (req.method === 'GET' && req.query?.action === 'approve') {
    return handleApprove(req, res);
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
