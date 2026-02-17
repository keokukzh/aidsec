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
  var grade = GRADE_MAP[Math.min(score, 6)];
  if (score === 6 && hstsValue && /preload/i.test(hstsValue)) {
    grade = 'A+';
  }
  return grade;
}

function normalizeUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  var url = raw.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  try {
    var parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname || parsed.hostname.length < 3) return null;
    return parsed.href;
  } catch (_) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var rawUrl = req.query.url;
  var url = normalizeUrl(rawUrl);

  if (!url) {
    return res.status(400).json({
      error: 'Ungueltige URL. Bitte geben Sie eine gueltige Website-Adresse ein.',
    });
  }

  try {
    var controller = new AbortController();
    var timeout = setTimeout(function () {
      controller.abort();
    }, 6000);

    var fetchOpts = {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'AidSec-SecurityCheck/1.0 (+https://aidsec.ch)',
      },
    };

    var response = await fetch(url, Object.assign({ method: 'HEAD' }, fetchOpts));

    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, Object.assign({ method: 'GET' }, fetchOpts));
    }

    clearTimeout(timeout);

    var headers = {};
    var score = 0;
    var hstsValue = null;

    for (var i = 0; i < SECURITY_HEADERS.length; i++) {
      var h = SECURITY_HEADERS[i];
      var value = response.headers.get(h.key);
      var present = value !== null && value !== '';
      if (present) score++;
      if (h.key === 'strict-transport-security') hstsValue = value;
      headers[h.key] = { present: present, value: value, label: h.label };
    }

    var grade = computeGrade(score, hstsValue);

    return res.status(200).json({
      url: url,
      grade: grade,
      score: score,
      maxScore: SECURITY_HEADERS.length,
      headers: headers,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({
        error: 'Zeitueberschreitung: Die Website hat nicht rechtzeitig geantwortet.',
      });
    }
    return res.status(502).json({
      error: 'Die Website konnte nicht erreicht werden. Bitte pruefen Sie die URL.',
    });
  }
}
