---
name: doc-inventory
description: |
  Pelorat — reconcile a project's documentation against reality: classify every doc
  (category/status/boundary), resolve version/supersession clusters, and optionally scan
  the code to find work that's BUILT but undocumented (and docs describing unbuilt features).
  Trigger: /foundation:doc-inventory
user-invocable: true
---

# Pelorat — Documentation Inventory & Reconciliation

The first phase of organizing a sprawling project's docs. Produces a structured **manifest** that
becomes the blueprint for `/foundation:doc-restructure`. Named for Janov Pelorat, the Foundation's
historian who catalogs and preserves knowledge. See `PROJECT_STRUCTURE_STANDARD.md` in the plugin docs.

## Instructions

1. **Enumerate** every markdown doc in the project (`find . -name '*.md'`, excluding `node_modules`,
   `.next`, `.git`, and any existing `docs/_inventory/`). Report the count and where they cluster.

2. **Classify (fan out — cheap is correct).** Partition the list and classify each doc into a manifest
   entry. Delegate the bulk classification to cheap models (Workflow with `model:'sonnet'/'haiku'`, or
   `scrooge -t extract -d easy`). For each doc read only the head + heading outline (`sed -n '1,70p'` +
   `grep -nE '^#{1,3} '`) — do NOT read whole files. Each entry:
   - `path`, `title`, `category` (architecture · spec · plan · runbook · decision · audit · reference ·
     planned · launch-marketing · other), `status` (LIVE · STALE · SUPERSEDED · ALREADY-ARCHIVED · UNSURE),
     `supersededByGuess`, `boundary` (subsystem), `proposedPath` (`docs/<category>/<kebab>.md`; stale/
     superseded → `docs/archive/`), `confidence`, `note`.

3. **Resolve clusters (one synthesizer, smarter model).** Merge the partitions; have one agent resolve
   version/supersession clusters (e.g. `SPEC` vs `SPEC_V2`, `X_PLAN` vs `X_SYSTEM`, dup copies), pick the
   canonical, sanity-check the taxonomy fit, and list docs that genuinely need a human decision.

4. **(Optional but recommended) Code-vs-docs reconciliation.** If the user wants to know what's built but
   undocumented: build a per-area capability digest (routes, migrations, services, workers, key file
   contents) and extract capabilities via `scrooge -t long-context/extract` (gemini for big digests,
   deepseek for code). Then gap-check: capabilities with no LIVE doc = **undocumented work to backfill**;
   docs with no code evidence = **planned/not-built** (reclassify). Cross-check against the last ~30 days
   of git log + Foundation memories to catch operational/infra knowledge that lives only in memory.

5. **Persist** the manifest to `docs/_inventory/doc-manifest.json` (+ a resolution/clusters file). This is
   the input to `/foundation:doc-restructure`. Present a tight summary: counts by category/status, the
   clusters, the need-decision list, and any undocumented-work findings — and let the user adjust before
   any files move.

**Verification:** every input doc appears in the manifest exactly once; the taxonomy fits (few/no 'other');
no files are moved in this phase (read-only).
