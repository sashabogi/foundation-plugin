---
name: doc-portal
description: |
  Seldon — generate a browsable HTML documentation portal from a project's markdown docs.
  Markdown stays the source of truth; the portal is generated (never hand-maintained), styled
  with the project's design system, and served locally. Run after /foundation:doc-restructure.
  Trigger: /foundation:doc-portal
user-invocable: true
---

# Seldon — Documentation Portal (generated HTML)

The third phase: a human-readable portal so a sprawling project becomes legible at a glance. **The one
rule:** markdown is the single source of truth; the HTML is *generated* from it — never maintain both by
hand (that drift is the sprawl you're eliminating). See `PROJECT_STRUCTURE_STANDARD.md` (the three tiers).

## Instructions

1. **Pick the source.** The project's `docs/` taxonomy (after `/foundation:doc-restructure`), plus its
   `docs/INDEX.md` and `docs/_inventory/doc-manifest.json` (for status badges + an ecosystem overview).

2. **Scaffold a generator** at `<project>-portal/` (or `docs-portal/`): a small static-site build script
   (`build.mjs` with `markdown-it`) + a tiny static server (`serve.mjs` honoring `$PORT`). The generator:
   - walks `docs/**/*.md`, converts each to HTML, groups by the taxonomy folders;
   - rewrites `./x.md` cross-links to portal routes (`/section/x.html`);
   - applies a theme — **reuse the project's design system** if it has one (import its `tokens.css` /
     brand colors + fonts) so it's properly branded, not generic; otherwise a clean default dark theme;
   - emits a sidebar nav grouped by category with **status badges** from the manifest, and a landing page
     (hero + project/subsystem overview + browse-by-category).
   - `.gitignore` `node_modules/` + `dist/`.

3. **Build + serve.** `node build.mjs` → `dist/`; serve with `portless <name> "$(pwd)/run.sh"` (portless
   needs a single-token command, so wrap the server in an executable `run.sh`) → stable
   `http://<name>.localhost:1355`. Verify it renders (screenshot the index + one doc page).

4. **For a multi-repo ecosystem:** ingest each repo's `docs/` as its own portal section, and hand-author
   (MDX) an overview page mapping how the repos connect.

**Verification:** the portal renders the real docs with correct theme + working cross-links; rebuilding
after any `.md` edit reflects the change (no second hand-maintained copy). Screenshot to confirm design.
