<?php
/**
 * AidSec API Communication Class
 * Handles all API communication with AidSec backend
 */

if (!defined('ABSPATH')) exit;

class AidSec_API {
  private $api_url;
  private $license_key;
  private $timeout = 15;

  public function __construct() {
    $this->api_url = get_option('aidsec_api_url', 'https://aidsec.ch/api');
    $this->license_key = get_option('aidsec_license_key', '');
  }

  private function request($endpoint, $args = []) {
    if (empty($this->license_key)) {
      return new WP_Error('no_license', 'Kein Lizenz-Schlüssel konfiguriert');
    }

    $url = trailingslashit($this->api_url) . ltrim($endpoint, '/');
    $defaults = [
      'timeout' => $this->timeout,
      'headers' => [
        'Authorization' => 'Bearer ' . $this->license_key,
        'Content-Type' => 'application/json',
        'User-Agent' => 'AidSec-WP-Plugin/' . AIDSEC_PLUGIN_VERSION,
      ],
    ];

    $args = wp_parse_args($args, $defaults);
    $response = wp_remote_request($url, $args);

    if (is_wp_error($response)) return $response;

    $code = wp_remote_retrieve_response_code($response);
    $body = wp_remote_retrieve_body($response);
    $data = json_decode($body, true);

    if ($code >= 400) {
      $msg = $data['error'] ?? 'API-Fehler';
      return new WP_Error('api_error', $msg);
    }

    return $data;
  }

  public function check_headers($url) {
    return $this->request('check-headers', [
      'method' => 'GET',
      'body' => null,
    ]);
  }

  public function get_license_info() {
    return $this->request('license/status');
  }

  public function submit_scan_result($url, $result) {
    return $this->request('plugin/scan-result', [
      'method' => 'POST',
      'body' => json_encode([
        'url' => $url,
        'result' => $result,
        'plugin_version' => AIDSEC_PLUGIN_VERSION,
      ]),
    ]);
  }

  public function verify_license() {
    $info = $this->get_license_info();
    if (is_wp_error($info)) return false;
    return !empty($info['active']);
  }

  public function test_connection() {
    $test = $this->request('health', ['timeout' => 5]);
    if (is_wp_error($test)) return false;
    return true;
  }
}