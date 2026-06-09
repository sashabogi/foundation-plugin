# Project Structure Standard & Documentation Refactor Plan

> Status: PLAN (approved decisions, not yet executed) · Created 2026-06-08
> Origin: adapted from the DOX hierarchical-docs pattern + the harness analysis
> (see HARNESS_IMPROVEMENT_ANALYSIS.md). Pilot target: `/Users/sashabogojevic/development/crebral`.

## Why
Crebral alone has **157 markdown docs (98 dumped flat in `docs/`)** with no taxonomy, plus 13
tied-together sibling repos (legal, pilot-v2, desktop-lite, ios, gateway, fleet, builtbetter…).
Result: impossible to discern *what was built and how*. We standardize so every project looks the
same, old projects get cleaned up, and a human-readable ecosystem portal makes it all legible.

## The three documentation tiers (the core mental model)
| Tier | Format | Audience | Maintained |
|---|---|---|---|
| **1. Agent context** | `AGENTS.md` + thin `CLAUDE.md` | the agent | hand · markdown · hook-walked by cwd · Gaia-indexed |
| **2. Source-of-truth docs** | `.md` / `.mdx` in taxonomy | agent + human (git) | hand · diffable |
| **3. Presentation portal** | generated **HTML** (design-system styled, served) | human (browser) | **build step from tier 2 — never hand-maintained twice** |

**The inviolable rule:** markdown is the single source of truth; HTML is *generated*. No doc is ever
hand-maintained as both `.md` and `.html`. That drift is the exact sprawl we are eliminating.

---

## A. Canonical project layout (every repo adopts this)
```
<project>/
  AGENTS.md            # REAL: project-wide rules + Child Index (pointers to child AGENTS.md)
  CLAUDE.md            # THIN: "Claude Code — read AGENTS.md and its tree; floor rules in ~/.claude/CLAUDE.md"
  README.md            # human entry: what this is, quickstart, links into docs/
  CHANGELOG.md
  docs/
    INDEX.md           # catalog of every doc, categorized + tagged (the human map)
    architecture/      # how the system works (system/gateway/frontend/backend design)
    specs/             # product & feature specs
    plans/             # implementation / migration / rollout plans
    runbooks/          # operational: deploy, security, infra, incident procedures
    decisions/         # ADRs — lightweight Architecture Decision Records (going forward)
    audits/            # point-in-time audits & analyses (dated)
    reference/         # stable reference (core reference, model lists, brand)
    archive/           # superseded/dead docs, kept for history (never deleted, just demoted)
  src/ services/ workers/ ...   # each durable boundary gets its own AGENTS.md
    <area>/AGENTS.md   # LOCAL rules for that area only
```

### Naming conventions
- Docs: **`kebab-case.md`** inside `docs/` (e.g. `gateway-architecture.md`).
- Canonical caps files keep caps: `README.md`, `AGENTS.md`, `CLAUDE.md`, `CHANGELOG.md`, `INDEX.md`.
- Dated artifacts (audits): suffix ISO date — `design-token-audit-2026-05-14.md`.
- One concept = one doc. Superseding a doc → move the old one to `archive/`, link forward.

## B. The AGENTS.md hierarchy (adapted DOX, hook-enforced not faith-based)
- **Root `AGENTS.md`** = project-wide rules + a **Child Index** listing every child `AGENTS.md` and
  what it governs (so the tree is traversable without scanning the filesystem).
- **Child `AGENTS.md`** = only the *local* rules for that area (the gateway env-var gotcha lives in
  `services/gateway/AGENTS.md`, not the root).
- **Specificity gradient:** broad at root, concrete at leaves. A session loads only the root→cwd chain.
- **Inviolable floor (harness #3):** a child may add/specialize but **may NOT weaken** a global
  non-negotiable (security rules, Definition-of-Done, absolute-paths). Floor lives in `~/.claude/CLAUDE.md`.
- **Closeout (harness #6):** after a structural change, the touched area's `AGENTS.md` is updated;
  the DoD gate warns if structure changed but its `AGENTS.md`/docs didn't.
- **Automated, not manual:** the Foundation SessionStart hook reads `cwd`, walks root→cwd, injects the
  nearest `AGENTS.md` chain, and dual-writes each to Gaia (tier=project) so they're FTS5/semantic-
  searchable. This is harness improvement #1 — it unifies the parallel MEMORY.md ↔ Gaia stores.

## C. The unified ecosystem portal (tier 3)
- A single app (`~/development/crebral-ecosystem-portal/`) that ingests each repo's `docs/` taxonomy
  as content, renders MDX/markdown to **designed HTML** using the **Crebral design system**
  (`crebral/design-system/tokens.css` + brand tokens — teal/amber, Sora/DM Sans/JetBrains Mono).
- Served like `foundation ui` (a local port via `portless`), constantly rebuilt as docs change.
- Sections: **Ecosystem overview + interconnection map** (how the 14 repos tie together) · per-project
  area (Crebral, Legal, Pilot v2, Desktop Lite, iOS, Gateway, Fleet, BuiltBetter…) · **feature
  inventory** (what's built, where) · architecture diagrams (real components, not ASCII wireframes).
- Front-door/overview pages authored in **MDX** (hand-designed, real components); deep specs are plain
  markdown that renders in. Build tool TBD in Phase 3 (Astro content-collections vs Next+MDX — Astro
  fits docs better; Next eases direct design-system component reuse).

---

## Implementation plan (phased)

### Phase 0 — Inventory & classify (Crebral) — *do first, low risk, read-only*
Fan out agents to read all 157 Crebral docs and produce a manifest: for each doc → category
(architecture/spec/plan/runbook/decision/audit/reference), status (LIVE / STALE / SUPERSEDED-BY-X),
the durable boundary it belongs to, and proposed new kebab path. Output = a classification table that
drives every later move. No files touched yet.

### Phase 1 — Restructure Crebral docs (hybrid cleanup)
Create the `docs/` taxonomy folders; move LIVE docs into them (kebab-renamed); move STALE/SUPERSEDED to
`docs/archive/` with forward-links; rewrite internal cross-links; generate `docs/INDEX.md`. Commit.

### Phase 2 — Author the AGENTS.md tree (Crebral)
Write the root `AGENTS.md` (rules + Child Index) + shrink `CLAUDE.md` to a pointer; author child
`AGENTS.md` at the real boundaries (`services/`, `services/gateway/`, `src/`, `workers/`, `supabase/`,
`design-system/`) — seeding each from existing scattered CLAUDE.md content + Gaia gotcha memories.

### Phase 3 — Stand up the ecosystem portal (Crebral section first)
Scaffold `crebral-ecosystem-portal`, wire it to read Crebral's new `docs/` taxonomy, style with the
design system, serve via portless. Hand-build the ecosystem overview + interconnection map. Verify it
renders the real docs.

### Phase 4 — Harness enforcement (the three rule-keepers)
Implement harness #1 (SessionStart AGENTS.md cwd-walk + Gaia dual-write), #3 (inviolable-floor guard),
#6 (Closeout doc-currency warning in verify-done-gate.py). This is what keeps the structure from rotting.

### Phase 5 — Extract template + rules, then propagate
Freeze the Crebral result into a reusable **template** (skeleton dirs + AGENTS.md stubs + portal
adapter) and a short **STRUCTURE_RULES** checklist. Apply to the family in waves (legal, pilot-v2,
ios, desktop-lite, gateway, fleet, builtbetter.ai…), each adding its section to the unified portal.

## Sequencing note
Phase 0 is pure read-only recon and should run before anything is moved. Phases 1–2 are the big
mechanical cleanup (parallelizable via agents). Phase 4 can run in parallel with 3. Do NOT mass-move
files (Phase 1) across all 14 repos before the Crebral pilot proves the taxonomy (Phase 5 gate).
