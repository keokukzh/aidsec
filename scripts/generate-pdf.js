#!/usr/bin/env node
/**
 * AidSec PDF Report Generator
 * Generiert PDF-Reports aus dem Audit-Report-Template
 * 
 * Usage: node generate-pdf.js --order ord_xxx --data data.json [--output ./reports/]
 */

const fs = require('fs');
const path = require('path');

let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  console.error('Puppeteer nicht installiert. Installation: npm install puppeteer');
  process.exit(1);
}

const TEMPLATE_PATH = path.join(__dirname, '../templates/audit-report.html');
const OUTPUT_DIR = path.join(__dirname, '../reports');

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

// Mock-Daten für Testing
function getMockData(orderId) {
  return {
    orderId: orderId || 'ord_demo_001',
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
      { name: 'Content-Security-Policy', status: 'yes', statusIcon: '✓', statusText: 'Implementiert', value: "frame-ancestors 'self'" },
      { name: 'X-Content-Type-Options', status: 'yes', statusIcon: '✓', statusText: 'Implementiert', value: 'nosniff' },
      { name: 'X-Frame-Options', status: 'yes', statusIcon: '✓', statusText: 'Implementiert', value: 'SAMEORIGIN' },
      { name: 'Referrer-Policy', status: 'yes', statusIcon: '✓', statusText: 'Implementiert', value: 'strict-origin-when-cross-origin' },
      { name: 'Permissions-Policy', status: 'yes', statusIcon: '✓', statusText: 'Implementiert', value: 'geolocation=(), microphone=(), camera=()' }
    ]
  };
}

// Daten laden
function loadData(options) {
  if (options.dataFile && fs.existsSync(options.dataFile)) {
    return JSON.parse(fs.readFileSync(options.dataFile, 'utf8'));
  }
  return getMockData(options.orderId);
}

// Template füllen
function fillTemplate(template, data) {
  let output = template;
  
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
  
  Object.keys(replacements).forEach(key => {
    output = output.replace(new RegExp(key, 'g'), replacements[key]);
  });
  
  // Headers-Tabelle
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

// PDF generieren
async function generatePDF(options) {
  console.log('Starte PDF-Generierung...');
  
  // Template laden
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error('Template nicht gefunden: ' + TEMPLATE_PATH);
  }
  
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const data = loadData(options);
  const html = fillTemplate(template, data);
  
  // Output-Verzeichnis
  const outputDir = options.outputDir || OUTPUT_DIR;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Puppeteer Browser starten
  console.log('  Browser wird gestartet...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // HTML setzen
  await page.setContent(html, { waitUntil: 'networkidle0' });
  
  // PDF generieren
  console.log('  PDF wird erstellt...');
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="font-size: 10px; width: 100%; text-align: center; color: #6B7280;">
        <span>AidSec – Digitale Sicherheit | Seite <span class="pageNumber"></span> von <span class="totalPages"></span></span>
      </div>
    `
  });
  
  await browser.close();
  
  // PDF speichern
  const outputPath = path.join(outputDir, `Audit-Protokoll_${data.orderId}.pdf`);
  fs.writeFileSync(outputPath, pdfBuffer);
  
  console.log('✓ PDF generiert:', outputPath);
  console.log('  Kunde:', data.customer.company);
  console.log('  Ergebnis:', data.results.gradeBefore, '→', data.results.gradeAfter);
  
  return outputPath;
}

// Main
if (require.main === module) {
  console.log('\n=== AidSec PDF Generator v1.0.0 ===\n');
  
  if (!options.orderId) {
    console.log('Usage: node generate-pdf.js --order ord_xxx [--data data.json] [--output ./reports/]\n');
    console.log('Demo-Modus: Generiere Test-PDF...\n');
    options.orderId = 'demo_' + Date.now();
  }
  
  generatePDF(options)
    .then(() => {
      console.log('\n✓ Fertig!');
    })
    .catch(err => {
      console.error('\n✗ Fehler:', err.message);
      process.exit(1);
    });
}

module.exports = { generatePDF };
