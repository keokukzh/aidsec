import crypto from 'crypto';
import { getEnvFirst, isProduction } from './env.js';
import { getOrder, recordOrderEvent, updateOrder } from './order-store.js';

const globalStore = globalThis.__aidsecWorkflowStore || {
  workflows: new Map(),
  orderIndex: new Map(),
  readyJobs: [],
  scheduledJobs: [],
  completedSteps: new Set(),
  locks: new Map(),
};
globalThis.__aidsecWorkflowStore = globalStore;

function generateWorkflowId() {
  return `wf_${crypto.randomBytes(8).toString('hex')}`;
}

async function upstashCommand(args) {
  const url = getEnvFirst(['UPSTASH_REDIS_REST_URL']);
  const token = getEnvFirst(['UPSTASH_REDIS_REST_TOKEN']);
  if (!url || !token) return null;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) throw new Error(`Upstash workflow command failed: ${response.status}`);
  const data = await response.json();
  return data.result;
}

function requirePersistentStore() {
  if (isProduction() && (!getEnvFirst(['UPSTASH_REDIS_REST_URL']) || !getEnvFirst(['UPSTASH_REDIS_REST_TOKEN']))) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for production workflows');
  }
}

async function redisGetJson(key) {
  const result = await upstashCommand(['GET', key]);
  if (!result) return null;
  return typeof result === 'string' ? JSON.parse(result) : result;
}

async function redisSetJson(key, value, options = []) {
  return upstashCommand(['SET', key, JSON.stringify(value), ...options]);
}

async function redisListJson(key) {
  const result = await upstashCommand(['LRANGE', key, 0, -1]);
  return (result || []).map((item) => (typeof item === 'string' ? JSON.parse(item) : item));
}

async function redisPushJson(key, value) {
  await upstashCommand(['RPUSH', key, JSON.stringify(value)]);
}

async function redisPopReadyJobs(limit) {
  const jobs = [];
  for (let index = 0; index < limit; index += 1) {
    const item = await upstashCommand(['LPOP', 'workflow-jobs:ready']);
    if (!item) break;
    jobs.push(typeof item === 'string' ? JSON.parse(item) : item);
  }
  return jobs;
}

function workflowIndexKey(orderId, type = 'delivery') {
  return `workflow-order:${orderId}:${type}`;
}

function stepKey(workflowId, stepId) {
  return `workflow-step:${workflowId}:${stepId}`;
}

export async function createDeliveryWorkflowForOrder(orderId) {
  requirePersistentStore();
  const order = await getOrder(orderId);
  if (!order) throw new Error(`Order not found: ${orderId}`);

  const existing = await getWorkflowForOrder(orderId);
  if (existing) return { workflow: existing, created: false };

  const now = new Date().toISOString();
  const workflow = {
    workflowId: generateWorkflowId(),
    type: 'delivery',
    orderId,
    productSlug: order.productSlug,
    status: 'queued',
    currentStep: 'queued',
    attempts: 0,
    approvalRequired: false,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };

  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) {
    const created = await redisSetJson(workflowIndexKey(orderId), workflow.workflowId, ['NX']);
    if (created !== 'OK') return { workflow: await getWorkflowForOrder(orderId), created: false };
    await redisSetJson(`workflow:${workflow.workflowId}`, workflow);
  } else {
    if (globalStore.orderIndex.has(orderId)) return { workflow: await getWorkflowForOrder(orderId), created: false };
    globalStore.orderIndex.set(orderId, workflow.workflowId);
    globalStore.workflows.set(workflow.workflowId, workflow);
  }

  await updateOrder(orderId, {
    workflowId: workflow.workflowId,
    workflowStatus: 'queued',
    deliveryStatus: 'queued',
    nextAction: 'Automatische Lieferung wird vorbereitet',
    reportReadiness: order.reportReadiness || 'pending',
  });
  await recordOrderEvent(orderId, 'workflow.requested', {
    workflowId: workflow.workflowId,
    productSlug: workflow.productSlug,
    status: workflow.status,
  });

  return { workflow, created: true };
}

export async function enqueueWorkflowJob(workflowId, payload = {}) {
  const workflow = await getWorkflow(workflowId);
  if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

  const job = {
    jobId: payload.jobId || `job_${crypto.randomBytes(8).toString('hex')}`,
    workflowId,
    orderId: workflow.orderId,
    runAfter: payload.runAfter || new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) {
    await redisPushJson('workflow-jobs:ready', job);
  } else if (!globalStore.readyJobs.some((item) => item.workflowId === workflowId)) {
    globalStore.readyJobs.push(job);
  }
  return job;
}

export async function enqueueDeliveryWorkflowForOrder(orderId) {
  const { workflow, created } = await createDeliveryWorkflowForOrder(orderId);
  if (created) await enqueueWorkflowJob(workflow.workflowId);
  return { workflowId: workflow.workflowId, created, workflow };
}

export async function getWorkflow(workflowId) {
  if (!workflowId) return null;
  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) return redisGetJson(`workflow:${workflowId}`);
  return globalStore.workflows.get(workflowId) || null;
}

export async function getWorkflowForOrder(orderId) {
  if (!orderId) return null;
  let workflowId;
  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) {
    workflowId = await redisGetJson(workflowIndexKey(orderId));
  } else {
    workflowId = globalStore.orderIndex.get(orderId);
  }
  return workflowId ? getWorkflow(workflowId) : null;
}

export async function updateWorkflow(workflowId, updates) {
  const workflow = await getWorkflow(workflowId);
  if (!workflow) return null;
  const updated = { ...workflow, ...updates, updatedAt: new Date().toISOString() };
  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) {
    await redisSetJson(`workflow:${workflowId}`, updated);
  } else {
    globalStore.workflows.set(workflowId, updated);
  }
  return updated;
}

export async function peekReadyWorkflowJobs() {
  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) return redisListJson('workflow-jobs:ready');
  return [...globalStore.readyJobs];
}

export async function claimReadyWorkflowJobs(limit = 5) {
  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) return redisPopReadyJobs(limit);
  return globalStore.readyJobs.splice(0, limit);
}

export async function acquireWorkflowLock(workflowId, ttlSeconds = 60) {
  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) {
    const result = await upstashCommand(['SET', `workflow-lock:${workflowId}`, '1', 'NX', 'EX', ttlSeconds]);
    return result === 'OK';
  }

  const now = Date.now();
  const existing = globalStore.locks.get(workflowId);
  if (existing && existing > now) return false;
  globalStore.locks.set(workflowId, now + ttlSeconds * 1000);
  return true;
}

export async function releaseWorkflowLock(workflowId) {
  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) {
    await upstashCommand(['DEL', `workflow-lock:${workflowId}`]);
  } else {
    globalStore.locks.delete(workflowId);
  }
}

export async function hasWorkflowStepCompleted(workflowId, stepId) {
  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) {
    return Boolean(await upstashCommand(['GET', stepKey(workflowId, stepId)]));
  }
  return globalStore.completedSteps.has(stepKey(workflowId, stepId));
}

export async function markWorkflowStepCompleted(workflowId, stepId, payload = {}) {
  const completed = {
    workflowId,
    stepId,
    payload,
    completedAt: new Date().toISOString(),
  };
  if (getEnvFirst(['UPSTASH_REDIS_REST_URL'])) {
    await redisSetJson(stepKey(workflowId, stepId), completed);
  } else {
    globalStore.completedSteps.add(stepKey(workflowId, stepId));
  }
  return completed;
}
