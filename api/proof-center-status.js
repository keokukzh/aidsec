/**
 * AidSec Proof Center Status API
 * Returns proof center data from site-data.json
 *
 * Uses fetch instead of fs to work in Vercel Edge runtime.
 */

async function loadSiteData() {
  // In Vercel: fetch from the same origin (git-tracked static file)
  // In local dev: fetch from localhost
  const baseUrl = process.env.BASE_URL || (process.env.NODE_ENV === 'production'
    ? 'https://aidsec.ch'
    : 'http://localhost:5173');

  const response = await fetch(`${baseUrl}/data/site-data.json`, {
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Failed to load site-data: ${response.status}`);
  }

  return response.json();
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

  try {
    const siteData = await loadSiteData();
    return res.status(200).json({
      updatedAt: siteData.updatedAt,
      packages: siteData.packages,
      proofCenter: siteData.proofCenter,
    });
  } catch (_) {
    return res.status(500).json({
      error: 'Proof-Center-Daten konnten nicht geladen werden.',
    });
  }
}
