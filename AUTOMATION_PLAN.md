# AidSec Order-to-Delivery Automation Plan

## Aktueller Zustand

```
Kunde kauft → Formular → E-Mail an AidSec → MANUELLE Bearbeitung
```

**Probleme:**
- Manuelle Prüfung jeder Website
- Manuelle Header-Implementierung
- Manuelle Verifizierung
- Manuelle Report-Erstellung
- Keine Skalierbarkeit

---

## Ziel-Zustand: Vollautomatischer Workflow

```
Kunde kauft → Automatische Analyse → Automatische Umsetzung → Automatische Verifizierung → Automatischer Report
```

---

## Phase 1: Automatisierte Security Header Analyse (SWE)

### 1.1 SecurityHeaders.com API Integration

**Endpoint:** `https://securityheaders.com/?q={url}&followRedirects=true&hide=false`

**Ablauf:**
```
1. Kunde gibt Website-URL ein
2. Frontend: JS Fetch zu SecurityHeaders.com API (oder Proxy)
3. Anzeige: "Ihre aktuelle Note: F" mit Details
4. Optional: Automatischer Report per E-Mail
```

**Tools:**
- `api/check-headers.js` existiert bereits - erweitern
- Alternativ: SecurityHeaders.com API (falls verfügbar)

**Beispiel-Response parsen:**
```json
{
  "statusCode": 200,
  "status": "A",
  "recommendations": [...]
}
```

---

## Phase 2: Automatisierte Header-Umsetzung (für Rapid Header Fix)

### 2.1 Server-Level Header Implementation

**Flow:**
```
1. Kunde kauft Rapid Header Fix
2. System erhält Zugang (Server/Hosting)
3. Automatische Header-Konfiguration via:
   - .htaccess (Apache)
   - nginx.conf (Nginx)
   - WordPress Plugin (als Fallback)
   - Vercel Headers (für Vercel-Hostings)
```

### 2.2 WordPress Plugin (AidSec Express)

**Bereits vorhanden:** `aidsec-express-fix.zip`

**Erweiterung für Automatisierung:**
```javascript
// Im Plugin hinzufügen:
- Automatische Server-Erkennung (Apache/Nginx)
- Automatische Header-Konfiguration
- Automatischer Verifizierungs-Check nach Konfiguration
- Error-Handling bei fehlenden Schreibrechten
```

### 2.3 Deployment-Optionen

| Hosting | Methode | Automatisierbar? |
|---------|--------|-------------------|
| Vercel | `vercel.json` headers | ✅ Ja |
| Apache | `.htaccess` | ✅ Ja |
| Nginx | `nginx.conf` | ⚠️ SSH benötigt |
| WordPress managed | Plugin | ✅ Ja |
| Hostpoint | .htaccess | ✅ Ja |
| Cyon | .htaccess | ✅ Ja |
| Infomaniak | .htaccess | ✅ Ja |

---

## Phase 3: Automatisierte Verifizierung

### 3.1 SecurityHeaders.com Re-Check

**Ablauf nach Header-Implementation:**
```javascript
// 1. 5 Minuten warten (Caching)
// 2. Erneuter API-Call zu SecurityHeaders.com
// 3. Ergebnis parsen
// 4. Wenn Note A → Success
// 5. Wenn nicht A → Fehlerdiagnose
```

### 3.2 Automatischer Screenshot

**Optional:** WordPress-Screenshot mit `?aidsec-verified=true` Parameter

---

## Phase 4: Automatischer Report

### 4.1 PDF-Generierung

**Tools:**
- `puppeteer` oder `playwright` für PDF-Generierung
- Template-basiert mit Kundendaten

**Report-Inhalt:**
```
1. Deckblatt mit Kundenname, Datum, Paket
2. Ausgangslage (Note F vor der Härtung)
3. Durchgeführte Maßnahmen
4. Ergebnis (Note A nach der Härtung)
5. Erklärung der implementierten Headers
6. NDSG-Compliance-Hinweis
7. Empfehlungen für laufenden Betrieb
```

### 4.2 E-Mail-Versand

**Automatisch nach erfolgreicher Verifizierung:**
```
An: kunde@kanzlei.ch
Betreff: Ihr AidSec Audit-Protokoll – [Website]
Anhang: Audit-Protokoll_[Kanzlei]_[Datum].pdf
```

---

## Phase 5: Cyber-Mandat Pro Automatisierung

### 5.1 Monatliches Monitoring

**Flow:**
```javascript
// Monatlich (Cron-Job):
1. Alle Cyber-Mandat-Kunden abrufen
2. Für jeden Kunden:
   a. SecurityHeaders.com Check
   b. WordPress-Status prüfen (falls implementiert)
   c. Domain-Blacklist-Check
   d. Report generieren
   e. Kunde per E-Mail benachrichtigen
```

### 5.2 Monitoring-Tool

**Tools für WordPress-Monitoring:**
- `uptime-robot.com` API
- `pingdom.com` API
- Eigenes Script mit `cron`

### 5.3 Incident-Alerting

**Bei Problemen (z.B. Note fällt von A auf B):**
```
1. Automatische Benachrichtigung an AidSec
2. Automatische Benachrichtigung an Kunden
3. Incident-Ticket erstellen
```

---

## Technische Architektur

### Stack

| Komponente | Technologie |
|------------|-------------|
| Frontend | Vanilla JS + bestehende Seite |
| Backend | Node.js (Vercel Functions) |
| Datenbank | Upstash Redis (für Kundendaten) |
| PDF-Generierung | Puppeteer/Playwright |
| E-Mail | Nodemailer (SMTP) |
| Monitoring | Cron + SecurityHeaders.com API |
| Hosting | Vercel (bestehend) |

### Datenmodell (Redis/JSON)

```javascript
// Customer Record
{
  id: "ord_xxx",
  customer: {
    name: "Dr. Max Muster",
    email: "m.muster@kanzlei.ch",
    company: "Muster & Partner",
    phone: "+41 44 000 00 00"
  },
  website: "https://kanzlei-muster.ch",
  package: "rapid-header-fix",
  status: "completed", // pending | in-progress | completed | error
  timeline: {
    ordered: "2026-04-10T12:00:00Z",
    headersApplied: "2026-04-10T12:05:00Z",
    verified: "2026-04-10T12:10:00Z",
    reportSent: "2026-04-10T12:15:00Z"
  },
  results: {
    before: { grade: "F", headers: [...] },
    after: { grade: "A", headers: [...] }
  },
  reportUrl: "/reports/ord_xxx.pdf"
}
```

---

## Implementierungs-Phasen

### Phase A: Sofort (1-2 Wochen)

**1. Automatisierte Analyse erweitern**
- `api/check-headers.js` mit Scoring-System
- Kunde kann Vorher/Nachher selbst prüfen

**2. WordPress Plugin verbessern**
- Auto-Detection von Server-Typ
- Besseres Error-Handling
- Logging für Debugging

**3. Report-Template erstellen**
- HTML-Template für Audit-Protokoll
- Dinamik mit Kundendaten

### Phase B: Kurzfristig (3-4 Wochen)

**4. PDF-Generierung implementieren**
- Puppeteer für PDF-Rendering
- Automatischer Versand nach Verifizierung

**5. Kunden-Dashboard (einfach)**
- `/kunden/[order-id]` Status-Seite
- Zeigt aktuellen Status des Auftrags

**6. E-Mail-Automatisierung**
- Bestätigungs-E-Mail nach Kauf
- Status-Updates
- Finaler Report

### Phase C: Mittel Fristig (1-2 Monate)

**7. Cyber-Mandat Pro Monitoring**
- Monatliche automatische Checks
- Report-Generierung
- Alerting bei Problemen

**8. Blacklist-Monitoring**
- DNSBL-Checks
- Google Safe Browsing API
- DMARC/SPF-Validierung

---

## Compliance & Sicherheit

### Datenschutz (nDSG)

- Kundendaten nur auf Schweizer Servern
- Keine Speicherung von Zugangsdaten
- Verschlüsselte Kommunikation
- Löschung nach Vertragsende

### Security

- Alle API-Endpoints mit Rate-Limiting (existiert bereits)
- Keine Passwörter in Formularen (existiert bereits)
- HTTPS nur (existiert bereits)
- CSP beachten (bestehend)

---

## Kosten-Schätzung (monatlich)

| Service | Kosten |
|---------|--------|
| Vercel Pro | CHF 20 |
| Upstash Redis | CHF 10 |
| E-Mail (SMTP) | CHF 5 |
| Monitoring APIs | CHF 0 (free tier) |
| **Total** | **CHF 35/Monat** |

---

## Nächste Schritte

### Sofort umsetzbar:

1. **WordPress Plugin verbessern** - Auto-Detection, Better Logging
2. **Report-Template erstellen** - HTML-PDF-Template
3. **check-headers.js erweitern** - Mehr Details im Response

### Decision benötigt:

4. **PDF-Generierung** - Puppeteer auf Vercel möglich?
5. **Kundenbereich** - Notwendig oder reicht E-Mail?
6. **Monitoring** - Welche APIs für Blacklist-Checks?

---

## Offene Fragen

1. **Hosting-Zugang:** Wie erhalten wir automatisch Server-Zugang?
2. **WordPress Plugin:** Wird es bereits bei Kauf angeboten oder manuell?
3. **Cyber-Mandat:** Wie läuft aktuell das Monitoring?
4. **Support:** Wer ответet auf Kundenanfragen?
