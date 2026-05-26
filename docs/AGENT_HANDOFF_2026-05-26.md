# AidSec Agent Handoff - 2026-05-26

> Stand lokal dokumentiert am 2026-05-26 11:08 Europe/Zurich. Keine Secret-Werte in dieser Datei speichern oder ausgeben.

## Kurzstatus

- Repo: `C:\Users\keoku\Desktop\AidSec.ch\project`
- GitHub Remote: `keokukzh/aidsec`
- Branch: `main`
- Lokaler Git-Stand bei Erstellung: `main...origin/main`, sauberer Worktree
- Aktueller HEAD: `c3c50cc feat: add portal report history`
- Vercel-Projekt: `aidsec-ucws`
- Vercel Project ID: `prj_ZUcUNY6xWsq1dpMUH2G5L1Ot1LFS`
- Vercel Team ID: `team_fAGLE7MCIh7hUmRtnk4HcwRC`
- Aktuelles Production Deployment laut Vercel-Abfrage: `dpl_9KHFY9Z7e4YadRX16KLnXQRKHVso`, Status `READY`, Commit `c3c50cc`
- Production Domains: `https://aidsec.ch`, `https://www.aidsec.ch`, Vercel Alias `aidsec-ucws.vercel.app`

## Was erledigt ist

### P0 Produktionshaertung

- `api/check-headers.js`
  - SSRF-Schutz mit DNS/IP-Validierung, privaten Netzen, Metadata-Hosts, internen Hostnames, Single-Label-Hosts, Port-Whitelist und Redirect-Revalidierung ist umgesetzt und getestet.
- `api/order-status.js`
  - Magic-Link Token Flow mit HMAC-SHA256, Ablaufzeit und timing-safe Vergleich ist umgesetzt.
  - Offener Order-Lookup ist geschlossen.
  - Magic-Link Request Flow via `POST` action `send_magic_link` ist eingebaut und enumeration-safe.
- `api/checkout.js` und `api/checkout-webhook.js`
  - Checkout erstellt persistente Orders vor Stripe Session.
  - Stripe Metadata enthaelt echte `orderId`.
  - Cyber-Mandat ist monatlich per Default, yearly optional.
  - Webhook nutzt Raw Body und Stripe-Signaturpruefung.
  - Webhook Events werden idempotent verarbeitet.
- `api/lib/order-store.js`
  - Upstash Redis als Production Store.
  - Dev-Fallback nur lokal.
  - Orders, Customer, License, Events, Report-Referenzen und Monitoring-Zielinformationen sind zentralisiert.
- `api/cron/storage.js`
  - R2/S3 via AWS SDK v3.
  - Signierte Read URLs fuer Reports.
  - Lokaler File-Fallback nur ausserhalb Production.
- `api/plugin-webhook-relay.js`
  - Per-License Signing mit `licenseId`, Installationssecret, `tokenVersion`, Timestamp und Replay-Fenster.
  - Kein globales Shared Secret im Plugin als dauerhafte Auth-Basis.
- `vercel.json`
  - Rewrites fuer Checkout Webhook, Plugin Relay und CRM API gesetzt.
  - Cronjobs fuer Monitoring und Re-Audit konfiguriert.

### P1 Customer Portal + Report-Historie

- `portal.html`, `js/portal.js`, `css/portal.css`
  - Customer Portal rendert Magic-Link Login, Portal-Daten, Reports, Report-Historie und Monitoring-Auszug.
  - Dynamic HTML wird in `js/portal.js` escaped.
  - Report-Historie zeigt Typ, Datum, Website und Download-Link.
- `api/proof-center-status.js`
  - Authentifizierte Portal-Antwort liefert `reports`, `reportHistory` und `monitoringHistory`.
  - Report URLs werden ueber R2 signed URLs ausgegeben.
- `api/crm-lead-scoring.js`
  - CRM/Lead-Scoring API verlangt Magic-Link Token statt offenem Zugriff.
- `api/cron/reaudit.js`
  - Nutzt echte Customer/Order-Kontaktdaten aus dem Store.
  - Verschickt Re-Audit E-Mails ueber den gemeinsamen Mailer.
- `api/lib/mailer.js`
  - Brevo API Transport als primaerer Weg, SMTP als Fallback.
  - Payment-, Delivery-, Re-Audit- und Magic-Link-Mails laufen ueber einen gemeinsamen transactional mail helper.
- `scripts/production-smoke.mjs`
  - Live Smoke Runner fuer Stripe Checkout, Redis Persistenz, Stripe Webhook Signatur, R2 signed report URL und Plugin Relay Signatur.

## Zuletzt verifizierte Checks

Diese Checks wurden im letzten Arbeitsblock erfolgreich ausgefuehrt:

```powershell
npm.cmd test
npm.cmd run lint -- --quiet
Get-ChildItem -Path api,tests,scripts,js -Recurse -Include *.js,*.mjs | ForEach-Object { node --check $_.FullName }
npm.cmd run build
npm.cmd audit --audit-level=moderate
node scripts/production-smoke.mjs
```

Erwarteter lokaler Teststand:

- `npm.cmd test`: 16/16 Tests bestanden.
- `npm.cmd run lint -- --quiet`: bestanden.
- `node --check`: alle API/Test/Script/JS-Dateien syntaktisch ok.
- `npm.cmd run build`: bestanden.
- `npm.cmd audit --audit-level=moderate`: 0 moderate+ Findings.
- Production Smoke: alle Kernchecks ok.

Letzter dokumentierter Production Smoke:

- Run ID: `20260526090454`
- Erfolgreich:
  - Checkout fuer `rapid-header-fix`
  - Checkout fuer `kanzlei-haertung`
  - Checkout fuer `cyber-mandat`
  - Stripe signed webhook
  - Redis persistente Order/License
  - R2 signed report URL
  - Plugin Relay mit gueltiger License-Signatur
  - Portal API mit signed Report URL

## Bekannte Risiken und offene Punkte

### Brevo Zustellung

Der App-Flow faengt Mailfehler ab, aber echte Zustellung ist noch der empfindlichste externe Punkt. In Vercel Logs gab es zuletzt Brevo-Fehler wegen IP-Allowlisting bzw. nicht erkannter Vercel Egress IPs. Wenn neue Mails nicht ankommen:

1. Brevo Security/IP-Allowlist pruefen oder vollstaendig deaktivieren.
2. Alternativ auf Anbieter mit stabiler Serverless-Zustellung wechseln.
3. Danach `node scripts/production-smoke.mjs` laufen lassen und Vercel Logs auf Brevo-Fehler pruefen.

Wichtig: In dieser Datei stehen keine Brevo, Redis, Stripe, R2 oder sonstige Secret-Werte. Der Nutzer hat Secrets im Chat und lokal in `.env.local` verwendet. Diese Secrets spaeter rotieren.

### Monitoring-Historie ist noch nicht vollwertig

Aktuell kann das Portal `monitoringHistory` anzeigen, aber der Store speichert im Kern noch primar den letzten Monitoring-Zustand pro Order/Website. Der naechste P1-Schritt sollte echte historische Monitoring-Laeufe persistieren und im Portal/Dashboard sichtbar machen.

### Lokale Artefakte

- Repo-Status bei Erstellung war sauber.
- `.env.local` ist vorhanden und gitignored; nicht committen.
- Ausserhalb des Repos liegen unter `C:\Users\keoku\Desktop\AidSec.ch` alte Arbeits-/Kontextdateien wie `AIDSEC_MASTER_PLAN.md`, `AIDSEC_STRATEGY_PLAN.md` und `portal.html.new`. Nicht automatisch loeschen.
- Die externe Chat-Transkriptdatei auf dem Desktop kann Secret-Werte enthalten. Nicht in Git aufnehmen.

## Naechste Schritte fuer neuen Agent

### 1. Startzustand pruefen

```powershell
Set-Location C:\Users\keoku\Desktop\AidSec.ch\project
git -c safe.directory=C:/Users/keoku/Desktop/AidSec.ch/project status --short --branch
git -c safe.directory=C:/Users/keoku/Desktop/AidSec.ch/project log --oneline --decorate -8
```

Erwartung:

- Branch `main`
- Worktree sauber
- HEAD mindestens `c3c50cc`

### 2. Baseline Verification laufen lassen

```powershell
npm.cmd test
npm.cmd run lint -- --quiet
Get-ChildItem -Path api,tests,scripts,js -Recurse -Include *.js,*.mjs | ForEach-Object { node --check $_.FullName }
npm.cmd run build
```

Falls Netzwerk erlaubt und `.env.local` korrekt ist:

```powershell
npm.cmd audit --audit-level=moderate
node scripts/production-smoke.mjs
```

### 3. P1 Monitoring-Historie persistent machen

Ziel: Jeder Monitoring-/Re-Audit-Lauf schreibt einen historischen Eintrag, nicht nur den letzten Zustand.

Dateien:

- Modify: `api/lib/order-store.js`
- Modify: `api/proof-center-status.js`
- Test: `tests/api-p0.test.js`
- Optional Frontend polish: `js/portal.js`, `css/portal.css`

Konkreter Ansatz:

1. In `tests/api-p0.test.js` einen Test ergaenzen:
   - Order mit Website erstellen.
   - `recordMonitoringResultForWebsite()` zweimal fuer dieselbe Website aufrufen, mit unterschiedlichen `checkedAt`, `grade`, `score`.
   - `getCustomerPortalByOrderId()` oder `proof-center-status` aufrufen.
   - Erwartung: `monitoringHistory.length === 2`, neuester Eintrag zuerst, `orders[0].monitoring` bleibt der neueste Snapshot.
2. In `api/lib/order-store.js` `normalizeOrderData()` um `monitoringHistory` erweitern.
3. In `recordMonitoringResultForWebsite(websiteUrl, result)`:
   - bisherigen `order.monitoring` Snapshot weiter setzen.
   - neuen Eintrag in `monitoringHistory` prepend/append und auf z.B. letzte 24 Eintraege begrenzen.
   - Event `monitoring.completed` beibehalten.
4. In `getCustomerPortalByOrderId()` `monitoringHistory` pro Order mit ausgeben.
5. In `api/proof-center-status.js` `monitoringHistory` aus `order.monitoringHistory` flatten/sortieren. Fallback auf `order.monitoring` nur wenn keine Historie existiert.
6. Tests laufen lassen und committen:

```powershell
npm.cmd test
npm.cmd run lint -- --quiet
git -c safe.directory=C:/Users/keoku/Desktop/AidSec.ch/project add api/lib/order-store.js api/proof-center-status.js tests/api-p0.test.js
git -c safe.directory=C:/Users/keoku/Desktop/AidSec.ch/project commit -m "feat: persist monitoring history"
git -c safe.directory=C:/Users/keoku/Desktop/AidSec.ch/project push origin main
```

### 4. P1 Monitoring-Dashboard im Portal ausbauen

Ziel: Customer Portal zeigt nicht nur Listen, sondern verwertbaren Verlauf.

Dateien:

- Modify: `js/portal.js`
- Modify: `css/portal.css`
- Test: vorhandene API-Tests plus Browser-Smoke

Konkreter UI-Scope:

- Letzte Pruefung mit Grade, Score, Datum.
- Historie der letzten 5-10 Checks.
- Trend-Hinweis aus den letzten zwei Scores: besser, gleich, schlechter.
- Report-Download bleibt ueber signed R2 URL.
- Keine sensiblen Rohdaten im Browser ausgeben.

Lokaler Browser-Smoke:

```powershell
npm.cmd run dev
```

Dann im Browser `http://localhost:5173/portal.html` oeffnen und mit einem lokalen Testtoken oder vorhandenen Smoke-Daten pruefen.

### 5. Email-Automation stabilisieren

Ziel: Checkout-paid und Portal-Magic-Link Mails kommen zuverlaessig an.

Dateien:

- Modify falls noetig: `api/lib/mailer.js`
- Test: `tests/api-p0.test.js`
- Operational: Vercel Logs, Brevo Dashboard

Konkreter Ablauf:

1. Brevo IP-Allowlist/Accountstatus ausserhalb Code final klaeren.
2. Production Smoke laufen lassen.
3. Vercel Logs pruefen:

```powershell
npx.cmd --yes vercel@latest logs aidsec.ch --since 10m --level error --expand
```

4. Falls Brevo weiter Vercel IPs blockiert: Anbieterwechsel oder Queue/Retry plus statische Egress-Loesung planen.

### 6. CRM Backbone als naechster P1 Block

Ziel: Orders, Customers, Websites, Reports, Monitoring und Licenses konsistent als Customer Backbone modellieren.

Vorlaeufige Entscheidung:

- Upstash Redis bleibt kurzfristig Source of Truth.
- Make/n8n nur Orchestrierung, nicht Datenquelle.
- Supabase kann spaeter als strukturierter CRM Store eingefuehrt werden, wenn Portal-/Monitoring-Datenmodell stabil ist.

Konkreter naechster Backend-Scope:

- Customer Record mit `customerId`, primary email, company, createdAt, updatedAt.
- Website Record mit `websiteId`, normalized URL, customerId, active monitoring flag.
- Order Record verweist auf `customerId` und `websiteId`.
- Report Record verweist auf `orderId`, `customerId`, `websiteId`, `type`, `storageKey`, `createdAt`.

## Commit-/Deploy-Regeln

- Keine Secret-Werte committen.
- `.env.local` nicht anzeigen, nicht committen.
- Vor jedem Push:

```powershell
npm.cmd test
npm.cmd run lint -- --quiet
npm.cmd run build
```

- Nach Push auf `main` pruefen:
  - Vercel Deployment `READY`.
  - Production Smoke `node scripts/production-smoke.mjs`.
  - Wenn Smoke fehlschlaegt, keine neuen P1-Features starten; erst Produktionspfad reparieren.

## Wichtige Dateien

- `api/lib/order-store.js`: Redis Store, Orders, Customers, Licenses, Events, Monitoring Targets.
- `api/proof-center-status.js`: Portal API, signed report URLs, report/monitoring history response.
- `api/order-status.js`: Order Status und Magic-Link Request Flow.
- `api/checkout.js`: Stripe Checkout Session Creation.
- `api/checkout-webhook.js`: Stripe Webhook Handler mit Raw Body.
- `api/plugin-webhook-relay.js`: Plugin Relay HMAC Validation.
- `api/cron/monitoring.js`: Monatlicher Monitoring Cron.
- `api/cron/reaudit.js`: Re-Audit Cron und Follow-up Mails.
- `api/cron/storage.js`: R2/S3 Storage Adapter.
- `api/lib/mailer.js`: Brevo API/SMTP transactional email.
- `js/portal.js`: Portal Frontend Rendering.
- `css/portal.css`: Portal Styles.
- `tests/api-p0.test.js`: P0/P1 API Regression Tests.
- `scripts/production-smoke.mjs`: Live Production Smoke Runner.
- `vercel.json`: Rewrites, Headers, Cronjobs.

## Nicht vergessen

- Der Nutzer will moeglichst autonomes Weiterarbeiten.
- Wenn Secrets rotiert werden, danach Vercel Production/Preview Env Vars und lokale `.env.local` synchronisieren.
- Wenn externe Dienste nicht erreichbar sind, klar zwischen Codeproblem und Provider-/Accountproblem unterscheiden.
- Bei allem, was live Stripe, Redis, R2 oder Vercel nutzt, keine Secret-Werte in Terminal-Ausgaben, Doku oder Git schreiben.
