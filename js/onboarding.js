/* ============================================
   AidSec Onboarding Modal — Open, Close, Steps, Toggle
   ============================================ */

(function () {
  'use strict';

  // ── Package info mapping ──
  var packageInfo = {
    'rapid-header': {
      name: 'Rapid Header Fix',
      price: 'CHF 299.\u2013',
      type: 'einmalig'
    },
    'kanzlei-haertung': {
      name: 'Kanzlei-H\u00e4rtung',
      price: 'CHF 599.\u2013',
      type: 'einmalig'
    },
    'cyber-mandat': {
      name: 'Cyber-Mandat',
      price: 'CHF 59.\u2013 / Monat (CHF 708.\u2013 / Jahr)',
      type: 'j\u00e4hrlich'
    }
  };

  // ── DOM References ──
  var modal = document.getElementById('onboarding-modal');
  var overlay = modal ? modal.querySelector('.onboarding-overlay') : null;
  var closeBtn = modal ? modal.querySelector('.onboarding-close') : null;
  var form = modal ? modal.querySelector('#onboarding-form') : null;
  var packageDisplay = document.getElementById('ob-package-display');
  var packageInput = document.getElementById('ob-package');
  var steps = modal ? modal.querySelectorAll('.onboarding-step') : [];
  var indicators = modal ? modal.querySelectorAll('.onboarding-indicator__step') : [];
  var nextBtns = modal ? modal.querySelectorAll('[data-step-next]') : [];
  var prevBtns = modal ? modal.querySelectorAll('[data-step-prev]') : [];

  var currentStep = 0;

  // ── Open Modal ──
  function openModal(triggerEl) {
    if (!modal) return;

    // Determine package from trigger
    var pkg = triggerEl.getAttribute('data-package') || 'rapid-header';
    var pkgName = triggerEl.getAttribute('data-package-name') || '';

    // Set package display
    if (packageDisplay) {
      packageDisplay.textContent = pkgName || (packageInfo[pkg] ? packageInfo[pkg].name + ' \u2013 ' + packageInfo[pkg].price : pkg);
    }
    if (packageInput) {
      packageInput.value = pkgName || (packageInfo[pkg] ? packageInfo[pkg].name + ' \u2013 ' + packageInfo[pkg].price : pkg);
    }

    // Reset to step 1
    currentStep = 0;
    showStep(0);

    // Show modal
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Focus first input
    setTimeout(function () {
      var firstInput = steps[0] && steps[0].querySelector('input:not([type="hidden"]):not([readonly]), select, textarea');
      if (firstInput) firstInput.focus();
    }, 300);
  }

  // ── Close Modal ──
  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // ── Step Navigation ──
  function showStep(index) {
    steps.forEach(function (step, i) {
      step.classList.toggle('is-active', i === index);
      step.setAttribute('aria-hidden', i !== index ? 'true' : 'false');
    });
    indicators.forEach(function (ind, i) {
      ind.classList.toggle('is-active', i === index);
      ind.classList.toggle('is-done', i < index);
    });
    currentStep = index;
  }

  function validateStep(stepIndex) {
    var step = steps[stepIndex];
    if (!step) return true;
    var inputs = step.querySelectorAll('[required]');
    var valid = true;
    inputs.forEach(function (input) {
      if (!input.checkValidity()) {
        input.reportValidity();
        valid = false;
      }
    });
    return valid;
  }

  // ── Tech Toggle (Option A / B) ──
  var techRadios = modal ? modal.querySelectorAll('input[name="tech-option"]') : [];
  var accessFields = document.getElementById('ob-access-fields');
  var itFields = document.getElementById('ob-it-fields');

  function toggleTechFields() {
    var selected = modal ? modal.querySelector('input[name="tech-option"]:checked') : null;
    if (!selected) return;

    if (selected.value === 'access') {
      if (accessFields) accessFields.style.display = 'block';
      if (itFields) itFields.style.display = 'none';
      // Toggle required
      toggleRequired(accessFields, false);
      toggleRequired(itFields, true);
    } else {
      if (accessFields) accessFields.style.display = 'none';
      if (itFields) itFields.style.display = 'block';
      toggleRequired(accessFields, true);
      toggleRequired(itFields, false);
    }
  }

  function toggleRequired(container, remove) {
    if (!container) return;
    var fields = container.querySelectorAll('[data-conditional-required]');
    fields.forEach(function (f) {
      if (remove) {
        f.removeAttribute('required');
      } else {
        f.setAttribute('required', '');
      }
    });
  }

  // ── Init Event Listeners ──
  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }
  if (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
  }

  // Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) {
      closeModal();
    }
  });

  // Step navigation
  nextBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = parseInt(btn.getAttribute('data-step-next'), 10);
      if (validateStep(currentStep)) {
        showStep(target);
      }
    });
  });

  prevBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = parseInt(btn.getAttribute('data-step-prev'), 10);
      showStep(target);
    });
  });

  // Tech toggle
  techRadios.forEach(function (radio) {
    radio.addEventListener('change', toggleTechFields);
  });

  // Init toggle state
  toggleTechFields();

  // ── Expose openModal globally ──
  window.openOnboardingModal = openModal;

})();
