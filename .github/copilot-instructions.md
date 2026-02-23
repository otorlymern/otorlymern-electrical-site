<!-- Copilot / AI agent instructions for the OES static site repo -->

# Copilot Instructions — OES site

Purpose

- Help AI coding agents make productive, minimal, and reversible changes to this static-site repository.

Quick architecture summary

- This repository is a primarily static website: many hand-authored HTML files and a small Eleventy-powered area.
- Generated site output appears under `_site/` — do NOT edit files in `_site/` (they are build artifacts).
- Key source areas:
  - top-level HTML content and section folders (e.g. `services/`, `solutions/`, `systems/`, `video/`)
  - `css/` contains multiple style projects; see `css/system7.css/` which is an Eleventy subproject with its own `package.json` and `.eleventy.js`.
  - `scripts/` contains asset processing utilities used before publishing.

Important files & commands (examples)

- Local asset generation (images, PDFs, video thumbnails):
  - `./scripts/make-web-images.sh [MAXW] [QUALITY]`
  - `./scripts/make-web-pdfs.sh [PRESET]`
  - `./scripts/make-web-video.sh`
    These write to `scripts/assets-cmprsd/` and `images/video-thumbs/`.
- Publish workflow:
  - `./scripts/publish.sh` — pushes `main` and (optionally) triggers the GitHub "Deploy to Neocities" workflow.
  - Use `./scripts/publish.sh --deploy` to trigger the workflow non-interactively.
  - `gh` CLI and a working git remote are expected for the publish helper.
- Eleventy (style docs subproject):
  - `cd css/system7.css && npm run build` runs `npx eleventy --input=web`.
  - `npm run serve` runs Eleventy dev server for that subproject.

Project conventions and patterns

- Generated vs source: treat `_site/` as generated output; edit source files elsewhere.
- Asset pipeline: raw assets live in `scripts/assets-src/` and compressed/processed outputs in `scripts/assets-cmprsd/`. Prefer running the shell helpers instead of manual image/video edits.
- Small, focused subsystems: parts like `oes-patch-builder/` are self-contained (HTML + JS). Respect their local entry points when changing behavior.

Safety rules for AI changes

- Do not modify files inside `_site/` — instead change the source and run the relevant build script.
- Prefer edits that are isolated to a single section (e.g., `services/repairrequest.html`) and include a note in the PR description explaining the intent.
- When adding or changing automated scripts, ensure POSIX shell compatibility and keep `set -euo pipefail` style errors.

Integration points to watch

- GitHub Actions: publishing is handled via a workflow called "Deploy to Neocities" (triggered by `gh workflow run "Deploy to Neocities" --ref main`). Modifying that workflow requires care.
- External tooling: `gh` CLI (for publish), `ffmpeg` (video script), `gs`/Ghostscript (PDF script), `sips` (image script on macOS). Check scripts for required programs before modifying.

How to propose a change (PR checklist for the agent)

1. Make minimal change confined to source files (not `_site/`).
2. If assets were added/changed, run the appropriate `scripts/make-*` helper and include compressed outputs or update references.
3. If page content changed, preview locally (open the HTML file or run Eleventy in subprojects where applicable).
4. Provide a brief PR body: what changed, why, and a one-line test/verification step.

Where to look for examples

- `scripts/` — asset helpers and `publish.sh` (source of truth for build/publish steps).
- `css/system7.css/package.json` and `.eleventy.js` — Eleventy usage and scripts.
- `oes-patch-builder/` — small JS-driven subapp pattern in this repo.

If uncertain

- Ask the human maintainer for clarification before making changes that touch CI, deploy workflows, or cross-cutting build scripts.

Questions for you

- Anything missing or any conventions you want emphasized (commits, branch names, or PR label rules)?
