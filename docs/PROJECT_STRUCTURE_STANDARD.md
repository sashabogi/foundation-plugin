# Project Structure Standard

> The documentation-architecture standard that the Foundation **Seldon** skills
> (`/foundation:doc-inventory`, `/foundation:doc-restructure`, `/foundation:doc-portal`)
> reshape a project toward. Adapted from the hierarchical-`AGENTS.md` ("DOX") pattern.

## Why

Large projects accumulate hundreds of flat markdown docs with no taxonomy. The result is
that it becomes impossible to tell *what was built and how*, or which docs are still true.
This standard makes every project look the same, lets old docs be cleaned up safely, and
makes the whole thing legible to both agents and humans.

## The three documentation tiers (the core mental model)

| Tier | Format | Audience | Maintained |
|---|---|---|---|
| **1. Agent context** | `AGENTS.md` + thin `CLAUDE.md` | the agent | hand · markdown · hook-walked by cwd · memory-indexed |
| **2. Source-of-truth docs** | `.md` / `.mdx` in a taxonomy | agent + human (git) | hand · diffable |
| **3. Presentation portal** | generated **HTML** (design-system styled, served) | human (browser) | **build step from tier 2 — never hand-maintained twice** |

**The inviolable rule:** markdown is the single source of truth; HTML is *generated*. No doc
is ever hand-maintained as both `.md` and `.html`. That drift is the exact sprawl this
standard eliminates.

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
    architecture/      # how the system works (system/service/frontend/backend design)
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

## B. The AGENTS.md hierarchy (hook-enforced, not faith-based)

- **Root `AGENTS.md`** = project-wide rules + a **Child Index** listing every child `AGENTS.md`
  and what it governs (so the tree is traversable without scanning the filesystem).
- **Child `AGENTS.md`** = only the *local* rules for that area (e.g. a gateway env-var gotcha
  lives in `services/gateway/AGENTS.md`, not the root).
- **Specificity gradient:** broad at the root, concrete at the leaves. A session loads only the
  root→cwd chain.
- **Inviolable floor:** a child may add/specialize but **may NOT weaken** a global non-negotiable
  (security rules, Definition-of-Done, absolute-paths). The floor lives in `~/.claude/CLAUDE.md`.
- **Closeout:** after a structural change, the touched area's `AGENTS.md` is updated; the SessionEnd
  hook warns if code changed under an `AGENTS.md` area but that file wasn't.
- **Automated, not manual:** the Foundation SessionStart hook reads `cwd`, walks root→cwd, and
  injects the nearest `AGENTS.md` chain into a `<foundation-agents>` context block — so path-local
  rules load automatically without a faith-based "remember to re-walk" instruction.

## C. The presentation portal (tier 3, optional)

- A generator reads each project's `docs/` taxonomy as content and renders markdown/MDX to
  **designed HTML** styled with the project's own design system, served locally (e.g. via a
  local port) and rebuilt as docs change.
- Front-door / overview pages are authored in **MDX** (hand-designed, real components); deep specs
  are plain markdown that renders in.
- Markdown remains the single source of truth; the portal is generated, never hand-maintained twice.
  `/foundation:doc-portal` produces this from the markdown.

---

## Suggested rollout (per project)

1. **Inventory & classify** (`/foundation:doc-inventory`) — read every doc, produce a manifest:
   category (architecture/spec/plan/runbook/decision/audit/reference), status (LIVE / STALE /
   SUPERSEDED-BY-X), the durable boundary it belongs to, and a proposed kebab path. No files moved yet.
2. **Restructure** (`/foundation:doc-restructure`) — create the taxonomy folders; move LIVE docs in
   (kebab-renamed); move STALE/SUPERSEDED to `archive/` with forward-links; rewrite cross-links;
   generate `docs/INDEX.md`; author the root + per-boundary `AGENTS.md` tree.
3. **Portal** (`/foundation:doc-portal`) — generate the browsable HTML portal from the markdown.

Inventory is pure read-only recon and should run before anything is moved. Prove the taxonomy on one
project before propagating the template across a family of related repos.
