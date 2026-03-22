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

  fetchJson('/api/proof-center-status')
    .catch(function () {
      return fetchJson('/data/site-data.json');
    })
    .then(renderProofCenter)
    .catch(function (error) {
      console.error('Proof center data error:', error);
    });
})();