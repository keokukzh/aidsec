# Full Repository Review — 2026-02-23

## Scope
- Whole repository baseline (`main`)
- Dimensions: Security, Code Quality, Performance, Deployment Config, Content QA
- Deliverable: prioritized issue list

## Automated Checks
- `npm run lint`: pass
- `npm run build`: pass (`js/dist/hero-app.js` bundle reported as 318.43 kB, gzip 102.38 kB)
- `npm run verify-headers`: warning (grade parsing returned `?`)

## Prioritized Findings

### Critical

1. **SMTP configuration error response leaks internal runtime details**
   - Evidence:
     - `api/onboarding-submit.js:212`
     - `api/onboarding-submit.js:215`
   - Risk:
     - Exposes internal environment-key naming to external callers, increasing recon value for attackers.
   - Recommendation:
     - Return a generic server error externally; log detailed missing-key diagnostics only server-side.

### High

2. **Cross-origin POST to onboarding endpoint is wide open (`*`)**
   - Evidence:
     - `api/onboarding-submit.js:172`
   - Risk:
     - Any website can send requests to your endpoint, increasing spam/abuse pressure.
   - Recommendation:
     - Restrict CORS origin to first-party domains only (or remove CORS headers if browser cross-origin is not required).

3. **WordPress credentials are collected and forwarded via plain email body**
   - Evidence:
     - `onboarding/rapid-header-fix/index.html:84`
     - `onboarding/kanzlei-haertung/index.html:84`
     - `onboarding/cyber-mandat/index.html:84`
     - `api/onboarding-submit.js:83`
     - `api/onboarding-submit.js:132`
   - Risk:
     - Email is not a secure secret transport/store medium; credential exposure blast radius is high.
   - Recommendation:
     - Avoid collecting/storing raw passwords; use one-time secure vault link or temporary credential workflow.

### Medium

4. **Rate limiting is in-memory and not durable in serverless runtime**
   - Evidence:
     - `api/onboarding-submit.js:3`
     - `api/onboarding-submit.js:5`
     - `api/onboarding-submit.js:15`
   - Risk:
     - Can be bypassed across cold starts/instances; limited abuse protection under load.
   - Recommendation:
     - Move rate limit state to durable storage (edge rate limiting, KV/Redis, or provider-level WAF rules).

5. **Client-side HTML insertion pattern uses `innerHTML` with server-provided labels**
   - Evidence:
     - `js/main.js:358`
     - `js/main.js:363`
   - Risk:
     - Current values are controlled by your API, but this pattern is fragile and can become an XSS vector if labels ever become user-influenced.
   - Recommendation:
     - Build DOM nodes via `textContent`/`appendChild` instead of interpolating HTML.

6. **Header verification script parser is brittle and deployment hint is stale**
   - Evidence:
     - `scripts/verify-security-headers.js:32`
     - `scripts/verify-security-headers.js:33`
     - `scripts/verify-security-headers.js:37`
   - Risk:
     - Produces uncertain grade (`?`) and points maintainers to Netlify config while project deploy guidance emphasizes Vercel.
   - Recommendation:
     - Use stable parsing/source for grade extraction and align warning text with active deployment target.

7. **CSP still allows `'unsafe-inline'` for scripts/styles**
   - Evidence:
     - `vercel.json:29`
   - Risk:
     - Weakens XSS protection compared to nonce/hash-based CSP.
   - Recommendation:
     - Gradually remove inline JS/CSS and migrate to nonce/hash strategy.

### Low

8. **Onboarding templates include unresolved `{{name}}` placeholders in hidden subject fields**
   - Evidence:
     - `onboarding/rapid-header-fix/index.html:46`
     - `onboarding/kanzlei-haertung/index.html:46`
     - `onboarding/cyber-mandat/index.html:46`
   - Risk:
     - Confusing/unused template residue (current backend computes subject itself).
   - Recommendation:
     - Remove or replace these placeholders to avoid ambiguity.

9. **`.gitignore` excludes entire `scripts/` directory despite tracked scripts in use**
   - Evidence:
     - `.gitignore:14`
     - `package.json:9`
     - `package.json:10`
     - `package.json:11`
   - Risk:
     - New script files can be silently untracked, causing tooling drift and onboarding confusion.
   - Recommendation:
     - Remove broad `scripts/` ignore; ignore only generated artifacts explicitly.

## Additional Notes
- A local secret was observed in ignored file `.env.local`; it is not currently tracked, but token rotation is advised if exposure occurred outside local environment.
- Build and lint status are healthy overall; highest leverage is in API hardening and secrets-handling workflow.

## Suggested Remediation Order
1. Stop leaking SMTP diagnostics to clients.
2. Restrict CORS for onboarding endpoint.
3. Replace password-over-email workflow.
4. Implement durable anti-abuse controls.
5. Tighten CSP and remove unsafe HTML insertion patterns.
6. Fix header verification script reliability and deployment messaging.
7. Cleanup template placeholders and `.gitignore` script rule.
