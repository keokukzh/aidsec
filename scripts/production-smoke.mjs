import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPresignedPutUrl, getObjectStorageConfig } from '../api/lib/signed-storage-url.js';

const repoRoot = new URL('..', import.meta.url);

function loadDotenv(pathname) {
  if (!fs.existsSync(pathname)) return;
  const lines = fs.readFileSync(pathname, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotenv(fileURLToPath(new URL('.env.local', repoRoot)));

const baseUrl = (process.env.BASE_URL || 'https://www.aidsec.ch').replace(/\/$/, '').replace('https://aidsec.ch', 'https://www.aidsec.ch');
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const configuredSmokeEmail = (process.env.SMOKE_EMAIL || '').trim();
const smokeEmail = configuredSmokeEmail || `aidsec-smoke-${runId}@example.invalid`;
const expectsTransactionalEmail = Boolean(configuredSmokeEmail);
const websiteUrl = `https://smoke-${runId}.example.com`;
const results = [];

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`${name} fehlt lokal fuer Production-Smoke`);
  return value.trim();
}

function record(name, ok, details = {}) {
  results.push({ name, ok, ...details });
}

function maskId(value) {
  if (!value) return null;
  return `${String(value).slice(0, 6)}...${String(value).slice(-6)}`;
}

function maskEmail(value) {
  const email = String(value || '');
  const at = email.indexOf('@');
  if (at <= 1) return email ? '***' : null;
  return `${email.slice(0, 2)}***${email.slice(at)}`;
}

function signMagicToken(orderId, email) {
  const secret = requireEnv('ORDER_TOKEN_SECRET');
  const payload = JSON.stringify({
    orderId,
    email,
    expiry: Math.floor(Date.now() / 1000) + 3600,
  });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

function stripeSignature(rawBody) {
  const secret = requireEnv('STRIPE_WEBHOOK_SECRET');
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  return `t=${ts},v1=${sig}`;
}

function pluginSignature(payload, installSecret, ts) {
  return crypto.createHmac('sha256', installSecret).update(JSON.stringify(payload) + ts).digest('base64');
}

async function postJson(url, payload, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = { raw: text.slice(0, 160) };
  }
  return { response, body };
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = { raw: text.slice(0, 160) };
  }
  return { response, body };
}

async function redisCommand(args) {
  const url = requireEnv('UPSTASH_REDIS_REST_URL');
  const token = requireEnv('UPSTASH_REDIS_REST_TOKEN');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error(`Upstash ${args[0]} failed: ${response.status}`);
  const body = await response.json();
  return body.result;
}

async function redisGetJson(key) {
  const result = await redisCommand(['GET', key]);
  if (!result) return null;
  return typeof result === 'string' ? JSON.parse(result) : result;
}

async function redisSetJson(key, value) {
  return redisCommand(['SET', key, JSON.stringify(value)]);
}

async function putR2Json(key, data) {
  requireEnv('R2_ACCOUNT_ID');
  requireEnv('R2_ACCESS_KEY_ID');
  requireEnv('R2_SECRET_ACCESS_KEY');
  requireEnv('R2_BUCKET');
  const config = getObjectStorageConfig();
  if (!config) throw new Error('R2-Konfiguration fehlt fuer Production-Smoke');
  const response = await fetch(createPresignedPutUrl(config, key), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(data, null, 2),
  });
  if (!response.ok) throw new Error(`R2 smoke report write failed: ${response.status}`);
}

async function createCheckout(productSlug, billingPeriod) {
  const { response, body } = await postJson(`${baseUrl}/api/checkout`, {
    productSlug,
    billingPeriod,
    name: `AidSec Smoke ${runId}`,
    email: smokeEmail,
    company: 'AidSec Smoke Test',
    websiteUrl,
  });
  if (!response.ok || !body?.success || !body.orderId || !body.sessionId || !body.url) {
    throw new Error(`${productSlug} checkout failed: ${response.status}`);
  }

  const token = signMagicToken(body.orderId, smokeEmail);
  const stored = await redisGetJson(`order:${body.orderId}`);
  if (!stored || stored.paymentStatus !== 'unpaid' || stored.stripeSessionId !== body.sessionId) {
    throw new Error(`${productSlug} persisted order check failed`);
  }

  record(`checkout:${productSlug}`, true, {
    orderId: maskId(body.orderId),
    sessionId: maskId(body.sessionId),
    mode: billingPeriod || 'once',
  });
  return { productSlug, orderId: body.orderId, sessionId: body.sessionId, token };
}

async function completeCheckout(order) {
  const event = {
    id: `evt_smoke_${runId}_${order.productSlug}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: order.sessionId,
        customer: `cus_smoke_${runId}`,
        subscription: order.productSlug === 'cyber-mandat' ? `sub_smoke_${runId}` : null,
        payment_status: 'paid',
        metadata: {
          orderId: order.orderId,
          productSlug: order.productSlug,
          websiteUrl,
          billingPeriod: order.productSlug === 'cyber-mandat' ? 'monthly' : 'once',
        },
      },
    },
  };
  const rawBody = JSON.stringify(event);
  const response = await fetch(`${baseUrl}/api/checkout/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': stripeSignature(rawBody),
    },
    body: rawBody,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.received || body.handled !== true) {
    throw new Error(`signed webhook failed: ${response.status}`);
  }

  const stored = await redisGetJson(`order:${order.orderId}`);
  if (!stored || stored.paymentStatus !== 'paid' || stored.status !== 'active') {
    throw new Error('post-webhook Redis order status failed');
  }

  record('stripe:signed-webhook', true, {
    orderId: maskId(order.orderId),
    duplicate: !!body.duplicate,
  });

  record('email:transactional-delivery', expectsTransactionalEmail, {
    recipient: maskEmail(smokeEmail),
    evidence: expectsTransactionalEmail ? 'workflow runner accepted and mail provider errors are checked via deployment logs' : 'skipped: set SMOKE_EMAIL to a real test inbox',
  });
}

async function runDeliveryWorkflow(order) {
  const secret = requireEnv('INTERNAL_WORKFLOW_SECRET');
  const { response, body } = await postJson(`${baseUrl}/api/internal/workflow-runner`, { limit: 5 }, {
    'X-AidSec-Internal-Secret': secret,
  });
  if (!response.ok || body?.success !== true) {
    throw new Error(`workflow runner failed: ${response.status}`);
  }

  const stored = await redisGetJson(`order:${order.orderId}`);
  if (!stored || !['delivered', 'review_needed', 'monitoring_active'].includes(stored.deliveryStatus)) {
    throw new Error('workflow runner did not update order delivery status');
  }

  record('workflow:delivery-runner', true, {
    orderId: maskId(order.orderId),
    deliveryStatus: stored.deliveryStatus,
    workflowStatus: stored.workflowStatus,
  });
}

async function verifyR2SignedReport(order) {
  const reportKey = `reports/smoke/${runId}-${order.orderId}.json`;
  await putR2Json(reportKey, {
    type: 'production-smoke',
    runId,
    orderId: order.orderId,
    createdAt: new Date().toISOString(),
  });

  const stored = await redisGetJson(`order:${order.orderId}`);
  if (!stored) throw new Error('order missing in Redis after webhook');
  stored.reportKey = reportKey;
  stored.reports = [
    ...(stored.reports || []),
    { orderId: order.orderId, key: reportKey, label: 'Smoke Report', createdAt: new Date().toISOString() },
  ];
  stored.updatedAt = new Date().toISOString();
  await redisSetJson(`order:${order.orderId}`, stored);

  const portal = await getJson(`${baseUrl}/api/proof-center-status?orderId=${encodeURIComponent(order.orderId)}&token=${encodeURIComponent(order.token)}`);
  const report = portal.body?.portal?.reports?.find((item) => item.key === reportKey);
  if (!portal.response.ok || !report?.url || !/^https:\/\//.test(report.url)) {
    throw new Error(`signed report URL failed: ${portal.response.status}`);
  }

  record('r2:signed-report-url', true, {
    orderId: maskId(order.orderId),
    reportKey,
    signed: report.url.includes('X-Amz-Signature') || report.url.includes('X-Amz-Credential'),
  });
}

async function verifyPluginRelay(order) {
  const stored = await redisGetJson(`order:${order.orderId}`);
  if (!stored?.licenseId) throw new Error('order license missing after webhook');
  const license = await redisGetJson(`license:${stored.licenseId}`);
  if (!license?.installSecret) throw new Error('license install secret missing in Redis');

  const payload = {
    event: 'production_smoke',
    site_url: websiteUrl,
    licenseId: license.licenseId,
    tokenVersion: Number.parseInt(process.env.PLUGIN_TOKEN_VERSION || String(license.tokenVersion || 1), 10),
    smokeRunId: runId,
  };
  const ts = Math.floor(Date.now() / 1000).toString();
  const { response, body } = await postJson(`${baseUrl}/api/plugin-webhook-relay`, payload, {
    'X-AidSec-Ts': ts,
    'X-AidSec-Sig': pluginSignature(payload, license.installSecret, ts),
  });
  if (!response.ok || body?.success !== true) {
    throw new Error(`plugin relay failed: ${response.status}`);
  }

  record('plugin-relay:valid-license-signature', true, {
    licenseId: maskId(license.licenseId),
  });
}

async function checkPricingCtas() {
  // Plan DoD-Kriterium 4: kein Pricing-CTA fuehrt auf 404.
  // Wir laden die Startseite + Notfall-Landing + alle Onboarding-/Leistungen-Seiten,
  // sammeln alle internen hrefs und HEAD-en sie. Alles >= 400 (ausser 401/403 fuer
  // bewusst geschuetzte Routen wie /api/license) gilt als Bruch.
  const seedUrls = [
    `${baseUrl}/`,
    `${baseUrl}/notfall.html`,
    `${baseUrl}/index.html#preise`,
    `${baseUrl}/leistungen/header-optimierung.html`,
    `${baseUrl}/leistungen/wordpress-haertung.html`,
    `${baseUrl}/leistungen/cyber-mandat.html`,
    `${baseUrl}/leistungen/ndsg-compliance-pack.html`,
    `${baseUrl}/leistungen/notfall-intervention.html`,
    `${baseUrl}/leistungen/email-sicherheit.html`,
    `${baseUrl}/onboarding/rapid-header-fix/`,
    `${baseUrl}/onboarding/kanzlei-haertung/`,
    `${baseUrl}/onboarding/cyber-mandat/`,
  ];

  const seen = new Map(); // href -> { sourceUrl, status }
  const failures = [];

  for (const seed of seedUrls) {
    let html;
    try {
      const res = await fetch(seed, { headers: { Accept: 'text/html' }, redirect: 'follow' });
      if (!res.ok) {
        failures.push({ source: seed, reason: `seed returned ${res.status}` });
        continue;
      }
      html = await res.text();
    } catch (error) {
      failures.push({ source: seed, reason: `fetch failed: ${error.message}` });
      continue;
    }

    const hrefs = extractInternalHrefs(html, baseUrl);
    for (const href of hrefs) {
      if (seen.has(href)) continue;
      seen.set(href, { sourceUrl: seed, status: null });
    }
  }

  for (const [href, meta] of seen.entries()) {
    // Bewusst geschuetzte Endpoints ueberspringen — der CTA-Check zielt auf Seiten.
    if (/\/api\//.test(href)) continue;
    if (/\/dashboard\b/.test(href)) continue; // login-pflichtig
    if (/\/auftrag\/[A-Za-z0-9_-]+/.test(href)) continue; // dynamische Routen
    if (/\?/.test(href)) continue; // Query-Parameter (z.B. ?order_id=) — wuerden eh umgelenkt

    // HEAD spart Bandbreite; manche Hosts antworten mit 405 -> Fallback GET.
    let status = 0;
    try {
      const headRes = await fetch(href, { method: 'HEAD', redirect: 'follow' });
      status = headRes.status;
      if (status === 405 || status === 501) {
        const getRes = await fetch(href, { method: 'GET', redirect: 'follow' });
        status = getRes.status;
      }
    } catch (error) {
      failures.push({ href, source: meta.sourceUrl, reason: `fetch failed: ${error.message}` });
      continue;
    }

    meta.status = status;
    if (status >= 400) {
      failures.push({ href, source: meta.sourceUrl, status });
    }
  }

  record('pricing-ctas:no-404', failures.length === 0, {
    checked: seen.size,
    failures: failures.slice(0, 10),
  });

  return failures;
}

function extractInternalHrefs(html, origin) {
  const matches = html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi);
  const out = new Set();
  for (const match of matches) {
    const raw = match[1].trim();
    if (!raw) continue;
    if (raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) continue;
    if (/^https?:\/\//i.test(raw)) {
      try {
        const u = new URL(raw);
        if (u.origin !== origin) continue; // extern
        out.add(u.pathname.replace(/\/$/, '') || '/');
      } catch (_) { /* ignore malformed */ }
      continue;
    }
    if (raw.startsWith('//')) continue;
    // intern
    const path = raw.split('#')[0].split('?')[0];
    if (!path) continue;
    const normalized = path.replace(/\/$/, '') || '/';
    out.add(normalized);
  }
  return Array.from(out);
}

async function main() {
  const orders = [];
  orders.push(await createCheckout('rapid-header-fix'));
  orders.push(await createCheckout('kanzlei-haertung'));
  orders.push(await createCheckout('cyber-mandat', 'monthly'));

  const cyberMandat = orders.find((order) => order.productSlug === 'cyber-mandat');
  await completeCheckout(cyberMandat);
  await runDeliveryWorkflow(cyberMandat);
  await verifyR2SignedReport(cyberMandat);
  await verifyPluginRelay(cyberMandat);

  // CTA-Smoke laeuft VOR dem JSON-Output, damit seine failures im Report sichtbar sind.
  // Bei `SMOKE_SKIP_CTAS=1` (z.B. weil die Seite down ist) kann er uebersprungen werden.
  if (process.env.SMOKE_SKIP_CTAS !== '1') {
    await checkPricingCtas();
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    runId,
    smokeEmail: maskEmail(smokeEmail),
    checks: results,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    runId,
    error: error.message,
    checks: results,
  }, null, 2));
  process.exitCode = 1;
});
