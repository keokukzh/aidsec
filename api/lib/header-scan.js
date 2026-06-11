/**
 * Shared security-header scan used by the delivery workflow (real baseline /
 * after audits). Same scoring model as the public /api/check-headers endpoint.
 */

import { fetchWithSSRFProtection, validateTargetUrlForSSRF } from './ssrf.js';

export const SECURITY_HEADER_KEYS = [
  'strict-transport-security',
  'content-security-policy',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
];

const GRADE_MAP = ['F', 'F', 'E', 'D', 'C', 'B', 'A'];

export function computeGrade(score, hstsValue) {
  let grade = GRADE_MAP[Math.max(0, Math.min(score, 6))];
  if (score === 6 && hstsValue && /preload/i.test(hstsValue)) grade = 'A+';
  return grade;
}

function normalizeUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch (_) {
    return null;
  }
}

export async function scanSecurityHeaders(rawUrl, { timeoutMs = 10000 } = {}) {
  const url = normalizeUrl(rawUrl);
  if (!url) throw new Error(`Ungueltige URL fuer Header-Scan: ${rawUrl}`);

  const ssrfCheck = await validateTargetUrlForSSRF(url);
  if (!ssrfCheck.safe) throw new Error(`SSRF blockiert: ${ssrfCheck.reason}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const fetchOpts = {
    signal: controller.signal,
    headers: {
      'User-Agent': 'AidSec-SecurityCheck/2.0 (+https://aidsec.ch)',
      Accept: 'text/html,application/xhtml+xml',
    },
  };

  try {
    let response = await fetchWithSSRFProtection(url, { method: 'HEAD', ...fetchOpts });
    if (response.status === 405 || response.status === 501) {
      response = await fetchWithSSRFProtection(url, { method: 'GET', ...fetchOpts });
    }
    if (!response.ok) throw new Error(`Zielserver antwortet mit HTTP ${response.status}`);

    const headers = {};
    let score = 0;
    for (const key of SECURITY_HEADER_KEYS) {
      const value = response.headers.get(key);
      headers[key] = value || null;
      if (value) score += 1;
    }

    return {
      url,
      score,
      maxScore: SECURITY_HEADER_KEYS.length,
      grade: computeGrade(score, headers['strict-transport-security']),
      headers,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}
