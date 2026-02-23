/* ═══════════════════════════════════════════
  AidSec Contact Form Logic (API)
  ═══════════════════════════════════════════ */

(function () {
  'use strict';

  var form = document.getElementById('contact-form');
  var submitBtn = document.getElementById('form-submit');
  var submitText = submitBtn ? submitBtn.querySelector('.contact-form__submit-text') : null;
  var errorMsg = document.getElementById('form-submit-error');

  if (!form) return;

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

    setSubmitting(true);

    var formData = new FormData(form);
    var payload = {
      name: (formData.get('name') || '').toString().trim(),
      company: (formData.get('company') || '').toString().trim(),
      websiteUrl: (formData.get('website') || '').toString().trim(),
      email: (formData.get('email') || '').toString().trim(),
      agb: formData.get('agb') ? 'on' : '',
      botField: (formData.get('bot-field') || '').toString().trim(),
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
