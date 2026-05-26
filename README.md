# AidSec.ch

Swiss IT security landing page for lawyers, doctors, and notaries. WordPress hardening, security headers, nDSG compliance.

## Tech Stack

- **Frontend:** HTML, CSS, vanilla JavaScript, React (hero animation only)
- **Build:** Vite
- **Design:** Navy + gold, Instrument Serif + Plus Jakarta Sans

## Setup

```bash
npm install
```

## Development

```bash
# Vite dev server (hot reload)
npm run dev

# Static preview (production-like)
npx serve .
```

## Build

```bash
npm run build
```

Builds the React hero bundle to `js/dist/hero-app.js`. The site is static HTML; deploy the entire directory.

## Code Quality

```bash
npm run lint    # ESLint
npm run format  # Prettier
```

## Form Backend

Onboarding forms (`/onboarding/*`) submit to `POST /api/onboarding-submit` (Vercel Serverless Function) and send internal notifications via SMTP.

Homepage Sicherheits-Check (`#contact-form`) submits to `POST /api/contact-submit` and sends a structured internal Anfrage-Mail.

Required Vercel Environment Variables:

- `SMTP_HOST`
- `SMTP_PORT` (e.g. `587`)
- `SMTP_USER`
- `SMTP_PASS`
- `ONBOARDING_TO_EMAIL` (defaults to `aid.destani@aidsec.ch`)
- `ONBOARDING_FROM_EMAIL` (optional, defaults to `SMTP_USER`)

Optional separate target/sender for Sicherheits-Check:

- `CONTACT_TO_EMAIL` (fallback: `ONBOARDING_TO_EMAIL` → `MAIL_TO` → `aid.destani@aidsec.ch`)
- `CONTACT_FROM_EMAIL` (fallback: `ONBOARDING_FROM_EMAIL` → `MAIL_FROM` → `SMTP_USER`)

Durable rate-limiting for deployed environments:

- `ONBOARDING_RATE_LIMIT_MODE` = `upstash`
- `CONTACT_RATE_LIMIT_MODE` = `upstash` (optional, otherwise deployed env still requires Upstash)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

P0 production hardening also requires:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_RAPID`
- `STRIPE_PRICE_HAERTUNG`
- `STRIPE_PRICE_MANDAT_MONTHLY`
- `STRIPE_PRICE_MANDAT_YEARLY` (optional)
- `ORDER_TOKEN_SECRET`
- `PLUGIN_TOKEN_VERSION`
- `PLUGIN_MAKE_WEBHOOK_URL`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `CRON_SECRET`
- `INTERNAL_API_SECRET`
- `BASE_URL`
- `ALLOWED_ORIGIN`

Plugin install secrets are generated per order/license and stored in Upstash. Do not configure or ship a global plugin shared secret.

P1 customer portal backbone:

- Paid Stripe checkout events create/update a customer record in the same Upstash-backed store as orders.
- `proof-center.html?orderId=...&token=...` switches from public demo data to an authenticated customer portal view.
- Report links use R2/S3 signed URLs when `reportKey` is present; local/dev falls back to `/reports/...`.
- Monthly monitoring targets are read from customer websites first, then from the legacy `data/customers.json` fallback.
- Payment confirmation e-mails are sent from the checkout webhook when SMTP is configured; failures are recorded as order events and do not fail Stripe webhook acknowledgement.

Local development and Vercel Preview may fall back to in-memory rate limiting. Production remains strict and returns `503` if Upstash is unavailable.

Allowed origins for form endpoints include the primary domain, localhost dev origins, and the current Vercel deployment URL via `VERCEL_URL`. Custom allowlists from `ONBOARDING_ALLOWED_ORIGINS` or `CONTACT_ALLOWED_ORIGINS` are merged on top.

**Vor dem Go-Live:** Siehe `config.example.json` und `scripts/fill-placeholders.js` für optionale Platzhalter (Plausible, hCaptcha).

## Deploy

1. `config.example.json` → `config.json` kopieren und Werte eintragen
2. `npm run fill` — Platzhalter ersetzen
3. `npm run prepare-fonts` — Fonts für Self-Hosting vorbereiten (einmalig)
4. `npm run build` — React Hero bauen
5. Projekt-Root deployen (`index.html`, `css/`, `js/`, `js/dist/`, `css/fonts/`)
6. **Vercel:** `vercel.json` enthält Security Headers/CSP und Cache-Regeln
7. Nach Deployment: `npm run verify-headers` — Security Headers prüfen

## Project Structure

```text
aidsec.ch/
├── index.html, 404.html, impressum.html, agb.html, datenschutz.html
├── proof-center.html  # AidSec Verified / Proof Center demo
├── vercel.json        # Security headers + cache config
├── robots.txt, sitemap.xml
├── css/               # Styles, fonts
├── data/              # Shared package and proof data
├── js/
│   ├── main.js, form.js, proof-center.js
│   ├── hero-app.jsx, BlurText.jsx
│   └── dist/          # Vite build output
├── onboarding/        # Dedicated onboarding pages + shared assets
├── scripts/           # fill-placeholders, prepare-fonts, verify-headers
├── api/               # Vercel serverless endpoints + Vite dev middleware target
├── docs/templates/    # Angebotsvorlagen (intern)
├── vite.config.js
└── package.json
```

## File Organization Rules

- Keep root-level HTML pages in place for static hosting compatibility.
- Keep runtime assets under `css/`, `js/`, `onboarding/`, and `assets/`.
- Keep operational notes and audits in `docs/plans/`.
- Keep local one-off helper scripts out of git.
- Before pushing: run `git status --short`, `npm run lint`, and `npm run build`.

## License

Proprietary. © 2026 AidSec.
