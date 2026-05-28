/* ═══════════════════════════════════════════
  AidSec Contact Form Logic (API)
  ═══════════════════════════════════════════ */

(function () {
  'use strict';

  var form = document.getElementById('contact-form');
  var submitBtn = document.getElementById('form-submit');
  var submitText = submitBtn ? submitBtn.querySelector('.contact-form__submit-text') : null;
  var errorMsg = document.getElementById('form-submit-error');
  var captchaContainer = document.getElementById('hcaptcha-container');
  var captchaWidgetId = null;

  if (!form) return;

  function getCaptchaSiteKey() {
    return (
      form.getAttribute('data-hcaptcha-sitekey') ||
      (captchaContainer ? captchaContainer.getAttribute('data-sitekey') : '') ||
      ''
    );
  }

  function hasCaptchaConsent() {
    return !window.aidsecConsent || window.aidsecConsent.hasConsent();
  }

  function showError(message) {
    if (errorMsg) {
      errorMsg.textContent = message;
      errorMsg.hidden = false;
      errorMsg.removeAttribute('hidden');
    }
  }

  function initCaptcha(attempt) {
    var siteKey = getCaptchaSiteKey();
    if (!siteKey || !captchaContainer || !hasCaptchaConsent()) return;

    captchaContainer.hidden = false;
    captchaContainer.removeAttribute('hidden');
    captchaContainer.setAttribute('aria-hidden', 'false');

    if (window.hcaptcha && typeof window.hcaptcha.render === 'function') {
      if (captchaWidgetId === null) {
        captchaWidgetId = window.hcaptcha.render(captchaContainer, { sitekey: siteKey });
      }
      return;
    }

    if ((attempt || 0) < 30) {
      setTimeout(function () {
        initCaptcha((attempt || 0) + 1);
      }, 250);
    }
  }

  function getCaptchaToken() {
    if (window.hcaptcha && captchaWidgetId !== null && typeof window.hcaptcha.getResponse === 'function') {
      return window.hcaptcha.getResponse(captchaWidgetId) || '';
    }
    return (new FormData(form).get('h-captcha-response') || '').toString();
  }

  document.addEventListener('aidsec:consent-granted', function () {
    initCaptcha(0);
  });
  document.addEventListener('aidsec:consent-change', function (event) {
    if (event.detail === 'accepted') initCaptcha(0);
  });
  initCaptcha(0);

  function setSubmitting(isSubmitting) {
    if (submitBtn) {
      submitBtn.disabled = isSubmitting;
      submitBtn.classList.toggle('loading', isSubmitting);
    }
    if (submitText) {
      submitText.textContent = isSubmitting ? 'Wird gesendet...' : 'Kostenfreie Analyse anfordern';
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    // Reset error
    if (errorMsg) {
      errorMsg.hidden = true;
      errorMsg.setAttribute('hidden', '');
      errorMsg.textContent = '';
    }

    // Basic internal validation check before sending
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    if (getCaptchaSiteKey() && !hasCaptchaConsent()) {
      showError('Bitte aktivieren Sie hCaptcha im Cookie-Hinweis, damit wir das Formular schuetzen koennen.');
      return;
    }

    initCaptcha(0);
    var hCaptchaToken = getCaptchaToken();
    if (getCaptchaSiteKey() && !hCaptchaToken) {
      showError('Bitte bestaetigen Sie hCaptcha und senden Sie das Formular erneut.');
      return;
    }

    setSubmitting(true);

    var formData = new FormData(form);
    var payload = {
      name: (formData.get('name') || '').toString().trim(),
      company: (formData.get('company') || '').toString().trim(),
      websiteUrl: (formData.get('website') || '').toString().trim(),
      email: (formData.get('email') || '').toString().trim(),
      agb: formData.get('agb') ? 'on' : '',
      botField: (formData.get('bot-field') || '').toString().trim(),
      hCaptchaToken: hCaptchaToken,
      source: (formData.get('source') || '').toString().trim(),
      sourcePath: window.location.pathname,
    };

    // Diagnostic: Warn if on localhost
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.warn('Form-E-Mails werden lokal nicht versendet. Weiterleitung wird simuliert.');
      setTimeout(function () {
        window.location.href = '/onboarding/bestaetigung/';
      }, 500);
      return;
    }

    fetch('/api/contact-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (response) {
        if (response.ok) {
          window.location.href = '/onboarding/bestaetigung/';
        } else {
          return response
            .json()
            .catch(function () {
              return { error: 'Server-Fehler' };
            })
            .then(function (data) {
              throw new Error(data.error || 'Server-Fehler');
            });
        }
      })
      .catch(function (error) {
        console.error('Submission error:', error);
        if (errorMsg) {
          errorMsg.textContent =
            'Es gab ein Problem beim Senden. Bitte versuchen Sie es erneut oder kontaktieren Sie uns direkt per E-Mail.';
          errorMsg.hidden = false;
          errorMsg.removeAttribute('hidden');
        }
        setSubmitting(false);
      });
  });
})();
