#!/usr/bin/env node
/**
 * AidSec Cyber-Mandat Pro Monitoring
 * Automatisiertes monatliches Security-Monitoring
 * 
 * Usage: node monitor.js [--customers ./customers.json] [--report ./reports/]
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
  apiBase: 'https://aidsec.ch/api',
  checkInterval: 30 * 24 * 60 * 60 * 1000, // 30 days
  timeout: 15000,
  retryAttempts: 2,
  retryDelay: 5000
};

const BLACKLISTS = [
  'dnsbl.phpnet.org',
  'bl.spamcop.net',
  'sbl.spamhaus.org',
  'xbl.spamhaus.org',
  'pbl.spamhaus.org',
  'cbl.abuseat.org',
  'db.wpbl.info'
];

// ============================================================
// SECURITY HEADERS CHECK
// ============================================================
const SECURITY_HEADERS = [
  'strict-transport-security',
  'content-security-policy',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy'
];

function computeGrade(score) {
  const grades = ['F', 'F', 'E', 'D', 'C', 'B', 'A'];
  return grades[Math.min(score, 6)];
}

async function checkSecurityHeaders(url) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.timeout);

    const req = https.get(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'AidSec-Monitor/1.0'
      }
    }, (res) => {
      clearTimeout(timeout);
      
      let score = 0;
      const headers = {};
      
      SECURITY_HEADERS.forEach(key => {
        const value = res.headers[key];
        const present = value !== undefined && value !== null;
        if (present) score++;
        headers[key] = { present, value: value || null };
      });

      resolve({
        url,
        grade: computeGrade(score),
        score,
        maxScore: SECURITY_HEADERS.length,
        headers,
        checkedAt: new Date().toISOString()
      });
    });

    req.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

// ============================================================
// BLACKLIST CHECK
// ============================================================
function reverseIp(ip) {
  return ip.split('.').reverse().join('.');
}

async function checkBlacklist(ip) {
  const reversed = reverseIp(ip);
  const results = [];
  
  for (const blacklist of BLACKLISTS) {
    try {
      const lookup = `${reversed}.${blacklist}`;
      
      await new Promise((resolve, reject) => {
        const req = dns.lookup(lookup, { timeout: 5000 }, (err, address) => {
          if (err && err.code === 'ENOTFOUND') {
            // Not on blacklist - good
            resolve({ listed: false, blacklist });
          } else if (address) {
            // Listed!
            resolve({ listed: true, blacklist, address });
          } else {
            resolve({ listed: false, blacklist });
          }
        });
        
        req.setTimeout(5000, () => {
          req.destroy();
          resolve({ listed: false, blacklist, error: 'timeout' });
        });
      });
      
      results.push({ blacklist, listed: false });
    } catch (e) {
      results.push({ blacklist, listed: false, error: e.message });
    }
  }
  
  return results;
}

// ============================================================
// WORDPRESS STATUS CHECK
// ============================================================
async function checkWordPress(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.timeout);

    const wpUrl = new URL(url);
    const xmlrpcUrl = `${wpUrl.protocol}//${wpUrl.host}/xmlrpc.php`;
    
    // Simple check if WordPress is detected
    const html = await new Promise((resolve, reject) => {
      https.get(url, { signal: controller.signal }, (res) => {
        clearTimeout(timeout);
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }).on('error', reject);
    });

    const isWordPress = html.includes('wp-content') || 
                       html.includes('wordpress') ||
                       html.includes('wp-json');

    const versionMatch = html.match(/ver=([0-9.]+)/);
    const version = versionMatch ? versionMatch[1] : null;

    return {
      detected: isWordPress,
      version,
      checkedAt: new Date().toISOString()
    };
  } catch (e) {
    return {
      detected: false,
      error: e.message,
      checkedAt: new Date().toISOString()
    };
  }
}

// ============================================================
// FULL CUSTOMER CHECK
// ============================================================
async function checkCustomer(customer) {
  console.log(`  Prüfe ${customer.website.url}...`);
  
  const results = {
    customerId: customer.id,
    website: customer.website,
    checkedAt: new Date().toISOString(),
    status: 'ok',
    issues: []
  };

  // 1. Security Headers Check
  try {
    const headerResult = await checkSecurityHeaders(customer.website.url);
    results.securityHeaders = headerResult;
    
    if (headerResult.grade === 'F' || headerResult.grade === 'E') {
      results.status = 'critical';
      results.issues.push({
        type: 'security_headers',
        severity: 'high',
        message: `Security Header Note: ${headerResult.grade}`,
        details: headerResult
      });
    } else if (headerResult.grade !== 'A') {
      results.status = 'warning';
      results.issues.push({
        type: 'security_headers',
        severity: 'medium',
        message: `Security Header Note: ${headerResult.grade}`,
        details: headerResult
      });
    }
  } catch (e) {
    results.status = 'error';
    results.issues.push({
      type: 'security_headers',
      severity: 'high',
      message: `Header-Check fehlgeschlagen: ${e.message}`
    });
  }

  // 2. WordPress Check
  try {
    const wpResult = await checkWordPress(customer.website.url);
    results.wordpress = wpResult;
  } catch (e) {
    results.wordpress = { error: e.message };
  }

  // 3. Blacklist Check (if IP available)
  if (customer.website.ip) {
    try {
      const blResults = await checkBlacklist(customer.website.ip);
      results.blacklist = blResults;
      
      const listed = blResults.filter(r => r.listed);
      if (listed.length > 0) {
        results.status = 'critical';
        results.issues.push({
          type: 'blacklist',
          severity: 'high',
          message: `Domain auf ${listed.length} Blacklist(s)`,
          details: listed
        });
      }
    } catch (e) {
      results.blacklist = { error: e.message };
    }
  }

  return results;
}

// ============================================================
// REPORT GENERATION
// ============================================================
function generateReport(results, customers) {
  const timestamp = new Date().toISOString();
  const dateStr = new Date().toLocaleDateString('de-CH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Summary
  const summary = {
    total: customers.length,
    ok: results.filter(r => r.status === 'ok').length,
    warning: results.filter(r => r.status === 'warning').length,
    critical: results.filter(r => r.status === 'critical').length,
    error: results.filter(r => r.status === 'error').length
  };

  // Markdown Report
  let report = `# AidSec Cyber-Mandat Pro – Monatsreport

**Datum:** ${dateStr}  
**Kunden:** ${summary.total}  
**Status:** ${summary.ok} ✓ OK | ${summary.warning} ⚠️ Warnung | ${summary.critical} 🔴 Kritisch

---

## Zusammenfassung

| Status | Anzahl |
|--------|--------|
| ✅ OK | ${summary.ok} |
| ⚠️ Warnung | ${summary.warning} |
| 🔴 Kritisch | ${summary.critical} |
| ❌ Fehler | ${summary.error} |

---

## Detaillierte Ergebnisse

`;

  results.forEach((result, index) => {
    const customer = customers[index];
    
    report += `### ${customer.name}\n`;
    report += `**Website:** ${result.website.url}\n`;
    report += `**Status:** ${result.status.toUpperCase()}\n\n`;
    
    if (result.securityHeaders) {
      report += `**Security Headers:** ${result.securityHeaders.grade} (${result.securityHeaders.score}/${result.securityHeaders.maxScore})\n`;
    }
    
    if (result.wordpress?.detected) {
      report += `**WordPress:** Erkannt (${result.wordpress.version || 'Version unbekannt'})\n`;
    }
    
    if (result.issues.length > 0) {
      report += `\n**Probleme:**\n`;
      result.issues.forEach(issue => {
        report += `- [${issue.severity.toUpperCase()}] ${issue.message}\n`;
      });
    }
    
    report += `\n---\n\n`;
  });

  // Recommendations
  report += `## Empfehlungen

`;
  
  const criticalIssues = results.filter(r => r.status === 'critical');
  if (criticalIssues.length > 0) {
    report += `### 🔴 Kritisch – Sofort handeln\n\n`;
    criticalIssues.forEach(result => {
      const customer = customers.find(c => c.website.url === result.website.url);
      report += `- **${customer?.name}:** ${result.issues[0]?.message}\n`;
    });
    report += `\n`;
  }

  const warningIssues = results.filter(r => r.status === 'warning');
  if (warningIssues.length > 0) {
    report += `### ⚠️ Warnung – Bald beheben\n\n`;
    warningIssues.forEach(result => {
      const customer = customers.find(c => c.website.url === result.website.url);
      report += `- **${customer?.name}:** ${result.issues[0]?.message}\n`;
    });
    report += `\n`;
  }

  report += `---

*Report generiert: ${timestamp}*  
*AidSec Cyber-Mandat Pro Monitoring*

`;

  return { summary, report };
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('\n=== AidSec Cyber-Mandat Pro Monitoring ===\n');
  
  const args = process.argv.slice(2);
  const options = {
    customersFile: path.join(__dirname, '../data/customers.json'),
    reportDir: path.join(__dirname, '../reports/monthly')
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--customers' && args[i + 1]) {
      options.customersFile = args[++i];
    } else if (args[i] === '--report' && args[i + 1]) {
      options.reportDir = args[++i];
    }
  }

  // Load customers
  let customers;
  if (fs.existsSync(options.customersFile)) {
    customers = JSON.parse(fs.readFileSync(options.customersFile, 'utf8'));
  } else {
    console.log('⚠️ Keine Kunden-Daten gefunden. Demo-Modus...');
    customers = [
      {
        id: 'demo_001',
        name: 'Dr. Max Muster',
        email: 'test@example.com',
        website: { url: 'https://muster-kanzlei.ch' }
      },
      {
        id: 'demo_002',
        name: 'Praxis Dr. Huber',
        email: 'test2@example.com',
        website: { url: 'https://praxis-huber.ch' }
      }
    ];
  }

  console.log(`Prüfe ${customers.length} Kunden...\n`);

  // Run checks
  const results = [];
  for (const customer of customers) {
    try {
      const result = await checkCustomer(customer);
      results.push(result);
    } catch (e) {
      console.error(`  ✗ Fehler bei ${customer.website.url}: ${e.message}`);
      results.push({
        customerId: customer.id,
        website: customer.website,
        status: 'error',
        issues: [{ type: 'unknown', severity: 'high', message: e.message }]
      });
    }
  }

  // Generate report
  const { summary, report } = generateReport(results, customers);

  // Save report
  if (!fs.existsSync(options.reportDir)) {
    fs.mkdirSync(options.reportDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().split('T')[0];
  const reportFile = path.join(options.reportDir, `monitoring-${timestamp}.md`);
  fs.writeFileSync(reportFile, report, 'utf8');

  console.log('\n=== Ergebnis ===');
  console.log(`OK: ${summary.ok} | Warnung: ${summary.warning} | Kritisch: ${summary.critical} | Fehler: ${summary.error}`);
  console.log(`\nReport gespeichert: ${reportFile}`);

  return { summary, results, report };
}

if (require.main === module) {
  main()
    .then(({ summary }) => {
      console.log('\n✓ Monitoring abgeschlossen');
      process.exit(summary.critical > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error('\n✗ Fehler:', err.message);
      process.exit(1);
    });
}

module.exports = { checkCustomer, checkSecurityHeaders, checkWordPress, checkBlacklist };
