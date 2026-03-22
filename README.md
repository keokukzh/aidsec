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
