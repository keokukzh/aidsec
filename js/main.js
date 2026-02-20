/* ============================================
   AidSec Main JS — Nav, Scroll, Reveals, Menu
   ============================================ */

(function () {
  'use strict';

  // ── DOM References ──
  const nav = document.getElementById('nav');
  const navToggle = document.getElementById('nav-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  const revealElements = document.querySelectorAll('[data-reveal]');

  // ── Sticky Nav on Scroll ──
  function handleNavScroll() {
    if (!nav) return;
    const scrolled = window.scrollY > 60;
    nav.classList.toggle('scrolled', scrolled);
  }

  window.addEventListener('scroll', handleNavScroll, { passive: true });
  handleNavScroll(); // Run on load

  // ── Mobile Menu ──
  let overlay = null;

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'mobile-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);
    overlay.addEventListener('click', closeMobileMenu);
  }

  function openMobileMenu() {
    if (!overlay) createOverlay();
    mobileMenu.classList.add('open');
    mobileMenu.setAttribute('aria-hidden', 'false');
    navToggle.classList.add('active');
    navToggle.setAttribute('aria-expanded', 'true');
    navToggle.setAttribute('aria-label', 'Menü schliessen');
    overlay.classList.add('visible');
    document.body.style.overflow = 'hidden';

    // Trap focus: focus first link
    const firstLink = mobileMenu.querySelector('a');
    if (firstLink) firstLink.focus();
  }

  function closeMobileMenu() {
    mobileMenu.classList.remove('open');
    mobileMenu.setAttribute('aria-hidden', 'true');
    navToggle.classList.remove('active');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'Menü öffnen');
    if (overlay) overlay.classList.remove('visible');
    document.body.style.overflow = '';
    navToggle.focus();
  }

  if (navToggle && mobileMenu) {
    navToggle.addEventListener('click', function () {
      const isOpen = mobileMenu.classList.contains('open');
      isOpen ? closeMobileMenu() : openMobileMenu();
    });

    // Close on link click
    mobileMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeMobileMenu);
    });

    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobileMenu.classList.contains('open')) {
        closeMobileMenu();
      }
    });
  }

  // ── Scroll Reveal (Intersection Observer) ──
  if (revealElements.length > 0 && 'IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            // Hint GPU compositing before animation
            entry.target.style.willChange = 'opacity, transform';
            entry.target.classList.add('revealed');
            revealObserver.unobserve(entry.target);

            // Clean up will-change after transition completes
            entry.target.addEventListener('transitionend', function handler() {
              entry.target.style.willChange = 'auto';
              entry.target.removeEventListener('transitionend', handler);
            });
          }
        });
      },
      {
        root: null,
        rootMargin: '0px 0px -80px 0px',
        threshold: 0.1,
      }
    );

    revealElements.forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    // Fallback: reveal all immediately
    revealElements.forEach(function (el) {
      el.classList.add('revealed');
    });
  }

  // ── Smooth Scroll for Anchor Links ──
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;

      const target = document.querySelector(targetId);
      if (!target) return;

      e.preventDefault();

      const navHeight = nav ? nav.offsetHeight : 0;
      const targetPos = target.getBoundingClientRect().top + window.scrollY - navHeight - 20;

      window.scrollTo({
        top: targetPos,
        behavior: 'smooth',
      });

      // Update URL without jump
      if (history.pushState) {
        history.pushState(null, null, targetId);
      }
    });
  });

  // ── Active Nav Link Highlight ──
  function updateActiveNavLink() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav__link');
    const navHeight = nav ? nav.offsetHeight : 0;

    let currentSection = '';

    sections.forEach(function (section) {
      const sectionTop = section.offsetTop - navHeight - 100;
      if (window.scrollY >= sectionTop) {
        currentSection = section.getAttribute('id');
      }
    });

    navLinks.forEach(function (link) {
      link.classList.remove('active');
      if (link.getAttribute('href') === '#' + currentSection) {
        link.classList.add('active');
      }
    });
  }

  window.addEventListener('scroll', updateActiveNavLink, { passive: true });

  // ── Pause Videos for Reduced Motion ──
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('video[autoplay]').forEach(function (video) {
      video.pause();
      video.removeAttribute('autoplay');
    });
  }

  // ── FAQ Accordion Toggle ──
  document.querySelectorAll('.faq__question').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var expanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', !expanded);
    });
  });

  // ── Sticky Mobile CTA Bar ──
  var stickyCta = document.getElementById('sticky-cta');
  var heroSection = document.getElementById('hero');
  var kontaktSection = document.getElementById('kontakt');

  if (stickyCta && heroSection && 'IntersectionObserver' in window) {
    var heroVisible = true;
    var kontaktVisible = false;

    function updateStickyCta() {
      var shouldShow = !heroVisible && !kontaktVisible;
      stickyCta.classList.toggle('visible', shouldShow);
      stickyCta.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    }

    var heroObs = new IntersectionObserver(
      function (entries) {
        heroVisible = entries[0].isIntersecting;
        updateStickyCta();
      },
      { threshold: 0.1 }
    );
    heroObs.observe(heroSection);

    if (kontaktSection) {
      var kontaktObs = new IntersectionObserver(
        function (entries) {
          kontaktVisible = entries[0].isIntersecting;
          updateStickyCta();
        },
        { threshold: 0.1 }
      );
      kontaktObs.observe(kontaktSection);
    }
  }

  // ── Animated Number Counters ──
  function formatNumber(num, separator) {
    if (!separator) return String(num);
    var str = String(num);
    var result = '';
    var count = 0;
    for (var i = str.length - 1; i >= 0; i--) {
      if (count > 0 && count % 3 === 0) {
        result = separator + result;
      }
      result = str[i] + result;
      count++;
    }
    return result;
  }

  function animateCounter(el) {
    var target = parseInt(el.getAttribute('data-count-to'), 10);
    if (isNaN(target)) return;
    var prefix = el.getAttribute('data-count-prefix') || '';
    var suffix = el.getAttribute('data-count-suffix') || '';
    var separator = el.getAttribute('data-count-separator') || '';
    var duration = target > 100 ? 1800 : 1200;
    var start = 0;
    var startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(start + (target - start) * eased);
      el.textContent = prefix + formatNumber(current, separator) + suffix;
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }

  if ('IntersectionObserver' in window) {
    var counterElements = document.querySelectorAll('[data-count-to]');
    if (counterElements.length > 0) {
      var counterObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              animateCounter(entry.target);
              counterObserver.unobserve(entry.target);
            }
          });
        },
        { rootMargin: '0px 0px -40px 0px', threshold: 0.3 }
      );
      counterElements.forEach(function (el) {
        counterObserver.observe(el);
      });
    }
  }

  // ── Inline Security Check Widget ──
  var heroUrlInput = document.getElementById('hero-url-input');
  var heroUrlBtn = document.getElementById('hero-url-btn');
  var heroCheckResult = document.getElementById('hero-check-result');
  var heroCheckError = document.getElementById('hero-check-error');
  var isChecking = false;

  function normalizeUrl(raw) {
    var url = raw.trim();
    if (!url) return null;
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    try {
      new URL(url);
      return url;
    } catch (_) {
      return null;
    }
  }

  function setCheckLoading(loading) {
    if (!heroUrlBtn) return;
    heroUrlBtn.classList.toggle('loading', loading);
    heroUrlBtn.disabled = loading;
    if (heroUrlInput) heroUrlInput.disabled = loading;
  }

  function showCheckError(msg) {
    if (!heroCheckError) return;
    heroCheckError.textContent = msg;
    heroCheckError.hidden = false;
    heroCheckError.removeAttribute('hidden');
    if (heroCheckResult) {
      heroCheckResult.hidden = true;
      heroCheckResult.setAttribute('hidden', '');
    }
  }

  function gradeColor(grade) {
    if (grade === 'A+' || grade === 'A') return 'green';
    if (grade === 'B') return 'green';
    if (grade === 'C' || grade === 'D') return 'gold';
    return 'red';
  }

  function renderCheckResult(data) {
    if (!heroCheckResult) return;

    var gradeEl = document.getElementById('hero-check-grade');
    var urlEl = document.getElementById('hero-check-url');
    var headersEl = document.getElementById('hero-check-headers');
    var scoreEl = document.getElementById('hero-check-score');

    if (gradeEl) {
      gradeEl.textContent = data.grade;
      gradeEl.className = 'hero__check-grade hero__check-grade--' + gradeColor(data.grade);
    }

    if (urlEl) {
      try {
        urlEl.textContent = new URL(data.url).hostname;
      } catch (_) {
        urlEl.textContent = data.url;
      }
    }

    if (headersEl) {
      headersEl.innerHTML = '';
      var keys = Object.keys(data.headers);
      for (var i = 0; i < keys.length; i++) {
        var h = data.headers[keys[i]];
        var li = document.createElement('li');
        li.className =
          'hero__check-header-item' +
          (h.present ? ' hero__check-header-item--ok' : ' hero__check-header-item--fail');
        var iconSvg = h.present
          ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>'
          : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>';
        li.innerHTML =
          '<span class="hero__check-header-icon">' +
          iconSvg +
          '</span>' +
          '<span class="hero__check-header-name">' +
          h.label +
          '</span>';
        headersEl.appendChild(li);
      }
    }

    if (scoreEl) {
      scoreEl.textContent = data.score + ' von ' + data.maxScore + ' Security-Headern aktiv';
    }

    if (heroCheckError) {
      heroCheckError.hidden = true;
      heroCheckError.setAttribute('hidden', '');
    }

    heroCheckResult.hidden = false;
    heroCheckResult.removeAttribute('hidden');
    heroCheckResult.classList.add('hero__check-result--visible');
  }

  function runSecurityCheck() {
    if (!heroUrlInput || isChecking) return;
    var url = normalizeUrl(heroUrlInput.value);
    if (!url) {
      heroUrlInput.classList.add('error');
      heroUrlInput.focus();
      return;
    }
    heroUrlInput.classList.remove('error');

    try {
      sessionStorage.setItem('aidsec_checked_url', url);
    } catch (_) {}

    isChecking = true;
    setCheckLoading(true);

    if (heroCheckResult) {
      heroCheckResult.hidden = true;
      heroCheckResult.setAttribute('hidden', '');
      heroCheckResult.classList.remove('hero__check-result--visible');
    }
    if (heroCheckError) {
      heroCheckError.hidden = true;
      heroCheckError.setAttribute('hidden', '');
    }

    fetch('/api/check-headers?url=' + encodeURIComponent(url))
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data.error) {
          showCheckError(data.error);
        } else {
          renderCheckResult(data);
        }
      })
      .catch(function () {
        showCheckError('Verbindungsfehler. Bitte versuchen Sie es erneut.');
      })
      .finally(function () {
        isChecking = false;
        setCheckLoading(false);
      });
  }

  if (heroUrlBtn) {
    heroUrlBtn.addEventListener('click', runSecurityCheck);
  }
  if (heroUrlInput) {
    heroUrlInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        runSecurityCheck();
      }
    });
    heroUrlInput.addEventListener('input', function () {
      this.classList.remove('error');
    });
  }

  // ── SecurityHeaders.com independent verification link ──
  var secHeadersLink = document.getElementById('hero-secheaders-link');
  if (secHeadersLink && heroUrlInput) {
    function updateSecHeadersLink() {
      var url = normalizeUrl(heroUrlInput.value);
      secHeadersLink.href = url
        ? 'https://securityheaders.com/?q=' + encodeURIComponent(url) + '&followRedirects=on'
        : 'https://securityheaders.com';
    }
    heroUrlInput.addEventListener('input', updateSecHeadersLink);
    heroUrlInput.addEventListener('change', updateSecHeadersLink);
  }

  // ── Lazy-pause off-screen videos for performance ──
  if ('IntersectionObserver' in window) {
    var videoObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var video = entry.target;
          if (entry.isIntersecting) {
            video.play().catch(function () {});
          } else {
            video.pause();
          }
        });
      },
      { rootMargin: '100px' }
    );

    document.querySelectorAll('.trust__video').forEach(function (video) {
      videoObserver.observe(video);
    });
  }

  // ── CTA Event Tracking (data-track) ──
  document.addEventListener('click', function (e) {
    var tracked = e.target.closest('[data-track]');
    if (!tracked) return;
    var eventName = tracked.getAttribute('data-track');
    var detail = { action: 'click', label: eventName, timestamp: Date.now() };

    document.dispatchEvent(new CustomEvent('aidsec:track', { detail: detail }));

    if (typeof window.plausible === 'function') {
      window.plausible(eventName);
    }
  });

  // ── ROI Calculator ──
  var roiBranche = document.getElementById('roi-branche');
  var roiMitarbeiter = document.getElementById('roi-mitarbeiter');
  var roiMitarbeiterOut = document.getElementById('roi-mitarbeiter-output');
  var roiWordpress = document.getElementById('roi-wordpress');
  var roiRisk = document.getElementById('roi-risk');
  var roiCost = document.getElementById('roi-cost');
  var roiRoi = document.getElementById('roi-roi');

  function chf(num) {
    return 'CHF ' + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  }

  function calcROI() {
    if (!roiBranche || !roiMitarbeiter) return;

    var branche = roiBranche.value;
    var mitarbeiter = parseInt(roiMitarbeiter.value, 10);
    var isWP = roiWordpress && roiWordpress.checked;

    if (roiMitarbeiterOut) roiMitarbeiterOut.textContent = mitarbeiter;

    // Base risk: CHF 1.04M avg recovery cost * attack probability by sector
    var brancheRisk = { kanzlei: 0.12, arztpraxis: 0.15, notariat: 0.10 };
    var baseProbability = brancheRisk[branche] || 0.12;

    // Size multiplier: larger firms = higher target value
    var sizeFactor = 1 + (mitarbeiter - 1) * 0.08;
    if (sizeFactor > 5) sizeFactor = 5;

    // WordPress multiplier: adds 40% more risk
    var wpFactor = isWP ? 1.4 : 1.0;

    var annualRisk = Math.round(1040000 * baseProbability * sizeFactor * wpFactor / 100) * 100;

    // AidSec cost recommendation
    var cost;
    var costLabel;
    if (!isWP) {
      cost = 490;
      costLabel = 'Einmalige Header-Optimierung';
    } else if (mitarbeiter <= 5) {
      cost = 490;
      costLabel = 'Einmaliger Rapid Header Fix';
    } else if (mitarbeiter <= 20) {
      cost = 950;
      costLabel = 'Einmalige Kanzlei-Härtung';
    } else {
      cost = 89 * 12;
      costLabel = 'Cyber-Mandat (jährlich)';
    }

    var roiPercent = Math.round(((annualRisk - cost) / cost) * 100);

    if (roiRisk) roiRisk.textContent = chf(annualRisk);
    if (roiCost) {
      roiCost.textContent = chf(cost);
      var costSub = roiCost.parentElement && roiCost.parentElement.querySelector('.roi__result-sub');
      if (costSub) costSub.textContent = costLabel;
    }
    if (roiRoi) roiRoi.textContent = roiPercent.toLocaleString('de-CH') + '%';

    // Pulse animation on value change
    [roiRisk, roiCost, roiRoi].forEach(function (el) {
      if (!el) return;
      el.classList.remove('updated');
      void el.offsetWidth; // force reflow
      el.classList.add('updated');
    });
  }

  if (roiBranche) roiBranche.addEventListener('change', calcROI);
  if (roiMitarbeiter) roiMitarbeiter.addEventListener('input', calcROI);
  if (roiWordpress) roiWordpress.addEventListener('change', calcROI);
  calcROI();

  // ── Scroll-to-top Button ──
  var scrollTopBtn = document.getElementById('scroll-top');
  if (scrollTopBtn) {
    window.addEventListener(
      'scroll',
      function () {
        if (window.scrollY > 600) {
          scrollTopBtn.classList.add('visible');
        } else {
          scrollTopBtn.classList.remove('visible');
        }
      },
      { passive: true }
    );

    scrollTopBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ── Exit-Intent Popup Logic ──
  var exitModal = document.getElementById('exit-modal');
  var exitModalClose = document.getElementById('exit-modal-close');
  var exitModalOverlay = document.getElementById('exit-modal-overlay');
  var exitModalCta = document.getElementById('exit-modal-cta');

  if (exitModal) {
    var showExitPopup = function () {
      if (!sessionStorage.getItem('aidsec_exit_shown')) {
        exitModal.classList.add('visible');
        exitModal.setAttribute('aria-hidden', 'false');
        sessionStorage.setItem('aidsec_exit_shown', 'true');
        
        // Tracking
        if (window.plausible) {
          window.plausible('exit_intent_show');
        }
      }
    };

    var closeExitPopup = function () {
      exitModal.classList.remove('visible');
      exitModal.setAttribute('aria-hidden', 'true');
    };

    // Detect mouse leave viewport (top)
    document.addEventListener('mouseleave', function (e) {
      if (e.clientY <= 0) {
        showExitPopup();
      }
    });

    if (exitModalClose) exitModalClose.addEventListener('click', closeExitPopup);
    if (exitModalOverlay) exitModalOverlay.addEventListener('click', closeExitPopup);
    if (exitModalCta) exitModalCta.addEventListener('click', closeExitPopup);

    // Escape key handling
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && exitModal.classList.contains('visible')) {
        closeExitPopup();
      }
    });
  }
  // ── Knowledge Base Search Logic removed as per structural simplification ──

})();
