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

The contact form uses **Netlify Forms** (native form handling). Add `data-netlify="true"` and `name` to the form; submissions appear in the Netlify dashboard.

**Vor dem Go-Live:** Siehe `PLATZHALTER.md` für optionale Platzhalter (Plausible, hCaptcha).

## Deploy

1. `config.example.json` → `config.json` kopieren und Werte eintragen
2. `npm run fill` — Platzhalter ersetzen
3. `npm run prepare-fonts` — Fonts für Self-Hosting vorbereiten (einmalig)
4. `npm run build` — React Hero bauen
5. Projekt-Root deployen (`index.html`, `css/`, `js/`, `js/dist/`, `css/fonts/`)
6. **Netlify:** `_headers` und `netlify.toml` werden automatisch verwendet
7. Nach Deployment: `npm run verify-headers` — Security Headers prüfen

## Project Structure

```
aidsec.ch/
├── index.html, 404.html, impressum.html, agb.html, datenschutz.html
├── netlify.toml       # Netlify build & redirects
├── _headers           # Netlify security headers
├── robots.txt, sitemap.xml
├── PLATZHALTER.md     # Deploy-Anleitung
├── css/               # Styles, fonts
├── js/
│   ├── main.js, form.js
│   ├── hero-app.jsx, BlurText.jsx
│   └── dist/          # Vite build output
├── scripts/           # fill-placeholders, prepare-fonts, verify-headers
├── netlify/functions/ # check-headers (Security-Check API)
├── api/               # Vite dev proxy for /api/check-headers
├── docs/templates/    # Angebotsvorlagen (intern)
├── vite.config.js
└── package.json
```

## License

Proprietary. © 2026 AidSec.
