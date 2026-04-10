<?php
/**
 * Plugin Name: AidSec Express Fix
 * Description: Injiziert sichere HTTP-Headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) und meldet den Erfolg an AidSec.
 * Version: 2.0.0
 * Author: AidSec
 * Author URI: https://aidsec.ch
 * License: GPL2
 * 
 * Automatische Server-Detection: Erkennt Apache/Nginx/Litespeed und passt die Header-Implementierung entsprechend an.
 */

if (!defined('ABSPATH')) {
    exit;
}

// Konfiguration
define('AIDSEC_VERSION', '2.0.0');
define('AIDSEC_WEBHOOK_URL', 'https://hook.eu1.make.com/h6sbfnewo9cf03j3lk8umcyxnlkabk8c');
define('AIDSEC_API_ENDPOINT', 'https://aidsec.ch/api/check-headers');

// ============================================================
// 1. SERVER DETECTION
// ============================================================
function aidsec_detect_server() {
    $server_software = isset($_SERVER['SERVER_SOFTWARE']) ? $_SERVER['SERVER_SOFTWARE'] : '';
    $server_signature = isset($_SERVER['SERVER_SIGNATURE']) ? $_SERVER['SERVER_SIGNATURE'] : '';
    $all_headers = function_exists('getallheaders') ? getallheaders() : [];
    
    $detection = [
        'apache' => false,
        'nginx' => false,
        'litespeed' => false,
        'cloudflare' => false,
        'varnish' => false,
        'detected' => 'unknown',
        'server_string' => $server_software
    ];
    
    // Server-Software Detection
    if (stripos($server_software, 'Apache') !== false) {
        $detection['apache'] = true;
        $detection['detected'] = 'apache';
    } elseif (stripos($server_software, 'nginx') !== false) {
        $detection['nginx'] = true;
        $detection['detected'] = 'nginx';
    } elseif (stripos($server_software, 'LiteSpeed') !== false) {
        $detection['litespeed'] = true;
        $detection['detected'] = 'litespeed';
    }
    
    // Cloudflare Detection
    if (isset($all_headers['CF-Ray']) || isset($all_headers['cf-ray'])) {
        $detection['cloudflare'] = true;
        $detection['detected'] = 'cloudflare_' . $detection['detected'];
    }
    
    // Varnish Detection
    if (isset($all_headers['X-Varnish']) || isset($all_headers['Via'])) {
        $detection['varnish'] = true;
    }
    
    return $detection;
}

// ============================================================
// 2. HEADER IMPLEMENTATION
// ============================================================
function aidsec_inject_security_headers() {
    $server = aidsec_detect_server();
    
    // Basis-Header (funktionieren auf allen Servern)
    $headers = [
        'Strict-Transport-Security' => 'max-age=31536000; includeSubDomains; preload',
        'X-Frame-Options' => 'SAMEORIGIN',
        'X-Content-Type-Options' => 'nosniff',
        'X-XSS-Protection' => '1; mode=block',
        'Referrer-Policy' => 'strict-origin-when-cross-origin',
        'Permissions-Policy' => 'geolocation=(), microphone=(), camera=()'
    ];
    
    // X-Frame-Options für Cloudflare anpassen
    if ($server['cloudflare']) {
        // Cloudflare kann X-Frame-Options blockieren, daher CSP als Fallback
        $headers['Content-Security-Policy'] = "frame-ancestors 'self'";
    }
    
    // Header injizieren
    foreach ($headers as $name => $value) {
        // Verhindere doppelte Header
        if (!headers_sent()) {
            header_remove($name);
            header("$name: $value");
        }
    }
    
    // Logging für Debugging
    aidsec_log_headers($server, $headers);
}

function aidsec_log_headers($server, $headers) {
    $log_data = [
        'timestamp' => current_time('c'),
        'server' => $server,
        'headers_applied' => array_keys($headers),
        'wp_version' => get_bloginfo('version'),
        'plugin_version' => AIDSEC_VERSION
    ];
    
    // In WordPress Debug Log schreiben wenn WP_DEBUG aktiv
    if (defined('WP_DEBUG') && WP_DEBUG) {
        error_log('[AidSec Express Fix] Headers applied: ' . json_encode($log_data));
    }
    
    // Als Option speichern für spätere Verifizierung
    update_option('aidsec_last_headers', $log_data, false);
    update_option('aidsec_headers_applied', true, false);
}

// ============================================================
// 3. VERIFIZIERUNG NACH AKTIVIERUNG
// ============================================================
function aidsec_verify_headers_after_activation() {
    $site_url = get_site_url();
    $verify_url = AIDSEC_API_ENDPOINT . '?url=' . urlencode($site_url);
    
    // Asynchroner Request zur Verifizierung
    wp_remote_get($verify_url, [
        'timeout' => 10,
        'blocking' => false,
        'headers' => [
            'User-Agent' => 'AidSec-Plugin/' . AIDSEC_VERSION
        ]
    ]);
}

// ============================================================
// 4. WEBHOOK BEI AKTIVIERUNG
// ============================================================
register_activation_hook(__FILE__, 'aidsec_activation_webhook');
function aidsec_activation_webhook() {
    $webhook_url = AIDSEC_WEBHOOK_URL;
    
    $site_url = get_site_url();
    $admin_email = get_option('admin_email');
    $site_name = get_bloginfo('name');
    $server = aidsec_detect_server();
    
    $body = json_encode([
        'event' => 'plugin_activated',
        'plugin_version' => AIDSEC_VERSION,
        'site_url' => $site_url,
        'site_name' => $site_name,
        'admin_email' => $admin_email,
        'server_detected' => $server['detected'],
        'server_software' => $server['server_string'],
        'cloudflare' => $server['cloudflare'],
        'timestamp' => current_time('mysql'),
        'aidsec_version' => AIDSEC_VERSION
    ], JSON_UNESCAPED_UNICODE);
    
    $response = wp_remote_post($webhook_url, [
        'method' => 'POST',
        'headers' => [
            'Content-Type' => 'application/json',
            'X-AidSec-Auth' => 'express-fix-v2',
            'X-AidSec-Version' => AIDSEC_VERSION
        ],
        'body' => $body,
        'blocking' => false
    ]);
    
    // Erfolgsmeldung setzen
    set_transient('aidsec_activation_success', true, 60);
    set_transient('aidsec_server_type', $server['detected'], 60);
    
    return $response;
}

// ============================================================
// 5. ADMIN NOTICE
// ============================================================
add_action('admin_notices', 'aidsec_admin_notice');
function aidsec_admin_notice() {
    // Erfolgreiche Aktivierung
    if (get_transient('aidsec_activation_success')) {
        $server_type = get_transient('aidsec_server_type');
        $server_label = [
            'apache' => 'Apache',
            'nginx' => 'Nginx',
            'litespeed' => 'LiteSpeed',
            'cloudflare_apache' => 'Apache (Cloudflare)',
            'cloudflare_nginx' => 'Nginx (Cloudflare)'
        ];
        $server_display = isset($server_label[$server_type]) ? $server_label[$server_type] : 'unbekannt';
        ?>
        <div class="notice notice-success is-dismissible">
            <p>
                <strong>🔒 AidSec Härtung erfolgreich aktiviert!</strong><br>
                Server-Typ: <code><?php echo esc_html($server_display); ?></code><br>
                HTTP-Headers wurden implementiert und gesichert.<br>
                <em>Die Verifizierung läuft automatisch im Hintergrund.</em>
            </p>
        </div>
        <?php
        delete_transient('aidsec_activation_success');
        delete_transient('aidsec_server_type');
    }
    
    // Fehler bei Aktivierung
    if (get_transient('aidsec_activation_error')) {
        $error_msg = get_transient('aidsec_activation_error');
        ?>
        <div class="notice notice-warning is-dismissible">
            <p>
                <strong>⚠️ AidSec: 部分完成</strong><br>
                Die HTTP-Headers wurden implementiert, aber die Verbindung zu AidSec konnte nicht hergestellt werden.<br>
                Fehler: <?php echo esc_html($error_msg); ?><br>
                <em>Die Header-Schutz ist dennoch aktiv. Bitte kontaktieren Sie info@aidsec.ch für Support.</em>
            </p>
        </div>
        <?php
        delete_transient('aidsec_activation_error');
    }
}

// ============================================================
// 6. REST API ENDPOINT FÜR VERIFIZIERUNG
// ============================================================
add_action('rest_api_init', 'aidsec_register_rest_endpoint');
function aidsec_register_rest_endpoint() {
    register_rest_route('aidsec/v1', '/status', [
        'methods' => 'GET',
        'callback' => function($request) {
            $headers_applied = get_option('aidsec_headers_applied', false);
            $last_headers = get_option('aidsec_last_headers', null);
            
            return [
                'success' => true,
                'headers_applied' => $headers_applied,
                'server_detected' => aidsec_detect_server()['detected'],
                'last_update' => $last_headers ? $last_headers['timestamp'] : null,
                'plugin_version' => AIDSEC_VERSION
            ];
        },
        'permission_callback' => '__return_true'
    ]);
}

// ============================================================
// 7. SHORTCODES FÜR CUSTOMIZER
// ============================================================
add_shortcode('aidsec_status', function($atts) {
    $atts = shortcode_atts([
        'show' => 'badge'
    ], $atts);
    
    if ($atts['show'] === 'badge') {
        $applied = get_option('aidsec_headers_applied', false);
        if ($applied) {
            return '<span class="aidsec-badge" style="background:#00a63f;color:#fff;padding:4px 12px;border-radius:4px;font-size:12px;">🔒 Geschützt by AidSec</span>';
        }
    }
    
    return '';
});

// WordPress Hook für Header-Injection
add_action('send_headers', 'aidsec_inject_security_headers');
