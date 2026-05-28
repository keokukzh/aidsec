# AidSec.ch Optimierung Tasks

## ✅ Phase 1: Kritische Fixes (ABGESCHLOSSEN)
- [x] Rechtschreibung - Vollstaendig, Massnahmen, fuer, jaehrlich etc.
- [x] Preis-Inkonsistenzen - CHF 950/490 → CHF 790 (Kanzlei-Härtung)
- [x] JSON-LD priceRange korrigiert

## ✅ Phase 2: Neue Seiten & Navigation (ABGESCHLOSSEN)
- [x] FAQ-Seite mit strukturierten Kategorien
- [x] FAQ-Link in Desktop + Mobile Navigation
- [x] Sitemap aktualisiert

## ✅ Phase 3: Fallstudien & Onboarding (ABGESCHLOSSEN)
- [x] Fallstudien Rechtschreibung gefixt
- [x] Onboarding Rechtschreibung gefixt

---

## ✅ Automatisierung (ABGESCHLOSSEN)

### Phase A: Sofort (1-2 Wochen) ✅
- [x] WordPress Plugin v2.0 - Auto-Server-Detection
- [x] check-headers.js API v2.0 - Erweiterte Details
- [x] Report-Template - Professionelles HTML-Template

### Phase B: Kurzfristig (3-4 Wochen) ✅
- [x] PDF-Generierung - Puppeteer Script
- [x] Kunden-Dashboard - /kunden/index.html
- [x] E-Mail-Automatisierung - send-email.js
- [x] Order Status API - api/order-status.js

### Phase C: Mittel Fristig (1-2 Monate) ✅
- [x] Monitoring Script - scripts/monitor.js
- [x] Kunden-Daten - data/customers.json Template
- [x] Cron-Job Setup - docs/CRON_SETUP.md
- [x] Cron Monitoring API - api/cron/monitoring.js
- [x] Alerting System - scripts/alert.js

---

## 📋 Commit History

| Commit | Beschreibung |
|--------|--------------|
| d8ff743 | Phase B: PDF, Dashboard, E-Mail-Automatisierung |
| eae3652 | Phase A: Plugin v2.0, API v2.0, Report-Template |
| a9b86c5 | Automation Plan Dokument |
| f3ba8cd | Rechtschreibung (23 Dateien) |
| 6f84e56 | Fallstudien & Onboarding Fix |
| d892373 | Neue FAQ-Seite |
| 891b867 | Preise & Rechtschreibung (17 Dateien) |
| 31987b2 | index.html Preise & Rechtschreibung |

---

## 📁 Neue Dateien

### Automatisierung
```
scripts/
├── generate-report.js   - HTML Report Generator
├── generate-pdf.js     - PDF Generator (Puppeteer)
├── send-email.js       - E-Mail Automation
├── monitor.js          - Monatliches Monitoring
└── alert.js            - Alerting System

api/
├── order-status.js     - Order Status API
└── cron/
    └── monitoring.js  - Vercel Cron Endpoint

kunden/
└── index.html         - Kunden Dashboard

data/
└── customers.json     - Kunden-Template

templates/
└── audit-report.html  - Report Template

docs/
└── CRON_SETUP.md     - Cron-Job Dokumentation
```

---

## 🔄 Offene Tasks

### Geplant aber nicht umgesetzt (Phase D)
- [ ] Blacklist-Monitoring API (DNSBL)
- [ ] Google Safe Browsing Integration
- [ ] PDF-Versand via E-Mail automatisieren
- [ ] WordPress Plugin Update-Server

### Optional
- [ ] Blog/News-Sektion für regelmässige Content-Updates
- [ ] Partnerschaften/Badges (SecurityHeaders Verified)
- [ ] Content-Halbjahresrefresh (BACS Statistiken)

---

## 💰 Kosten-Schätzung (monatlich)

| Service | Kosten |
|---------|--------|
| Vercel Pro | CHF 20 |
| Upstash Redis | CHF 10 |
| E-Mail (SMTP) | CHF 5 |
| Monitoring APIs | CHF 0 (free tier) |
| **Total** | **CHF 35/Monat** |
