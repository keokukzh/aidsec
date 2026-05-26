(function () {
  'use strict';

  function fetchJson(url) {
    return fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    }).then(function (response) {
      if (!response.ok) {
        throw new Error('Request failed');
      }
      return response.json();
    });
  }

  function setText(id, value, prefix) {
    var element = document.getElementById(id);
    if (!element || !value) return;
    element.textContent = prefix ? prefix + value : value;
  }

  function renderProofCenter(data) {
    if (data && data.portal) {
      renderCustomerPortal(data.portal, data.updatedAt);
      return;
    }

    if (!data || !data.proofCenter) return;

    var proofCenter = data.proofCenter;
    var managedPackage = data.packages && data.packages['cyber-mandat'];

    setText('pc-status-label', proofCenter.statusLabel, 'Monatsstatus: ');
    setText('pc-last-audit-label', proofCenter.lastAuditLabel, 'Letztes Re-Audit: ');
    setText('pc-incident-sla-label', proofCenter.incidentSlaLabel, 'Incident-SLA: ');
    setText('pc-badge-title', proofCenter.badgeTitle);
    setText('pc-badge-subtitle', proofCenter.badgeSubtitle);
    setText('pc-report-status', proofCenter.report && proofCenter.report.status);
    setText('pc-report-changes', proofCenter.report && proofCenter.report.changes);
    setText('pc-report-open-items', proofCenter.report && proofCenter.report.openItems);

    if (data.updatedAt) {
      var updatedAt = new Date(data.updatedAt);
      if (!Number.isNaN(updatedAt.getTime())) {
        setText('pc-updated-at', updatedAt.toLocaleDateString('de-CH'), 'Stand: ');
      }
    }

    if (managedPackage) {
      var cta = document.getElementById('pc-package-cta');
      if (cta) {
        cta.href = '/leistungen/cyber-mandat.html';
        cta.textContent = managedPackage.shortName + ' ansehen';
      }

      var reportLink = document.getElementById('pc-report-link');
      if (reportLink) {
        reportLink.href = '/leistungen/cyber-mandat.html';
        reportLink.querySelector('.trust-badges__link-label').textContent =
          managedPackage.shortName + ' Report';
      }
    }
  }

  function renderCustomerPortal(portal, updatedAt) {
    var firstOrder = portal.orders && portal.orders[0];
    var firstWebsite = portal.websites && portal.websites[0];
    var firstReport = portal.reports && portal.reports[0];
    var lastEvent = portal.events && portal.events[0];

    setText('pc-status-label', firstOrder && firstOrder.status, 'Auftragsstatus: ');
    setText('pc-last-audit-label', firstWebsite && (firstWebsite.lastCheckedAt || firstOrder.updatedAt), 'Letzte Pruefung: ');
    setText('pc-incident-sla-label', firstOrder && firstOrder.package, 'Paket: ');
    setText('pc-badge-title', 'Kundenportal');
    setText('pc-badge-subtitle', firstWebsite && firstWebsite.url);
    setText('pc-report-status', firstWebsite && firstWebsite.lastGrade ? 'Letzte Monitoring-Note: ' + firstWebsite.lastGrade : 'Auftrag aktiv. Monitoringdaten werden nach der naechsten Pruefung angezeigt.');
    setText('pc-report-changes', lastEvent ? 'Letztes Ereignis: ' + lastEvent.type : 'Noch keine Ereignisse dokumentiert.');
    setText('pc-report-open-items', firstOrder && firstOrder.results && firstOrder.results.gradeAfter ? 'Nachher-Note: ' + firstOrder.results.gradeAfter : 'Offene Punkte werden nach Analyse und Umsetzung dokumentiert.');

    if (updatedAt) {
      var date = new Date(updatedAt);
      if (!Number.isNaN(date.getTime())) setText('pc-updated-at', date.toLocaleString('de-CH'), 'Portal-Stand: ');
    }

    var reportLink = document.getElementById('pc-report-link');
    if (reportLink && firstReport && firstReport.url) {
      reportLink.href = firstReport.url;
      reportLink.querySelector('.trust-badges__link-label').textContent = firstReport.label || 'Audit-Report';
    }

    var cta = document.getElementById('pc-package-cta');
    if (cta && firstOrder) {
      cta.href = '/leistungen/cyber-mandat.html';
      cta.textContent = 'Schutzstatus ansehen';
    }
  }

  var params = new URLSearchParams(window.location.search);
  var orderId = params.get('orderId');
  var token = params.get('token');
  var endpoint =
    orderId && token
      ? '/api/proof-center-status?orderId=' + encodeURIComponent(orderId) + '&token=' + encodeURIComponent(token)
      : '/api/proof-center-status';

  fetchJson(endpoint)
    .catch(function () {
      return fetchJson('/data/site-data.json');
    })
    .then(renderProofCenter)
    .catch(function (error) {
      console.error('Proof center data error:', error);
    });
})();
