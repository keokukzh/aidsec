(function () {
  'use strict';

  var el = function (id) {
    return document.getElementById(id);
  };

  function setText(id, value) {
    var e = el(id);
    if (!e || !value) return;
    e.textContent = value;
  }

  function setHtml(id, html) {
    var e = el(id);
    if (!e) return;
    e.innerHTML = html;
  }

  function show(id) {
    var e = el(id);
    if (e) e.style.display = '';
  }

  function hide(id) {
    var e = el(id);
    if (e) e.style.display = 'none';
  }

  // Render states
  function renderAuth() {
    show('portal-auth');
    hide('portal-loading');
    hide('portal-dashboard');
    hide('portal-error');
  }

  function renderLoading() {
    hide('portal-auth');
    show('portal-loading');
    hide('portal-dashboard');
    hide('portal-error');
  }

  function renderError(msg) {
    hide('portal-auth');
    hide('portal-loading');
    hide('portal-dashboard');
    setHtml('portal-error-msg', msg || 'Kundenportal nicht gefunden. Bitte pruefen Sie Ihre Zugangsdaten.');
    show('portal-error');
  }

  function gradeColor(g) {
    if (!g) return '';
    var map = { A: 'a', B: 'a', C: 'c', D: 'd', E: 'f', F: 'f' };
    return map[g.toUpperCase()] || 'f';
  }

  function statusLabel(s) {
    if (!s) return 'Unbekannt';
    if (s === 'active') return 'Aktiv';
    if (s === 'pending_payment') return 'Zahlung ausstehend';
    if (s === 'expired') return 'Abgelaufen';
    return s;
  }

  function statusClass(s) {
    if (!s) return 'pending';
    if (s === 'active') return 'active';
    if (s === 'expired') return 'expired';
    return 'pending';
  }

  function workflowStatusLabel(s) {
    if (!s) return 'Noch nicht gestartet';
    if (s === 'queued') return 'Eingeplant';
    if (s === 'running') return 'Automation laeuft';
    if (s === 'delivered') return 'Geliefert';
    if (s === 'needs_manual_review') return 'Review noetig';
    return s;
  }

  function deliveryStatusLabel(s) {
    if (!s) return 'Wird vorbereitet';
    if (s === 'queued') return 'Eingeplant';
    if (s === 'analysis_running') return 'Analyse laeuft';
    if (s === 'monitoring_active') return 'Monitoring aktiv';
    if (s === 'delivered') return 'Geliefert';
    if (s === 'review_needed') return 'Review noetig';
    if (s === 'retry_scheduled') return 'Retry geplant';
    return s;
  }

  function reportReadinessLabel(s) {
    if (!s || s === 'pending') return 'In Vorbereitung';
    if (s === 'ready') return 'Bereit';
    return s;
  }

  function formatMoney(amount) {
    if (!amount) return '-';
    return 'CHF ' + amount.replace(/['']/g, '') + ' CHF 1284.40';
  }

  function formatDate(d) {
    if (!d) return '-';
    try {
      var date = new Date(d);
      if (!isNaN(date.getTime())) return date.toLocaleDateString('de-CH');
    } catch (e) {}
    return d;
  }

  function mask(str) {
    if (!str) return '---';
    return '•••' + str.slice(-6);
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function reportTypeLabel(type) {
    if (type === 'reaudit') return 'Re-Audit';
    if (type === 'monitoring') return 'Monitoring';
    if (type === 'delivery' || type === 'delivery_report') return 'Delivery';
    return 'Audit';
  }

  function scoreText(score) {
    return (score !== null && score !== undefined) ? score + '/6' : '-';
  }

  function monitoringTrend(history) {
    if (!history || history.length < 2) return null;
    var latest = Number(history[0].score);
    var previous = Number(history[1].score);
    if (!Number.isFinite(latest) || !Number.isFinite(previous)) return null;
    var delta = latest - previous;
    if (delta > 0) return { label: 'Verbessert (+' + delta + ')', className: 'up' };
    if (delta < 0) return { label: 'Rueckgang (' + delta + ')', className: 'down' };
    return { label: 'Stabil', className: 'stable' };
  }

  function renderPortal(data) {
    hide('portal-auth');
    hide('portal-loading');
    hide('portal-error');
    show('portal-dashboard');

    var portal = data.portal || {};
    var orders = portal.orders || [];
    var websites = portal.websites || [];
    var reports = portal.reports || [];
    var reportHistory = portal.reportHistory || reports;
    var monitoringHistory = portal.monitoringHistory || [];
    var events = portal.events || [];
    var customer = portal.customer || {};
    var leadScore = portal.leadScore || null;
    var upsellRec = portal.upsellRecommendation || null;
    var updatedAt = data.updatedAt || null;

    // Hero
    setText('portal-greeting', 'Willkommen');
    setText('portal-customer-name', customer.name || 'Guten Tag');
    setText('portal-customer-company', customer.company || customer.email || '');

    var firstOrder = orders[0];
    if (firstOrder) {
      var sc = statusClass(firstOrder.paymentStatus);
      setText('portal-status-text', statusLabel(firstOrder.status));
      var statusEl = el('portal-status-badge');
      if (statusEl) statusEl.className = 'portal-hero__status portal-hero__status--' + sc;
    } else {
      setText('portal-status-text', 'Kunde registriert');
      var statusEl = el('portal-status-badge');
      if (statusEl) statusEl.className = 'portal-hero__status portal-hero__status--pending';
    }

    if (updatedAt) {
      setText('portal-updated-at', new Date(updatedAt).toLocaleString('de-CH'));
    }

    // Orders
    if (orders.length > 0) {
      var ordersHtml = '<div class="portal-order">';
      orders.forEach(function (o) {
        ordersHtml += '<div class="portal-order__row">';
        ordersHtml += '<span class="portal-order__label">Auftrag</span>';
        ordersHtml += '<span class="portal-order__value">' + escapeHtml(o.orderId) + '</span>';
        ordersHtml += '</div>';
        ordersHtml += '<div class="portal-order__row">';
        ordersHtml += '<span class="portal-order__label">Produkt</span>';
        ordersHtml += '<span class="portal-order__value">' + escapeHtml(o.package || o.productSlug || '-') + '</span>';
        ordersHtml += '</div>';
        ordersHtml += '<div class="portal-order__row">';
        ordersHtml += '<span class="portal-order__label">Status</span>';
        ordersHtml += '<span class="portal-order__value">' + escapeHtml(statusLabel(o.status)) + '</span>';
        ordersHtml += '</div>';
        ordersHtml += '<div class="portal-order__row">';
        ordersHtml += '<span class="portal-order__label">Zahlung</span>';
        ordersHtml += '<span class="portal-order__value">' + escapeHtml(statusLabel(o.paymentStatus)) + '</span>';
        ordersHtml += '</div>';
        ordersHtml += '<div class="portal-order__row">';
        ordersHtml += '<span class="portal-order__label">Lieferung</span>';
        ordersHtml += '<span class="portal-order__value">' + escapeHtml(deliveryStatusLabel(o.deliveryStatus)) + '</span>';
        ordersHtml += '</div>';
        ordersHtml += '<div class="portal-order__row">';
        ordersHtml += '<span class="portal-order__label">Workflow</span>';
        ordersHtml += '<span class="portal-order__value">' + escapeHtml(workflowStatusLabel(o.workflowStatus)) + '</span>';
        ordersHtml += '</div>';
        ordersHtml += '<div class="portal-order__row">';
        ordersHtml += '<span class="portal-order__label">Report</span>';
        ordersHtml += '<span class="portal-order__value">' + escapeHtml(reportReadinessLabel(o.reportReadiness)) + '</span>';
        ordersHtml += '</div>';
        if (o.nextAction) {
          ordersHtml += '<div class="portal-order__row">';
          ordersHtml += '<span class="portal-order__label">Naechster Schritt</span>';
          ordersHtml += '<span class="portal-order__value">' + escapeHtml(o.nextAction) + '</span>';
          ordersHtml += '</div>';
        }
        ordersHtml += '<div class="portal-order__row">';
        ordersHtml += '<span class="portal-order__label">Website</span>';
        ordersHtml += '<span class="portal-order__value">' + escapeHtml(o.website ? o.website.url : '-') + '</span>';
        ordersHtml += '</div>';
        ordersHtml += '<div class="portal-order__row">';
        ordersHtml += '<span class="portal-order__label">Bestellt am</span>';
        ordersHtml += '<span class="portal-order__value">' + escapeHtml(formatDate(o.createdAt)) + '</span>';
        ordersHtml += '</div>';
        ordersHtml += '</div>';
      });
      setHtml('portal-orders-body', ordersHtml);
      var timelineSteps = firstOrder && firstOrder.timeline ? Object.keys(firstOrder.timeline).length : 0;
      if (timelineSteps > 0) {
        var timelineHtml = '';
        for (var i = 0; i < timelineSteps; i++) {
          timelineHtml += '<div class="portal-timeline__step portal-timeline__step--done"></div>';
        }
        setHtml('portal-timeline-bar', timelineHtml);
      }
    } else {
      setHtml('portal-orders-body', '<p style="color:var(--gray-500);font-size:var(--text-sm);">Keine Auftraege vorhanden.</p>');
    }

    // Monitoring
    var latestMonitoring = monitoringHistory[0] || (firstOrder && firstOrder.monitoring);
    if (latestMonitoring) {
      var m = latestMonitoring;
      setText('portal-monitor-grade', m.grade || '-');
      setText('portal-monitor-score', scoreText(m.score));
      setText('portal-monitor-date', m.checkedAt ? new Date(m.checkedAt).toLocaleDateString('de-CH') : '-');
      var gradeEl = el('portal-monitor-circle');
      if (gradeEl) {
        gradeEl.className = 'portal-grade__circle portal-grade__circle--' + gradeColor(m.grade);
      }
      if (monitoringHistory.length > 0) {
        var trend = monitoringTrend(monitoringHistory);
        var monitoringHtml = '<div class="portal-monitor-summary">';
        monitoringHtml += '<div><span>Letzter Check</span><strong>' + escapeHtml(formatDate(m.checkedAt)) + '</strong></div>';
        monitoringHtml += '<div><span>Checks</span><strong>' + escapeHtml(String(monitoringHistory.length)) + '</strong></div>';
        monitoringHtml += '<div><span>Trend</span><strong class="portal-monitor-trend portal-monitor-trend--' + escapeHtml(trend ? trend.className : 'stable') + '">' + escapeHtml(trend ? trend.label : 'Noch offen') + '</strong></div>';
        monitoringHtml += '</div>';
        monitoringHtml += '<div class="portal-history portal-history--compact">';
        monitoringHistory.slice(0, 10).forEach(function (entry) {
          monitoringHtml += '<div class="portal-history__item">';
          monitoringHtml += '<div class="portal-history__main">';
          monitoringHtml += '<span class="portal-history__badge portal-history__badge--' + gradeColor(entry.grade) + '">' + escapeHtml(entry.grade || '-') + '</span>';
          monitoringHtml += '<div>';
          monitoringHtml += '<p class="portal-history__title">' + escapeHtml(entry.websiteUrl || 'Website') + '</p>';
          monitoringHtml += '<p class="portal-history__meta">Score ' + escapeHtml(scoreText(entry.score)) + ' - ' + escapeHtml(formatDate(entry.checkedAt)) + '</p>';
          monitoringHtml += '</div></div></div>';
        });
        monitoringHtml += '</div>';
        el('portal-monitor-body').insertAdjacentHTML('beforeend', monitoringHtml);
      }
    } else {
      setHtml('portal-monitor-body', '<p style="color:var(--gray-500);font-size:var(--text-sm);">Monitoringdaten werden nach der naechsten Pruefung angezeigt.</p>');
    }

    // License
    if (firstOrder && firstOrder.licenseId) {
      setText('portal-license-id', firstOrder.licenseId);
      setText('portal-license-status', 'Aktiv');
      setText('portal-license-token-version', String(1));
      var masked = mask(firstOrder.licenseId);
      setText('portal-license-mask', masked);
    } else {
      setHtml('portal-license-body', '<p style="color:var(--gray-500);font-size:var(--text-sm);">Noch keine Lizenz generiert.</p>');
    }

    // Lead Score
    if (leadScore) {
      setText('portal-lead-score', String(leadScore.score || 0));
      setText('portal-lead-recommendation', upsellRec ? upsellRec : '');
      if (upsellRec) {
        setText('portal-lead-title', 'Empfohlener Naechster Schritt');
      }
    } else {
      setText('portal-lead-score', '---');
      setText('portal-lead-recommendation', 'Nach Zahlungseingang wird eine individuelle Empfehlung generiert.');
    }

    // Reports
    if (reportHistory.length > 0) {
      var reportsHtml = '';
      reportHistory.forEach(function (r) {
        reportsHtml += '<div class="portal-history__item">';
        reportsHtml += '<div class="portal-history__main">';
        reportsHtml += '<span class="portal-history__badge">' + escapeHtml(reportTypeLabel(r.type)) + '</span>';
        reportsHtml += '<div>';
        reportsHtml += '<p class="portal-history__title">' + escapeHtml(r.label || 'Report') + '</p>';
        reportsHtml += '<p class="portal-history__meta">' + escapeHtml(formatDate(r.createdAt)) + (r.websiteUrl ? ' · ' + escapeHtml(r.websiteUrl) : '') + '</p>';
        reportsHtml += '</div></div>';
        if (r.url) {
          reportsHtml += '<a class="portal-history__link" href="' + escapeHtml(r.url) + '" target="_blank" rel="noopener">Report oeffnen</a>';
        } else {
          reportsHtml += '<span class="portal-history__link portal-history__link--muted">In Vorbereitung</span>';
        }
        reportsHtml += '</div>';
      });
      setHtml('portal-reports-body', reportsHtml);
    } else {
      setHtml('portal-reports-body', '<p style="color:var(--gray-500);font-size:var(--text-sm);">Noch keine Reports vorhanden.</p>');
    }

    // Events
    if (events.length > 0) {
      var eventsHtml = '';
      events.slice(0, 5).forEach(function (e) {
        eventsHtml += '<div class="portal-order__row">';
        eventsHtml += '<span class="portal-order__label">' + escapeHtml(e.type.replace(/_/g, ' ')) + '</span>';
        eventsHtml += '<span class="portal-order__value">' + escapeHtml(formatDate(e.createdAt)) + '</span>';
        eventsHtml += '</div>';
      });
      setHtml('portal-events-body', eventsHtml);
    } else {
      setHtml('portal-events-body', '<p style="color:var(--gray-500);font-size:var(--text-sm);">Noch keine Ereignisse dokumentiert.</p>');
    }
  }

  function renderPublicDemo(data) {
    hide('portal-auth');
    hide('portal-loading');
    hide('portal-error');
    show('portal-dashboard');

    if (data && data.portal) {
      renderPortal(data);
      return;
    }

    if (!data || !data.proofCenter) {
      renderAuth();
      return;
    }

    var pc = data.proofCenter;
    setText('portal-greeting', 'Proof Center Demo');
    setText('portal-customer-name', 'Besucher');
    setText('portal-customer-company', 'AidSec Verified Demo');
    setText('portal-status-text', pc.statusLabel || 'Demo');
    setText('portal-updated-at', new Date().toLocaleDateString('de-CH'));

    var gradeEl = el('portal-monitor-circle');
    if (gradeEl) {
      gradeEl.className = 'portal-grade__circle portal-grade__circle--a';
      gradeEl.textContent = 'A';
    }
    setText('portal-monitor-grade', 'A');
    setText('portal-monitor-score', '6/6');
    setText('portal-monitor-date', pc.lastAuditLabel || '-');

    setHtml('portal-orders-body', '<p style="color:var(--gray-500);font-size:var(--text-sm);">Demo-Modus: Einloggen mit Ihrem Proof-Center-Link fuer Ihre Daten.</p>');
    setHtml('portal-license-body', '<p style="color:var(--gray-500);font-size:var(--text-sm);">Demo-Modus: Keine Lizenzinformationen verfuegbar.</p>');
    setText('portal-lead-score', '---');
    setHtml('portal-reports-body', '<p style="color:var(--gray-500);font-size:var(--text-sm);">Reports sind nur fuer authentifizierte Kunden sichtbar.</p>');
    setHtml('portal-events-body', '<p style="color:var(--gray-500);font-size:var(--text-sm);">Keine Ereignisse in der Demo.</p>');
  }

  // Main flow
  var params = new URLSearchParams(window.location.search);
  var orderId = params.get('orderId');
  var token = params.get('token');
  var endpoint;

  if (orderId && token) {
    endpoint = '/api/proof-center-status?orderId=' + encodeURIComponent(orderId) + '&token=' + encodeURIComponent(token);
  } else {
    endpoint = '/api/proof-center-status';
  }

  renderLoading();

  fetch(endpoint, {
    headers: { Accept: 'application/json' }
  })
    .then(function (res) {
      if (!res.ok) throw new Error('API error: ' + res.status);
      return res.json();
    })
    .then(function (data) {
      renderPublicDemo(data);
    })
    .catch(function (err) {
      if (orderId && token) {
        renderError('Zugang nicht gueltig. Bitte pruefen Sie den Link aus Ihrer Bestaetigungs-E-Mail.');
      } else {
        renderAuth();
      }
    });

  // Handle magic-link request
  var authForm = el('portal-auth-form');
  if (authForm) {
    authForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = el('portal-auth-email').value.trim();
      var oid = el('portal-auth-oid').value.trim();
      if (!email || !oid) return;
      var btn = authForm.querySelector('button');
      btn.textContent = 'Link senden...';
      btn.disabled = true;
      // In production: POST to /api/order-status with email + orderId to send magic link
      fetch('/api/order-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: oid, email: email, action: 'send_magic_link' })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.sent) {
            setHtml('portal-auth-hint', '<p style="color:var(--green-safe);">Ein Zugangsweg wurde an ' + email + ' gesendet. Bitte pruefen Sie Ihren Posteingang.</p>');
          } else {
            setHtml('portal-auth-hint', '<p style="color:var(--red-danger);">Auftrag oder E-Mail nicht gefunden. Bitte pruefen Sie Ihre Angaben.</p>');
          }
        })
        .catch(function () {
          setHtml('portal-auth-hint', '<p style="color:var(--red-danger);">Fehler beim Senden. Bitte versuchen Sie es spaeter erneut.</p>');
        })
        .finally(function () {
          btn.textContent = 'Zugang anfordern';
          btn.disabled = false;
        });
    });
  }
})();
