import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'local',
  'internal',
  'intranet',
  'dmz',
  'corp',
  'corporate',
  'lan',
  'home',
  'work',
  'host',
  'server',
  'router',
  'gateway',
  'docker',
  'kubernetes',
  'minikube',
  'metadata.google.internal',
]);

function ipv4ToNumber(ip) {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function inIpv4Cidr(ip, base, bits) {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToNumber(ip) & mask) === (ipv4ToNumber(base) & mask);
}

export function isPrivateOrReservedIP(ip) {
  if (!ip || typeof ip !== 'string') return true;

  const normalized = ip.toLowerCase();
  if (normalized.startsWith('::ffff:')) {
    return isPrivateOrReservedIP(normalized.slice(7));
  }

  if (net.isIP(normalized) === 4) {
    return [
      ['0.0.0.0', 8],
      ['10.0.0.0', 8],
      ['100.64.0.0', 10],
      ['127.0.0.0', 8],
      ['169.254.0.0', 16],
      ['172.16.0.0', 12],
      ['192.0.0.0', 24],
      ['192.0.2.0', 24],
      ['192.168.0.0', 16],
      ['198.18.0.0', 15],
      ['198.51.100.0', 24],
      ['203.0.113.0', 24],
      ['224.0.0.0', 4],
      ['240.0.0.0', 4],
    ].some(([base, bits]) => inIpv4Cidr(normalized, base, bits));
  }

  if (net.isIP(normalized) === 6) {
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fe80:') ||
      /^f[c-d][0-9a-f]{2}:/i.test(normalized)
    );
  }

  return true;
}

export function normalizeTargetUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const value = raw.trim();
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname || parsed.hostname.length < 3) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

export function validateHostname(hostname) {
  if (!hostname) return { safe: false, reason: 'Hostname fehlt' };
  const lower = hostname.toLowerCase().replace(/\.$/, '');

  if (!lower.includes('.')) return { safe: false, reason: 'Single-Label-Hostnames sind nicht erlaubt' };
  if (BLOCKED_HOSTNAMES.has(lower)) return { safe: false, reason: 'Interner Hostname blockiert' };
  for (const blocked of BLOCKED_HOSTNAMES) {
    if (lower.endsWith(`.${blocked}`)) return { safe: false, reason: 'Interner Hostname blockiert' };
  }
  if (net.isIP(lower) && isPrivateOrReservedIP(lower)) {
    return { safe: false, reason: 'Private oder reservierte IP-Adressen sind nicht erlaubt' };
  }

  return { safe: true };
}

export function validatePort(parsed) {
  const effectivePort = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  if (parsed.protocol === 'https:' && effectivePort !== '443') {
    return { safe: false, reason: 'Nur HTTPS-Port 443 ist erlaubt' };
  }
  if (parsed.protocol === 'http:' && effectivePort !== '80') {
    return { safe: false, reason: 'Nur HTTP-Port 80 ist erlaubt' };
  }
  return { safe: true };
}

export async function validateTargetUrlForSSRF(rawUrl, options = {}) {
  const parsed = normalizeTargetUrl(rawUrl);
  if (!parsed) return { safe: false, reason: 'Ungueltiges URL-Format' };

  const hostnameCheck = validateHostname(parsed.hostname);
  if (!hostnameCheck.safe) return hostnameCheck;

  const portCheck = validatePort(parsed);
  if (!portCheck.safe) return portCheck;

  if (!net.isIP(parsed.hostname)) {
    let addresses;
    try {
      addresses = await (options.lookup || dns.lookup)(parsed.hostname, { all: true, verbatim: true });
    } catch (_) {
      return { safe: false, reason: 'DNS-Aufloesung fehlgeschlagen' };
    }

    if (!addresses.length) return { safe: false, reason: 'DNS-Aufloesung ohne Ergebnis' };
    for (const address of addresses) {
      if (isPrivateOrReservedIP(address.address)) {
        return { safe: false, reason: 'DNS zeigt auf private oder reservierte IP-Adresse' };
      }
    }
  }

  return { safe: true, url: parsed.href };
}

export async function fetchWithSSRFProtection(rawUrl, fetchOptions = {}, options = {}) {
  let currentUrl = rawUrl;
  const maxRedirects = options.maxRedirects || 5;
  const fetchImpl = options.fetchImpl || fetch;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const validation = await validateTargetUrlForSSRF(currentUrl, options);
    if (!validation.safe) {
      const error = new Error(validation.reason);
      error.code = 'SSRF_BLOCKED';
      throw error;
    }

    const response = await fetchImpl(validation.url, { ...fetchOptions, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;

    const location = response.headers.get('location');
    if (!location) return response;
    currentUrl = new URL(location, validation.url).href;
  }

  const error = new Error('Zu viele Redirects');
  error.code = 'TOO_MANY_REDIRECTS';
  throw error;
}
