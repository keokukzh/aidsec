# Design Plan: Lead Generation & Knowledge Base (Phase 4)

Date: 2026-02-20
Status: Approved

## 1. Goal

Professionalize the AidSec website by building a high-authority Knowledge Base to drive SEO and an integrated Lead Generation system to capture high-value prospective clients (lawyers, doctors).

## 2. Architecture

Following the existing AidSec architecture for maximum speed and security.

- **Storage**: Pure static HTML files.
- **Directory**: `/wissen/` for articles.
- **Article Structure**:
  - Standard AidSec header/footer.
  - Semantic content structure (`<article>`, `<section>`, `<aside>`).
  - Integrated Table of Contents for long-form content.

## 3. Components

### 3.1 Knowledge Base Nav

- **Main Nav**: Replace "Meldungen" with "Wissen".
- **Index View**: A grid of article cards with category tags (Security, Legal, Practice-Mgmt).

### 3.2 Lead-Magnet Duo

- **Topic 1**: nDSG-Compliance Checkliste 2026 (Legal focus).
- **Topic 2**: Ransomware Prevention Roadmap (Safety focus).

### 3.3 Acquisition UI

- **Inline CTA Card**:
  - Styled with `--navy` background and `1px` gold border.
  - Placed strategically within articles after the first 30% of content.
- **Exit-Intent Popup**:
  - Glassmorphic overlay (`backdrop-filter: blur(12px)`).
  - Fade-in animation triggered by `window.onmouseleave`.
  - Headline: "Sichern Sie Ihre Kanzlei ab, bevor Sie gehen."

## 4. Data Flow

1. **Form Submission**: Extended `form.js` with `lead_type` parameter.
2. **Backend**: Netlify forms capturing lead data.
3. **Automation**: HubSpot auto-responder triggering PDF delivery via email.
4. **Analytics**: `aidsec:lead_gen` custom event in Plausible.

## 5. Implementation Roadmap

1. Setup directory structure and global knowledge styles.
2. Build the first two "Pillar" articles.
3. Implement the Inline CTA component.
4. Implement the Exit-Intent Popup logic and UI.
5. Setup HubSpot auto-responders.
