---
feature: phase-auto-advance-enforcement
status: locked
created: 2026-06-01
---

# Design: Phase Auto-Advance Enforcement

## Architecture

### Component Overview

```
status.md (Write/Edit)
       │
       ▼
PostToolUse Hook (phase-transition-guard.sh)
       │
       ├─ Read .forge/status.md → extract phase
       ├─ Read /tmp/forge-last-phase → previous phase
       │
       ├─ Phase changed AND ≠ completed?
       │     YES → Output §2.7 reminder to stdout
       │     NO  → Silent exit
       │
       └─ Atomically write current phase → /tmp/forge-last-phase
```

### Hook Integration Point

Existing `.claude/settings.json` PostToolUse hooks:

```
PostToolUse → [
  { matcher: "Write|Edit", hooks: [...] },          // progress reminder
  { matcher: "Read", hooks: [...] },                  // read budget
  { matcher: "Bash|Write|Edit", hooks: [...] },       // duration tracking
  { matcher: "Write|Edit", hooks: [NEW_ENTRY] }       // ← phase transition guard
]
```

New hook entry sits alongside existing entries. No modification to existing hooks.

## Data Model

### Phase Cache File

- **Path**: `/tmp/forge-last-phase`
- **Format**: Plain text, single line containing the phase value
- **Write strategy**: Atomic (write to temp file, then `mv`)
- **Lifecycle**: Session-scoped (cleared on reboot as `/tmp` is volatile)
- **Stale handling**: If file doesn't exist, treat as "no previous phase" → no reminder on first run

### Phase Transition Detection Logic

```bash
# Pseudocode
current_phase = read_field(".forge/status.md", "phase")
last_phase = cat /tmp/forge-last-phase 2>/dev/null || ""

if current_phase != last_phase && current_phase != "completed" && current_phase != "":
    echo "§2.7 reminder message with transition details"
fi

# Atomic update
echo "$current_phase" > /tmp/forge-last-phase.tmp
mv /tmp/forge-last-phase.tmp /tmp/forge-last-phase
```

### Reminder Message Template

```
⚠️ §2.7 铁律触发：phase 已从 {last_phase} 过渡到 {current_phase}。
必须立即调用 Skill(skill="forge", args="{next_phase}")。
不得只输出过渡文字而不实际调用 Skill。
→ 详见 shared/next-step-protocol.md
```

## Error Handling

| Error Case | Handling |
|-----------|---------|
| status.md not found | Exit 0 silently |
| status.md has no phase field | Exit 0 silently |
| Cache file read failure | Treat as "no previous phase" → no reminder |
| Cache file write failure | Log to stderr, exit 0 (non-blocking) |
| Invalid phase value | Still detect transition, still output reminder |

All error cases follow fail-open design: the hook never blocks workflow on error.

## Reversibility

### Rollback

1. Remove hook entry from `.claude/settings.json`
2. Delete `scripts/phase-transition-guard.sh`
3. Delete `shared/next-step-protocol.md`
4. No other files reference the hook or protocol doc

### Mount Points

| Mount Point | Description |
|-------------|-------------|
| `.claude/settings.json` → PostToolUse | Hook registration |
| `scripts/` | Hook script location |
| `shared/` | Protocol document location |
| `/tmp/forge-last-phase` | Runtime state |

## Security Considerations

- Hook script is read-only (only reads status.md, writes to /tmp)
- No network access, no external dependencies
- Fail-open: errors produce no output, never block
- Cache file in /tmp is session-scoped, cleared on reboot
- No sensitive data in cache file (only phase string like "build", "review")
