#!/usr/bin/env node
/**
 * AidSec E-Mail Automation
 * Sendet automatisierte E-Mails bei Statusänderungen
 * 
 * Usage: node send-email.js --type confirmation --order ord_xxx --data data.json
 */

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Konfiguration
const CONFIG = {
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  },
  from: process.env.EMAIL_FROM || 'AidSec <info@aidsec.ch>',
  to: process.env.EMAIL_TO || 'aid.destani@aidsec.ch'
};

// E-Mail-Templates
const TEMPLATES = {
  confirmation: {
    subject: '✅ Auftrag bestätigt – AidSec',
    getBody: (data) => `
Sehr geehrte${data.customer.name.includes('Dr.') ? 'r' : ''} ${data.customer.name},

vielen Dank für Ihren Auftrag bei AidSec!

═══════════════════════════════════════════
AUFTRAGSBESTÄTIGUNG
═══════════════════════════════════════════

Auftrags-Nr.: ${data.orderId}
Website: ${data.website.url}
Paket: ${data.package}

═══════════════════════════════════════════
NÄCHSTE SCHRITTE
═══════════════════════════════════════════

1. Analyse (innert 1 Stunde)
   Wir prüfen Ihre aktuelle Security Headers Konfiguration.

2. Umsetzung (innert 24 Stunden)
   Die Security Headers werden auf Note A optimiert.

3. Verifizierung (nach Umsetzung)
   Sie erhalten den Nachweis per E-Mail.

═══════════════════════════════════════════

Bei Fragen sind wir für Sie da:
• E-Mail: info@aidsec.ch
• Website: https://aidsec.ch

Mit freundlichen Grüssen
Ihr AidSec-Team

--
AidSec – Digitale Sicherheit für Schweizer Kanzleien und Praxen
info@aidsec.ch | https://aidsec.ch
    `.trim()
  },

  statusUpdate: {
    subject: '📊 Status-Update – AidSec Auftrag ${orderId}',
    getBody: (data) => `
Sehr geehrte${data.customer.name.includes('Dr.') ? 'r' : ''} ${data.customer.name},

Ihr AidSec Auftrag macht Fortschritte!

═══════════════════════════════════════════
STATUS-UPDATE
═══════════════════════════════════════════

Auftrags-Nr.: ${data.orderId}
Website: ${data.website.url}
Aktueller Status: ${data.status}

═══════════════════════════════════════════
TIMELINE
═══════════════════════════════════════════

${data.timeline.map(t => `• ${t.step}: ${t.time}`).join('\n')}

═══════════════════════════════════════════

Bei Fragen sind wir für Sie da:
• E-Mail: info@aidsec.ch

Mit freundlichen Grüssen
Ihr AidSec-Team

--
AidSec – Digitale Sicherheit für Schweizer Kanzleien und Praxen
    `.trim()
  },

  completed: {
    subject: '🎉 Auftrag abgeschlossen – AidSec Audit-Protokoll',
    getBody: (data) => `
Sehr geehrte${data.customer.name.includes('Dr.') ? 'r' : ''} ${data.customer.name},

wir freuen uns, Ihnen mitteilen zu können, dass Ihr Auftrag erfolgreich abgeschlossen wurde!

═══════════════════════════════════════════
ERGEBNIS
═══════════════════════════════════════════

Auftrags-Nr.: ${data.orderId}
Website: ${data.website.url}
Paket: ${data.package}

───────────────────────
VORHER          NACHHER
───────────────────────
Note: ${data.results.gradeBefore}     →     Note: ${data.results.gradeAfter}
Score: ${data.results.scoreBefore}/6  →  Score: ${data.results.scoreAfter}/6
───────────────────────

Alle implementierten Security Headers:
${data.headers.map(h => `• ${h.label}: ${h.present ? '✓' : '✗'}`).join('\n')}

═══════════════════════════════════════════
IHRE NÄCHSTEN SCHRITTE
═══════════════════════════════════════════

1. Verifizieren Sie das Ergebnis:
   → https://securityheaders.com/?q=${encodeURIComponent(data.website.url)}

2. Laden Sie Ihr Audit-Protokoll herunter:
   → Im Anhang dieser E-Mail

3. Für laufenden Schutz:
   Wir empfehlen Cyber-Mandat Pro für monatliche Monitoring und Nachweise.

═══════════════════════════════════════════
DATENSCHUTZ (nDSG)
═══════════════════════════════════════════

Die implementierten technischen Massnahmen entsprechen den Anforderungen
gemäss Art. 8 nDSG (Datenschutzgesetz).

═══════════════════════════════════════════

Bei Fragen sind wir für Sie da:
• E-Mail: info@aidsec.ch

Mit freundlichen Grüssen
Ihr AidSec-Team

--
AidSec – Digitale Sicherheit für Schweizer Kanzleien und Praxen
info@aidsec.ch | https://aidsec.ch
    `.trim()
  },

  reminder: {
    subject: '⏰ Erinnerung: Ihr AidSec Schutz läuft bald ab',
    getBody: (data) => `
Sehr geehrte${data.customer.name.includes('Dr.') ? 'r' : ''} ${data.customer.name},

wir möchten Sie daran erinnern, dass Ihr AidSec Schutz am ${data.expiryDate} ausläuft.

═══════════════════════════════════════════
IHR AKTUELLER SCHUTZ
═══════════════════════════════════════════

Website: ${data.website.url}
Paket: ${data.package}
Läuft ab: ${data.expiryDate}

═══════════════════════════════════════════
EMPFEHLUNG
═══════════════════════════════════════════

Für unterbrechungsfreien Schutz empfehlen wir die Verlängerung
Ihres Cyber-Mandat Pro Abonnements.

• Monatlich: CHF 89.–
• Jährlich: CHF 950.– (2 Monate gratis)

═══════════════════════════════════════════

Jetzt verlängern: https://aidsec.ch/kunden

Bei Fragen sind wir für Sie da:
• E-Mail: info@aidsec.ch

Mit freundlichen Grüssen
Ihr AidSec-Team

--
AidSec – Digitale Sicherheit für Schweizer Kanzleien und Praxen
    `.trim()
  }
};

// Transporter erstellen
function createTransporter() {
  if (!CONFIG.smtp.user || !CONFIG.smtp.pass) {
    console.warn('⚠️ SMTP nicht konfiguriert - E-Mail wird nur simuliert');
    return null;
  }
  
  return nodemailer.createTransport({
    host: CONFIG.smtp.host,
    port: CONFIG.smtp.port,
    secure: CONFIG.smtp.secure,
    auth: {
      user: CONFIG.smtp.user,
      pass: CONFIG.smtp.pass
    }
  });
}

// Mock-Daten für Testing
function getMockData(type, orderId) {
  const base = {
    orderId: orderId || 'ord_demo_001',
    customer: {
      name: 'Dr. Max Muster',
      email: 'test@example.com'
    },
    website: {
      url: 'https://muster-kanzlei.ch'
    },
    package: 'Rapid Header Fix'
  };
  
  if (type === 'confirmation') {
    return base;
  }
  
  if (type === 'statusUpdate') {
    return {
      ...base,
      status: 'Headers werden implementiert',
      timeline: [
        { step: 'Auftrag erteilt', time: '10. April 2026, 14:00' },
        { step: 'Analyse abgeschlossen', time: '10. April 2026, 14:05' },
        { step: 'Headers werden implementiert', time: 'Läuft...' }
      ]
    };
  }
  
  if (type === 'completed') {
    return {
      ...base,
      results: {
        gradeBefore: 'F',
        gradeAfter: 'A',
        scoreBefore: 0,
        scoreAfter: 6
      },
      headers: [
        { label: 'Strict-Transport-Security', present: true },
        { label: 'Content-Security-Policy', present: true },
        { label: 'X-Frame-Options', present: true },
        { label: 'X-Content-Type-Options', present: true },
        { label: 'Referrer-Policy', present: true },
        { label: 'Permissions-Policy', present: true }
      ]
    };
  }
  
  if (type === 'reminder') {
    return {
      ...base,
      expiryDate: '10. Mai 2026',
      package: 'Cyber-Mandat Pro'
    };
  }
  
  return base;
}

// E-Mail senden
async function sendEmail(type, options = {}) {
  const data = options.data || getMockData(type, options.orderId);
  const template = TEMPLATES[type];
  
  if (!template) {
    throw new Error('Unbekannter E-Mail-Typ: ' + type);
  }
  
  const subject = template.subject.replace('${orderId}', data.orderId);
  const body = template.getBody(data);
  
  console.log('\n=== E-Mail senden ===');
  console.log('Typ:', type);
  console.log('An:', data.customer.email);
  console.log('Betreff:', subject);
  console.log('\n--- Body Preview ---');
  console.log(body.substring(0, 500) + '...\n');
  
  const transporter = createTransporter();
  
  if (!transporter) {
    console.log('⚠️ SMTP nicht konfiguriert - E-Mail nicht gesendet (Simulationsmodus)');
    return { simulated: true, type, data };
  }
  
  try {
    const result = await transporter.sendMail({
      from: CONFIG.from,
      to: data.customer.email,
      subject: subject,
      text: body
    });
    
    console.log('✓ E-Mail gesendet:', result.messageId);
    return result;
  } catch (error) {
    console.error('✗ E-Mail-Fehler:', error.message);
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
    } else if (args[i] === '--order' && args[i + 1]) {
      options.orderId = args[++i];
    } else if (args[i] === '--data' && args[i + 1]) {
      options.data = JSON.parse(fs.readFileSync(args[++i], 'utf8'));
    } else if (args[i] === '--to' && args[i + 1]) {
      options.data = { customer: { email: args[++i], name: 'Test' } };
    }
  }
  
  if (!options.type) {
    console.log(`
AidSec E-Mail Automation

Usage: node send-email.js --type <type> [--order ord_xxx] [--data data.json]

Types:
  confirmation   - Auftragsbestätigung
  statusUpdate   - Status-Update während der Bearbeitung
  completed      - Abschluss-Benachrichtigung mit Report
  reminder       - Erinnerung vor Vertragsablauf

Examples:
  node send-email.js --type confirmation --order ord_001
  node send-email.js --type completed --order ord_001 --data mydata.json
    `.trim());
    process.exit(1);
  }
  
  try {
    await sendEmail(options.type, options);
  } catch (error) {
    console.error('Fehler:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { sendEmail, TEMPLATES };
