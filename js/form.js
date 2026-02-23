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
    
    // Netlify needs the form-name specifically for AJAX submissions
    // We also ensure it's application/x-www-form-urlencoded
    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(formData).toString()
    })
      .then(function (response) {
        if (response.ok) {
          // Redirect to confirmation or show success
          window.location.href = '/onboarding/bestaetigung/';
        } else {
          throw new Error('Server-Antwort war nicht ok');
        }
      })
      .catch(function (error) {
        console.error('Submission error:', error);
        if (errorMsg) {
          errorMsg.textContent = 'Es gab ein Problem beim Senden. Bitte versuchen Sie es erneut oder kontaktieren Sie uns direkt per E-Mail.';
          errorMsg.hidden = false;
          errorMsg.removeAttribute('hidden');
        }
        setSubmitting(false);
      });
  });

})();
