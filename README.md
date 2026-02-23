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

Required Vercel Environment Variables:

- `SMTP_HOST`
- `SMTP_PORT` (e.g. `587`)
- `SMTP_USER`
- `SMTP_PASS`
- `ONBOARDING_TO_EMAIL` (defaults to `aid.destani@aidsec.ch`)
- `ONBOARDING_FROM_EMAIL` (optional, defaults to `SMTP_USER`)

Optional durable rate-limiting (recommended for production):

- `ONBOARDING_RATE_LIMIT_MODE` = `upstash` (default is in-memory fallback)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

**Vor dem Go-Live:** Siehe `PLATZHALTER.md` für optionale Platzhalter (Plausible, hCaptcha).

## Deploy

1. `config.example.json` → `config.json` kopieren und Werte eintragen
2. `npm run fill` — Platzhalter ersetzen
3. `npm run prepare-fonts` — Fonts für Self-Hosting vorbereiten (einmalig)
4. `npm run build` — React Hero bauen
5. Projekt-Root deployen (`index.html`, `css/`, `js/`, `js/dist/`, `css/fonts/`)
6. **Vercel:** `vercel.json` enthält Security Headers/CSP und Cache-Regeln
7. Nach Deployment: `npm run verify-headers` — Security Headers prüfen

## Project Structure

```
aidsec.ch/
├── index.html, 404.html, impressum.html, agb.html, datenschutz.html
├── vercel.json        # Security headers + cache config
├── robots.txt, sitemap.xml
├── PLATZHALTER.md     # Deploy-Anleitung
├── css/               # Styles, fonts
├── js/
│   ├── main.js, form.js
│   ├── hero-app.jsx, BlurText.jsx
│   └── dist/          # Vite build output
├── scripts/           # fill-placeholders, prepare-fonts, verify-headers
├── netlify/functions/ # legacy lambda source (kept for parity)
├── api/               # Vercel serverless endpoints + Vite dev middleware target
├── docs/templates/    # Angebotsvorlagen (intern)
├── vite.config.js
└── package.json
```

## License

Proprietary. © 2026 AidSec.
