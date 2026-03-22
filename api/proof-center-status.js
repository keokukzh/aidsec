import { readFile } from 'node:fs/promises';

const SITE_DATA_URL = new URL('../data/site-data.json', import.meta.url);

async function loadSiteData() {
  const raw = await readFile(SITE_DATA_URL, 'utf8');
  return JSON.parse(raw);
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