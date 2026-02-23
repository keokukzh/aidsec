# Copilot Instructions for aidsec.ch

This repository is a **static marketing site** with a handful of interactive UX bits and a small serverless helper.  The goal of these notes is to point AI agents at the things that matter so they can be productive without human hand‑holding.

---
## High‑level architecture

1. **Static HTML/CSS/JS** lives in the repo root. Each page (`index.html`, `agb.html`, etc.) is written by hand; there is no templating engine.
2. **CSS** is organised under `css/` with one large stylesheet per purpose.  Classes use a simple BEM‑ish naming convention (`hero__check-result`, `faq__question`, etc.).
3. **Client JavaScript** is under `js/`:
   * `main.js` – the only substantial script; it contains all DOM logic (navigation, scroll reveals, form handling, ROI calculator, the security‑header widget, etc.).  Sections are separated with comment headers in the file and rely on `id`/`data-` attributes in the markup.
   * `hero-app.jsx` + `BlurText.jsx` – a tiny React "island" built with Vite.  The build outputs a single ES module `js/dist/hero-app.js` which is then shipped with the site.
4. **Serverless API** lives in `netlify/functions/check-headers.js` and is also exposed during development via a Vite middleware.  It performs the same header‑scoring logic the client uses for the inline widget.
5. **Build tooling** is Vite.  React plugin is enabled solely for the hero component; the rest of the site ships as plain JS/CSS.  The `vite.config.js` file also defines the dev‑server proxy for `/api/check-headers`.
6. **Deployment targets**: Netlify (primary) and Vercel (alternate).  Security headers are declared in `_headers`/`netlify.toml` or `vercel.json`; changes here must match the CSP rules referenced in the HTML and scripts.

---
## Developer workflows

```bash
npm install             # first‑time setup
npm run dev             # launches Vite with hot reload and /api proxy
npm run build           # prepare-fonts + Vite production build
npm run lint            # ESLint on js/*.js js/*.jsx api/*.js
npm run format          # Prettier formatting
npm run fill            # replace placeholders in HTML using config.json
npm run verify-headers  # check production headers with securityheaders.com
```

- **Config file**.  `config.json` is gitignored; copy `config.example.json` and populate values before running `npm run fill`.  That script patches `index.html`, `impressum.html` and activates Plausible/HCaptcha snippets.  Any new placeholder in the markup should be added to `scripts/fill-placeholders.js`.
- **Fonts**.  Self‑hosted fonts are prepared with `npm run prepare-fonts`.  It pulls from `@fontsource/*` and writes `css/fonts.css` + copies `.woff2` files.  Always run before build if font deps change.
- **Section reordering**.  `scripts/reorder-sections.py` is a one‑off utility used by the author to shuffle `<main>` sections in `index.html`.  It is not part of the build; repair the absolute path if running on another machine.

---
## Code conventions & patterns

* The repo is ESM (`"type":"module"` in package.json).  Node scripts and the Vite config use `import`/`export`.
* All static assets (`images`, videos, fonts) are versioned in place.  Build output (`js/dist/*`, `css/fonts/`) is gitignored.
* JavaScript tries to avoid dependencies: most functionality is handwritten.  Use modern browser APIs (IntersectionObserver, `fetch`, `URL`) directly; polyfills are not included.
* DOM elements are selected once and cached at the top of `main.js` with `getElementById` or `querySelectorAll`.  Add new features in the same file, following the existing comment section style.
* Data attributes drive behaviour (`data-reveal`, `data-count-to`, `data-track`).  When adding a new interactive element, add a corresponding selector or attribute check in `main.js`.
* The React hero island is the only place `react`/`motion` are used; don't add React elsewhere unless a new island pattern is consciously adopted.
* Netlify function handlers export a default `async (req,res) => {}` style compatible with Vite's dev middleware.  Use `fetch` instead of node‑only http libraries.

---
## Integration & external dependencies

* **Netlify Forms**: native HTML forms with `data-netlify="true"`.  No backend required.
* **Security header widget**: client calls `/api/check-headers?url=…` which hits the serverless function.  In dev, Vite middleware loads `netlify/functions/check-headers.js` via `ssrLoadModule`.
* **Analytics/tracking**.  Plausible integration is toggled by `config.json`.  There is also a simple `data-track` event emitter in `main.js` which fires a custom `aidsec:track` event and optionally calls `window.plausible()`.
* **hCaptcha**: optional site key injected by `npm run fill`.

---
## Files & directories to watch

```
js/                # client scripts (see above)
css/               # stylesheets; fonts.css generated
api/               # Vite dev proxy modules (mirror of netlify/functions)
netlify/functions/ # production lambda code
scripts/           # helper scripts (placeholder, fonts, headers, reorder)
config.example.json# template for config.json
.
```

---
## Notes for AI agents

* When editing HTML, remember the placeholder replacement script.  If you add new dynamic text, update `scripts/fill-placeholders.js` accordingly.
* Keep the hero‑app build configuration in sync: any change to React code requires running `npm run dev` or `npm run build` to regenerate `js/dist/hero-app.js`.
* Avoid touching `js/dist` and `css/fonts`; they are generated.
* There are no automated tests; rely on manual smoke testing (`npm run dev` + browser) and `npm run lint`/`npm run format` for JS quality.
* Be conservative about dependencies.  The site is intentionally light‑weight; the only runtime deps are React/motion for the hero component, `sharp` for font prep, and ESLint/Prettier/Vite for dev tooling.

---

When in doubt, read `README.md` and the top of each script for context.  Ask the maintainer to clarify any business‑specific text (German copy, privacy requirements, etc.) before making large changes.