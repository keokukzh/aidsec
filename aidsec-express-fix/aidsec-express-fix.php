<?php
/**
 * Plugin Name: AidSec Express Fix
 * Description: Injiziert sichere HTTP-Headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) und meldet den Erfolg an AidSec.
 * Version: 1.0.0
 * Author: AidSec
 * Author URI: https://aidsec.ch
 * License: GPL2
 */

if (!defined('ABSPATH')) {
    exit;
}

// 1. Injiziere Security Headers
add_action('send_headers', 'aidsec_inject_security_headers');
function aidsec_inject_security_headers()
{
    // Erzwinge HTTPS (HSTS) für 1 Jahr (inkl. Subdomains)
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');

    // Verhindere Clickjacking
    header('X-Frame-Options: SAMEORIGIN');

    // Verhindere MIME-Type Sniffing
    header('X-Content-Type-Options: nosniff');

    // Kontrolliere Referrer-Daten
    header('Referrer-Policy: strict-origin-when-cross-origin');

    // Anmerkung: CSP ist bewusst ausgelassen, um die Website nicht durch strenge Regeln zu zerstören (Best Practice fürs MVP)
}

// 2. Webhook bei Aktivierung senden
register_activation_hook(__FILE__, 'aidsec_activation_webhook');
function aidsec_activation_webhook()
{
    $webhook_url = 'https://hook.eu1.make.com/h6sbfnewo9cf03j3lk8umcyxnlkabk8c'; // <-- Make.com Webhook URL hier eintragen

    $site_url = get_site_url();
    $admin_email = get_option('admin_email');
    $site_name = get_bloginfo('name');

    $body = json_encode([
        'event' => 'plugin_activated',
        'site_url' => $site_url,
        'site_name' => $site_name,
        'admin_email' => $admin_email,
        'timestamp' => current_time('mysql')
    ]);

    wp_remote_post($webhook_url, [
        'method' => 'POST',
        'headers' => [
            'Content-Type' => 'application/json',
            'X-AidSec-Auth' => 'express-fix-v1' // Simpler Auth-Header für Make.com Router
        ],
        'body' => $body,
        'blocking' => false // Blockiert den Ladevorgang nicht
    ]);

    // Setze ein Transient für die Erfolgsmeldung im Admin-Dashboard
    set_transient('aidsec_activation_notice', true, 60);
}

// 3. Erfolgsmeldung im Dashboard anzeigen
add_action('admin_notices', 'aidsec_admin_notice');
function aidsec_admin_notice()
{
    if (get_transient('aidsec_activation_notice')) {
        ?>
        <div class="notice notice-success is-dismissible">
            <p><strong>🔒 AidSec Härtung erfolgreich!</strong> Die sicheren HTTP-Headers wurden aktiviert. Bitte prüfen Sie Ihr
                E-Mail-Postfach (<?php echo esc_html(get_option('admin_email')); ?>) für Ihren Audit-Report und weitere
                Schritte.</p>
        </div>
        <?php
        delete_transient('aidsec_activation_notice');
    }
}
