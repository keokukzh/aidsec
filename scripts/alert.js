#!/usr/bin/env node
/**
 * AidSec Alert System
 * Sendet Benachrichtigungen bei Security-Problemen
 * 
 * Usage: node alert.js --type critical --issues ./reports/monthly/2026-04-01.json
 */

const fs = require('fs');
const nodemailer = require('nodemailer');

// Konfiguration
const CONFIG = {
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  },
  alertsEmail: process.env.ALERTS_EMAIL || 'info@aidsec.ch',
  fromEmail: process.env.EMAIL_FROM || 'AidSec Alerting <alerts@aidsec.ch>'
};

// Severity Icons
const ICONS = {
  critical: '🔴',
  warning: '⚠️',
  info: 'ℹ️'
};

// Alert-Templates
const TEMPLATES = {
  critical: {
    subject: '[KRITISCH] AidSec Security Alert – Sofortige Aktion erforderlich',
    getBody: (data) => `
${ICONS.critical} KRITISCHER SECURITY ALERT

============================================================

Datum: ${data.timestamp}
Kunden betroffen: ${data.issues.length}

============================================================

AKTION ERFORDERLICH:

${data.issues.map((issue, i) => `
${i + 1}. ${issue.customerName}
   Website: ${issue.website}
   Problem: ${issue.message}
   Typ: ${issue.type}
`).join('\n')}

============================================================

EMPFOHLENE AKTION:

Bei Security Header Problemen:
1. Website-Status prüfen
2. Hosting-Konfiguration prüfen
3. Header erneut implementieren

Bei Blacklist-Problemen:
1. Blacklist-Entfernung einleiten
2. E-Mail-Authentifizierung prüfen (SPF/DKIM/DMARC)
3. Domain-Reputation wiederherstellen

============================================================

Dies ist eine automatische Benachrichtigung von AidSec Cyber-Mandat Pro.

Kontakt: ${CONFIG.alertsEmail}
    `.trim()
  },

  warning: {
    subject: '[WARNUNG] AidSec Monitoring Report – Handlungsbedarf',
    getBody: (data) => `
${ICONS.warning} WARNUNG - HANDLUNGSBEDARF

============================================================

Datum: ${data.timestamp}
Probleme gefunden: ${data.issues.length}

============================================================

Übersicht:

${data.issues.map((issue, i) => `
${i + 1}. ${issue.customerName}
   Website: ${issue.website}
   Problem: ${issue.message}
`).join('\n')}

============================================================

RECOMMENDATION:

Diese Probleme sollten in den nächsten Wochen behoben werden,
um die Sicherheit und nDSG-Compliance zu gewährleisten.

============================================================

Kontakt: ${CONFIG.alertsEmail}
    `.trim()
  },

  summary: {
    subject: '✅ AidSec Monatsreport – Alle Systeme operativ',
    getBody: (data) => `
✅ MONATLICHER SECURITY REPORT

============================================================

Datum: ${data.timestamp}
Kunden geprüft: ${data.summary.total}
Status: ${data.summary.ok} OK | ${data.summary.warning} Warnung | ${data.summary.critical} Kritisch

============================================================

Alle Cyber-Mandat Pro Kunden wurden erfolgreich geprüft.
Keine kritischen Probleme gefunden.

Kunden mit Bestnoten (A): ${data.summary.ok}

============================================================

Nächste automatische Prüfung: in 30 Tagen

Kontakt: ${CONFIG.alertsEmail}
    `.trim()
  }
};

// E-Mail senden
async function sendAlert(type, data) {
  const template = TEMPLATES[type];
  if (!template) {
    throw new Error('Unbekannter Alert-Typ: ' + type);
  }

  const subject = template.subject;
  const body = template.getBody(data);

  console.log('\n=== Alert senden ===');
  console.log('Typ:', type);
  console.log('An:', CONFIG.alertsEmail);
  console.log('Betreff:', subject);

  // SMTP Transporter erstellen
  let transporter;
  if (CONFIG.smtp.user && CONFIG.smtp.pass) {
    transporter = nodemailer.createTransport({
      host: CONFIG.smtp.host,
      port: CONFIG.smtp.port,
      secure: CONFIG.smtp.secure,
      auth: {
        user: CONFIG.smtp.user,
        pass: CONFIG.smtp.pass
      }
    });
  } else {
    console.log('⚠️ SMTP nicht konfiguriert - Alert wird nur simuliert');
    console.log('\n--- E-Mail Body ---');
    console.log(body);
    return { simulated: true };
  }

  try {
    const result = await transporter.sendMail({
      from: CONFIG.fromEmail,
      to: CONFIG.alertsEmail,
      subject: subject,
      text: body
    });

    console.log('✓ Alert gesendet:', result.messageId);
    return result;
  } catch (error) {
    console.error('✗ Alert-Fehler:', error.message);
    throw error;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) {
      options.type = args[++i];
    } else if (args[i] === '--issues' && args[i + 1]) {
      options.issuesFile = args[++i];
    }
  }

  if (!options.type) {
    console.log(`
AidSec Alert System

Usage: node alert.js --type <type> [--issues ./report.json]

Types:
  critical   - Kritische Security-Probleme
  warning    - Warnungen
  summary    - Monatlicher Summary-Report

Examples:
  node alert.js --type critical --issues ./reports/monthly/2026-04-01.json
  node alert.js --type summary --issues ./reports/monthly/2026-04-01.json
    `.trim());
    process.exit(1);
  }

  // Load issues from file if provided
  let data = {
    timestamp: new Date().toISOString(),
    issues: [],
    summary: { total: 0, ok: 0, warning: 0, critical: 0 }
  };

  if (options.issuesFile && fs.existsSync(options.issuesFile)) {
    const report = JSON.parse(fs.readFileSync(options.issuesFile, 'utf8'));
    data.issues = report.issues || [];
    data.summary = report.summary || data.summary;
    data.timestamp = report.timestamp || data.timestamp;
  }

  try {
    await sendAlert(options.type, data);
  } catch (error) {
    console.error('Fehler:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { sendAlert, TEMPLATES };
