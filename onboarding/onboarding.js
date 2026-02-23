/* ═══════════════════════════════════════════
   ONBOARDING FLOW – SHARED JS
   ═══════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Constants ─────────────────────────── */
  var TWINT_QR_RAPID = '/assets/twint-qr-rapid.png';
  var TWINT_QR_HAERTUNG = '/assets/twint-qr-haertung.png';
  var TWINT_QR_MANDAT = '/assets/twint-qr-mandat.png';

  /* ── Package config (set by each page) ── */
  var packageSlug = document.body.getAttribute('data-package') || '';
  var packageName = document.body.getAttribute('data-package-name') || '';
  var packagePrice = document.body.getAttribute('data-package-price') || '';
  var packagePeriod = document.body.getAttribute('data-package-period') || '';

  var twintQrMap = {
    'rapid-header-fix': TWINT_QR_RAPID,
    'kanzlei-haertung': TWINT_QR_HAERTUNG,
    'cyber-mandat': TWINT_QR_MANDAT,
  };

  /* ── DOM refs ──────────────────────────── */
  var steps = document.querySelectorAll('.ob-step');
  var dots = document.querySelectorAll('.ob-progress__dot');
  var lines = document.querySelectorAll('.ob-progress__line');
  var btnNext = document.querySelectorAll('[data-ob-next]');
  var btnPrev = document.querySelectorAll('[data-ob-prev]');
  var form = document.getElementById('ob-form');

  var currentStep = 0;
  var totalSteps = steps.length;

  /* ── Navigate Steps ────────────────────── */
  function goToStep(index) {
    if (index < 0 || index >= totalSteps) return;
    currentStep = index;

    steps.forEach(function (s, i) {
      s.classList.toggle('ob-step--active', i === index);
    });

    dots.forEach(function (d, i) {
      d.classList.remove('ob-progress__dot--active', 'ob-progress__dot--done');
      if (i < index) d.classList.add('ob-progress__dot--done');
      if (i === index) d.classList.add('ob-progress__dot--active');
    });

    lines.forEach(function (l, i) {
      l.classList.toggle('ob-progress__line--done', i < index);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── Validation ────────────────────────── */
  function validateStep(index) {
    var step = steps[index];
    if (!step) return true;

    var required = step.querySelectorAll('[required]');
    var valid = true;

    required.forEach(function (el) {
      var group = el.closest('.ob-form-group') || el.closest('.ob-checkbox');
      var errorEl = group ? group.querySelector('.ob-error') : null;

      if (el.type === 'checkbox' && !el.checked) {
        valid = false;
        el.classList.add('ob-input--error');
        if (errorEl) errorEl.classList.add('ob-error--visible');
      } else if (el.type !== 'checkbox' && !el.value.trim()) {
        valid = false;
        el.classList.add('ob-input--error');
        if (errorEl) errorEl.classList.add('ob-error--visible');
      } else if (el.type === 'email' && el.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value)) {
        valid = false;
        el.classList.add('ob-input--error');
        if (errorEl) {
          errorEl.textContent = 'Bitte geben Sie eine gültige E-Mail-Adresse ein.';
          errorEl.classList.add('ob-error--visible');
        }
      } else if (
        el.type === 'url' &&
        el.value &&
        !/^https?:\/\/.+/i.test(el.value) &&
        !/^[a-z0-9][\w.-]+\.[a-z]{2,}/i.test(el.value)
      ) {
        valid = false;
        el.classList.add('ob-input--error');
        if (errorEl) {
          errorEl.textContent = 'Bitte geben Sie eine gültige URL ein (z.B. ihre-kanzlei.ch).';
          errorEl.classList.add('ob-error--visible');
        }
      } else {
        el.classList.remove('ob-input--error');
        if (errorEl) errorEl.classList.remove('ob-error--visible');
      }
    });

    return valid;
  }

  /* ── Clear errors on input ─────────────── */
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.classList.contains('ob-input--error')) {
      el.classList.remove('ob-input--error');
      var group = el.closest('.ob-form-group') || el.closest('.ob-checkbox');
      if (group) {
        var err = group.querySelector('.ob-error');
        if (err) err.classList.remove('ob-error--visible');
      }
    }
  });

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.type === 'checkbox' && el.classList.contains('ob-input--error')) {
      el.classList.remove('ob-input--error');
      var group = el.closest('.ob-checkbox');
      if (group) {
        var err = group.querySelector('.ob-error');
        if (err) err.classList.remove('ob-error--visible');
      }
    }
  });

  /* ── Summary Rendering (step 3) ────────── */
  function renderSummary() {
    var url = document.getElementById('ob-url');
    var name = document.getElementById('ob-name');
    var email = document.getElementById('ob-email');

    var sumPkg = document.getElementById('sum-package');
    var sumUrl = document.getElementById('sum-url');
    var sumName = document.getElementById('sum-name');
    var sumEmail = document.getElementById('sum-email');

    if (sumPkg) sumPkg.textContent = packageName;
    if (sumUrl && url) sumUrl.textContent = url.value;
    if (sumName && name) sumName.textContent = name.value;
    if (sumEmail && email) sumEmail.textContent = email.value;
  }

  /* ── Payment Card Selection ─────────────── */
  var paymentCards = document.querySelectorAll('.ob-payment-card:not(.ob-payment-card--disabled)');
  var selectedPayment = null;
  var paymentInput = document.getElementById('ob-payment-method');

  paymentCards.forEach(function (card) {
    card.addEventListener('click', function () {
      paymentCards.forEach(function (c) {
        c.classList.remove('ob-payment-card--active');
      });
      card.classList.add('ob-payment-card--active');
      selectedPayment = card.getAttribute('data-method');
      if (paymentInput) paymentInput.value = selectedPayment;

      // TWINT QR reveal
      var qrContainer = document.getElementById('twint-qr');
      if (qrContainer) {
        if (selectedPayment === 'twint') {
          var qrImg = qrContainer.querySelector('img');
          if (qrImg) qrImg.src = twintQrMap[packageSlug] || '';
          qrContainer.classList.add('ob-twint-qr--visible');
        } else {
          qrContainer.classList.remove('ob-twint-qr--visible');
        }
      }

      // Enable submit button
      var submitBtn = document.getElementById('ob-submit');
      if (submitBtn) submitBtn.disabled = false;
    });
  });

  /* ── Navigation Bindings ────────────────── */
  btnNext.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (validateStep(currentStep)) {
        if (currentStep === 1) renderSummary(); // Before step 3
        goToStep(currentStep + 1);
      }
    });
  });

  btnPrev.forEach(function (btn) {
    btn.addEventListener('click', function () {
      goToStep(currentStep - 1);
    });
  });

  function formDataToObject(formData) {
    var obj = {};
    formData.forEach(function (value, key) {
      obj[key] = value;
    });
    return obj;
  }

  /* ── Form Submission ───────────────────── */
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      if (!selectedPayment) {
        alert('Bitte wählen Sie eine Zahlungsmethode.');
        return;
      }

      if (!validateStep(currentStep)) return;

      var formData = new FormData(form);

      var payload = formDataToObject(formData);
      payload.packageSlug = packageSlug;
      payload.packageName = packageName;
      payload.packagePrice = packagePrice;
      payload.packagePeriod = packagePeriod;
      payload.sourcePath = window.location.pathname;

      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.warn(
          'Onboarding-Mail wird lokal nicht versendet. Weiterleitung zur Bestätigungsseite wird simuliert.'
        );
        setTimeout(function () {
          window.location.href = '/onboarding/bestaetigung/';
        }, 350);
        return;
      }

      fetch('/api/onboarding-submit', {
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
          alert(error.message || 'Es gab ein Problem beim Senden Ihrer Daten. Bitte versuchen Sie es erneut.');
          goToStep(currentStep); // Stay on current step
        });
    });
  }

  /* ── Option Selector ────────────────────── */
  var optionCards = document.querySelectorAll('.ob-option-card');
  var credentialsSection = document.getElementById('ob-credentials-section');

  optionCards.forEach(function (card) {
    card.addEventListener('click', function () {
      var radio = card.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
        // Visual toggle
        optionCards.forEach(function (c) {
          c.classList.remove('ob-option-card--active');
        });
        card.classList.add('ob-option-card--active');

        // Show/Hide credentials
        if (credentialsSection) {
          credentialsSection.style.display = radio.value === 'a' ? 'block' : 'none';
        }
      }
    });
  });

  /* ── Login Helper Logic ─────────────────── */
  var helperToggle = document.getElementById('ob-helper-toggle');
  var helperBox = document.getElementById('ob-login-helper');
  var urlInput = document.getElementById('ob-url');
  var resetBtn = document.getElementById('ob-reset-link');

  if (helperToggle && helperBox) {
    helperToggle.addEventListener('click', function (e) {
      e.preventDefault();
      helperBox.classList.toggle('is-visible');
    });
  }

  if (urlInput && resetBtn) {
    urlInput.addEventListener('input', function () {
      var raw = urlInput.value.trim();
      if (!raw) return;

      // Ensure protocol
      var url = raw;
      if (!url.startsWith('http')) {
        url = 'https://' + url;
      }

      // Remove trailing slash
      url = url.replace(/\/$/, '');

      // Update link
      resetBtn.href = url + '/wp-login.php?action=lostpassword';
    });
  }

  /* ── Init ───────────────────────────────── */
  goToStep(0);
})();
