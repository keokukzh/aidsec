/* ============================================
   AidSec Consent Management — nDSG-konform
   ============================================
   Plausible Analytics: cookieless, EU-hosted → NO consent needed, loads immediately.
   hCaptcha: requires consent → loaded only after user accepts.
*/

(function () {
  'use strict';

  const CONSENT_KEY = 'aidsec_cookie_consent';
  const CONSENT_VERSION = '1'; // bump to re-ask on policy changes

  // ── State ──
  function getConsent() {
    try {
      const raw = localStorage.getItem(CONSENT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed.version !== CONSENT_VERSION) return null;
      return parsed.status; // 'accepted' | 'rejected'
    } catch (_) {
      return null;
    }
  }

  function setConsent(status) {
    try {
      localStorage.setItem(
        CONSENT_KEY,
        JSON.stringify({ status, version: CONSENT_VERSION, timestamp: Date.now() })
      );
    } catch (_) {}
  }

  function hasConsent() {
    return getConsent() === 'accepted';
  }

  // ── Plausible (loads IMMEDIATELY — no consent required) ──
  function loadPlausible() {
    if (document.querySelector('script[src*="plausible"]')) return;

    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = 'https://plausible.io/js/script.js';
    script.setAttribute('data-domain', 'aidsec.ch');
    document.head.appendChild(script);

    // Plausible queue fallback
    window.plausible =
      window.plausible ||
      function () {
        (window.plausible.q = window.plausible.q || []).push(arguments);
      };
  }

  // Load Plausible immediately on every page load
  loadPlausible();

  // ── Consent-gated scripts (hCaptcha) ──
  let consentScriptsLoaded = false;

  function loadConsentScripts() {
    if (consentScriptsLoaded) return;
    consentScriptsLoaded = true;

    // hCaptcha
    if (!document.querySelector('script[src*="hcaptcha"]')) {
      const hcaptchaScript = document.createElement('script');
      hcaptchaScript.src = 'https://js.hcaptcha.com/1/api.js';
      hcaptchaScript.async = true;
      hcaptchaScript.defer = true;
      hcaptchaScript.crossOrigin = 'anonymous';
      document.head.appendChild(hcaptchaScript);
    }

    // Dispatch event so form.js can initialize hCaptcha widget
    document.dispatchEvent(new CustomEvent('aidsec:consent-granted'));
  }

  // ── Banner Logic ──
  function showBanner() {
    const banner = document.getElementById('cookie-banner');
    if (banner) banner.style.display = 'block';
  }

  function hideBanner() {
    const banner = document.getElementById('cookie-banner');
    if (banner) banner.style.display = 'none';
  }

  // ── Public API ──
  window.aidsecConsent = {
    grant() {
      setConsent('accepted');
      hideBanner();
      loadConsentScripts();
      document.dispatchEvent(new CustomEvent('aidsec:consent-change', { detail: 'accepted' }));
    },
    reject() {
      setConsent('rejected');
      hideBanner();
      document.dispatchEvent(new CustomEvent('aidsec:consent-change', { detail: 'rejected' }));
    },
    hasConsent,
    revoke() {
      try {
        localStorage.removeItem(CONSENT_KEY);
      } catch (_) {}
      consentScriptsLoaded = false;
      showBanner();
    },
  };

  // ── Init ──
  const currentConsent = getConsent();

  if (currentConsent === 'accepted') {
    loadConsentScripts();
  } else if (currentConsent === null) {
    // No decision yet → show banner on DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showBanner);
    } else {
      showBanner();
    }
  }
  // If 'rejected' → do nothing, banner stays hidden
})();
