#!/usr/bin/env node
/**
 * AidSec Report Generator
 * Füllt das Audit-Report-Template mit echten Daten
 * 
 * Usage: node generate-report.js --order ord_xxx --output ./reports/
 */

const fs = require('fs');
const path = require('path');

// Template einlesen
const TEMPLATE_PATH = path.join(__dirname, '../templates/audit-report.html');

// Kommandozeilen-Argumente parsen
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--order' && args[i + 1]) {
    options.orderId = args[++i];
  } else if (args[i] === '--output' && args[i + 1]) {
    options.outputDir = args[++i];
  } else if (args[i] === '--data' && args[i + 1]) {
    options.dataFile = args[++i];
  }
}

// Daten laden (aus Datei oder Mock-Daten)
function loadData(options) {
  if (options.dataFile && fs.existsSync(options.dataFile)) {
    return JSON.parse(fs.readFileSync(options.dataFile, 'utf8'));
  }
  
  // Mock-Daten für Testing
  return {
    orderId: options.orderId || 'ord_demo_001',
    date: new Date().toLocaleDateString('de-CH', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }),
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
    timeline: {
      ordered: '10. April 2026',
      implemented: '10. April 2026, 14:30',
      verified: '10. April 2026, 14:35',
      duration: '5 Minuten'
    },
    results: {
      gradeBefore: 'F',
      gradeAfter: 'A',
      scoreBefore: 0,
      scoreAfter: 6,
      headersImproved: 6,
      downtime: '0 Minuten'
    },
    headers: [
      { name: 'Strict-Transport-Security', status: 'yes', statusIcon: '✓', statusText: 'Implementiert', value: 'max-age=31536000; includeSubDomains; preload' },
      { name: 'Content-Security-Policy', status: 'yes', statusIcon: '✓', statusText: 'Implementiert', value: 'frame-ancestors \'self\'' },
      { name: 'X-Content-Type-Options', status: 'yes', statusIcon: '✓', statusText: 'Implementiert', value: 'nosniff' },
      { name: 'X-Frame-Options', status: 'yes', statusIcon: '✓', statusText: 'Implementiert', value: 'SAMEORIGIN' },
      { name: 'Referrer-Policy', status: 'yes', statusIcon: '✓', statusText: 'Implementiert', value: 'strict-origin-when-cross-origin' },
      { name: 'Permissions-Policy', status: 'yes', statusIcon: '✓', statusText: 'Implementiert', value: 'geolocation=(), microphone=(), camera=()' }
    ]
  };
}

// Template mit Daten füllen
function fillTemplate(template, data) {
  let output = template;
  
  // Einfache Template-Platzhalter ersetzen
  const replacements = {
    '{{ORDER_ID}}': data.orderId,
    '{{DATE}}': data.date,
    '{{CUSTOMER_NAME}}': data.customer.name,
    '{{CUSTOMER_COMPANY}}': data.customer.company,
    '{{CUSTOMER_EMAIL}}': data.customer.email,
    '{{WEBSITE_URL}}': data.website.url,
    '{{SERVER_TYPE}}': data.website.server,
    '{{PACKAGE_NAME}}': data.website.package,
    '{{DATE_ORDERED}}': data.timeline.ordered,
    '{{DATE_IMPLEMENTED}}': data.timeline.implemented,
    '{{DATE_VERIFIED}}': data.timeline.verified,
    '{{DURATION}}': data.timeline.duration,
    '{{GRADE_BEFORE}}': data.results.gradeBefore,
    '{{GRADE_AFTER}}': data.results.gradeAfter,
    '{{SCORE_BEFORE}}': data.results.scoreBefore,
    '{{SCORE_AFTER}}': data.results.scoreAfter,
    '{{HEADERS_IMPROVED}}': data.results.headersImproved,
    '{{DOWNTIME}}': data.results.downtime
  };
  
  // Platzhalter ersetzen
  Object.keys(replacements).forEach(key => {
    output = output.replace(new RegExp(key, 'g'), replacements[key]);
  });
  
  // Headers-Tabelle füllen
  const headersRegex = /\{\{#HEADERS\}\}([\s\S]*?)\{\{\/HEADERS\}\}/;
  const headersMatch = output.match(headersRegex);
  
  if (headersMatch) {
    const rowTemplate = headersMatch[1];
    const rows = data.headers.map(h => {
      let row = rowTemplate;
      row = row.replace(/\{\{NAME\}\}/g, h.name);
      row = row.replace(/\{\{STATUS\}\}/g, h.status);
      row = row.replace(/\{\{STATUS_ICON\}\}/g, h.statusIcon);
      row = row.replace(/\{\{STATUS_TEXT\}\}/g, h.statusText);
      row = row.replace(/\{\{VALUE\}\}/g, h.value);
      return row;
    }).join('');
    
    output = output.replace(headersRegex, rows);
  }
  
  return output;
}

// Report generieren
function generateReport(options) {
  // Template laden
  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error('Template nicht gefunden:', TEMPLATE_PATH);
    process.exit(1);
  }
  
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const data = loadData(options);
  const html = fillTemplate(template, data);
  
  // Output-Verzeichnis erstellen
  const outputDir = options.outputDir || path.join(__dirname, '../reports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // HTML-Datei schreiben
  const outputPath = path.join(outputDir, `Audit-Protokoll_${data.orderId}.html`);
  fs.writeFileSync(outputPath, html, 'utf8');
  
  console.log('✓ Report generiert:', outputPath);
  console.log('  URL:', data.website.url);
  console.log('  Kunde:', data.customer.company);
  console.log('  Ergebnis:', data.results.gradeBefore, '→', data.results.gradeAfter);
  
  return outputPath;
}

// Main
if (require.main === module) {
  console.log('AidSec Report Generator v1.0.0\n');
  
  if (!options.orderId) {
    console.log('Usage: node generate-report.js --order ord_xxx [--output ./reports/] [--data data.json]');
    console.log('\nDemo-Modus: Generiere Test-Report...\n');
  }
  
  const outputPath = generateReport(options);
  console.log('\n✓ Fertig!');
  console.log('\nFür PDF-Generierung:');
  console.log('  1. Öffnen Sie die HTML-Datei im Browser');
  console.log('  2. Drucken als PDF (Ctrl+P → Als PDF speichern)');
  console.log('  3. Oder nutzen Sie Puppeteer für automatisierte PDF-Generierung');
}

module.exports = { generateReport, fillTemplate };
