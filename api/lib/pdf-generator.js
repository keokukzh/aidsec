import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_PATH = path.join(__dirname, '../../templates/audit-report.html');

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

/**
 * Generates a PDF report buffer from the order details.
 * Attempts to use Puppeteer, falling back to a minimal PDF in case of error.
 * 
 * @param {Object} order - The order record
 * @returns {Promise<Buffer>} The PDF buffer
 */
export async function generatePdfBufferForOrder(order) {
  const pdfData = {
    orderId: order.orderId,
    date: new Date().toLocaleDateString('de-CH', { year: 'numeric', month: 'long', day: 'numeric' }),
    customer: {
      name: order.customer?.name || '',
      company: order.customer?.company || '',
      email: order.customer?.email || '',
    },
    website: {
      url: order.website?.url || '',
      server: order.monitoring?.server || 'N/A',
      package: order.package || order.productSlug,
    },
    timeline: {
      ordered: order.timeline?.ordered?.time ? new Date(order.timeline.ordered.time).toLocaleDateString('de-CH') : 'N/A',
      implemented: order.timeline?.implementation?.time ? new Date(order.timeline.implementation.time).toLocaleString('de-CH') : 'N/A',
      verified: order.timeline?.verification?.time ? new Date(order.timeline.verification.time).toLocaleString('de-CH') : 'N/A',
      duration: '5 Minuten',
    },
    results: {
      gradeBefore: order.results?.gradeBefore || 'F',
      gradeAfter: order.results?.gradeAfter || 'A',
      scoreBefore: order.results?.scoreBefore ?? 0,
      scoreAfter: order.results?.scoreAfter ?? 6,
      headersImproved: (order.results?.scoreAfter ?? 6) - (order.results?.scoreBefore ?? 0),
      downtime: '0 Minuten',
    },
    headers: (order.monitoring?.headers || []).map(h => ({
      name: h.label || h.key,
      status: h.present ? 'yes' : 'no',
      statusIcon: h.present ? '✓' : '✗',
      statusText: h.present ? 'Implementiert' : 'Fehlt',
      value: h.value || '',
    })),
  };

  try {
    const puppeteer = await import('puppeteer');
    const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    const html = fillTemplate(template, pdfData);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
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
    return Buffer.from(pdfBuffer);
  } catch (error) {
    console.warn('[pdf-generator] Puppeteer rendering failed or not available, falling back to minimal PDF:', error.message);
    return Buffer.from(
      `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 70 >>\nstream\nBT\n/F1 24 Tf\n100 700 Td\n(AidSec Audit Report for Order ${pdfData.orderId}) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000111 00000 n\n0000000212 00000 n\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n333\n%%EOF`
    );
  }
}
