/**
 * AidSec AI Offer Generator
 * Generiert personalisierte Angebote basierend auf Website-Analyse und Lead-Daten
 *
 * POST /api/ai/offer-generator
 * Body: { websiteUrl, email, name, company, productSlug? }
 */

import { getEnvFirst, isProduction } from '../lib/env.js';
import { storage } from '../cron/storage.js';
import { generateMagicToken } from '../lib/order-token.js';

const GATEWAY_API_KEY = getEnvFirst(['AI_GATEWAY_API_KEY']);
const GATEWAY_BASE_URL = 'https://gateway.hubble.ai/v1/chat/completions';

function buildSystemPrompt() {
  return `Du bist ein erfahrener Cybersecurity-Berater für Schweizer Anwaltskanzleien, Arztpraxen, Notariate und Treuhand-Unternehmen.

Deine Aufgabe ist es, personalisierte AidSec-Angebote zu erstellen basierend auf:
1. Security Header Analyse (websites, grades)
2. Lead-Score und Kundenhistorie
3. Schweizer Datenschutz-Anforderungen (nDSG)

AidSec Produkte:
- AidSec Express (CHF 390) — Sofort-Header-Optimierung, Note F → A in 24h
- AidSec Protect/Kanzlei-Härtung (CHF 790) — Vollständige WordPress-Härtung, Firewall, nDSG-Protokoll
- Cyber-Mandat Pro (CHF 89/Monat) — Laufendes Security-Monitoring, monatliche Re-Audits, Executive Reports

Wichtige Selling Points:
- Schweizer Datenschutz (nDSG-konform)
- Keine Drittstaaten-Datenweitergabe
- 24h Response-Zeit
- Note A bis F in 24h garantiert
- R2-Storage für Reports (keine lokalen Daten)

Antworte IMMER auf Deutsch mit professionellem Ton.
Format: JSON mit fields: offerTitle, offerBody, recommendedProduct, urgencyScore (1-10), nextStep`;
}

function buildUserPrompt(leadData, auditResult) {
  const grade = auditResult?.grade || 'F';
  const score = auditResult?.score || 0;
  const gradeColor = grade === 'F' || grade === 'E' ? 'rot' : grade === 'D' || grade === 'C' ? 'gelb' : 'grün';

  return `Erstelle ein personalisiertes Angebot für:

Kontakt: ${leadData.name || 'Unbekannt'} (${leadData.email || 'N/A'})
Unternehmen: ${leadData.company || 'N/A'}
Website: ${leadData.websiteUrl}

Security-Analyse:
- aktuelle Note: ${grade}
- Score: ${score}/6
- Server: ${auditResult?.server || 'N/A'}
- Geprüft am: ${auditResult?.checkedAt || new Date().toISOString()}

Folgende spezifische Sicherheitslücken wurden gefunden:
${auditResult?.headers ? Object.entries(auditResult.headers).filter(([, v]) => !v.present).map(([k]) => `- ${k}`).join('\n') : '- Security Headers unvollständig'}

Erstelle ein überzeugendes, personalisiertes Angebot mit klarem Call-to-Action.`;
}

async function generateOfferWithAI(leadData, auditResult) {
  if (!GATEWAY_API_KEY) {
    return generateFallbackOffer(leadData, auditResult);
  }

  const response = await fetch(GATEWAY_BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GATEWAY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-5.4',
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(leadData, auditResult) },
      ],
      temperature: 0.7,
      max_tokens: 800,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('[offer-generator] OpenAI error:', err);
    return generateFallbackOffer(leadData, auditResult);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) return generateFallbackOffer(leadData, auditResult);

  try {
    return JSON.parse(content);
  } catch (_) {
    console.warn('[offer-generator] Failed to parse AI response, using fallback');
    return generateFallbackOffer(leadData, auditResult);
  }
}

function generateFallbackOffer(leadData, auditResult) {
  const grade = auditResult?.grade || 'F';
  const product = grade === 'F' || grade === 'E' ? 'rapid-header-fix' : 'kanzlei-haertung';
  const productNames = {
    'rapid-header-fix': 'AidSec Express (CHF 390)',
    'kanzlei-haertung': 'AidSec Kanzlei-Härtung (CHF 790)',
    'cyber-mandat': 'Cyber-Mandat Pro (CHF 89/Monat)',
  };

  return {
    offerTitle: `Security-Analyse: Note ${grade} — Handlungsbedarf`,
    offerBody: `Sehr geehrte/r ${leadData.name || 'Herr/Frau'},\n\nIhre Website "${leadData.websiteUrl}" wurde einem kostenlosen Security-Check unterzogen. Das Ergebnis: Note ${grade}.\n\nDies bedeutet, dass Ihre Website erhebliche Sicherheitslücken aufweist, die sowohl Ihre Daten als auch die Ihrer Mandanten gefährden. Im schlimmsten Fall drohen nDSG-Bussen bis zu CHF 250'000.\n\nWir bieten Ihnen eine sofortige Lösung:\n${productNames[product]}\n\n- Note F bis A in 24 Stunden\n- nDSG-konform\n- Schweizer Server & Speicherung\n\nHandeln Sie jetzt — bevor jemand anderes handelt.\n\nFreundliche Grüsse\nAidSec`,
    recommendedProduct: product,
    urgencyScore: grade === 'F' || grade === 'E' ? 9 : grade === 'D' ? 7 : 5,
    nextStep: 'Kostenlose Beratung vereinbaren',
  };
}

async function checkWebsiteHeaders(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const apiUrl = `https://${process.env.AUTH_DOMAIN || 'aidsec.ch'}/api/check-headers?url=${encodeURIComponent(url)}`;
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AidSec-OfferGenerator/1.0',
        'Accept': 'application/json',
      },
    });

    clearTimeout(timeout);
    if (!response.ok) return null;
    return await response.json();
  } catch (_) {
    clearTimeout(timeout);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const { websiteUrl, email, name, company } = body;

    if (!websiteUrl || !email) {
      return res.status(400).json({
        error: 'Pflichtfelder fehlen',
        required: ['websiteUrl', 'email'],
      });
    }

    // 1. Check website and get audit result
    const auditResult = await checkWebsiteHeaders(websiteUrl);

    // 2. Build lead data
    const leadData = { websiteUrl, email, name, company };

    // 3. Generate personalized offer using AI (or fallback)
    const offer = await generateOfferWithAI(leadData, auditResult);

    // 4. Save offer to storage
    const offerRecord = {
      offerId: `offer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      leadData,
      auditResult: auditResult ? {
        url: auditResult.url,
        grade: auditResult.grade,
        score: auditResult.score,
        server: auditResult.server,
        checkedAt: auditResult.metadata?.checkedAt,
      } : null,
      offer,
      createdAt: new Date().toISOString(),
    };

    try {
      const key = `reports/offers/${offerRecord.offerId}.json`;
      await storage.put(key, offerRecord);
      offerRecord.storageKey = key;
    } catch (_) {}

    // 5. Return offer
    return res.status(200).json({
      success: true,
      offerId: offerRecord.offerId,
      websiteUrl,
      auditResult: offerRecord.auditResult,
      offer,
      generatedAt: offerRecord.createdAt,
    });
  } catch (error) {
    console.error('[offer-generator] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}