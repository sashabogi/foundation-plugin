## Foundation v3.1 — Clean Session Verification Prompt

Copy-paste this into a fresh Claude Code session to verify everything works:

---

Foundation v3.1 verification session. Context-Mode was absorbed into Foundation
(demerzel_execute + demerzel_fetch). Context-Mode plugin is disabled.

Run these checks in order:

1. VERIFY CONTEXT-MODE IS GONE:
   - Confirm NO `<context_guidance>` tips appear on tool calls
   - Confirm `mcp__plugin_context-mode_*` tools are NOT available
   - Run a Bash command and a Read — should be clean, no "context-mode" noise

2. VERIFY FOUNDATION HOOKS ARE ACTIVE:
   - SessionStart: Check if `<foundation-context>` was injected in system prompt
   - PostToolUse: After a few tool calls, check `/tmp/foundation-session-$PPID.jsonl` exists
   - PreToolUse: Do a Glob search — should see `<foundation-tip>` nudge if cwd has snapshot
   - Report PASS/FAIL for each

3. TEST demerzel_execute (NEW TOOL):
   - Use ToolSearch to load: `ToolSearch("+foundation demerzel")`
   - Test shell: `demerzel_execute({ language: "shell", code: "echo hello && ls -la /tmp | head -5" })`
   - Test javascript: `demerzel_execute({ language: "javascript", code: "console.log(JSON.stringify({test: true, pid: process.pid}))" })`
   - Test python: `demerzel_execute({ language: "python", code: "print('hello from python')" })`
   - Test truncation: `demerzel_execute({ language: "shell", code: "seq 1 100000" })`
   - Test timeout: `demerzel_execute({ language: "shell", code: "sleep 60", timeout: 3000 })`
   - Verify: stdout captured, truncation works, timeout kills process

4. TEST demerzel_fetch (NEW TOOL):
   - Test HTML: `demerzel_fetch({ url: "https://example.com" })`
   - Test JSON: `demerzel_fetch({ url: "https://httpbin.org/json" })`
   - Verify: HTML stripped to clean text, JSON pretty-printed

5. TEST EXISTING TOOLS STILL WORK:
   - `demerzel_search({ pattern: "function" })` — should search snapshot
   - `memory_search({ queries: ["foundation"] })` — should return Gaia memories
   - Foundation UI: `node ~/.claude/plugins/cache/foundation-plugin/foundation/3.0.0/ui/server.mjs &`
     then `agent-browser open http://localhost:3333` — Brain tab should show 30+ memories

6. REPORT:
   - Table of PASS/FAIL for each check
   - Any issues found
