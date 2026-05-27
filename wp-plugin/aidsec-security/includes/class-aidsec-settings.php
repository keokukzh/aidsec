<?php
/**
 * AidSec Settings Management
 */

if (!defined('ABSPATH')) exit;

class AidSec_Settings {
  private static $instance = null;

  public static function get_instance() {
    if (!self::$instance) {
      self::$instance = new self();
    }
    return self::$instance;
  }

  private function __construct() {
    add_action('admin_init', [$this, 'register_settings']);
  }

  public function register_settings() {
    register_setting('aidsec_settings_group', 'aidsec_license_key', [
      'sanitize_callback' => [$this, 'sanitize_license_key'],
    ]);
    register_setting('aidsec_settings_group', 'aidsec_api_url', [
      'sanitize_callback' => 'esc_url_raw',
    ]);
    register_setting('aidsec_settings_group', 'aidsec_auto_hardening', [
      'sanitize_callback' => 'absint',
    ]);
    register_setting('aidsec_settings_group', 'aidsec_ndsg_mode', [
      'sanitize_callback' => 'absint',
    ]);
    register_setting('aidsec_settings_group', 'aidsec_webhook_url', [
      'sanitize_callback' => 'esc_url_raw',
    ]);
  }

  public function sanitize_license_key($value) {
    $value = trim($value);
    if (!empty($value) && !preg_match('/^lic_[a-f0-9]{16}$/', $value)) {
      add_settings_error('aidsec_license_key', 'invalid_key', 'Ungültiger Lizenz-Schlüssel. Format: lic_...', 'error');
      return '';
    }
    return $value;
  }

  public function get_license_key() {
    return get_option('aidsec_license_key', '');
  }

  public function get_api_url() {
    return get_option('aidsec_api_url', 'https://aidsec.ch/api');
  }

  public function is_auto_hardening_enabled() {
    return (bool) get_option('aidsec_auto_hardening', false);
  }

  public function is_ndsg_mode_enabled() {
    return (bool) get_option('aidsec_ndsg_mode', false);
  }

  public function get_webhook_url() {
    return get_option('aidsec_webhook_url', '');
  }

  public function save_settings($data) {
    $allowed = ['aidsec_license_key', 'aidsec_api_url', 'aidsec_auto_hardening', 'aidsec_ndsg_mode', 'aidsec_webhook_url'];
    foreach ($allowed as $key) {
      if (isset($data[$key])) {
        $sanitized = sanitize_text_field($data[$key]);
        update_option($key, $sanitized);
      }
    }
  }
}