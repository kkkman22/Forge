---
topic: worktree-spike
date: 2026-05-17
verdict: pass
blocking: false
update_after_lock: true
---

# Wave 0 Spike: Worktree Path Resolution + Dev Mode

## Environment

| Item | Value |
|------|-------|
| pwd | `/Users/king/code/Forge` |
| git root | `/Users/king/code/Forge` |
| branch | `feature/forge-single-entry-poc` |
| `CLAUDE_PLUGIN_ROOT` | **unset** (dev mode) |
| `CLAUDE_PLUGIN_DATA` | **unset** |
| global plugin install | **none** |
| HEAD | `0a0251c` |
| working tree | clean |

## Step 1: Dev Mode Lib Path Resolution

`CLAUDE_PLUGIN_ROOT` unset = dev mode. Dispatcher must support two modes:

| Mode | Trigger | Lib Root |
|------|---------|----------|
| **plugin install** | `CLAUDE_PLUGIN_ROOT` set | `${CLAUDE_PLUGIN_ROOT}/skills/forge/lib/` |
| **dev mode** | `CLAUDE_PLUGIN_ROOT` unset | `${cwd}/skills/forge/lib/` |

**Dev mode verification**:

```
realpath skills/forge/lib/zoom-out/instructions.md
→ /Users/king/code/Forge/skills/forge/lib/zoom-out/instructions.md (exists)

path.resolve(cwd, "skills/forge/lib", "zoom-out", "instructions.md")
→ lands within cwd: PASS
```

## Step 2: Worktree Behavior

5 worktrees exist, each with independent `skills/` git checkout. CWD-relative resolution works per-worktree. No silent shadow between worktrees.

## Step 3: Path Safety (Both Modes)

Attack vectors tested against `path.resolve(libRoot, input)`:

| Input | Result | Reason |
|-------|--------|--------|
| `../../../etc/passwd` | REJECT | escapes root |
| `/etc/passwd` | REJECT | escapes root (absolute) |
| `../../.env` | REJECT | escapes root |
| `zoom-out/../../../../../etc/shadow` | REJECT | escapes root |

**Symlink detection**: Created symlink `evil-symlink → /etc/passwd` in lib root. `realpath()` reveals target `/private/etc/passwd`. Dispatcher rejects by comparing `realpath(resolved)` starts with `realpath(libRoot)`.

**All 4 attacks rejected. Path safety works. PASS.**

## Step 4: Silent Shadow Check

**DEFERRED to ship phase.**

No plugin installed → "main install + worktree install" scenario untestable.

**Ship-phase verification plan**:
1. `claude plugin install file://$(pwd)` — install globally
2. In worktree, run `/forge zoom-out test` — observe lib root used
3. Failure → ship blocked, backport to v2.5.1

**Dispatcher design**: does NOT detect shadow. Trusts mode detection (CLAUDE_PLUGIN_ROOT set → plugin root; unset → cwd root).

## Step 5: Absolute Path Scan

```
grep -rn '/Users/\|/home/' skills/forge/lib/
→ zero hits
```

**PASS**. Deferred full scan after Task 6 migration.

## Plugin Mode Verification (R2.8b — ship phase)

### Method

Compiled dispatcher (`dist/src/forge-dispatcher.js`) loaded in Node.js with controlled env vars.

### Results

| Test | Env | cwd | Expected | Actual | Status |
|------|-----|-----|----------|--------|--------|
| T5a | `CLAUDE_PLUGIN_ROOT=/tmp/test-plugin-root` | default | `/tmp/test-plugin-root/skills/forge/lib/zoom-out/instructions.md` | matches | PASS |
| T5b | `CLAUDE_PLUGIN_ROOT=<plugin-cache>` | `/tmp/forge-worktree-test` | Uses plugin root, NOT worktree cwd | `path.startsWith(pluginCache)=true` | PASS |
| T5c | unset | `/tmp/forge-worktree-test` | `/tmp/forge-worktree-test/skills/forge/lib/zoom-out/instructions.md` | matches | PASS |
| T5d | unset | default (cwd) | cwd-based resolution | matches | PASS |
| T3 | — | — | Traversal `../etc/passwd` rejected | `E_PATH_INVALID` | PASS |

### Silent Shadow Verdict

**No silent shadow.** When `CLAUDE_PLUGIN_ROOT` is set (plugin install mode), `resolveLibPath` uses plugin root as base, ignoring cwd entirely. Worktree cwd does NOT override or shadow plugin root.

Path resolution priority: `opts.pluginRoot` > `process.env.CLAUDE_PLUGIN_ROOT` > `opts.cwd` > `process.cwd()` — set in `path-resolve.ts:31-34`.

### Plugin Cache Status

Current plugin cache at `~/.claude/plugins/cache/forge-official/forge/2.4.0/` still has **old layout** (`skills/forge-*/SKILL.md`), not new collapsed layout (`skills/forge/lib/<sub>/instructions.md`). This confirms R1.2 finding: cache refresh requires plugin update to v2.4.1+. Resolution mechanics are verified correct; content sync is a separate concern.

## Verdict: **PASS** (all criteria met)

| Criterion | Result |
|-----------|--------|
| Dev mode path resolution | PASS |
| Plugin mode path resolution (CLAUDE_PLUGIN_ROOT) | PASS |
| Silent shadow (worktree cwd vs plugin root) | PASS — no shadow |
| Path safety (traversal, absolute, symlink) | PASS |
| No absolute paths in lib/ | PASS |

**Not P0-block**: R2.8b verified. Dispatcher correctly prioritizes `CLAUDE_PLUGIN_ROOT` over `cwd`.

## Spec Updates Required

1. **R2.2**: Add dev mode path — `CLAUDE_PLUGIN_ROOT` unset → lib root = `${cwd}/skills/forge/lib/`
2. **R2.8**: Downgrade "silent shadow spike is P0 blocker" to "ship-phase manual evidence". Dev mode is first-class supported mode.

## Reproducible Commands

```bash
# Step 1
pwd && echo "${CLAUDE_PLUGIN_ROOT:-unset}"
realpath skills/forge/lib/zoom-out/instructions.md

# Step 3 — path safety
node -e "
const p = require('path');
const cwd = process.cwd();
const libRoot = p.resolve(cwd, 'skills/forge/lib');
const attacks = ['../../../etc/passwd', '/etc/passwd', '../../.env', 'zoom-out/../../../../../etc/shadow'];
for (const a of attacks) {
  const r = p.normalize(p.resolve(libRoot, a));
  console.log(a, r.startsWith(libRoot) ? 'ACCEPT(BUG)' : 'REJECT');
}
"
```
