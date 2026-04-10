/**
 * AidSec Order Status API
 * Gibt den aktuellen Status einer Bestellung zurück
 * 
 * GET /api/order-status?orderId=ord_xxx
 */

import crypto from 'crypto';

// In-Memory Store (ersetzt durch Redis in Produktion)
const orderStore = new Map();

// Demo-Daten für Testing
const demoOrders = {
  'ord_demo_001': {
    orderId: 'ord_demo_001',
    customer: {
      name: 'Dr. Max Muster',
      company: 'Muster & Partner Rechtsanwälte',
      email: 'm.muster@muster-kanzlei.ch'
    },
    website: {
      url: 'https://muster-kanzlei.ch',
      server: 'Apache (Cloudflare)',
      package: 'Rapid Header Fix'
    },
    status: 'complete',
    timeline: {
      ordered: { time: '2026-04-10T12:00:00Z', label: 'Auftrag erteilt', step: 1 },
      analysis: { time: '2026-04-10T12:05:00Z', label: 'Analyse abgeschlossen', step: 2 },
      implementation: { time: '2026-04-10T12:30:00Z', label: 'Headers implementiert', step: 3 },
      verification: { time: '2026-04-10T12:35:00Z', label: 'Verifizierung', step: 4 },
      complete: { time: '2026-04-10T12:40:00Z', label: 'Abgeschlossen', step: 5 }
    },
    results: {
      gradeBefore: 'F',
      gradeAfter: 'A',
      scoreBefore: 0,
      scoreAfter: 6,
      headersImproved: 6,
      downtime: '0 Minuten'
    },
    reportUrl: null,
    createdAt: '2026-04-10T12:00:00Z'
  },
  'ord_demo_002': {
    orderId: 'ord_demo_002',
    customer: {
      name: 'Praxis Dr. Huber',
      company: 'Allgemeinmedizin',
      email: 'info@praxis-huber.ch'
    },
    website: {
      url: 'https://praxis-huber.ch',
      server: 'Nginx',
      package: 'Kanzlei-Härtung'
    },
    status: 'active',
    timeline: {
      ordered: { time: '2026-04-10T11:00:00Z', label: 'Auftrag erteilt', step: 1 },
      analysis: { time: '2026-04-10T11:10:00Z', label: 'Analyse abgeschlossen', step: 2 },
      implementation: { time: null, label: 'Headers werden implementiert', step: 3 },
      verification: { time: null, label: 'Verifizierung', step: 4 },
      complete: { time: null, label: 'Abgeschlossen', step: 5 }
    },
    results: {
      gradeBefore: 'F',
      gradeAfter: null,
      scoreBefore: 0,
      scoreAfter: null
    },
    reportUrl: null,
    createdAt: '2026-04-10T11:00:00Z'
  }
};

// Order erstellen (würde normalerweise beim Kauf aufgerufen)
function createOrder(data) {
  const orderId = 'ord_' + crypto.randomBytes(8).toString('hex');
  
  const order = {
    orderId,
    customer: data.customer,
    website: data.website,
    package: data.package,
    status: 'pending',
    timeline: {
      ordered: { time: new Date().toISOString(), label: 'Auftrag erteilt', step: 1 },
      analysis: { time: null, label: 'Analyse läuft', step: 2 },
      implementation: { time: null, label: 'Headers werden implementiert', step: 3 },
      verification: { time: null, label: 'Verifizierung', step: 4 },
      complete: { time: null, label: 'Abgeschlossen', step: 5 }
    },
    results: {
      gradeBefore: null,
      gradeAfter: null,
      scoreBefore: null,
      scoreAfter: null
    },
    reportUrl: null,
    createdAt: new Date().toISOString()
  };
  
  orderStore.set(orderId, order);
  return order;
}

// Order aktualisieren
function updateOrder(orderId, updates) {
  const order = orderStore.get(orderId);
  if (!order) return null;
  
  Object.assign(order, updates);
  order.updatedAt = new Date().toISOString();
  
  return order;
}

// Order abrufen
function getOrder(orderId) {
  // Erst im Store suchen
  let order = orderStore.get(orderId);
  
  // Dann in Demo-Daten
  if (!order && demoOrders[orderId]) {
    order = demoOrders[orderId];
  }
  
  return order;
}

// Timeline für API-Response formatieren
function formatTimeline(timeline) {
  return Object.entries(timeline).map(([key, value]) => ({
    key,
    ...value
  }));
}

// API Handler
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { orderId } = req.query;

  if (req.method === 'GET') {
    // Order Status abrufen
    if (!orderId) {
      return res.status(400).json({
        error: 'orderId Parameter erforderlich',
        example: '/api/order-status?orderId=ord_demo_001'
      });
    }

    const order = getOrder(orderId);

    if (!order) {
      return res.status(404).json({
        error: 'Auftrag nicht gefunden',
        orderId,
        hint: 'Bitte überprüfen Sie die Auftrags-Nr.'
      });
    }

    // Response formatieren
    return res.status(200).json({
      success: true,
      order: {
        orderId: order.orderId,
        customer: order.customer,
        website: order.website,
        package: order.package,
        status: order.status,
        statusLabel: {
          pending: 'Ausstehend',
          active: 'In Bearbeitung',
          complete: 'Abgeschlossen',
          error: 'Fehler'
        }[order.status],
        timeline: formatTimeline(order.timeline),
        results: order.results,
        reportUrl: order.reportUrl,
        createdAt: order.createdAt
      }
    });
  }

  if (req.method === 'POST') {
    // Neue Order erstellen
    try {
      const data = req.body || {};
      
      if (!data.customer?.email || !data.website?.url || !data.package) {
        return res.status(400).json({
          error: 'Pflichtfelder fehlen',
          required: ['customer.email', 'website.url', 'package']
        });
      }
      
      const order = createOrder(data);
      
      return res.status(201).json({
        success: true,
        order: {
          orderId: order.orderId,
          status: order.status,
          message: 'Auftrag erfolgreich erstellt'
        }
      });
    } catch (error) {
      return res.status(500).json({
        error: 'Fehler beim Erstellen des Auftrags'
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
