<?php
/**
 * Plugin Name: AidSec Security — WordPress Security Header Optimizer
 * Plugin URI: https://aidsec.ch/wordpress-plugin
 * Description: Optimiert Security Headers, schützt vor XSS/Clickjacking und bringt Ihre WordPress-Website auf Note A in 24 Stunden. nDSG-konform.
 * Version: 1.2.0
 * Author: AidSec
 * Author URI: https://aidsec.ch
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: aidsec-security
 * Domain Path: /languages
 * Requires at least: 5.8
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) exit;

define('AIDSEC_PLUGIN_VERSION', '1.2.0');
define('AIDSEC_PLUGIN_URL', plugin_dir_url(__FILE__));
define('AIDSEC_PLUGIN_PATH', plugin_dir_path(__FILE__));

require_once AIDSEC_PLUGIN_PATH . 'includes/class-aidsec-api.php';
require_once AIDSEC_PLUGIN_PATH . 'includes/class-aidsec-settings.php';
require_once AIDSEC_PLUGIN_PATH . 'includes/class-aidsec-scanner.php';
require_once AIDSEC_PLUGIN_PATH . 'includes/class-aidsec-admin.php';

class AidSec_Security_Plugin {
  private static $instance = null;

  public static function get_instance() {
    if (!self::$instance) {
      self::$instance = new self();
    }
    return self::$instance;
  }

  private function __construct() {
    add_action('init', [$this, 'load_textdomain']);
    add_action('admin_menu', [$this, 'add_admin_menu']);
    add_action('admin_init', [$this, 'register_settings']);
    add_filter('plugin_action_links_' . plugin_basename(__FILE__), [$this, 'add_settings_link']);
    add_action('wp_ajax_aidsec_run_scan', [$this, 'ajax_run_scan']);
    add_action('wp_ajax_aidsec_save_settings', [$this, 'ajax_save_settings']);
    add_action('admin_notices', [$this, 'admin_notices']);
  }

  public function load_textdomain() {
    load_plugin_textdomain('aidsec-security', false, dirname(plugin_basename(__FILE__)) . '/languages');
  }

  public function add_admin_menu() {
    add_menu_page(
      'AidSec Security',
      'AidSec Security',
      'manage_options',
      'aidsec-security',
      [$this, 'render_admin_page'],
      'data:image/svg+xml;base64,' . base64_encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#c8a84b"><path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z"/></svg>'),
      80
    );
  }

  public function register_settings() {
    register_setting('aidsec_options_group', 'aidsec_license_key', ['sanitize' => 'sanitize_text_field']);
    register_setting('aidsec_options_group', 'aidsec_api_url', ['sanitize' => 'esc_url_raw']);
    register_setting('aidsec_options_group', 'aidsec_auto_hardening', ['sanitize' => 'wp_verify_nonce']);
    register_setting('aidsec_options_group', 'aidsec_ndsg_mode', ['sanitize' => 'wp_verify_nonce']);
    add_settings_section('aidsec_main_section', 'AidSec Konfiguration', null, 'aidsec-security');
    add_settings_field('aidsec_license_key', 'Lizenz-Schlüssel', [$this, 'render_license_field'], 'aidsec-security', 'aidsec_main_section');
    add_settings_field('aidsec_api_url', 'API URL', [$this, 'render_api_url_field'], 'aidsec-security', 'aidsec_main_section');
    add_settings_field('aidsec_auto_hardening', 'Auto-Hardening', [$this, 'render_auto_hardening_field'], 'aidsec-security', 'aidsec_main_section');
    add_settings_field('aidsec_ndsg_mode', 'nDSG-Modus', [$this, 'render_ndsg_field'], 'aidsec-security', 'aidsec_main_section');
  }

  public function add_settings_link($links) {
    $settings_link = '<a href="' . admin_url('admin.php?page=aidsec-security') . '">' . __('Settings', 'aidsec-security') . '</a>';
    array_unshift($links, $settings_link);
    return $links;
  }

  public function admin_notices() {
    $license = get_option('aidsec_license_key');
    if (empty($license) && isset($_GET['page']) && $_GET['page'] === 'aidsec-security') {
      echo '<div class="notice notice-warning"><p><strong>AidSec:</strong> Bitte geben Sie Ihren Lizenz-Schlüssel ein, um die automatische Security-Optimierung zu aktivieren.</p></div>';
    }
  }

  public function render_admin_page() {
    if (!current_user_can('manage_options')) return;
    $scanner = new AidSec_Scanner();
    $last_scan = get_option('aidsec_last_scan', []);
    $grade = $last_scan['grade'] ?? null;
    $score = $last_scan['score'] ?? 0;
    ?>
    <div class="wrap aidsec-admin">
      <h1>AidSec Security — Dashboard</h1>
      <hr />
      <div class="aidsec-cards">
        <div class="aidsec-card">
          <h2>Security-Score</h2>
          <div class="aidsec-grade <?php echo $grade ? 'grade-' . strtolower($grade) : ''; ?>">
            <?php echo $grade ?: '–'; ?>
          </div>
          <p><?php echo $score; ?> von 6 Headern</p>
          <button class="button button-primary" id="aidsec-run-scan">Scan jetzt starten</button>
          <div id="aidsec-scan-output"></div>
        </div>

        <div class="aidsec-card">
          <h2>Einstellungen</h2>
          <form method="post" action="options.php">
            <?php settings_fields('aidsec_options_group'); ?>
            <table class="form-table">
              <tr>
                <th scope="row">Lizenz-Schlüssel</th>
                <td><input type="text" name="aidsec_license_key" value="<?php echo esc_attr(get_option('aidsec_license_key')); ?>" class="regular-text" placeholder="lic_..." /></td>
              </tr>
              <tr>
                <th scope="row">Auto-Hardening</th>
                <td><input type="checkbox" name="aidsec_auto_hardening" value="1" <?php checked(get_option('aidsec_auto_hardening'), 1); ?> /></td>
              </tr>
              <tr>
                <th scope="row">nDSG-Modus</th>
                <td><input type="checkbox" name="aidsec_ndsg_mode" value="1" <?php checked(get_option('aidsec_ndsg_mode'), 1); ?> /></td>
              </tr>
            </table>
            <?php submit_button(); ?>
          </form>
        </div>

        <div class="aidsec-card">
          <h2>Security Headers</h2>
          <?php
          $headers = ['strict-transport-security', 'content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy'];
          foreach ($headers as $header):
            $value = $_SERVER['HTTP_' . strtoupper(str_replace('-', '_', $header))] ?? null;
            ?>
            <div class="aidsec-header-item">
              <span class="aidsec-header-name"><?php echo esc_html($header); ?></span>
              <span class="aidsec-header-status <?php echo $value ? 'ok' : 'missing'; ?>">
                <?php echo $value ? '✓ ' . esc_html($value) : '✗ fehlt'; ?>
              </span>
            </div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>
    <style>
      .aidsec-admin .aidsec-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 20px; }
      .aidsec-card { background: #fff; border: 1px solid #ccd0d4; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      .aidsec-card h2 { margin-top: 0; font-size: 1.25rem; }
      .aidsec-grade { width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: 700; color: #fff; margin: 16px 0; }
      .aidsec-grade.grade-a { background: #16a34a; }
      .aidsec-grade.grade-b { background: #65a30d; }
      .aidsec-grade.grade-c { background: #ca8a04; }
      .aidsec-grade.grade-d { background: #d97706; }
      .aidsec-grade.grade-e { background: #ea580c; }
      .aidsec-grade.grade-f { background: #dc2626; }
      .aidsec-header-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
      .aidsec-header-status.ok { color: #16a34a; }
      .aidsec-header-status.missing { color: #dc2626; }
    </style>
    <?php
  }

  public function ajax_run_scan() {
    check_ajax_referer('aidsec_nonce');
    if (!current_user_can('manage_options')) wp_die();
    $scanner = new AidSec_Scanner();
    $result = $scanner->run_scan(site_url());
    update_option('aidsec_last_scan', $result);
    wp_send_json_success($result);
  }

  public function ajax_save_settings() {
    check_ajax_referer('aidsec_nonce');
    if (!current_user_can('manage_options')) wp_die();
    parse_str($_POST['data'], $args);
    foreach ($args as $key => $value) {
      if (strpos($key, 'aidsec_') === 0) update_option($key, sanitize_text_field($value));
    }
    wp_send_json_success(['message' => 'Einstellungen gespeichert']);
  }
}

function aidsec_security_init() {
  return AidSec_Security_Plugin::get_instance();
}
add_action('plugins_loaded', 'aidsec_security_init');