<?php
/**
 * AidSec Admin Interface Helpers
 */

if (!defined('ABSPATH')) exit;

class AidSec_Admin {
  private static $instance = null;

  public static function get_instance() {
    if (!self::$instance) {
      self::$instance = new self();
    }
    return self::$instance;
  }

  private function __construct() {
    add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
    add_action('admin_notices', [$this, 'admin_notice_license_missing']);
  }

  public function enqueue_assets($hook) {
    if (strpos($hook, 'aidsec-security') === false) return;

    wp_enqueue_style('aidsec-admin', AIDSEC_PLUGIN_URL . 'assets/admin.css', [], AIDSEC_PLUGIN_VERSION);
    wp_enqueue_script('aidsec-admin', AIDSEC_PLUGIN_URL . 'assets/admin.js', ['jquery'], AIDSEC_PLUGIN_VERSION, true);

    wp_localize_script('aidsec-admin', 'aidsecConfig', [
      'ajaxUrl' => admin_url('admin-ajax.php'),
      'nonce' => wp_create_nonce('aidsec_nonce'),
      'strings' => [
        'scanning' => __('Scanning...', 'aidsec-security'),
        'scanComplete' => __('Scan abgeschlossen', 'aidsec-security'),
        'error' => __('Fehler', 'aidsec-security'),
        'saveSuccess' => __('Einstellungen gespeichert', 'aidsec-security'),
        'saveError' => __('Fehler beim Speichern', 'aidsec-security'),
      ],
    ]);
  }

  public function admin_notice_license_missing() {
    $screen = get_current_screen();
    if (!$screen || strpos($screen->id, 'aidsec-security') === false) return;

    $license = get_option('aidsec_license_key', '');
    if (!empty($license)) return;

    echo '<div class="notice notice-warning is-dismissible">';
    echo '<p>';
    echo '<strong>AidSec:</strong> ';
    echo __('Bitte geben Sie Ihren Lizenz-Schlüssel ein, um die automatische Security-Optimierung zu aktivieren.', 'aidsec-security');
    echo ' <a href="' . admin_url('admin.php?page=aidsec-security') . '">' . __('Zu den Einstellungen', 'aidsec-security') . '</a>';
    echo '</p>';
    echo '</div>';
  }

  public function render_grade_badge($grade) {
    $color = $this->get_grade_color($grade);
    printf(
      '<span class="aidsec-grade-badge" style="background:%s;color:#fff;padding:4px 12px;border-radius:12px;font-weight:700;">%s</span>',
      esc_attr($color),
      esc_html($grade)
    );
  }

  private function get_grade_color($grade) {
    $colors = [
      'A+' => '#059669', 'A' => '#16a34a', 'B' => '#65a30d',
      'C' => '#ca8a04', 'D' => '#d97706', 'E' => '#ea580c', 'F' => '#dc2626',
    ];
    return $colors[$grade] ?? '#6b7280';
  }

  public function render_header_status($header_key) {
    $value = $this->get_header_value($header_key);
    $present = !empty($value);

    printf(
      '<span class="aidsec-header-status %s" style="color:%s;">%s %s</span>',
      $present ? 'ok' : 'missing',
      $present ? '#16a34a' : '#dc2626',
      $present ? '✓' : '✗',
      $present ? esc_html($value) : __('fehlt', 'aidsec-security')
    );
  }

  private function get_header_value($header_key) {
    $normalized = strtoupper(str_replace('-', '_', $header_key));
    return $_SERVER['HTTP_' . $normalized] ?? '';
  }

  public function output_dashboard_widget() {
    $scanner = new AidSec_Scanner();
    $last_scan = get_option('aidsec_last_scan', []);
    $grade = $last_scan['grade'] ?? null;
    ?>
    <div class="aidsec-dashboard-widget">
      <h2><?php _e('AidSec Security Status', 'aidsec-security'); ?></h2>
      <?php if ($grade): ?>
        <div class="aidsec-widget-grade grade-<?php echo strtolower($grade); ?>">
          <span class="grade"><?php echo esc_html($grade); ?></span>
          <span class="label"><?php echo esc_html($scanner->get_grade_label($grade)); ?></span>
        </div>
        <p><?php printf(__('Letzter Scan: %s', 'aidsec-security'), esc_html($last_scan['scanned_at'] ?? 'N/A')); ?></p>
      <?php else: ?>
        <p><?php _e('Noch kein Scan durchgeführt.', 'aidsec-security'); ?></p>
      <?php endif; ?>
      <a href="<?php echo admin_url('admin.php?page=aidsec-security'); ?>" class="button"><?php _e('Zum Dashboard', 'aidsec-security'); ?></a>
    </div>
    <style>
      .aidsec-dashboard-widget { text-align: center; padding: 20px; }
      .aidsec-widget-grade { display: inline-flex; align-items: center; gap: 12px; margin: 16px 0; padding: 16px 24px; border-radius: 50px; color: #fff; }
      .aidsec-widget-grade .grade { font-size: 2rem; font-weight: 700; }
      .aidsec-widget-grade .label { font-size: 1rem; }
      .aidsec-widget-grade.grade-a { background: linear-gradient(135deg, #16a34a, #059669); }
      .aidsec-widget-grade.grade-f { background: linear-gradient(135deg, #dc2626, #991b1b); }
    </style>
    <?php
  }
}