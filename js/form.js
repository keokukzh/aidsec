/* ═══════════════════════════════════════════
   AidSec Contact Form Logic (Netlify)
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

    // Diagnostic: Warn if on localhost
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.warn(
        'Form-E-Mails funktionieren nur auf dem Live-System (Netlify). Lokal wird nur die Weiterleitung simuliert.'
      );
      setTimeout(function () {
        window.location.href = '/onboarding/bestaetigung/';
      }, 500);
      return;
    }

    // Netlify requires form-name to be present in AJAX body
    var body = new URLSearchParams();
    body.append('form-name', form.getAttribute('name'));
    for (var pair of formData.entries()) {
      body.append(pair[0], pair[1]);
    }

    // Submit via fetch to Netlify
    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
      .then(function (response) {
        if (response.ok) {
          window.location.href = '/onboarding/bestaetigung/';
        } else {
          throw new Error('Server-Antwort war nicht ok');
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
