# AidSec Cron-Job Setup für Monitoring

## Übersicht

Das monatliche Monitoring läuft automatisch via Cron-Job:

```
┌─────────────────────────────────────────────────────────────┐
│                    MONATLICHES MONITORING                     │
├─────────────────────────────────────────────────────────────┤
│  Tag 1: Alle Cyber-Mandat Pro Kunden automatisch prüfen    │
│          1. Security Headers Check                           │
│          2. WordPress Status                                │
│          3. Blacklist-Check (optional)                      │
│          4. Report generieren                               │
│          5. Bei Problemen: E-Mail-Benachrichtigung          │
│          6. Kunden-Dashboard aktualisieren                  │
└─────────────────────────────────────────────────────────────┘
```

## Cron-Job einrichten

### Auf Vercel (Empfohlen)

1. **Vercel Cron Dashboard** öffnen: https://vercel.com/dashboard

2. **Neuer Cron-Job**:
   - Name: `monthly-monitoring`
   - Schedule: `0 7 1 * *` (Monatlich, 1. Tag, 07:00 UTC; entspricht 08:00 Europe/Zurich in der Winterzeit)
   - Hinweis: Vercel Cron nutzt UTC. Bei Sommerzeit ist der Lauf um 09:00 Europe/Zurich, sofern kein zweiter saisonaler Cron eingerichtet wird.
   - URL: `/api/cron/monitoring`

### Alternativ: System-Cron (Server)

```bash
# Crontab öffnen
crontab -e

# Monatlich am 1. um 08:00 Uhr
0 8 1 * * cd /path/to/aidsec && node scripts/monitor.js --customers ./data/customers.json --report ./reports/monthly >> /var/log/aidsec-monitoring.log 2>&1
```

### Alternativ: GitHub Actions

```yaml
# .github/workflows/monitoring.yml
name: Monthly Security Monitoring

on:
  schedule:
    - cron: '0 8 1 * *'  # Monatlich am 1. um 08:00 UTC
  workflow_dispatch:  # Manuell auslösbar

jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: node scripts/monitor.js
        env:
          SMTP_HOST: ${{ secrets.SMTP_HOST }}
          SMTP_USER: ${{ secrets.SMTP_USER }}
          SMTP_PASS: ${{ secrets.SMTP_PASS }}
```

## Monitoring API

### Endpoint: `/api/cron/monitoring`

**Method:** POST (intern) oder GET (Vercel Cron)

**Funktion:**
1. Lädt Kundenliste aus `data/customers.json`
2. Führt für jeden Kunde Security-Checks durch
3. Generiert PDF-Report
4. Sendet E-Mail bei Problemen
5. Aktualisiert Kunden-Dashboard

**Response:**
```json
{
  "success": true,
  "customersChecked": 15,
  "issuesFound": 3,
  "reportUrl": "/reports/monthly/2026-04-01.pdf",
  "timestamp": "2026-04-01T08:00:00Z"
}
```

## Alerting

### Bei folgenden Problemen wird automatisch benachrichtigt:

| Problem | Severity | Aktion |
|---------|----------|--------|
| Security Header Note F/E | 🔴 Kritisch | Sofort E-Mail an AidSec + Kunde |
| Security Header Note C/D | ⚠️ Warnung | E-Mail an AidSec |
| Domain auf Blacklist | 🔴 Kritisch | Sofort E-Mail an AidSec + Kunde |
| Website nicht erreichbar | 🔴 Kritisch | Sofort E-Mail an AidSec |

### Alert-E-Mails:

**An:** info@aidsec.ch  
**Betreff:** `[ALERT] Cyber-Mandat Monitoring – X Probleme gefunden`

```
Cyber-Mandat Pro Alert

Datum: 01.04.2026
Kunden geprüft: 15
Probleme gefunden: 3

🔴 KRITISCH:

1. Dr. Max Muster (muster-kanzlei.ch)
   Problem: Security Header Note F
   Aktion: Erfordert sofortige Behebung

2. Praxis Dr. Huber (praxis-huber.ch)
   Problem: Domain auf Spam-Blacklist
   Aktion: Blacklist-Entfernung erforderlich

⚠️ WARNUNG:

3. Notariat Meier (notariat-meier.ch)
   Problem: Security Header Note C
   Aktion: Empfehlung zur Verbesserung

--
AidSec Cyber-Mandat Pro Monitoring
```

## Report-Speicherung

Alle Reports werden gespeichert unter:

```
reports/
├── monthly/
│   ├── 2026-01-01.md
│   ├── 2026-02-01.md
│   ├── 2026-03-01.md
│   └── 2026-04-01.md
└── customers/
    └── [customer-id]/
        ├── 2026-01-15.pdf
        ├── 2026-02-15.pdf
        └── ...
```

## Troubleshooting

### Cron-Job läuft nicht?

1. **Logs prüfen:** `/var/log/aidsec-monitoring.log`
2. **Manuell testen:** `node scripts/monitor.js`
3. **Vercel:** Unter "Functions" → Logs prüfen

### E-Mails kommen nicht an?

1. SMTP-Konfiguration prüfen
2. Spam-Ordner prüfen
3. Test-E-Mail senden: `node scripts/send-email.js --type confirmation --to test@example.com`

### Falsche Results?

1. SecurityHeaders.com direkt prüfen: https://securityheaders.com
2. Kunden-URL verifizieren
3. Website vielleicht gerade down → Retry-Logik prüfen

## Maintenance

### Kunden hinzufügen:

1. `data/customers.json` öffnen
2. Neuen Kunden im gleichen Format hinzufügen
3. Commit + Push → Cron-Job übernimmt automatisch

### Kunden entfernen:

1. Aus `data/customers.json` löschen
2. Oder `active: false` setzen (temporär deaktivieren)

```json
{
  "id": "ord_xxx",
  "active": false,
  "name": "Ex-Kunde",
  ...
}
```
