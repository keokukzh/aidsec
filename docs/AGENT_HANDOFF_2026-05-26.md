# AidSec Agent Handoff - 2026-05-26

> Stand lokal aktualisiert am 2026-05-27 nach Production-Mail-Fix, P1-Sicherheitsnacharbeit, Customer-Backbone-Slice, Conversion-/Video-Block und P1-Automation-Nachzug. Keine Secret-Werte in dieser Datei speichern oder ausgeben.

## Kurzstatus

- Repo: `C:\Users\keoku\Desktop\AidSec.ch\project`
- GitHub Remote: `keokukzh/aidsec`
- Branch: `main`
- Ausgangs-HEAD dieses Blocks: `5454625 feat: support smtp email provider override`
- Letzter dokumentierter HEAD vor Customer-Backbone-Slice: `049efae fix: avoid sdk presigner warning`
- Aktueller dokumentierter HEAD vor P1-Automation-Nachzug: `85cffec fix: resolve broken internal links, favicon paths and redundant font preloads`
- P1-Automation-Nachzug Commit: dieser Commit, `feat: finalize p1 customer automation` (exakter SHA via `git log -1 --oneline`)
- Vercel-Projekt: `aidsec-ucws`
- Vercel Project ID: `prj_ZUcUNY6xWsq1dpMUH2G5L1Ot1LFS`
- Vercel Team ID: `team_fAGLE7MCIh7hUmRtnk4HcwRC`
- Production vor diesem Block: Deployment `dpl_Fzm4AQDnxy5KMvJQTWJd9y9Fdx5Q`, Status `READY`, Commit `5454625`
- Aktuelles Production Deployment vor P1-Automation-Nachzug: `dpl_4etqZWvVrBtzefkDeQTVgUFx2tBR`, Status `READY`, Commit `85cffec`
- Production Domains: `https://aidsec.ch`, `https://www.aidsec.ch`

## Erledigt

- P0 ist produktionsfaehig: SSRF-Hardening, Magic-Link Auth, Stripe Checkout/Webhook, Redis Store, R2 signed URLs, Plugin Relay License-HMAC, Cron/Rewrites und Portal Auth sind umgesetzt.
- P1 Portal-Basis ist aktiv: Report-Historie, Monitoring-Historie, Magic-Link Login, signierte Report-Downloads und Portal API sind vorhanden.
- Monitoring-Historie wird persistent als Order-History gespeichert und im Portal chronologisch ausgegeben.
- Transactional Mail kann in Production per `EMAIL_PROVIDER=smtp` explizit Microsoft 365 SMTP nutzen.
- Microsoft SMTP AUTH wurde tenant-weit erlaubt und fuer `aid.destani@aidsec.ch` aktiviert.
- DKIM fuer `aidsec.ch` loest oeffentlich auf die Microsoft DKIM CNAMEs `selector1` und `selector2`.
- Production-Smoke mit echter Empfaengeradresse war zuletzt gruen: Stripe, Webhook, Redis, R2, Plugin-Relay, Portal API und Mailprovider-Pfad.
- Conversion-/Video-Block ist live: Remotion-Videos, Poster, Social-Cuts und Website-Einbau sind vorhanden; `npm run video:check` war gruen.

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

## Customer Backbone Slice

- `api/lib/order-store.js`
  - Erzeugt stabile `websiteId` Werte (`web_*`) aus normalisierten Website URLs.
  - Erzeugt stabile `reportId` Werte (`rep_*`) aus Order, Report-Key/URL, Typ und Datum.
  - Speichert Website Records lokal/Redis-kompatibel unter dem bestehenden `website:<url>` Index und zusaetzlich per `website-id:<websiteId>`.
  - Speichert Report Records unter `report:<reportId>`.
  - Exponiert `getWebsiteRecordByUrl()` und `getReportRecord()` fuer kommende CRM-/Portal-APIs.
  - Customer Portal gibt Websites und Reports mit `customerId`, `websiteId`, `reportId`, `orderIds`, `storageKey` und Monitoring-Flags aus.
- `api/proof-center-status.js`
  - `reportHistory` fuehrt stabile Backbone-IDs weiter, damit UI und Automationen nicht auf URL/String-Vergleiche angewiesen sind.
- `api/cron/storage.js`
  - AWS SDK wird fuer Put/Get/List erst dynamisch geladen.
  - Proof-Center signed Read URLs laufen ohne AWS-SDK-Import und ohne `url.parse` Deprecation Warning.
- Tests
  - `customer backbone exposes stable website and report records`
  - `proof center report history keeps stable backbone identifiers`

## P1-Automation-Nachzug 2026-05-27

- `api/lib/order-store.js`
  - `recordOrderEvent()` kann fachliche Ereigniszeitpunkte ueber `payload.createdAt` oder `payload.checkedAt` abbilden, damit Monitoring-/Re-Audit-Events im Portal stabil sortiert werden.
  - `createOnboardingTaskForOrder()` erzeugt ein internes `onboarding.task.created` Event nach bezahltem Checkout.
  - `createReportPlaceholderForOrder()` haengt einen nicht-sensitiven `pending_delivery` Report-Platzhalter an die Order und erzeugt `report.placeholder.created`.
  - `createLicenseForOrder()` dokumentiert `license.created`.
- `api/checkout-webhook.js`
  - `checkout.session.completed` aktiviert jetzt neben Customer/License auch Onboarding-Task, Delivery-Report-Platzhalter, Payment-Mail, explizite Proof-Center-Magic-Link-Mail und Delivery-Mail.
  - Alle Mailpfade schreiben Erfolgs-/Fehler-Events; keine neuen oeffentlichen APIs.
- `api/cron/reaudit.js`
  - Re-Audit-Mailausgang schreibt `email.reaudit` oder `email.reaudit_failed` als Order-Event.
- `vercel.json` und `js/main.js`
  - `/assets/videos/(.*)` bekommt immutable Cache Header.
  - Lazy-Pause beobachtet neben alten Trust-Videos auch `process-video__media`, `trust-video__media` und `industry-hero__video`.
- Tests
  - Checkout-Paid Folgeartefakte: License, Onboarding-Task, Report-Platzhalter, Magic-Link-Mail-Event.
  - Monitoring-Events sind kundenportal-sichtbar und neuester Check steht zuerst.
  - Re-Audit-Cron dokumentiert Mail-Automation als Events.
  - Video Cache Header und neue Lazy-Pause-Selectoren sind abgesichert.

## Log-Hygiene-Nachzug 2026-05-27

- `api/lib/signed-storage-url.js`
  - Neuer AWS-SDK-freier SigV4-Signer fuer R2/S3-kompatible Read-, Put- und List-Operationen.
  - Wird von Proof Center direkt genutzt, damit `/api/proof-center-status` keinen SDK-Pfad importiert.
- `api/cron/storage.js`
  - Nutzt denselben Signer fuer `putJson`, `getJson`, `list` und `createSignedReadUrl()` per `fetch`.
- `api/proof-center-status.js`
  - Importiert nur noch `createSignedStorageReadUrl()` statt `./cron/storage.js`.
- `scripts/production-smoke.mjs`
  - Schreibt Smoke-Reports in R2 per SigV4+fetch statt AWS SDK.
- `package.json`
  - `@aws-sdk/client-s3` entfernt, damit Vercel keine Smithy/AWS Dependency in jede Function packt.
- Tests
  - `proof center signed report links avoid importing the cron storage adapter`
  - Bestehender R2-Signed-URL-Test bleibt gruen.
  - `object storage and production smoke do not depend on AWS SDK packages`

## Agent-Workflow-Automation 2026-05-27

- Neue interne Workflow-Schicht fuer bezahlte Bestellungen:
  - `api/lib/workflow-store.js` verwaltet `workflow:<id>`, `workflow-order:<orderId>:delivery`, `workflow-jobs:ready`, Locks und Step-Idempotenz.
  - `api/lib/delivery-workflow.js` verarbeitet Produktfluesse deterministisch: Intake, License, Baseline-Audit, Delivery-Report, Mails, Monitoring-Aktivierung oder Human-Approval-Gate.
  - `api/internal/workflow-runner.js` ist der geschuetzte interne Runner (`X-AidSec-Internal-Secret`, `INTERNAL_WORKFLOW_SECRET` oder Fallback `INTERNAL_API_SECRET`).
  - `api/cron/workflow-runner.js` verarbeitet liegengebliebene Jobs ueber Vercel Cron.
- Stripe Webhook bleibt schnell:
  - `checkout.session.completed` aktiviert Order/Payment, sichert Customer/License minimal, schreibt `order.paid`/`checkout.session.completed`, queued genau einen Delivery-Workflow und sendet keine direkten Delivery-Mails mehr.
  - Mailversand, Report-Platzhalter, Monitoring-Aktivierung und Review-Gates laufen im Runner mit Step-Events.
- Produktverhalten:
  - `rapid-header-fix` und `cyber-mandat` laufen automatisch bis `deliveryStatus=delivered`.
  - `kanzlei-haertung` stoppt bewusst bei `deliveryStatus=review_needed` und `workflowStatus=needs_manual_review`.
  - Portal gibt nur nicht-sensitive Felder aus: `workflowStatus`, `deliveryStatus`, `nextAction`, `reportReadiness`.
- Production-Smoke:
  - `scripts/production-smoke.mjs` ruft nach signed Stripe Webhook den internen Workflow-Runner auf.
  - Fuer Production-Smoke muss lokal/Vercel `INTERNAL_WORKFLOW_SECRET` gesetzt sein.

## Verifikation Dieses Blocks

Bereits lokal gruen:

```powershell
npm.cmd test
npm.cmd run lint -- --quiet
Get-ChildItem -Path api,tests,scripts,js,onboarding -Recurse -Include *.js,*.mjs | ForEach-Object { node --check $_.FullName }
npm.cmd run build
npm.cmd audit --audit-level=moderate
npm.cmd run video:check
```

Nach Deploy:

```powershell
$env:SMOKE_EMAIL="<echte-testadresse>"
node scripts/production-smoke.mjs
npx.cmd --yes vercel@latest logs aidsec.ch --since 5m --level error --expand
```

Letzter dokumentierter Production-Smoke nach `f8dd090`:

- Run ID: `20260526151213`
- Erfolgreich: Stripe Checkout fuer alle 3 Produkte, signed Stripe Webhook, Redis Persistenz, R2 signed report URL, Plugin Relay License-Signatur, transactional mail path.
- Direkt danach: `npx.cmd --yes vercel@latest logs aidsec.ch --since 1m --level error --expand` meldete keine Error-Logs.

Erfolgskriterium fuer weitere Deploys: Smoke gruen, keine frischen SMTP-/API-Fehler, keine erwartbaren Warnungen im Testfenster.

## Bekannte Risiken

- Alle im Chat geteilten Provider-Secrets muessen rotiert werden. Dazu gehoeren mindestens SMTP/Microsoft, Brevo, hCaptcha Secret, HARPA Key, Redis Tokens und alle weiteren geposteten Keys. Diese Datei enthaelt bewusst keine Werte.
- Secret-Rotation ist nicht technisch durch alten Code loesbar: Neue Secrets muessen bei den Providern erzeugt und danach in Vercel Production/Preview/Development plus lokaler `.env.local` ersetzt werden. Danach ist ein neuer Production-Smoke Pflicht.
- `.env.local` bleibt gitignored und darf nicht angezeigt oder committed werden.
- Die alte Smoke-Variante mit `example.com` als Empfaenger hat Microsoft-Mailfehler erzeugt. Ab jetzt echte Smoke-Mail nur ueber `SMOKE_EMAIL`.
- Die frische `url.parse` Deprecation-Warnung aus Vercel Logs wurde erneut nach Production-Smoke sichtbar. Root Cause: `@aws-sdk/client-s3` brachte Smithy-Dependencies in Vercel Functions. Fix: AWS SDK entfernt; R2/S3 laeuft ueber `api/lib/signed-storage-url.js` und `fetch`. Nach Deploy erneut Production-Smoke plus Error-Logs pruefen.

## Naechste Schritte Fuer Neuen Agent

1. Aktuellen Git-/Deploy-Stand pruefen:

```powershell
Set-Location C:\Users\keoku\Desktop\AidSec.ch\project
git status --short --branch
git log --oneline --decorate -8
npx.cmd --yes vercel@latest list aidsec-ucws
```

2. Falls der P1-Automation-Nachzug noch nicht committed ist:

```powershell
npm.cmd test
npm.cmd run lint -- --quiet
Get-ChildItem -Path api,tests,scripts,js,onboarding -Recurse -Include *.js,*.mjs | ForEach-Object { node --check $_.FullName }
npm.cmd run build
npm.cmd audit --audit-level=moderate
npm.cmd run video:check
git add api/lib/order-store.js api/lib/signed-storage-url.js api/checkout-webhook.js api/proof-center-status.js api/cron/storage.js api/cron/reaudit.js js/main.js vercel.json scripts/production-smoke.mjs package.json package-lock.json tests/api-p0.test.js tests/conversion-design.test.js docs/AGENT_HANDOFF_2026-05-26.md
git commit -m "feat: finalize p1 customer automation"
git push origin main
```

3. Nach Vercel `READY` Production-Smoke mit echter `SMOKE_EMAIL` ausfuehren und Error-Logs im 5-Minuten-Fenster pruefen.

4. Secret-Rotation operativ erledigen:
   - Neue Keys in Providern erzeugen.
   - Vercel Production/Preview/Development Env aktualisieren.
   - Lokale `.env.local` erneuern.
   - Danach Smoke erneut laufen lassen.

5. Naechster P1/P2 Schritt nach Secret-Rotation:
   - Echte Testimonials/Case Studies einholen und strukturierte Trust-Sektion bauen.
   - Follow-up-/Upsell-Automation an Order-Events koppeln.
   - Optional Airtable/Supabase erst anbinden, wenn Redis-Backbone-Events stabil gesmoked sind.
   - Upstash bleibt kurzfristig Source of Truth; Make/n8n nur fuer Orchestrierung, nicht als Datenquelle.

## Wichtige Dateien

- `api/lib/order-store.js`: Redis Store, Orders, Customers, Licenses, Events, Monitoring Targets, Website/Report Backbone Records.
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
