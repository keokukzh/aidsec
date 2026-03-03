# AidSec 1-Click-Plugin: Setup Guide

Dieses Plugin ist das MVP für die "Express Header Fix" Automatisierungs-Strategie.
Es verzichtet auf passworthafte Setups und setzt stattdessen auf die "Instant Gratification" via Plugin-Upload.

## 1. Stripe Setup

1. Erstelle ein neues Produkt in Stripe: **AidSec Express Header Fix** (z.B. 390 CHF).
2. Erstelle einen **Payment Link** für dieses Produkt.
3. Wichtig: Gehe in die Payment Link Einstellungen unter **Bestätigungsseite (Confirmation Page)**.
4. Wähle "Kunden nicht auf die Standard-Erfolgsseite weiterleiten". Stattdessen leitest Du sie um auf: `https://aidsec.ch/download-plugin.html` (Diese Seite müssen wir noch auf Deiner Website bauen).

## 2. Make.com Setup

1. Logge Dich bei Make.com ein und erstelle ein neues **Scenario**.
2. Wähle als erstes Modul **Webhooks -> Custom Webhook**.
3. Klicke auf "Add" und nenne den Webhook z.B. "AidSec Express Fix".
4. Kopiere die Webhook-URL, die Make.com Dir jetzt anzeigt.

## 3. Plugin Konfigurieren und Packen

1. Öffne die Datei `aidsec-express-fix.php`.
2. Gehe zu Zeile 35: `$webhook_url = 'https://hook.eu1.make.com/DEIN_WEBHOOK_HIER';`
3. Ersetze die URL mit der kopierten Make.com URL aus Schritt 2.
4. Fasse die Datei `aidsec-express-fix.php` (und optional eine index.php zur Sicherheit) in eine ZIP-Datei namens `aidsec-express-fix.zip` zusammen.
5. Lade diese ZIP-Datei auf Deinen Webserver (z.B. ins Hauptverzeichnis), sodass sie über `https://aidsec.ch/aidsec-express-fix.zip` heruntergeladen werden kann.

## 4. Make.com Workflow fertigstellen

1. **Webhook Datenstruktur erkennen:** Aktiviere das Plugin einmal testweise in einer eigenen WordPress-Installation, während in Make.com der Webhook auf "Determine data structure" läuft. Er wird die Felder `site_url`, `admin_email` und `site_name` empfangen.
2. **Modul hinzufügen (PDF):** Nutze z.B. das Modul "PDF Generator" oder "Google Docs -> Create Document from Template" um das Note A Zertifikat zu erstellen.
3. **Modul hinzufügen (Email/Gmail):** Sende dem Kunden (an `admin_email`) das generierte Zertifikat.
   - _Text beispiel:_ "Gratulation, Ihre Seite ist auf Note A. Hier ist Ihr Audit-Report. Möchten Sie noch sicherer werden? Buchen Sie das Cyber-Mandat."

Das war's. Ab sofort vollautomatisiert: Zahlung -> Download -> Aktivierung -> Security Headers gesetzt -> Webhook -> Zertifikat via Email.
