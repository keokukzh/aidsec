const fs = require('fs');
const path = require('path');

const baseDir = __dirname;
const htmlFiles = [];

// Recursively find all HTML files
function findHtmlFiles(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        findHtmlFiles(fullPath);
      }
    } else if (fullPath.endsWith('.html')) {
      htmlFiles.push(fullPath);
    }
  }
}

findHtmlFiles(baseDir);

const newHeader = `<header class="nav" id="nav" role="banner">
      <div class="container nav__inner">
        <!-- Logo -->
        <a href="/" class="nav__logo" aria-label="AidSec — Startseite">
          <img
            src="/logowhite.png"
            alt="AidSec"
            width="119"
            height="109"
            class="nav__logo-img"
            loading="eager"
            decoding="async"
          />
        </a>

        <!-- Desktop Links -->
        <nav class="nav__links" aria-label="Hauptnavigation">
          <div class="nav__item has-dropdown">
            <a href="/index.html#leistungen" class="nav__link">Leistungen</a>
            <div class="nav__dropdown">
              <a href="/leistungen/header-optimierung.html">Rapid Header Fix</a>
              <a href="/leistungen/wordpress-haertung.html">Kanzlei-Härtung</a>
              <a href="/leistungen/cyber-mandat.html">Cyber-Mandat</a>
            </div>
          </div>
          
          <div class="nav__item has-dropdown">
            <span class="nav__link" tabindex="0">Branchen</span>
            <div class="nav__dropdown">
              <a href="/branchen/anwaltskanzleien.html">Anwaltskanzleien</a>
              <a href="/branchen/arztpraxen.html">Arztpraxen</a>
              <a href="/branchen/notariate.html">Notariate</a>
            </div>
          </div>
          
          <a href="/fallstudien.html" class="nav__link">Fallstudien</a>
          <a href="/index.html#preise" class="nav__link">Preise</a>
          
          <div class="nav__item has-dropdown">
            <a href="/wissen/index.html" class="nav__link">Wissen</a>
            <div class="nav__dropdown">
              <a href="/wissen/index.html">Alle Artikel</a>
              <a href="/wissen/der-ultimative-ndsg-compliance-guide-2025.html">nDSG Compliance Guide</a>
              <a href="/wissen/security-headers-note-f.html">Security Headers Note F</a>
            </div>
          </div>
        </nav>

        <!-- CTA -->
        <a
          href="/index.html#kontakt"
          class="btn btn--gold nav__cta desktop-only"
          data-track="nav-cta"
          aria-label="Kostenfreien Security-Check starten"
        >
          Kostenfreien Security-Check
          <span class="btn__badge">24h</span>
        </a>

        <!-- Mobile Toggle -->
        <button
          class="nav__toggle"
          id="nav-toggle"
          aria-label="Menü öffnen"
          aria-expanded="false"
          aria-controls="mobile-menu"
        >
          <span class="nav__toggle-bar"></span>
          <span class="nav__toggle-bar"></span>
          <span class="nav__toggle-bar"></span>
        </button>
      </div>

      <!-- Mobile Menu -->
      <div class="mobile-menu" id="mobile-menu" aria-hidden="true">
        <nav class="mobile-menu__nav" aria-label="Mobile Navigation">
          <div class="nav__item has-dropdown">
            <a href="/index.html#leistungen" class="nav__link mobile-menu__link">Leistungen <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></a>
            <div class="nav__dropdown">
              <a href="/leistungen/header-optimierung.html" class="mobile-menu__link">Rapid Header Fix</a>
              <a href="/leistungen/wordpress-haertung.html" class="mobile-menu__link">Kanzlei-Härtung</a>
              <a href="/leistungen/cyber-mandat.html" class="mobile-menu__link">Cyber-Mandat</a>
            </div>
          </div>
          <div class="nav__item has-dropdown">
            <span class="nav__link mobile-menu__link">Branchen <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></span>
            <div class="nav__dropdown">
              <a href="/branchen/anwaltskanzleien.html" class="mobile-menu__link">Anwaltskanzleien</a>
              <a href="/branchen/arztpraxen.html" class="mobile-menu__link">Arztpraxen</a>
              <a href="/branchen/notariate.html" class="mobile-menu__link">Notariate</a>
            </div>
          </div>
          <a href="/fallstudien.html" class="mobile-menu__link">Fallstudien</a>
          <a href="/index.html#preise" class="mobile-menu__link">Preise</a>
          <div class="nav__item has-dropdown">
            <a href="/wissen/index.html" class="nav__link mobile-menu__link">Wissen <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></a>
            <div class="nav__dropdown">
              <a href="/wissen/index.html" class="mobile-menu__link">Alle Artikel</a>
              <a href="/wissen/der-ultimative-ndsg-compliance-guide-2025.html" class="mobile-menu__link">nDSG Guide 2025</a>
            </div>
          </div>
          <a
            href="/index.html#kontakt"
            class="btn btn--gold mobile-menu__cta"
            data-track="mobile-cta"
            aria-label="Gratis Security-Check starten"
            >Gratis Security-Check</a
          >
        </nav>
      </div>
    </header>`;

const newFooter = `<footer class="footer" role="contentinfo">
      <div class="container">
        <div class="footer__inner">
          <div class="footer__brand">
            <img
              src="/logowhite.png"
              alt="AidSec"
              width="36"
              height="36"
              class="footer__logo"
              loading="lazy"
            />
            <span class="footer__brand-text">Aid<strong>SEC</strong></span>
          </div>
          <p class="footer__tagline">Digitale Sicherheit für Schweizer Kanzleien und Praxen</p>
          <p class="footer__copy">&copy; 2026 AidSec. Alle Rechte vorbehalten. Schweiz.</p>
          <div class="footer__links">
            <a href="/datenschutz.html" class="footer__link">Datenschutz</a>
            <a href="/impressum.html" class="footer__link">Impressum</a>
            <a href="/agb.html" class="footer__link">AGB</a>
          </div>
        </div>
      </div>
    </footer>`;

let changedCount = 0;

for (const file of htmlFiles) {
  let content = fs.readFileSync(file, 'utf8');
  let modified = false;

  // Replace Header
  // Using a regular expression to match everything from <header ... id="nav"...> to </header>
  const headerRegex = /<header\b[^>]*?id="nav"[^>]*>[\s\S]*?<\/header>/i;
  if (headerRegex.test(content)) {
    content = content.replace(headerRegex, newHeader);
    modified = true;
  } else {
    console.log('[Warn] No header found in', file);
  }

  // Replace Footer
  const footerRegex = /<footer\b[^>]*?class="footer"[^>]*>[\s\S]*?<\/footer>/i;
  if (footerRegex.test(content)) {
    content = content.replace(footerRegex, newFooter);
    modified = true;
  } else {
    console.log('[Warn] No footer found in', file);
  }

  if (modified) {
    fs.writeFileSync(file, content, 'utf8');
    changedCount++;
    console.log('Updated:', path.relative(baseDir, file));
  }
}

console.log('Done! Updated', changedCount, 'files.');
