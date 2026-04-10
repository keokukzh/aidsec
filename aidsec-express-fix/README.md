# AidSec Express Fix WordPress Plugin

**Version: 2.0.0**

Automatische WordPress Security Header Optimierung für Schweizer Kanzleien und Praxen.

## Features

- ✅ **Auto-Server-Detection** - Erkennt Apache, Nginx, LiteSpeed und Cloudflare
- ✅ **Security Headers** - Implementiert alle wichtigen HTTP-Security-Headers
- ✅ **Automatische Verifizierung** - Prüft nach Aktivierung ob Headers korrekt gesetzt sind
- ✅ **Webhook-Integration** - Sendet Aktivierungsdaten an AidSec Backend
- ✅ **nDSG-Compliance** - Konform mit Art. 8 nDSG

## Installierted Headers

| Header | Beschreibung |
|--------|--------------|
| Strict-Transport-Security | Erzwingt HTTPS (1 Jahr + Preload) |
| X-Frame-Options | Verhindert Clickjacking |
| X-Content-Type-Options | Verhindert MIME-Sniffing |
| X-XSS-Protection | XSS-Filter aktivieren |
| Referrer-Policy | Kontrolliert Referrer-Daten |
| Permissions-Policy | Beschränkt Browser-APIs |
| Content-Security-Policy | Frame-Ancestors (bei Cloudflare) |

## Server-Kompatibilität

| Server | Status | Hinweis |
|--------|--------|---------|
| Apache | ✅ Vollständig | mod_headers erforderlich |
| Nginx | ✅ Vollständig | Direkte Header-Setzung |
| LiteSpeed | ✅ Vollständig | OpenLiteSpeed kompatibel |
| Cloudflare | ✅ Unterstützt | CSP als Fallback für X-Frame |
| Varnish | ⚠️ Partial | Zusätzliche Konfiguration nötig |

## Installation

1. Plugin-Datei `aidsec-express-fix.php` in `/wp-content/plugins/aidsec-express-fix/` hochladen
2. Im WordPress-Backend unter "Plugins" aktivieren
3. Bei Aktivierung werden automatisch alle Security Headers gesetzt

## Konfiguration

### Server-Erkennung

Das Plugin erkennt automatisch den Server-Typ:

```
Apache → .htaccess Headers (empfohlen)
Nginx → Direkte Header-Injection
Cloudflare → CSP-Header zusätzlich
```

### Webhook-URL

Die Webhook-URL für Make.com / Automatisierung:

```
https://hook.eu1.make.com/h6sbfnewo9cf03j3lk8umcyxnlkabk8c
```

### Verifizierung

Nach Aktivierung wird automatisch geprüft:
1. Sind alle Headers gesetzt?
2. Erreicht die Seite Note A bei SecurityHeaders.com?

## Troubleshooting

### Headers werden nicht gesetzt

1. **Prüfen Sie ob WP_DEBUG aktiviert ist:**
   ```php
   define('WP_DEBUG', true);
   ```

2. **Prüfen Sie die Server-Kompatibilität:**
   - Apache: mod_headers aktiviert?
   - Nginx: Direkte Konfiguration in nginx.conf nötig

3. **Cloudflare:**
   - CSP-Header kann X-Frame-Options blockieren
   - In Cloudflare Dashboard: "Email RFC 8485" deaktivieren

### Plugin funktioniert nicht

1. WordPress Cache leeren (WP Super Cache, W3TC, etc.)
2. Server-neustart nach .htaccess Änderungen
3. Hosting-Provider kontaktieren falls mod_headers nicht verfügbar

## Changelog

### 2.0.0
- Auto-Server-Detection implementiert
- Permissions-Policy Header hinzugefügt
- Verbessertes Error-Handling
- REST-API Endpoint für Status-Abfrage
- Shortcode für Trust-Badge

### 1.0.0
- Initiale Version
- Basis Security Headers
- Webhook-Integration

## Support

**AidSec**
- E-Mail: info@aidsec.ch
- Website: https://aidsec.ch

## Lizenz

GPL2
