/* ============================================
   AidSec Form JS — Validation & Submission
   ES6 Refactored, nDSG Consent-aware
   ============================================ */

(() => {
  'use strict';

  const form = document.getElementById('contact-form');
  const submitBtn = document.getElementById('form-submit');
  const successMsg = document.getElementById('form-success');
  const hcaptchaContainer = document.getElementById('hcaptcha-container');

  if (!form) return;

  // Pre-fill website field from security check widget
  try {
    const savedUrl = sessionStorage.getItem('aidsec_checked_url');
    if (savedUrl) {
      const websiteField = form.querySelector('#website');
      if (websiteField && !websiteField.value) {
        websiteField.value = savedUrl;
      }
    }
  } catch (_) {}

  const formAction =
    form.getAttribute('data-action') || (form.hasAttribute('data-netlify') ? '/' : null);
  const hcaptchaSiteKey = form.getAttribute('data-hcaptcha-sitekey');
  const useHcaptcha =
    hcaptchaSiteKey && hcaptchaSiteKey.length > 0 && !hcaptchaSiteKey.includes('PLATZHALTER');

  // ── hCaptcha (consent-gated via consent.js) ──
  function initHcaptcha() {
    if (!useHcaptcha || !hcaptchaContainer) return;
    if (!window.hcaptcha) return;

    hcaptchaContainer.hidden = false;
    hcaptchaContainer.setAttribute('aria-hidden', 'false');
    window.hcaptcha.render('hcaptcha-container', {
      sitekey: hcaptchaSiteKey,
      theme: 'dark',
    });
  }

  // Listen for consent — hCaptcha script is loaded by consent.js
  document.addEventListener('aidsec:consent-granted', () => {
    // hCaptcha script may take time to load; poll briefly
    const checkHcaptcha = setInterval(() => {
      if (window.hcaptcha) {
        clearInterval(checkHcaptcha);
        initHcaptcha();
      }
    }, 200);
    // Stop polling after 10s
    setTimeout(() => clearInterval(checkHcaptcha), 10000);
  });

  // If consent was already granted before page load, init immediately when hCaptcha is ready
  if (window.aidsecConsent && window.aidsecConsent.hasConsent()) {
    if (window.hcaptcha) {
      initHcaptcha();
    } else {
      document.addEventListener('aidsec:consent-granted', () => {
        const check = setInterval(() => {
          if (window.hcaptcha) {
            clearInterval(check);
            initHcaptcha();
          }
        }, 200);
        setTimeout(() => clearInterval(check), 10000);
      });
    }
  }

  // ── Validation Rules ──
  const validators = {
    name: {
      required: true,
      message: 'Bitte geben Sie Ihren Namen ein.',
      validate: (value) => value.trim().length >= 2,
    },
    email: {
      required: true,
      message: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.',
      validate: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),
    },
    website: {
      required: true,
      message: 'Bitte geben Sie eine gültige Website-URL ein (z.B. https://www.beispiel.ch).',
      validate: (value) => {
        if (!value.trim()) return false;
        let url = value.trim();
        if (!/^https?:\/\//i.test(url)) {
          url = `https://${url}`;
        }
        try {
          new URL(url);
          return true;
        } catch (_) {
          return false;
        }
      },
    },
    company: {
      required: false,
      message: '',
      validate: () => true,
    },
    agb: {
      required: true,
      message: 'Bitte bestätigen Sie die AGB, um fortzufahren.',
      validate: (_value, input) => input && input.checked,
    },
  };

  // ── Show/Clear Errors ──
  const showError = (input, message) => {
    input.classList.add('error');
    const group = input.closest('.contact-form__group');
    const errorEl = group
      ? group.querySelector('.contact-form__error')
      : input.parentElement.querySelector('.contact-form__error');
    if (errorEl) {
      errorEl.textContent = message;
    }
  };

  const clearError = (input) => {
    input.classList.remove('error');
    const group = input.closest('.contact-form__group');
    const errorEl = group
      ? group.querySelector('.contact-form__error')
      : input.parentElement.querySelector('.contact-form__error');
    if (errorEl) {
      errorEl.textContent = '';
    }
  };

  // ── Validate Single Field ──
  const validateField = (input) => {
    const name = input.getAttribute('name');
    const validator = validators[name];

    if (!validator) return true;

    clearError(input);

    if (input.type === 'checkbox') {
      if (validator.required && !input.checked) {
        showError(input, validator.message);
        return false;
      }
      return true;
    }

    const value = input.value;

    if (validator.required && !value.trim()) {
      showError(input, validator.message);
      return false;
    }

    if (value.trim() && !validator.validate(value)) {
      showError(input, validator.message);
      return false;
    }

    return true;
  };

  // ── Validate All Fields ──
  const validateForm = () => {
    let isValid = true;
    let firstInvalid = null;

    form.querySelectorAll('.contact-form__input').forEach((input) => {
      if (!validateField(input)) {
        isValid = false;
        if (!firstInvalid) firstInvalid = input;
      }
    });

    const agbCheckbox = form.querySelector('#agb-check');
    if (agbCheckbox && !validateField(agbCheckbox)) {
      isValid = false;
      if (!firstInvalid) firstInvalid = agbCheckbox;
    }

    if (firstInvalid) {
      firstInvalid.focus();
    }

    return isValid;
  };

  // ── Real-time Validation on Blur ──
  form.querySelectorAll('.contact-form__input').forEach((input) => {
    input.addEventListener('blur', function () {
      validateField(this);
    });

    input.addEventListener('input', function () {
      if (this.classList.contains('error')) {
        clearError(this);
      }
    });
  });

  // ── AGB Checkbox: clear error on change ──
  const agbCheck = form.querySelector('#agb-check');
  if (agbCheck) {
    agbCheck.addEventListener('change', function () {
      if (this.checked) {
        clearError(this);
      }
    });
  }

  // ── Form Submission ──
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    const formData = {
      'form-name': form.getAttribute('name') || 'contact',
      name: form.querySelector('#name').value.trim(),
      company: form.querySelector('#company').value.trim(),
      website: form.querySelector('#website').value.trim(),
      email: form.querySelector('#email').value.trim(),
      timestamp: new Date().toISOString(),
    };

    if (useHcaptcha && window.hcaptcha) {
      const response = document.querySelector('[name="h-captcha-response"]');
      if (response && response.value) {
        formData['h-captcha-response'] = response.value;
      }
    }

    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    const showSuccess = () => {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
      form.style.display = 'none';
      successMsg.hidden = false;
      successMsg.removeAttribute('hidden');
      successMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const showErrorMsg = (message) => {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
      const errorEl = document.getElementById('form-submit-error');
      if (errorEl) {
        errorEl.textContent =
          message || 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.';
        errorEl.hidden = false;
        errorEl.removeAttribute('hidden');
      }
    };

    if (formAction) {
      const body = new URLSearchParams(formData);
      fetch(formAction, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
        .then((res) => {
          if (res.ok) {
            showSuccess();
          } else {
            showErrorMsg(
              'Die Anfrage konnte nicht gesendet werden. Bitte kontaktieren Sie uns direkt unter info@aidsec.ch.'
            );
          }
        })
        .catch(() => {
          showErrorMsg(
            'Netzwerkfehler. Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.'
          );
        });
    } else {
      setTimeout(showSuccess, 500);
    }
  });
})();

/* ============================================
   Lead Magnet Form Handler
   ============================================ */
(() => {
  'use strict';

  const leadForm = document.getElementById('lead-magnet-form');
  if (!leadForm) return;

  const successEl = document.getElementById('lead-magnet-success');

  leadForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = new FormData(leadForm);
    const name = formData.get('name');
    const email = formData.get('email');

    if (!name || !name.trim()) return;
    if (!email || !email.trim() || email.indexOf('@') === -1) return;

    const submitBtn = leadForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Wird gesendet\u2026';
    }

    const body = new URLSearchParams(formData);
    fetch(leadForm.action || '/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
      .then((res) => {
        if (res.ok) {
          leadForm.hidden = true;
          if (successEl) successEl.hidden = false;
        } else if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Gratis Leitfaden herunterladen';
        }
      })
      .catch(() => {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Gratis Leitfaden herunterladen';
        }
      });
  });
})();
