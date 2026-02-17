/* ============================================
   AidSec Form JS — Validation & Submission
   ============================================ */

(function () {
  'use strict';

  const form = document.getElementById('contact-form');
  const submitBtn = document.getElementById('form-submit');
  const successMsg = document.getElementById('form-success');
  const hcaptchaContainer = document.getElementById('hcaptcha-container');

  if (!form) return;

  // Pre-fill website field from security check widget
  try {
    var savedUrl = sessionStorage.getItem('aidsec_checked_url');
    if (savedUrl) {
      var websiteField = form.querySelector('#website');
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

  // ── hCaptcha (optional) ──
  if (useHcaptcha && hcaptchaContainer) {
    hcaptchaContainer.hidden = false;
    hcaptchaContainer.setAttribute('aria-hidden', 'false');
    const script = document.createElement('script');
    script.src = 'https://js.hcaptcha.com/1/api.js';
    script.async = true;
    script.defer = true;
    script.onload = function () {
      if (window.hcaptcha) {
        window.hcaptcha.render('hcaptcha-container', { sitekey: hcaptchaSiteKey, theme: 'dark' });
      }
    };
    document.head.appendChild(script);
  }

  // ── Validation Rules ──
  const validators = {
    name: {
      required: true,
      message: 'Bitte geben Sie Ihren Namen ein.',
      validate: function (value) {
        return value.trim().length >= 2;
      },
    },
    email: {
      required: true,
      message: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.',
      validate: function (value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
      },
    },
    website: {
      required: true,
      message: 'Bitte geben Sie eine gültige Website-URL ein (z.B. https://www.beispiel.ch).',
      validate: function (value) {
        if (!value.trim()) return false;
        let url = value.trim();
        if (!/^https?:\/\//i.test(url)) {
          url = 'https://' + url;
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
      validate: function () {
        return true;
      },
    },
    agb: {
      required: true,
      message: 'Bitte bestätigen Sie die AGB, um fortzufahren.',
      validate: function (value, input) {
        return input && input.checked;
      },
    },
  };

  // ── Show/Clear Errors ──
  function showError(input, message) {
    input.classList.add('error');
    const group = input.closest('.contact-form__group');
    const errorEl = group
      ? group.querySelector('.contact-form__error')
      : input.parentElement.querySelector('.contact-form__error');
    if (errorEl) {
      errorEl.textContent = message;
    }
  }

  function clearError(input) {
    input.classList.remove('error');
    const group = input.closest('.contact-form__group');
    const errorEl = group
      ? group.querySelector('.contact-form__error')
      : input.parentElement.querySelector('.contact-form__error');
    if (errorEl) {
      errorEl.textContent = '';
    }
  }

  // ── Validate Single Field ──
  function validateField(input) {
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
  }

  // ── Validate All Fields ──
  function validateForm() {
    let isValid = true;
    let firstInvalid = null;

    form.querySelectorAll('.contact-form__input').forEach(function (input) {
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
  }

  // ── Real-time Validation on Blur ──
  form.querySelectorAll('.contact-form__input').forEach(function (input) {
    input.addEventListener('blur', function () {
      validateField(this);
    });

    // Clear error on input
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
  form.addEventListener('submit', function (e) {
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

    function showSuccess() {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
      form.style.display = 'none';
      successMsg.hidden = false;
      successMsg.removeAttribute('hidden');
      successMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function showErrorMsg(message) {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
      const errorEl = document.getElementById('form-submit-error');
      if (errorEl) {
        errorEl.textContent =
          message || 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.';
        errorEl.hidden = false;
        errorEl.removeAttribute('hidden');
      }
    }

    if (formAction) {
      const body = new URLSearchParams(formData);
      fetch(formAction, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body,
      })
        .then(function (res) {
          if (res.ok) {
            showSuccess();
          } else {
            showErrorMsg(
              'Die Anfrage konnte nicht gesendet werden. Bitte kontaktieren Sie uns direkt unter info@aidsec.ch.'
            );
          }
        })
        .catch(function () {
          showErrorMsg(
            'Netzwerkfehler. Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.'
          );
        });
    } else {
      // No endpoint configured: show dev/demo success (replace with real endpoint before production)
      setTimeout(showSuccess, 500);
    }
  });
})();
