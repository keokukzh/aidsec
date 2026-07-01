/**
 * AidSec WordPress Plugin Update API
 * Returns update metadata for the premium WordPress plugin.
 * 
 * GET /api/plugin/update
 */

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Returns plugin update metadata in WordPress-compatible format
  const updateData = {
    name: 'AidSec Security — WordPress Security Header Optimizer',
    slug: 'aidsec-security',
    version: '2.0.0',
    download_url: 'https://aidsec.ch/assets/downloads/aidsec-security.zip',
    tested: '6.5',
    requires: '5.8',
    author: 'AidSec',
    author_profile: 'https://aidsec.ch',
    sections: {
      description: 'Optimiert Security Headers, schuetzt vor XSS/Clickjacking und bringt Ihre WordPress-Website auf Note A in 24 Stunden. nDSG-konform.',
      changelog: '<h4>2.0.0</h4><ul><li>Erweiterte Auto-Server-Detection (Nginx, Apache, Vercel).</li><li>Automatisierte Haertung und Scan-Reporting.</li><li>Verbesserte Lizenzpruefung.</li></ul>'
    }
  };

  return res.status(200).json(updateData);
}
