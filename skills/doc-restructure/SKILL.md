---
name: doc-restructure
description: |
  Pelorat — restructure a project's docs into a standard taxonomy and build the hierarchical
  AGENTS.md context tree. Moves docs into typed folders, archives superseded ones, generates an
  INDEX, and authors root + per-boundary AGENTS.md. Run /foundation:doc-inventory first.
  Trigger: /foundation:doc-restructure
user-invocable: true
---

# Pelorat — Documentation Restructure & AGENTS Tree

The second phase. Consumes the manifest from `/foundation:doc-inventory` and reshapes the docs into the
standard. Do it as ONE reviewable git commit (renames preserve history). See `PROJECT_STRUCTURE_STANDARD.md`.

## The standard (what every project ends up looking like)
```
<project>/
  AGENTS.md            # root: project-wide rules + Child Index (the hierarchical context tree)
  CLAUDE.md            # Claude-native; can stay full law or become a thin pointer to AGENTS.md
  docs/
    INDEX.md           # the human catalog (categorized, status-iconed)
    architecture/ specs/ plans/ runbooks/ decisions/ audits/ reference/ planned/ archive/
  <boundary>/AGENTS.md # LOCAL rules per durable boundary (services/, src/, db/, …)
```
Markdown is the single source of truth. Naming: `kebab-case.md`; superseding → move to `archive/` (never
delete) + forward-link. A child `AGENTS.md` may specialize but **never weakens a global non-negotiable**.

## Instructions

1. **Guard list.** Identify files that must NOT move: root `README.md`/`CLAUDE.md`/`CHANGELOG.md`, any
   design-system or skill files referenced by path, and cohesive subsystem clusters (keep them intact).
2. **Generate the move plan** from the manifest: LIVE/IMPLEMENTED/in-progress → `docs/<category>/<kebab>.md`;
   PLANNED → `docs/planned/`; SUPERSEDED/STALE → `docs/archive/`. Check for collisions. Show it for review.
3. **Execute** with `git mv` (preserves history). Create the taxonomy folders first.
4. **Rewrite cross-links** to the new paths (build an old→new map; fix relative + full-path forms). Emit a
   broken-link report for any residual.
5. **Generate `docs/INDEX.md`** from the manifest — grouped by category, each entry with a status icon.
6. **Author the AGENTS.md tree:** root `AGENTS.md` (project orientation + structural rules + the Child Index
   pointing to each child) and a child `AGENTS.md` at each durable boundary, seeded from any existing
   CLAUDE.md content + the project's known gotchas (pull from Foundation memories). Keep children to LOCAL
   rules only. Add the AGENTS-tree pointer to CLAUDE.md.
7. **Commit locally**, surface the diff, and let the user review before pushing. NEVER sweep unrelated
   working-tree changes into the commit — stage markdown only (`git add -A -- '*.md'`).

**Verification:** no flat docs left in `docs/`; INDEX lists every doc; the SessionStart AGENTS-walk hook
(shipped with Foundation) now auto-surfaces the root AGENTS.md — confirm it appears in a fresh session.
