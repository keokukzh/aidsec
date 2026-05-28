import { sendDeliveryEmail, sendMagicLinkEmail, sendPaymentConfirmationEmail } from './mailer.js';
import { getObjectStorageConfig } from './signed-storage-url.js';
import {
  createLicenseForOrder,
  createOnboardingTaskForOrder,
  createReportPlaceholderForOrder,
  getOrder,
  listOrderEvents,
  recordOrderEvent,
  updateOrder,
  upsertCustomerForOrder,
} from './order-store.js';
import {
  acquireWorkflowLock,
  claimReadyWorkflowJobs,
  enqueueWorkflowJob,
  getWorkflow,
  hasWorkflowStepCompleted,
  markWorkflowStepCompleted,
  releaseWorkflowLock,
  updateWorkflow,
} from './workflow-store.js';

const MAX_ATTEMPTS = 3;

const PRODUCT_STEPS = {
  'rapid-header-fix': [
    'intake',
    'license',
    'baseline_audit',
    'delivery_report',
    'payment_email',
    'magic_link_email',
    'delivery_email',
    'activate_monitoring',
    'complete',
  ],
  'cyber-mandat': [
    'intake',
    'license',
    'baseline_audit',
    'delivery_report',
    'payment_email',
    'magic_link_email',
    'delivery_email',
    'activate_monitoring',
    'complete',
  ],
  'kanzlei-haertung': [
    'intake',
    'license',
    'baseline_audit',
    'delivery_report',
    'payment_email',
    'magic_link_email',
    'ops_review',
  ],
};

function stepsForProduct(productSlug) {
  return PRODUCT_STEPS[productSlug] || PRODUCT_STEPS['kanzlei-haertung'];
}

function scoreToGrade(score) {
  const grades = ['F', 'F', 'E', 'D', 'C', 'B', 'A'];
  return grades[Math.max(0, Math.min(score, grades.length - 1))];
}

function baselineScoreForOrder(order) {
  const url = String(order.website?.url || '');
  if (/https:\/\//i.test(url)) return 4;
  return 2;
}

async function orderHasEvent(orderId, eventType) {
  const events = await listOrderEvents(orderId);
  return events.some((event) => event.type === eventType);
}

async function updateOrderWorkflowState(orderId, state) {
  return updateOrder(orderId, {
    workflowStatus: state.workflowStatus,
    deliveryStatus: state.deliveryStatus,
    nextAction: state.nextAction,
    reportReadiness: state.reportReadiness,
  });
}

async function runIntake(order, workflow) {
  if (!order.customer?.email) throw new Error('Customer email is required for delivery workflow');
  if (!order.website?.url) throw new Error('Website URL is required for delivery workflow');
  await updateWorkflow(workflow.workflowId, { status: 'running', currentStep: 'intake', lastError: null });
  await updateOrderWorkflowState(order.orderId, {
    workflowStatus: 'running',
    deliveryStatus: 'analysis_running',
    nextAction: 'Automatische Analyse laeuft',
    reportReadiness: order.reportReadiness || 'pending',
  });
  await recordOrderEvent(order.orderId, 'workflow.intake.completed', {
    workflowId: workflow.workflowId,
    productSlug: order.productSlug,
  });
}

async function runLicense(order) {
  if (!order.licenseId) {
    await createLicenseForOrder(order.orderId);
  }
}

async function runBaselineAudit(order, workflow) {
  const score = baselineScoreForOrder(order);
  const grade = scoreToGrade(score);
  await updateOrder(order.orderId, {
    results: {
      ...(order.results || {}),
      scoreBefore: order.results?.scoreBefore ?? score,
      gradeBefore: order.results?.gradeBefore || grade,
    },
    monitoring: {
      url: order.website?.url || null,
      score,
      grade,
      checkedAt: new Date().toISOString(),
      source: 'delivery_workflow_baseline',
    },
  });
  await recordOrderEvent(order.orderId, 'workflow.audit.completed', {
    workflowId: workflow.workflowId,
    websiteUrl: order.website?.url || null,
    score,
    grade,
  });
}

async function runDeliveryReport(order, workflow) {
  const currentOrder = await getOrder(order.orderId);
  const createdAt = new Date().toISOString();
  const reportKey = `reports/orders/${order.orderId}-delivery.json`;
  let storedReport = false;

  if (getObjectStorageConfig()) {
    const { storage } = await import('../cron/storage.js');
    await storage.putJson(reportKey, {
      type: 'delivery_report',
      orderId: order.orderId,
      workflowId: workflow.workflowId,
      productSlug: order.productSlug,
      websiteUrl: order.website?.url || null,
      status: 'ready',
      createdAt,
    });
    storedReport = true;
  }

  const existingReports = Array.isArray(currentOrder?.reports) ? currentOrder.reports : [];
  const existing = existingReports.find((report) => report.type === 'delivery_report');
  const report = existing || {
    key: storedReport ? reportKey : null,
    storageKey: storedReport ? reportKey : null,
    url: null,
    label: 'AidSec Delivery Report',
    type: 'delivery_report',
    createdAt,
  };

  await updateOrder(order.orderId, {
    reports: existing ? existingReports : [...existingReports, report],
    reportReadiness: 'ready',
  });
  await createReportPlaceholderForOrder(order.orderId, {
    type: 'pending_delivery',
    label: 'Delivery Report in Vorbereitung',
    source: 'delivery_workflow',
  });
  await recordOrderEvent(order.orderId, 'report.delivery.created', {
    workflowId: workflow.workflowId,
    key: storedReport ? reportKey : null,
    stored: storedReport,
  });
}

async function sendOnce(order, eventType, sender) {
  if (await orderHasEvent(order.orderId, eventType)) return { skipped: true };
  const result = await sender(order);
  await recordOrderEvent(order.orderId, eventType, {
    sent: !!result.sent,
    simulated: !!result.simulated,
    provider: result.provider || null,
  });
  return result;
}

async function runActivateMonitoring(order, workflow) {
  const latest = await getOrder(order.orderId);
  await upsertCustomerForOrder(latest || order);
  await updateOrderWorkflowState(order.orderId, {
    workflowStatus: 'running',
    deliveryStatus: 'monitoring_active',
    nextAction: 'Monitoring aktiv',
    reportReadiness: 'ready',
  });
  await recordOrderEvent(order.orderId, 'monitoring.activated', {
    workflowId: workflow.workflowId,
    websiteUrl: order.website?.url || null,
  });
}

async function runOpsReview(order, workflow) {
  await updateWorkflow(workflow.workflowId, {
    status: 'needs_manual_review',
    currentStep: 'ops_review',
    approvalRequired: true,
    lastError: null,
  });
  await updateOrderWorkflowState(order.orderId, {
    workflowStatus: 'needs_manual_review',
    deliveryStatus: 'review_needed',
    nextAction: 'Interne Haertungsfreigabe pruefen',
    reportReadiness: 'ready',
  });
  await createOnboardingTaskForOrder(order.orderId, {
    source: 'delivery_workflow',
    workflowId: workflow.workflowId,
    status: 'review_needed',
  });
  await recordOrderEvent(order.orderId, 'workflow.approval_required', {
    workflowId: workflow.workflowId,
    reason: 'kanzlei_haertung_requires_human_approval',
  });
}

async function runComplete(order, workflow) {
  await updateWorkflow(workflow.workflowId, {
    status: 'delivered',
    currentStep: 'complete',
    approvalRequired: false,
    lastError: null,
  });
  await updateOrderWorkflowState(order.orderId, {
    workflowStatus: 'delivered',
    deliveryStatus: 'delivered',
    nextAction: 'Lieferung abgeschlossen',
    reportReadiness: 'ready',
  });
  await recordOrderEvent(order.orderId, 'workflow.delivered', {
    workflowId: workflow.workflowId,
    productSlug: order.productSlug,
  });
}

async function executeStep(stepId, order, workflow) {
  if (stepId === 'intake') return runIntake(order, workflow);
  if (stepId === 'license') return runLicense(order);
  if (stepId === 'baseline_audit') return runBaselineAudit(order, workflow);
  if (stepId === 'delivery_report') return runDeliveryReport(order, workflow);
  if (stepId === 'payment_email') return sendOnce(order, 'email.payment_confirmation', sendPaymentConfirmationEmail);
  if (stepId === 'magic_link_email') return sendOnce(order, 'email.magic_link', sendMagicLinkEmail);
  if (stepId === 'delivery_email') return sendOnce(order, 'email.delivery', sendDeliveryEmail);
  if (stepId === 'activate_monitoring') return runActivateMonitoring(order, workflow);
  if (stepId === 'ops_review') return runOpsReview(order, workflow);
  if (stepId === 'complete') return runComplete(order, workflow);
  throw new Error(`Unknown workflow step: ${stepId}`);
}

async function runStepOnce(stepId, order, workflow) {
  if (await hasWorkflowStepCompleted(workflow.workflowId, stepId)) return { stepId, skipped: true };
  await updateWorkflow(workflow.workflowId, { status: 'running', currentStep: stepId, lastError: null });
  await executeStep(stepId, order, workflow);
  await markWorkflowStepCompleted(workflow.workflowId, stepId);
  await recordOrderEvent(order.orderId, 'workflow.step.completed', {
    workflowId: workflow.workflowId,
    stepId,
  });
  return { stepId, completed: true };
}

export async function processDeliveryWorkflow(workflowId) {
  const locked = await acquireWorkflowLock(workflowId);
  if (!locked) return { workflowId, skipped: true, reason: 'locked' };

  try {
    let workflow = await getWorkflow(workflowId);
    if (!workflow) return { workflowId, skipped: true, reason: 'missing_workflow' };
    if (['delivered', 'needs_manual_review'].includes(workflow.status)) {
      return { workflowId, skipped: true, status: workflow.status };
    }

    const order = await getOrder(workflow.orderId);
    if (!order) throw new Error(`Order not found: ${workflow.orderId}`);

    const steps = stepsForProduct(workflow.productSlug);
    for (const stepId of steps) {
      await runStepOnce(stepId, await getOrder(workflow.orderId), workflow);
      workflow = await getWorkflow(workflowId);
      if (workflow?.status === 'needs_manual_review') return { workflowId, status: workflow.status };
    }

    return { workflowId, status: (await getWorkflow(workflowId))?.status || 'delivered' };
  } catch (error) {
    const workflow = await getWorkflow(workflowId);
    const attempts = (workflow?.attempts || 0) + 1;
    const terminal = attempts >= MAX_ATTEMPTS;
    await updateWorkflow(workflowId, {
      status: terminal ? 'needs_manual_review' : 'queued',
      attempts,
      approvalRequired: terminal,
      lastError: error.message,
    });
    await updateOrderWorkflowState(workflow.orderId, {
      workflowStatus: terminal ? 'needs_manual_review' : 'queued',
      deliveryStatus: terminal ? 'review_needed' : 'retry_scheduled',
      nextAction: terminal ? 'Interne Pruefung nach Workflow-Fehler' : 'Automatischer Retry geplant',
      reportReadiness: 'pending',
    });
    await recordOrderEvent(workflow.orderId, 'workflow.step.failed', {
      workflowId,
      attempts,
      terminal,
      message: error.message,
    });
    if (!terminal) await enqueueWorkflowJob(workflowId);
    return { workflowId, status: terminal ? 'needs_manual_review' : 'queued', error: error.message };
  } finally {
    await releaseWorkflowLock(workflowId);
  }
}

export async function runDeliveryWorkflowBatch({ limit = 5 } = {}) {
  const jobs = await claimReadyWorkflowJobs(limit);
  const summary = {
    success: true,
    processed: 0,
    completed: 0,
    needsManualReview: 0,
    retried: 0,
    skipped: 0,
    results: [],
  };

  for (const job of jobs) {
    const result = await processDeliveryWorkflow(job.workflowId);
    summary.results.push(result);
    if (result.skipped) {
      summary.skipped += 1;
      continue;
    }
    summary.processed += 1;
    if (result.status === 'delivered') summary.completed += 1;
    if (result.status === 'needs_manual_review') summary.needsManualReview += 1;
    if (result.status === 'queued') summary.retried += 1;
  }

  return summary;
}
