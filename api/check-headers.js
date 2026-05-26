import { fetchWithSSRFProtection, validateTargetUrlForSSRF } from './lib/ssrf.js';

const SECURITY_HEADERS = [
  { 
    key: 'strict-transport-security', 
    label: 'Strict-Transport-Security (HSTS)',
    description: 'Erzwingt HTTPS-Verbindungen und verhindert SSL-Stripping-Angriffe.',
    cwe: 'CWE-319' 
  },
  { 
    key: 'content-security-policy', 
    label: 'Content-Security-Policy (CSP)',
    description: 'Definiert erlaubte Ressourcen und blockiert XSS-Angriffe.',
    cwe: 'CWE-79' 
  },
  { 
    key: 'x-content-type-options', 
    label: 'X-Content-Type-Options',
    description: 'Verhindert MIME-Sniffing und unerwartete Code-Ausführung.',
    cwe: 'CWE-436' 
  },
  { 
    key: 'x-frame-options', 
    label: 'X-Frame-Options',
    description: 'Verhindert Clickjacking durch Einbettung in Frames.',
    cwe: 'CWE-346' 
  },
  { 
    key: 'referrer-policy', 
    label: 'Referrer-Policy',
    description: 'Kontrolliert welche URL-Informationen bei Links weitergegeben werden.',
    cwe: 'CWE-200' 
  },
  { 
    key: 'permissions-policy', 
    label: 'Permissions-Policy',
    description: 'Beschränkt Browser-APIs wie Kamera, Mikrofon und Geolocation.',
    cwe: 'CWE-250' 
  }
];

const GRADE_MAP = ['F', 'F', 'E', 'D', 'C', 'B', 'A'];
const GRADE_COLORS = {
  'F': '#DC2626',
  'E': '#EA580C',
  'D': '#D97706',
  'C': '#CA8A04',
  'B': '#65A30D',
  'A': '#16A34A',
  'A+': '#059669'
};

function computeGrade(score, hstsValue) {
  var grade = GRADE_MAP[Math.min(score, 6)];
  if (score === 6 && hstsValue && /preload/i.test(hstsValue)) {
    grade = 'A+';
  }
  return grade;
}

function getGradeColor(grade) {
  return GRADE_COLORS[grade] || '#6B7280';
}

function getRecommendations(headers, grade) {
  var recommendations = [];
  
  if (grade === 'F' || grade === 'E') {
    recommendations.push({
      priority: 'critical',
      title: 'Sofortige Header-Optimierung erforderlich',
      description: 'Ihre Webseite sendet keine Security Headers. Dies macht sie anfällig für XSS, Clickjacking und Man-in-the-Middle-Angriffe.'
    });
  }
  
  var missingHeaders = headers.filter(function(h) { return !h.present; });
  missingHeaders.forEach(function(h) {
    recommendations.push({
      priority: h.key === 'strict-transport-security' ? 'high' : 'medium',
      title: h.label + ' fehlt',
      description: h.description,
      cwe: h.cwe
    });
  });
  
  // Spezifische Empfehlungen
  var hsts = headers.find(function(h) { return h.key === 'strict-transport-security'; });
  if (hsts && hsts.present) {
    var maxAge = hsts.value.match(/max-age=(\d+)/i);
    if (maxAge && parseInt(maxAge[1]) < 31536000) {
      recommendations.push({
        priority: 'medium',
        title: 'HSTS max-age erhöhen',
        description: 'Das aktuelle max-age ist weniger als 1 Jahr. Für HSTS Preload empfehlen wir mindestens 31536000 Sekunden.'
      });
    }
  }
  
  return recommendations;
}

function getNDSGComplianceStatus(headers) {
  var criticalHeaders = ['strict-transport-security', 'x-frame-options', 'x-content-type-options'];
  var presentCount = 0;
  
  criticalHeaders.forEach(function(key) {
    var header = headers.find(function(h) { return h.key === key; });
    if (header && header.present) presentCount++;
  });
  
  return {
    compliant: presentCount >= 2,
    level: presentCount === 3 ? 'full' : presentCount >= 1 ? 'partial' : 'none',
    article: 'Art. 8 nDSG - Technische Schutzmassnahmen',
    description: presentCount >= 3 
      ? 'Alle kritischen Security Headers sind implementiert.'
      : presentCount >= 1 
        ? 'Teilweise Konformität hergestellt. Weitere Headers empfohlen.'
        : 'Erheblicher Nachholbedarf bei technischen Schutzmassnahmen.'
  };
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

function extractDomain(url) {
  try {
    var parsed = new URL(url);
    return parsed.hostname;
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
      error: 'Ungültige URL. Bitte geben Sie eine gültige Website-Adresse ein.',
      code: 'INVALID_URL'
    });
  }

  // ── SSRF Protection ──
  var ssrfCheck = await validateTargetUrlForSSRF(url);
  if (!ssrfCheck.safe) {
    return res.status(403).json({
      error: 'Diese URL ist aus Sicherheitsgründen nicht erlaubt: ' + ssrfCheck.reason,
      code: 'SSRF_BLOCKED'
    });
  }

  try {
    var controller = new AbortController();
    var timeout = setTimeout(function () {
      controller.abort();
    }, 10000); // Timeout erhöht auf 10s

    var fetchOpts = {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AidSec-SecurityCheck/2.0 (+https://aidsec.ch)',
        'Accept': 'text/html,application/xhtml+xml'
      },
    };

    // Erst mit HEAD, dann GET als Fallback
    var response;
    var fetchError;
    
    try {
      response = await fetchWithSSRFProtection(url, Object.assign({ method: 'HEAD' }, fetchOpts));
      if (response.status === 405 || response.status === 501) {
        response = await fetchWithSSRFProtection(url, Object.assign({ method: 'GET' }, fetchOpts));
      }
    } catch (e) {
      fetchError = e.message;
    }

    clearTimeout(timeout);

    if (!response || !response.ok) {
      return res.status(502).json({
        error: 'Die Website antwortet nicht korrekt (HTTP ' + (response ? response.status : 'N/A') + ').',
        code: 'SERVER_ERROR',
        url: url
      });
    }

    var headers = [];
    var score = 0;
    var hstsValue = null;
    var serverInfo = response.headers.get('server') || response.headers.get('x-powered-by') || 'unbekannt';

    for (var i = 0; i < SECURITY_HEADERS.length; i++) {
      var h = SECURITY_HEADERS[i];
      var value = response.headers.get(h.key);
      var present = value !== null && value !== '';
      if (present) score++;
      if (h.key === 'strict-transport-security') hstsValue = value;
      
      headers.push({
        key: h.key,
        label: h.label,
        description: h.description,
        present: present,
        value: value || null,
        cwe: h.cwe
      });
    }

    var grade = computeGrade(score, hstsValue);
    var gradeColor = getGradeColor(grade);
    var recommendations = getRecommendations(headers, grade);
    var ndsgStatus = getNDSGComplianceStatus(headers);
    var domain = extractDomain(url);

    var result = {
      success: true,
      url: url,
      domain: domain,
      grade: grade,
      gradeColor: gradeColor,
      score: score,
      maxScore: SECURITY_HEADERS.length,
      headers: headers,
      server: serverInfo,
      recommendations: recommendations,
      ndsg: ndsgStatus,
      metadata: {
        checkedAt: new Date().toISOString(),
        checkDuration: '~2s',
        apiVersion: '2.0.0',
        contentType: response.headers.get('content-type') || null
      }
    };

    return res.status(200).json(result);

  } catch (err) {
    if (err.code === 'SSRF_BLOCKED') {
      return res.status(403).json({
        error: 'Diese URL ist aus Sicherheitsgruenden nicht erlaubt: ' + (err.message || 'Redirect blockiert'),
        code: 'SSRF_BLOCKED',
        url: url
      });
    }

    if (err.name === 'AbortError') {
      return res.status(504).json({
        error: 'Zielserver antwortet nicht rechtzeitig (Timeout nach 10s). Bitte versuchen Sie es später erneut.',
        code: 'TIMEOUT',
        url: url
      });
    }
    
    return res.status(502).json({
        error: 'Die Website konnte nicht erreicht werden: ' + (err.message || 'Unbekannter Fehler'),
        code: 'FETCH_ERROR',
      url: url
    });
  }
}
