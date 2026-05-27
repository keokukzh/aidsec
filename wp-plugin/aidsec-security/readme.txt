# AidSec Security WordPress Plugin

**Version:** 1.2.0

Optimiert Security Headers für WordPress-Websites und bringt sie auf Note A in 24 Stunden. nDSG-konform.

## Features

- **Auto-Hardening** — Security Headers automatisch setzen
- **Live-Scanner** — WordPress-Website auf Sicherheitslücken prüfen
- **nDSG-Modus** — Schweizer Datenschutz-konform
- **Dashboard** — Übersicht aller Security Headers
- **Lizenz-Management** — API-Anbindung an AidSec-Backend

## Installation

1. ZIP-Datei im WordPress Admin hochladen (Plugins > Neu installieren > Hochladen)
2. Oder Ordner via FTP in `/wp-content/plugins/` kopieren
3. Plugin aktivieren unter "Plugins"
4. Lizenz-Schlüssel unter AidSec Security > Einstellungen eingeben

## Lizenz-Schlüssel

Nach dem Kauf erhalten Sie einen Lizenz-Schlüssel (Format: `lic_...`) per E-Mail.
Dieser wird unter **AidSec Security > Einstellungen** eingegeben.

## System-Anforderungen

- WordPress 5.8+
- PHP 7.4+
- SSL (HTTPS) erforderlich

## Sicherheit

- Keine Zugriffe auf Mandantendaten
- Lizenz-Key geschützt gespeichert
- API-Kommunikation nur über HTTPS
- HMAC-Signatur für Webhook-Kommunikation

## Support

support@aidsec.ch | https://aidsec.ch/kontakt