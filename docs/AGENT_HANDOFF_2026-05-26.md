# AidSec Agent Handoff - 2026-05-26

> Stand lokal dokumentiert am 2026-05-26 nach Production-Mail-Fix und P1-Sicherheitsnacharbeit. Keine Secret-Werte in dieser Datei speichern oder ausgeben.

## Kurzstatus

- Repo: `C:\Users\keoku\Desktop\AidSec.ch\project`
- GitHub Remote: `keokukzh/aidsec`
- Branch: `main`
- Ausgangs-HEAD dieses Blocks: `5454625 feat: support smtp email provider override`
- Vercel-Projekt: `aidsec-ucws`
- Vercel Project ID: `prj_ZUcUNY6xWsq1dpMUH2G5L1Ot1LFS`
- Vercel Team ID: `team_fAGLE7MCIh7hUmRtnk4HcwRC`
- Production vor diesem Block: Deployment `dpl_Fzm4AQDnxy5KMvJQTWJd9y9Fdx5Q`, Status `READY`, Commit `5454625`
- Production Domains: `https://aidsec.ch`, `https://www.aidsec.ch`

## Erledigt

- P0 ist produktionsfaehig: SSRF-Hardening, Magic-Link Auth, Stripe Checkout/Webhook, Redis Store, R2 signed URLs, Plugin Relay License-HMAC, Cron/Rewrites und Portal Auth sind umgesetzt.
- P1 Portal-Basis ist aktiv: Report-Historie, Monitoring-Historie, Magic-Link Login, signierte Report-Downloads und Portal API sind vorhanden.
- Monitoring-Historie wird persistent als Order-History gespeichert und im Portal chronologisch ausgegeben.
- Transactional Mail kann in Production per `EMAIL_PROVIDER=smtp` explizit Microsoft 365 SMTP nutzen.
- Microsoft SMTP AUTH wurde tenant-weit erlaubt und fuer `aid.destani@aidsec.ch` aktiviert.
- DKIM fuer `aidsec.ch` loest oeffentlich auf die Microsoft DKIM CNAMEs `selector1` und `selector2`.
- Production-Smoke mit echter Empfaengeradresse war zuletzt gruen: Stripe, Webhook, Redis, R2, Plugin-Relay, Portal API und Mailprovider-Pfad.

## In Diesem Block Umgesetzt

- `scripts/production-smoke.mjs`
  - Nutzt `SMOKE_EMAIL` aus Env fuer echte Mail-Smokes.
  - Faellt ohne `SMOKE_EMAIL` auf eine sichere `.invalid` Nicht-Mail-Adresse zurueck.
  - Ergaenzt expliziten Check `email:transactional-delivery`.
  - Maskiert die Smoke-Mail-Adresse in der JSON-Ausgabe.
- `api/lib/hcaptcha.js`
  - Neues Shared-Modul fuer hCaptcha Token-Auslese und Server-Side Verification.
  - Production ohne `HCAPTCHA_SECRET` faellt klar mit 503 statt Formular ohne Schutz anzunehmen.
- `api/contact-submit.js`
  - Validiert hCaptcha serverseitig vor SMTP-Versand.
- `api/onboarding-submit.js`
  - Validiert hCaptcha serverseitig fuer oeffentliche Onboarding-Mail-Flows.
  - Stripe Checkout bleibt unbeeinflusst, weil `/api/checkout` intern den bezahlten Flow abwickelt.
- Frontend
  - Contact-Form sendet `hCaptchaToken`.
  - Onboarding-Seiten laden Consent-Management, rendern hCaptcha fuer Nicht-Stripe-Submit und senden `hCaptchaToken`.
  - hCaptcha Site Key ist public im Markup hinterlegt; Secret bleibt nur in Env.
- Tests
  - Regression fuer `SMOKE_EMAIL`/`email:transactional-delivery`.
  - Regression fuer fehlendes hCaptcha im Contact Flow.
  - Regression fuer gueltiges hCaptcha im Onboarding Flow.

## Verifikation Dieses Blocks

Bereits lokal gruen:

```powershell
npm.cmd test
npm.cmd run lint -- --quiet
Get-ChildItem -Path api,tests,scripts,js,onboarding -Recurse -Include *.js,*.mjs | ForEach-Object { node --check $_.FullName }
```

Vor Commit/Push noch laufen lassen:

```powershell
npm.cmd run build
npm.cmd audit --audit-level=moderate
```

Nach Deploy:

```powershell
$env:SMOKE_EMAIL="<echte-testadresse>"
node scripts/production-smoke.mjs
npx.cmd --yes vercel@latest logs aidsec.ch --since 5m --level error --expand
```

Erfolgskriterium: Smoke gruen, keine frischen SMTP-/API-Fehler, keine erwartbaren Warnungen im Testfenster.

## Bekannte Risiken

- Alle im Chat geteilten Provider-Secrets muessen rotiert werden. Dazu gehoeren mindestens SMTP/Microsoft, Brevo, hCaptcha Secret, HARPA Key, Redis Tokens und alle weiteren geposteten Keys. Diese Datei enthaelt bewusst keine Werte.
- `.env.local` bleibt gitignored und darf nicht angezeigt oder committed werden.
- Die alte Smoke-Variante mit `example.com` als Empfaenger hat Microsoft-Mailfehler erzeugt. Ab jetzt echte Smoke-Mail nur ueber `SMOKE_EMAIL`.
- Die `url.parse` Deprecation-Warnung aus Vercel Logs konnte lokal mit `NODE_OPTIONS=--trace-deprecation` beim R2 signed URL Pfad nicht reproduziert werden. Im Repo gibt es keinen eigenen `url.parse` Aufruf; AWS SDK v3 und Nodemailer sind laut `npm outdated` aktuell. Wenn die Warnung nach neuem Deploy wieder frisch erscheint, Logs mit engem Zeitfenster ziehen und ggf. als Dependency-Warnung dokumentieren oder upstream fixen.

## Naechste Schritte Fuer Neuen Agent

1. Aktuellen Git-/Deploy-Stand pruefen:

```powershell
Set-Location C:\Users\keoku\Desktop\AidSec.ch\project
git status --short --branch
git log --oneline --decorate -8
npx.cmd --yes vercel@latest list aidsec-ucws
```

2. Falls dieser Block noch nicht committed ist:

```powershell
npm.cmd test
npm.cmd run lint -- --quiet
Get-ChildItem -Path api,tests,scripts,js,onboarding -Recurse -Include *.js,*.mjs | ForEach-Object { node --check $_.FullName }
npm.cmd run build
git add api/lib/hcaptcha.js api/contact-submit.js api/onboarding-submit.js js/form.js onboarding index.html scripts/production-smoke.mjs tests/api-p0.test.js docs/AGENT_HANDOFF_2026-05-26.md
git commit -m "fix: verify captcha and production smoke email"
git push origin main
```

3. Nach Vercel `READY` Production-Smoke mit echter `SMOKE_EMAIL` ausfuehren und Error-Logs im 5-Minuten-Fenster pruefen.

4. Secret-Rotation operativ erledigen:
   - Neue Keys in Providern erzeugen.
   - Vercel Production/Preview/Development Env aktualisieren.
   - Lokale `.env.local` erneuern.
   - Danach Smoke erneut laufen lassen.

5. Erst danach P1 Customer Backbone weiter ausbauen:
   - Customer, Website, Order, Report, Monitoring und License als klarere Records modellieren.
   - Upstash bleibt kurzfristig Source of Truth.
   - Make/n8n nur fuer Orchestrierung nutzen, nicht als Datenquelle.
   - Portal danach um Ereignislog, bessere Report-Historie und Monitoring-Trend erweitern.

## Wichtige Dateien

- `api/lib/order-store.js`: Redis Store, Orders, Customers, Licenses, Events, Monitoring Targets.
- `api/lib/hcaptcha.js`: hCaptcha Server-Side Verification.
- `api/lib/mailer.js`: Brevo API/SMTP transactional email.
- `api/proof-center-status.js`: Portal API, signed report URLs, report/monitoring history response.
- `api/checkout.js`: Stripe Checkout Session Creation.
- `api/checkout-webhook.js`: Stripe Webhook Handler mit Raw Body.
- `api/plugin-webhook-relay.js`: Plugin Relay HMAC Validation.
- `api/contact-submit.js`: Contact Form API mit hCaptcha und SMTP.
- `api/onboarding-submit.js`: Onboarding Mail API mit hCaptcha und SMTP.
- `js/form.js`: Contact Form Frontend.
- `onboarding/onboarding.js`: Onboarding Frontend.
- `scripts/production-smoke.mjs`: Live Production Smoke Runner.
- `tests/api-p0.test.js`: P0/P1 Regression Tests.
- `vercel.json`: Rewrites, Headers, Cronjobs.
