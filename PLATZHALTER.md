# AidSec — Deploy-Anleitung

Die Website ist für Netlify vorbereitet. Alle Platzhalter wurden durch die korrekten Angaben ersetzt.

## Aktueller Stand

- **Anbieter:** Aid Destani (AidSec), Volketswil, Zürich
- **Kontaktformular:** Netlify Forms (funktioniert automatisch nach Deploy)
- **Security-Check-Widget:** Netlify Function unter `/api/check-headers`
- **Impressum, AGB, Datenschutz:** Vollständig ausgefüllt

## Netlify Deploy

1. Repository mit Netlify verbinden (GitHub/GitLab/Bitbucket)
2. Build-Einstellungen werden aus `netlify.toml` gelesen
3. Deploy starten — fertig

Nach dem Deploy:
- Formular-Eingänge erscheinen unter **Site → Forms** im Netlify-Dashboard
- Security-Check-Widget funktioniert unter `/api/check-headers`

## Optional: Plausible Analytics

Falls Sie Besucherstatistiken nutzen möchten (cookieless, nDSG-konform):

1. `plausibleDomain` in `config.json` eintragen (z.B. `aidsec.ch`)
2. `npm run fill` ausführen
3. **Netlify Redirect:** In `netlify.toml` ist ein Redirect für `/js/plausible.js` → Plausible-Script hinterlegt. Nach `npm run fill` wird das Script in `index.html` aktiviert.

## Optional: hCaptcha (Spam-Schutz)

`hCaptchaSiteKey` in `config.json` eintragen, dann `npm run fill` ausführen.

## Security Headers prüfen

Nach dem Deployment: `npm run verify-headers` oder https://securityheaders.com/?q=https://aidsec.ch
