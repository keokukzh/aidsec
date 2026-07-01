import dns from 'dns';
import { getEnvFirst, isProduction } from './env.js';

/**
 * Resolves a hostname to its IP address.
 */
async function resolveDomainIp(hostname) {
  return new Promise((resolve) => {
    dns.resolve4(hostname, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        resolve(null);
      } else {
        resolve(addresses[0]);
      }
    });
  });
}

/**
 * Checks if an IP is listed on Spamhaus DNSBL.
 */
async function checkDnsbl(ip) {
  if (!ip) return { listed: false };
  const reversedIp = ip.split('.').reverse().join('.');
  const dnsblDomain = `${reversedIp}.zen.spamhaus.org`;

  return new Promise((resolve) => {
    dns.resolve4(dnsblDomain, (err, addresses) => {
      if (!err && addresses && addresses.length > 0) {
        resolve({
          listed: true,
          listName: 'Spamhaus (zen.spamhaus.org)',
          details: `Listed with code ${addresses[0]}`
        });
      } else {
        resolve({ listed: false });
      }
    });
  });
}

/**
 * Checks a URL against Google Safe Browsing API.
 */
export async function checkGoogleSafeBrowsing(url) {
  const apiKey = getEnvFirst(['GOOGLE_SAFE_BROWSING_API_KEY', 'GOOGLE_API_KEY']);
  if (!apiKey) {
    return { safe: true, info: 'Google Safe Browsing key not configured' };
  }

  try {
    const response = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'aidsec', clientVersion: '2.0.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url }],
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Google API returned ${response.status}`);
    }

    const data = await response.json();
    if (data && data.matches && data.matches.length > 0) {
      return {
        safe: false,
        threatType: data.matches[0].threatType,
        details: 'Flagged as unsafe by Google Safe Browsing'
      };
    }
    return { safe: true };
  } catch (error) {
    console.warn('[reputation] Google Safe Browsing API check failed:', error.message);
    return { safe: true, error: error.message };
  }
}

/**
 * Checks both DNSBL and Safe Browsing.
 */
export async function checkDomainReputation(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    
    const ip = await resolveDomainIp(hostname);
    
    const [dnsblResult, safeBrowsingResult] = await Promise.all([
      checkDnsbl(ip),
      checkGoogleSafeBrowsing(url)
    ]);
    
    return {
      hostname,
      ip: ip || 'unknown',
      dnsbl: dnsblResult,
      safeBrowsing: safeBrowsingResult,
      isClean: !dnsblResult.listed && safeBrowsingResult.safe
    };
  } catch (error) {
    console.error('[reputation] Check failed:', error.message);
    return {
      error: error.message,
      isClean: true
    };
  }
}
