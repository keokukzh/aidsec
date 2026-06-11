/* ============================================
   AidSec Main JS — Nav, Scroll, Reveals, Menu
   ============================================ */

(function () {
  'use strict';

  var siteDataPromise = null;

  function loadSiteData() {
    if (siteDataPromise) return siteDataPromise;

    siteDataPromise = fetch('/data/site-data.json', {
      headers: {
        Accept: 'application/json',
      },
    })
      .then(function (response) {
        if (!response.ok) throw new Error('Site data unavailable');
        return response.json();
      })
      .catch(function () {
        return null;
      });

    return siteDataPromise;
  }

  function applySharedPackageLabels(siteData) {
    var packages = siteData && siteData.packages;
    var managedPackage = packages && packages['cyber-mandat'];

    if (!managedPackage) return;

    document.querySelectorAll('a[href="/leistungen/cyber-mandat.html"]').forEach(function (link) {
      var text = link.textContent.trim();
      if (text === 'Cyber-Mandat') {
        link.textContent = managedPackage.navName || managedPackage.shortName || managedPackage.name;
      }
    });
  }

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

    // Update CSS scroll progress variable
    const scrollProgress = Math.min(
      (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100,
      100
    );
    document.documentElement.style.setProperty('--scroll-progress', scrollProgress + '%');
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

    // Handle Mobile Menu Dropdowns (Accordion)
    const mobileDropdowns = mobileMenu.querySelectorAll(
      '.nav__item.has-dropdown > .nav__link, .nav__item.has-dropdown > span'
    );
    mobileDropdowns.forEach(function (trigger) {
      trigger.addEventListener('click', function (e) {
        // Prevent default link behavior if it's just meant to open the dropdown
        // On desktop it works via hover, on mobile we click it to expand
        e.preventDefault();
        const parentItem = this.parentElement;

        // Close others
        mobileMenu.querySelectorAll('.nav__item.has-dropdown').forEach(function (item) {
          if (item !== parentItem) {
            item.classList.remove('is-open');
          }
        });

        // Toggle current
        parentItem.classList.toggle('is-open');
      });
    });

    // Close on regular link click (not dropdown triggers)
    mobileMenu
      .querySelectorAll('a:not(.nav__item.has-dropdown > .nav__link)')
      .forEach(function (link) {
        link.addEventListener('click', closeMobileMenu);
      });

    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobileMenu.classList.contains('open')) {
        closeMobileMenu();
      }
    });
  }

  loadSiteData().then(function (siteData) {
    if (siteData) {
      applySharedPackageLabels(siteData);
    }
  });

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

// ── Animated Number Counters with Skeleton Loading ──
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
              var el = entry.target;
              // Add skeleton shimmer loading state
              el.classList.add('is-loading');
              el.style.opacity = '1';

              // After brief shimmer, animate to final value
              setTimeout(function() {
                el.classList.remove('is-loading');
                var target = parseInt(el.getAttribute('data-count-to'), 10);
                var prefix = el.getAttribute('data-count-prefix') || '';
                var suffix = el.getAttribute('data-count-suffix') || '';
                var separator = el.getAttribute('data-count-separator') || '';
                if (!isNaN(target)) {
                  el.textContent = prefix + formatNumber(target, separator) + suffix;
                }
                animateCounter(el);
              }, 400);

              counterObserver.unobserve(el);
            }
          });
        },
        { rootMargin: '0px 0px -40px 0px', threshold: 0.1 }
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

  function createCheckIconSvg(isPresent) {
    var svgNs = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');

    if (isPresent) {
      var okPath = document.createElementNS(svgNs, 'path');
      okPath.setAttribute('d', 'M20 6L9 17l-5-5');
      svg.appendChild(okPath);
    } else {
      var failPathOne = document.createElementNS(svgNs, 'path');
      failPathOne.setAttribute('d', 'M18 6L6 18');
      svg.appendChild(failPathOne);

      var failPathTwo = document.createElementNS(svgNs, 'path');
      failPathTwo.setAttribute('d', 'M6 6l12 12');
      svg.appendChild(failPathTwo);
    }

    return svg;
  }

  function renderCheckResult(data) {
    if (!heroCheckResult) return;

    var gradeEl = document.getElementById('hero-check-grade');
    var urlEl = document.getElementById('hero-check-url');
    var headersEl = document.getElementById('hero-check-headers');
    var scoreEl = document.getElementById('hero-check-score');
    var ctaEl = document.getElementById('hero-check-cta');

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
      while (headersEl.firstChild) {
        headersEl.removeChild(headersEl.firstChild);
      }
      var keys = Object.keys(data.headers);
      for (var i = 0; i < keys.length; i++) {
        var h = data.headers[keys[i]];
        var li = document.createElement('li');
        li.className =
          'hero__check-header-item' +
          (h.present ? ' hero__check-header-item--ok' : ' hero__check-header-item--fail');

        var iconSpan = document.createElement('span');
        iconSpan.className = 'hero__check-header-icon';
        iconSpan.appendChild(createCheckIconSvg(Boolean(h.present)));

        var labelSpan = document.createElement('span');
        labelSpan.className = 'hero__check-header-name';
        labelSpan.textContent = h.label;

        li.appendChild(iconSpan);
        li.appendChild(labelSpan);
        headersEl.appendChild(li);
      }
    }

    if (scoreEl) {
      scoreEl.textContent = data.score + ' von ' + data.maxScore + ' Security-Headern aktiv';
    }

    if (ctaEl) {
      var recommendation = recommendForGrade(data.grade, data.url);
      ctaEl.href = recommendation.href;
      ctaEl.setAttribute('data-track', 'check-result-cta-' + recommendation.trackKey);
      ctaEl.textContent = recommendation.label + ' ';
      ctaEl.appendChild(createArrowSvg());
    }

    if (heroCheckError) {
      heroCheckError.hidden = true;
      heroCheckError.setAttribute('hidden', '');
    }

    heroCheckResult.hidden = false;
    heroCheckResult.removeAttribute('hidden');
    heroCheckResult.classList.add('hero__check-result--visible');
  }

  function createArrowSvg() {
    var svgNs = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('class', 'btn__icon');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var p1 = document.createElementNS(svgNs, 'path');
    p1.setAttribute('d', 'M5 12h14');
    var p2 = document.createElementNS(svgNs, 'path');
    p2.setAttribute('d', 'm12 5 7 7-7 7');
    svg.appendChild(p1);
    svg.appendChild(p2);
    return svg;
  }

  function recommendForGrade(grade, rawUrl) {
    var cleanedUrl = stripUrlForQuery(rawUrl);
    var enc = encodeURIComponent(cleanedUrl);
    if (grade === 'A+' || grade === 'A' || grade === 'B') {
      return {
        href: '/onboarding/cyber-mandat/?url=' + enc + '&billing=yearly',
        label: 'Note halten mit Cyber-Mandat – 2 Monate sparen',
        trackKey: 'good-mandat',
      };
    }
    if (grade === 'C' || grade === 'D') {
      return {
        href: '/onboarding/cyber-mandat/?url=' + enc + '&billing=monthly',
        label: 'Cyber-Mandat starten und auf Note A bringen',
        trackKey: 'mid-mandat',
      };
    }
    return {
      href: '/onboarding/rapid-header-fix/?url=' + enc,
      label: 'Wir bringen Sie auf Note A – in unter 24h',
      trackKey: 'bad-rapid',
    };
  }

  function stripUrlForQuery(rawUrl) {
    try {
      var parsed = new URL(rawUrl);
      return parsed.origin + parsed.pathname.replace(/\/$/, '');
    } catch (_) {
      return String(rawUrl || '').trim();
    }
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

    document
      .querySelectorAll('.trust__video, .process-video__media, .trust-video__media, .industry-hero__video')
      .forEach(function (video) {
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

  // ── ROI Calculator (Static Version) ──
  const roiRecordsSlider = document.getElementById('roi-records-slider');
  const roiRecordsValue = document.getElementById('roi-records-value');
  const roiTotalDamage = document.getElementById('roi-total-damage');
  const roiFactor = document.getElementById('roi-factor');
  const roiFactorText = document.getElementById('roi-factor-text');

  function updateROI() {
    if (!roiRecordsSlider) return;

    const records = parseInt(roiRecordsSlider.value, 10);
    if (roiRecordsValue) roiRecordsValue.textContent = records.toLocaleString('de-CH');

    // Logic matching RiskCalculator.jsx
    const costPerRecord = 245;
    const fixFee = 790; // Kanzlei-Härtung Preis — CHF 790
    const totalRisk = records * costPerRecord;
    const potentialFine = Math.min(totalRisk * 0.1, 250000);
    const totalPotentialDamage = totalRisk + potentialFine;

    const formattedDamage = new Intl.NumberFormat('de-CH', {
      style: 'currency',
      currency: 'CHF',
      maximumFractionDigits: 0,
    }).format(totalPotentialDamage);

    const factor = Math.round(totalPotentialDamage / fixFee);

    if (roiTotalDamage) roiTotalDamage.textContent = formattedDamage;
    if (roiFactor) roiFactor.textContent = factor + 'x';
    if (roiFactorText) roiFactorText.textContent = factor;

    // Pulse effect
    [roiTotalDamage, roiFactor].forEach((el) => {
      if (!el) return;
      el.classList.remove('updated');
      void el.offsetWidth;
      el.classList.add('updated');
    });
  }

  if (roiRecordsSlider) {
    roiRecordsSlider.addEventListener('input', updateROI);
    updateROI(); // Init
  }

  // ── ROI Calculator 2 (Mitarbeiter / Branche) ──
  const secondMitarbeiter = document.getElementById('roi-mitarbeiter');
  const secondMitarbeiterOutput = document.getElementById('roi-mitarbeiter-output');
  const secondBranche = document.getElementById('roi-branche');
  const secondWordpress = document.getElementById('roi-wordpress');
  const secondRisk = document.getElementById('roi-risk');
  const secondCost = document.getElementById('roi-cost');
  const secondRoi = document.getElementById('roi-roi');

  function updateSecondROI() {
    if (!secondMitarbeiter) return;

    const mitarbeiter = parseInt(secondMitarbeiter.value, 10);
    if (secondMitarbeiterOutput) secondMitarbeiterOutput.textContent = mitarbeiter;

    const branchValue = secondBranche ? secondBranche.value : 'kanzlei';
    const hasWordpress = secondWordpress ? secondWordpress.checked : true;

    let baseMultiplier = 8000;
    if (branchValue === 'arztpraxis') baseMultiplier = 6000;
    if (branchValue === 'notariat') baseMultiplier = 10000;
    if (branchValue === 'treuhand') baseMultiplier = 9000;

    const totalRisk = mitarbeiter * baseMultiplier * (hasWordpress ? 1.5 : 1.0);
    const fixFee = 790;

    const formattedRisk = new Intl.NumberFormat('de-CH', {
      style: 'currency',
      currency: 'CHF',
      maximumFractionDigits: 0,
    }).format(totalRisk);

    const formattedCost = new Intl.NumberFormat('de-CH', {
      style: 'currency',
      currency: 'CHF',
      maximumFractionDigits: 0,
    }).format(fixFee);

    const roiPercent = Math.round((totalRisk / fixFee) * 100);

    if (secondRisk) secondRisk.textContent = formattedRisk;
    if (secondCost) secondCost.textContent = formattedCost;
    if (secondRoi) secondRoi.textContent = roiPercent.toLocaleString('de-CH') + '%';
  }

  if (secondMitarbeiter) {
    secondMitarbeiter.addEventListener('input', updateSecondROI);
  }
  if (secondBranche) {
    secondBranche.addEventListener('change', updateSecondROI);
  }
  if (secondWordpress) {
    secondWordpress.addEventListener('change', updateSecondROI);
  }

  // Initialize
  updateSecondROI();

  var mandatPricingCard = document.querySelector('[data-mandat-pricing-card]');
  if (mandatPricingCard) {
    var mandatPrice = mandatPricingCard.querySelector('[data-mandat-price]');
    var mandatPeriod = mandatPricingCard.querySelector('[data-mandat-period]');
    var mandatNote = mandatPricingCard.querySelector('[data-mandat-note]');
    var mandatCta = mandatPricingCard.querySelector('[data-mandat-cta]');

    function updateMandatBilling(value) {
      var yearly = value === 'yearly';
      if (mandatPrice) mandatPrice.innerHTML = yearly ? '890.&ndash;' : '89.&ndash;';
      if (mandatPeriod) mandatPeriod.textContent = yearly ? '/ Jahr' : '/ Monat';
      if (mandatNote) {
        mandatNote.innerHTML = yearly
          ? 'Jaehrliche Abrechnung: CHF 890.&ndash; / Jahr. 2 Monate geschenkt.'
          : 'Monatlich kuendbar. Jahresoption: CHF 890.&ndash; / Jahr.';
      }
      if (mandatCta) mandatCta.href = '/onboarding/cyber-mandat?billing=' + (yearly ? 'yearly' : 'monthly');
    }

    mandatPricingCard.querySelectorAll('input[name="mandat-billing"]').forEach(function (input) {
      input.addEventListener('change', function () {
        updateMandatBilling(input.value);
      });
    });
  }


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

  // ── Knowledge Base Search Logic removed as per structural simplification ──
})();
