<?php
/**
 * AidSec Security Scanner
 * Scans website for security header compliance
 */

if (!defined('ABSPATH')) exit;

class AidSec_Scanner {
  private $api;

  public function __construct() {
    $this->api = new AidSec_API();
  }

  public function run_scan($url = null) {
    if (!$url) $url = home_url();

    $result = $this->api->check_headers($url);

    if (is_wp_error($result)) {
      return [
        'success' => false,
        'error' => $result->get_error_message(),
        'url' => $url,
        'scanned_at' => current_time('mysql'),
      ];
    }

    $this->apply_headers_recommendations($result);

    return [
      'success' => true,
      'url' => $url,
      'grade' => $result['grade'] ?? 'F',
      'score' => $result['score'] ?? 0,
      'max_score' => $result['maxScore'] ?? 6,
      'headers' => $result['headers'] ?? [],
      'server' => $result['server'] ?? 'unknown',
      'ndsg' => $result['ndsg'] ?? null,
      'scanned_at' => current_time('mysql'),
      'metadata' => $result['metadata'] ?? [],
    ];
  }

  private function apply_headers_recommendations($result) {
    if (!get_option('aidsec_auto_hardening', false)) return;

    $headers_to_set = [];

    foreach (($result['headers'] ?? []) as $header) {
      if (!$header['present'] && $this->should_apply_header($header['key'])) {
        $headers_to_set[$header['key']] = $this->get_recommended_value($header['key']);
      }
    }

    if (!empty($headers_to_set)) {
      $this->set_security_headers($headers_to_set);
    }
  }

  private function should_apply_header($key) {
    $always_apply = ['x-content-type-options', 'x-frame-options', 'referrer-policy'];
    return in_array($key, $always_apply);
  }

  private function get_recommended_value($key) {
    $values = [
      'strict-transport-security' => 'max-age=31536000; includeSubDomains; preload',
      'content-security-policy' => "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
      'x-content-type-options' => 'nosniff',
      'x-frame-options' => 'DENY',
      'referrer-policy' => 'strict-origin-when-cross-origin',
      'permissions-policy' => 'camera=(), microphone=(), geolocation=()',
    ];
    return $values[$key] ?? '';
  }

  private function set_security_headers($headers) {
    if (!empty($headers['strict-transport-security'])) {
      header('Strict-Transport-Security: ' . $headers['strict-transport-security']);
    }
    if (!empty($headers['content-security-policy'])) {
      header('Content-Security-Policy: ' . $headers['content-security-policy']);
    }
    if (!empty($headers['x-content-type-options'])) {
      header('X-Content-Type-Options: ' . $headers['x-content-type-options']);
    }
    if (!empty($headers['x-frame-options'])) {
      header('X-Frame-Options: ' . $headers['x-frame-options']);
    }
    if (!empty($headers['referrer-policy'])) {
      header('Referrer-Policy: ' . $headers['referrer-policy']);
    }
    if (!empty($headers['permissions-policy'])) {
      header('Permissions-Policy: ' . $headers['permissions-policy']);
    }
  }

  public function get_headers_status() {
    $headers = [
      'strict-transport-security' => 'Strict-Transport-Security',
      'content-security-policy' => 'Content-Security-Policy',
      'x-content-type-options' => 'X-Content-Type-Options',
      'x-frame-options' => 'X-Frame-Options',
      'referrer-policy' => 'Referrer-Policy',
      'permissions-policy' => 'Permissions-Policy',
    ];

    $status = [];
    foreach ($headers as $key => $label) {
      $value = $this->get_header($key);
      $status[$key] = [
        'label' => $label,
        'present' => !empty($value),
        'value' => $value,
      ];
    }
    return $status;
  }

  private function get_header($name) {
    $apache = $this->get_apache_header($name);
    if ($apache) return $apache;
    $nginx = $this->get_nginx_header($name);
    return $nginx;
  }

  private function get_apache_header($name) {
    if (!function_exists('apache_get_version')) return '';
    $htaccess = ABSPATH . '.htaccess';
    if (file_exists($htaccess)) {
      $content = file_get_contents($htaccess);
      preg_match('/' . preg_quote($name, '/') . ':\s*(.+)/i', $content, $matches);
      return $matches[1] ?? '';
    }
    return '';
  }

  private function get_nginx_header($name) {
    return '';
  }

  public function get_grade_color($grade) {
    $colors = [
      'A+' => '#059669', 'A' => '#16a34a', 'B' => '#65a30d',
      'C' => '#ca8a04', 'D' => '#d97706', 'E' => '#ea580c', 'F' => '#dc2626',
    ];
    return $colors[$grade] ?? '#6b7280';
  }

  public function get_grade_label($grade) {
    $labels = [
      'A+' => 'Ausgezeichnet', 'A' => 'Sehr gut', 'B' => 'Gut',
      'C' => 'Befriedigend', 'D' => 'Ausreichend', 'E' => 'Mangelhaft', 'F' => 'Ungenügend',
    ];
    return $labels[$grade] ?? 'Unbekannt';
  }
}