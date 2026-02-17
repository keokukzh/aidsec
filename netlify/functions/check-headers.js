const SECURITY_HEADERS = [
  { key: 'strict-transport-security', label: 'Strict-Transport-Security' },
  { key: 'content-security-policy', label: 'Content-Security-Policy' },
  { key: 'x-content-type-options', label: 'X-Content-Type-Options' },
  { key: 'x-frame-options', label: 'X-Frame-Options' },
  { key: 'referrer-policy', label: 'Referrer-Policy' },
  { key: 'permissions-policy', label: 'Permissions-Policy' },
];

const GRADE_MAP = ['F', 'F', 'E', 'D', 'C', 'B', 'A'];

function computeGrade(score, hstsValue) {
  const grade = GRADE_MAP[Math.min(score, 6)];
  if (score === 6 && hstsValue && /preload/i.test(hstsValue)) {
    return 'A+';
  }
  return grade;
}

function normalizeUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname || parsed.hostname.length < 3) return null;
    return parsed.href;
  } catch (_) {
    return null;
  }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=300, s-maxage=300',
  'Content-Type': 'application/json',
};

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(data),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rawUrl = event.queryStringParameters?.url;
  const url = normalizeUrl(rawUrl);

  if (!url) {
    return jsonResponse(400, {
      error: 'Ungueltige URL. Bitte geben Sie eine gueltige Website-Adresse ein.',
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const fetchOpts = {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'AidSec-SecurityCheck/1.0 (+https://aidsec.ch)' },
    };

    let response = await fetch(url, { ...fetchOpts, method: 'HEAD' });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, { ...fetchOpts, method: 'GET' });
    }

    clearTimeout(timeout);

    const headers = {};
    let score = 0;
    let hstsValue = null;

    for (const h of SECURITY_HEADERS) {
      const value = response.headers.get(h.key);
      const present = value !== null && value !== '';
      if (present) score++;
      if (h.key === 'strict-transport-security') hstsValue = value;
      headers[h.key] = { present, value, label: h.label };
    }

    const grade = computeGrade(score, hstsValue);

    return jsonResponse(200, {
      url,
      grade,
      score,
      maxScore: SECURITY_HEADERS.length,
      headers,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return jsonResponse(504, {
        error: 'Zeitueberschreitung: Die Website hat nicht rechtzeitig geantwortet.',
      });
    }
    return jsonResponse(502, {
      error: 'Die Website konnte nicht erreicht werden. Bitte pruefen Sie die URL.',
    });
  }
};
