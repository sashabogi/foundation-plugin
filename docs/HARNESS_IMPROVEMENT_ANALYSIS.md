# Harness Improvement Analysis — GraphiFy · DOX · Agent Zero vs. Our Foundation Stack

> Generated 2026-06-08 from a 5-agent workflow that deep-read three external repos and our own
> harness, then synthesized (Opus). Claims below were verified against plugin source on disk.

## Repos reviewed
- **GraphiFy** (`github.com/safishamsi/graphify`, Python, YC S26) — `/graphify` builds a queryable
  knowledge graph (`graph.html` + `GRAPH_REPORT.md` + `graph.json`) of a project; "The Memory Layer."
- **DOX** (`github.com/agent0ai/dox`) — zero-dependency hierarchical `AGENTS.md` framework: walk the
  docs tree root→target before editing, update affected docs after.
- **Agent Zero** (`github.com/agent0ai/agent-zero`) — full agentic framework (Docker Linux + desktop +
  plugin hub + Skills + in-process subordinate agents).

## Our stack (for reference)
Foundation plugin: **Demerzel** (codebase snapshots — import/export graph + symbol index),
**Gaia** (local SQLite+FTS5 memory graph w/ typed links + checkpoints), **Open Brain** (cloud
pgvector semantic memory), zero-token lifecycle **hooks**, lazy-loaded **skills**, 7 essential MCP
tools. Plus: `CLAUDE.md` operating contract (abs paths, Definition-of-Done verify gate, working-mode
orchestration), **Workflow/Agent** multi-agent primitives, **RTK** token optimization, **scrooge**
cheap-LLM delegation. Auto-memory = `MEMORY.md` index of typed memory files.

Two corrections verified on disk: (1) the live Foundation MCP server **does** register
`demerzel_semantic_search` + all 16 `gaia_*` tools (so semantic search is a capability we HAVE);
(2) Claude Code exposes exactly five hook events — `PreToolUse, PostToolUse, SessionStart, Stop,
SubagentStop` — there is **no `SubagentStart`**.

## Verdicts
| Repo | Call | One-line justification |
|---|---|---|
| **DOX** | **ADOPT concept / ADAPT mechanism** | Solves our real gap: `CLAUDE.md`+`MEMORY.md` are globally flat (no locality). But hook-automate + Gaia-index it; don't rely on faith-based re-walks. |
| **GraphiFy** | **ADAPT one feature** | Near-direct Demerzel competitor; we beat it on semantic search. Take only its typed **call-graph + confidence labels**; do NOT adopt `graph.json` as a store (shadows Gaia). |
| **Agent Zero** | **SKIP framework / ADAPT 2 patterns** | Container + in-process shared-context subordinates are *less safe* than our isolated-worktree agents. Take only `triggers:` skill frontmatter and persistent-vs-ephemeral context split. |

## Ranked improvements
| # | Improvement | From | Touches | Effort |
|---|---|---|---|---|
| 1 | **Per-directory `CONTEXT.md`/`AGENTS.md` tree, Gaia-indexed**, hook-surfaced by cwd. Highest leverage — gives context locality AND unifies the parallel MEMORY.md↔Gaia stores. | DOX | CLAUDE.md / Gaia / hooks | M |
| 2 | **Call-graph + confidence edges** in Demerzel snapshot (+ `find_callers`, cross-lang phantom-edge suppression for py/ts/go monorepos). | GraphiFy | Demerzel | L |
| 3 | **Inviolable-floor guard** — flag when a local doc tries to weaken a global non-negotiable (security/DoD/abs-paths). | DOX hard floor | CLAUDE.md / hooks | S |
| 4 | **Snapshot auto-staleness nudge** — PostToolUse edit-counter vs snapshot mtime. | GraphiFy git-hook rebuild | Demerzel / hooks | M |
| 5 | **`triggers:` skill frontmatter** → auto-suggest 1-2 skills on first message. | Agent Zero | skills / hooks | M |
| 6 | **Closeout doc-currency check** in the DoD gate (warn if structure changed but docs didn't). | DOX Closeout | hooks / CLAUDE.md | S |
| 7 | **Retire 12 dead `seldon_*` tool stubs** still consuming deferred-schema budget. | our own cruft | Foundation MCP | S |

## What NOT to do
- ❌ Don't stand up `graph.json` as a memory store (third parallel store vs Gaia + MEMORY.md).
- ❌ Don't port Agent Zero's framework (container + shared-context subordinates + dirty-JSON parsing all regress Claude Code natives).
- ❌ Don't make hierarchical docs a mandatory re-walk agent instruction (collapses under context pressure) — index in Gaia, surface via hook, automatic not faith-based.
- ❌ Don't add a `SubagentStart` workaround — it re-pays memory/snapshot token cost per fan-out agent. Pass context in the dispatch prompt.

## First two prototypes
1. **Path-local context tree in SessionStart hook** — pilot on `crebral/`. Touches the SessionStart
   hook + `foundation-plugin/src/memory/gaia.mjs`. (This is the one that connects to the project-
   structure standardization effort — see PROJECT_STRUCTURE_STANDARD.md once written.)
2. **Call-graph edges** — JS/TS-only thin slice in `src/demerzel/snapshot.mjs` + `search.mjs`.

---
*Source paths: `foundation-plugin/src/demerzel/{snapshot,search,analyze,index}.mjs` ·
`foundation-plugin/src/memory/gaia.mjs` · `~/.claude/settings.json` · `~/.claude/CLAUDE.md` ·
`~/.claude/engineering-standards.md`*
