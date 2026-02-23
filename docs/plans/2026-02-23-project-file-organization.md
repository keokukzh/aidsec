# Project File Organization — 2026-02-23

## Scope
- Target: `aidsec.ch` repository root
- Goal: full-project organization pass without breaking runtime paths
- Strategy: conservative cleanup + structure governance (no risky file moves)

## Current State (Project Files Only)
- Files: 80 (excluding `node_modules`, `.git`, generated outputs)
- Directories: 30 (excluding `node_modules`, `.git`, generated outputs)
- Main file types: `.html` (20), `.js` (14), `.md` (13), `.css` (10), `.json` (7)
- Largest top-level project assets:
  - `Scene_pingpong.mp4` (~9 MB)
  - `logonoback.PNG` (~1.11 MB)
  - `css/` (~0.58 MB)
  - `js/` (~0.34 MB)

## Duplicate Analysis
- Exact duplicate content (hash-based): **none found**
- Same filename in multiple folders (expected by framework/content structure):
  - `index.html` (6)
  - `onboarding.css` (2)
  - `onboarding.js` (2)
  - `check-headers.js` (2)

## Changes Applied (Safe, Non-Breaking)
1. Local helper scripts are ignored in git:
   - `scripts/reorder-sections.py`
   - `scripts/verify.py`
2. Repository remains path-stable (no runtime file moves)
3. Added this organization baseline document for future cleanup iterations

## Recommended Target Structure (No Immediate Moves)
The current structure is already close to ideal for this static/Vite hybrid project:

- `api/` — serverless endpoints
- `css/` — authored styles + generated font assets
- `js/` — client scripts + React island entry
- `onboarding/` — package-specific onboarding pages/assets
- `docs/plans/` — operational reports and plans
- `scripts/` — build/deploy helper scripts
- Root HTML pages (`index.html`, legal pages) for static hosting compatibility

## Optional Future Cleanup (Requires Explicit Approval)
1. Asset normalization:
   - Move large root media files into `assets/images/` and `assets/media/`
   - Update all references in HTML/CSS/JS
2. Onboarding script/style dedup audit:
   - Evaluate overlap between root and `onboarding/` scoped assets
3. Naming consistency:
   - Standardize image filename casing (`.PNG` -> `.png`) if deployment target is case-sensitive

## Maintenance Checklist
- Weekly: run `git status --short` and keep working tree clean
- Monthly: run `npm run lint` and `npm run build`
- Quarterly: re-run duplicate hash scan excluding dependencies
- Before releases: ensure only intended files are tracked and generated outputs are ignored

## Quick Commands
```powershell
# Project-only file count (exclude deps)
$root='C:\Users\aidevelo\Desktop\aidsec.ch';
$exclude='\\node_modules\\|\\\.git\\|\\js\\dist\\|\\css\\fonts\\';
(Get-ChildItem -Path $root -Recurse -File | Where-Object { $_.FullName -notmatch $exclude }).Count

# Top file types
Get-ChildItem -Path $root -Recurse -File |
  Where-Object { $_.FullName -notmatch $exclude } |
  Group-Object Extension | Sort-Object Count -Descending

# Exact duplicate check (hash-based)
# (No duplicates found in this run)
```
