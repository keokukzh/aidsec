/**
 * AidSec Customer Dashboard JavaScript
 *
 * Features:
 * - Magic-Link Auth via URL params (token + orderId)
 * - Dashboard data fetching
 * - License key display with copy functionality
 * - Fail-safe error handling
 */

(function() {
  'use strict';

  // ============================================
  // DOM Elements
  // ============================================

  const elements = {
    loadingState: document.getElementById('loading-state'),
    errorState: document.getElementById('error-state'),
    dashboardContent: document.getElementById('dashboard-content'),
    errorMessage: document.getElementById('error-message'),
    customerName: document.getElementById('customer-name'),
    statusBadge: document.getElementById('status-badge'),
    statusText: document.getElementById('status-text'),
    infoName: document.getElementById('info-name'),
    infoEmail: document.getElementById('info-email'),
    infoCompany: document.getElementById('info-company'),
    infoProduct: document.getElementById('info-product'),
    infoWebsite: document.getElementById('info-website'),
    infoOrderId: document.getElementById('info-order-id'),
    licenseKey: document.getElementById('license-key'),
    copyLicenseBtn: document.getElementById('copy-license-btn'),
    downloadLink: document.getElementById('download-link'),
    invoiceLink: document.getElementById('invoice-link'),
  };

  // ============================================
  // Configuration
  // ============================================

  const CONFIG = {
    apiEndpoint: '/api/dashboard-status',
    fallbackApiEndpoint: '/api/order-status',
    pluginDownloadUrl: '/aidsec-express-fix.zip',
    invoiceBaseUrl: '/api/invoice',
    redirectDelay: 5000,
  };

  // ============================================
  // Utility Functions
  // ============================================

  /**
   * Get URL parameters
   */
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('order_id') || params.get('orderId') || '';
    const token = params.get('token') || '';

    // Demo mode: inject fake data when no real credentials
    if (!orderId && !token) {
      console.log('[dashboard] Demo mode active');
      return {
        orderId: 'DEMO-ORDER-001',
        token: 'demo-token-aidsec-2026',
        email: 'muster@example.ch',
      };
    }

    return {
      orderId,
      token,
      email: params.get('email') || '',
    };
  }

  /**
   * Show specific state (loading, error, or content)
   */
  function showState(state) {
    elements.loadingState.style.display = state === 'loading' ? 'flex' : 'none';
    elements.errorState.style.display = state === 'error' ? 'block' : 'none';
    elements.dashboardContent.style.display = state === 'content' ? 'block' : 'none';
  }

  /**
   * Show error message
   */
  function showError(message, hint) {
    elements.errorMessage.textContent = hint || message;
    showState('error');
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    if (!text) return '-';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  /**
   * Format order ID for display
   */
  function formatOrderId(orderId) {
    if (!orderId) return '-';
    return orderId.length > 16 ? orderId.substring(0, 16) + '...' : orderId;
  }

  /**
   * Get status configuration based on order status
   */
  function getStatusConfig(status) {
    const statusMap = {
      pending_payment: { label: 'Zahlung ausstehend', class: 'status--pending' },
      pending: { label: 'Ausstehend', class: 'status--pending' },
      active: { label: 'In Bearbeitung', class: 'status--active' },
      complete: { label: 'Abgeschlossen', class: 'status--complete' },
      paid: { label: 'Bezahlt', class: 'status--complete' },
      expired: { label: 'Abgelaufen', class: 'status--error' },
      error: { label: 'Fehler', class: 'status--error' },
    };
    return statusMap[status] || { label: status || 'Unbekannt', class: '' };
  }

  /**
   * Get product display name
   */
  function getProductDisplayName(productSlug) {
    const productNames = {
      'rapid-header-fix': 'AidSec Express Plugin',
      'kanzlei-haertung': 'Kanzlei-Haertung',
      'cyber-mandat': 'Cyber-Mandat Pro',
    };
    return productNames[productSlug] || productSlug || '-';
  }

  // ============================================
  // Copy Functionality
  // ============================================

  /**
   * Copy text to clipboard with fallback
   */
  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }

      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    } catch (err) {
      console.error('[dashboard] Copy failed:', err);
      return false;
    }
  }

  /**
   * Setup copy button click handler
   */
  function setupCopyButton() {
    const btn = elements.copyLicenseBtn;
    const key = elements.licenseKey.textContent;

    btn.addEventListener('click', async function() {
      const licenseKey = btn.dataset.licenseKey || elements.licenseKey.textContent;
      const success = await copyToClipboard(licenseKey);

      if (success) {
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 2000);
      } else {
        // Show fallback message
        const tooltip = btn.querySelector('.copy-tooltip');
        tooltip.textContent = 'Fehler';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.classList.remove('copied');
          tooltip.textContent = 'Kopiert!';
        }, 2000);
      }
    });
  }

  // ============================================
  // API Functions
  // ============================================

/**
   * Fetch dashboard data from API
   */
  async function fetchDashboardData(orderId, token, email) {
    // Demo mode: return mock data
    if (token === 'demo-token-aidsec-2026') {
      await new Promise(r => setTimeout(r, 800)); // Simulate network delay
      return {
        success: true,
        data: {
          order: {
            orderId: 'DEMO-ORDER-001',
            customer: { name: 'Müller & Partner', email: 'muster@example.ch', company: 'Müller & Partner Rechtsanwälte' },
            productSlug: 'kanzlei-haertung',
            websiteUrl: 'https://mueller-partner.ch',
            status: 'active',
            licenseKey: 'AIDSEC-DEMO-2026-KANZ-LEIH',
            results: { headersScore: 72, issuesFixed: 8, lastScan: '2026-05-28' },
          }
        },
        endpoint: 'demo'
      };
    }

    // Try primary endpoint first
    try {
      const params = new URLSearchParams({ orderId, token });
      if (email) params.append('email', email);

      const response = await fetch(`${CONFIG.apiEndpoint}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, data, endpoint: 'primary' };
      }

      // Try fallback endpoint if primary fails
      if (response.status === 404 || response.status === 500) {
        throw new Error('Primary endpoint not available');
      }

      const error = await response.json().catch(() => ({ error: 'Unbekannter Fehler' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    } catch (primaryError) {
      console.warn('[dashboard] Primary endpoint failed, trying fallback:', primaryError.message);

      // Try fallback endpoint
      try {
        const params = new URLSearchParams({ orderId, token });
        if (email) params.append('email', email);

        const response = await fetch(`${CONFIG.fallbackApiEndpoint}?${params.toString()}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Unbekannter Fehler' }));
          throw new Error(error.error || error.reason || `HTTP ${response.status}`);
        }

        const result = await response.json();
        return { success: true, data: result, endpoint: 'fallback' };
      } catch (fallbackError) {
        throw new Error(fallbackError.message);
      }
    }
  }

  /**
   * Transform API response to dashboard data format
   */
  function transformOrderData(apiResponse) {
    const order = apiResponse.order || apiResponse;

    return {
      customer: {
        name: order.customer?.name || order.name || '',
        email: order.customer?.email || order.email || '',
        company: order.customer?.company || order.company || '',
      },
      product: {
        slug: order.productSlug || order.package || '',
        displayName: getProductDisplayName(order.productSlug || order.package),
      },
      website: order.website?.url || order.websiteUrl || '',
      orderId: order.orderId || '',
      status: order.status || 'unknown',
      statusLabel: order.statusLabel || getStatusConfig(order.status).label,
      licenseId: order.licenseId || order.licenseKey || '',
      results: order.results || {},
    };
  }

  // ============================================
  // UI Update Functions
  // ============================================

  /**
   * Update UI with dashboard data
   */
  function updateUI(data) {
    // Update customer info
    elements.customerName.textContent = data.customer.name
      ? `Willkommen, ${escapeHtml(data.customer.name)}`
      : 'Willkommen in Ihrem Kundenportal';

    elements.infoName.textContent = escapeHtml(data.customer.name) || '-';
    elements.infoEmail.textContent = escapeHtml(data.customer.email) || '-';
    elements.infoCompany.textContent = escapeHtml(data.customer.company) || '-';

    // Update product info
    elements.infoProduct.textContent = data.product.displayName;
    elements.infoWebsite.textContent = escapeHtml(data.website) || '-';
    elements.infoOrderId.textContent = formatOrderId(data.orderId);

    // Update license key
    const licenseKey = data.licenseId || data.licenseKey || '';
    elements.licenseKey.textContent = licenseKey || 'Kein License Key verfuegbar';
    elements.copyLicenseBtn.dataset.licenseKey = licenseKey;

    // Style license key based on availability
    if (!licenseKey) {
      elements.licenseKey.style.opacity = '0.5';
      elements.licenseKey.style.borderColor = 'rgba(255,255,255,0.2)';
    }

    // Update status badge
    const statusConfig = getStatusConfig(data.status);
    elements.statusText.textContent = statusConfig.label;
    elements.statusBadge.className = `dashboard__status-badge ${statusConfig.class}`;

    // Update download link based on product
    if (data.product.slug === 'cyber-mandat') {
      elements.downloadLink.href = '#';
      elements.downloadLink.textContent = 'Konfiguration folgt';
      elements.downloadLink.style.pointerEvents = 'none';
    } else {
      elements.downloadLink.href = CONFIG.pluginDownloadUrl;
    }

    // Update invoice link
    if (data.orderId) {
      elements.invoiceLink.href = `${CONFIG.invoiceBaseUrl}/${data.orderId}`;
    }
  }

  // ============================================
  // Main Initialization
  // ============================================

  /**
   * Initialize dashboard
   */
  async function init() {
    console.log('[dashboard] Initializing...');

    // Get URL parameters
    const params = getUrlParams();
    console.log('[dashboard] URL params:', { orderId: params.orderId, hasToken: !!params.token });

    // Validate required parameters
    if (!params.orderId) {
      showError(
        'Auftrags-ID fehlt',
        'Bitte nutzen Sie den Link aus Ihrer Bestaetigungs-E-Mail.'
      );
      return;
    }

    if (!params.token) {
      showError(
        'Authentifizierung erforderlich',
        'Bitte nutzen Sie den Link aus Ihrer Bestaetigungs-E-Mail.'
      );
      return;
    }

    try {
      // Fetch dashboard data
      const result = await fetchDashboardData(params.orderId, params.token, params.email);
      console.log('[dashboard] Data fetched from:', result.endpoint);

      // Transform data
      const dashboardData = transformOrderData(result.data);

      // Update UI
      updateUI(dashboardData);

      // Setup interactive elements
      setupCopyButton();

      // Show content
      showState('content');
      console.log('[dashboard] Initialization complete');

    } catch (error) {
      console.error('[dashboard] Error:', error.message);

      // Handle specific error cases
      const errorMessages = {
        'Token und Auftrags-ID stimmen nicht ueberein': 'Ungueltiger Zugangslink',
        'Ungueltiger oder abgelaufener Link': 'Ihr Zugangslink ist abgelaufen oder ungueltig',
        'Auftrag nicht gefunden': 'Auftrag nicht gefunden',
      };

      const displayMessage = errorMessages[error.message] || error.message;

      showError(
        displayMessage,
        'Bitte wenden Sie sich an support@aidsec.ch oder nutzen Sie den Link aus Ihrer Bestaetigungs-E-Mail.'
      );
    }
  }

  // ============================================
  // Start Dashboard
  // ============================================

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();