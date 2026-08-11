# Hooks `if:` Migration Plan

> Auto-generated audit of inline if patterns in hooks/hooks.json
> Date: 2026-05-12

## Audit Results

7 inline `if [` patterns found. Analysis below.

### Entry 1: SessionStart — evolved-rules.md check
- **Location**: Line 17 (SessionStart hook 2)
- **Current command**: `if [ -f .tinkerman/knowledge/evolved-rules.md ]; then echo '=== Evolved Rules ==='; cat .tinkerman/knowledge/evolved-rules.md; fi`
- **Can migrate to `if:`**: NO — checks project state (file existence), not tool input
- **Action**: Keep inline but optimize — already optimal (`[ -f ... ]`)

### Entry 2: PreToolUse — sandbox check for Bash
- **Location**: Line 87 (PreToolUse Bash hook)
- **Current command**: `if [ -f .tinkerman/.sandbox-active.json ]; then node forge/dist/src/check-sandbox.js Bash "$TOOL_INPUT_FILE" ...; fi`
- **Can migrate to `if:`**: NO — checks project state (.sandbox-active.json existence)
- **Action**: Keep inline, already optimal

### Entry 3: PostToolUse — status check reminder
- **Location**: Line 109 (PostToolUse Write|Edit hook)
- **Current command**: `if [ -d .tinkerman/status ] || [ -f .tinkerman/status.md ]; then echo '📝 ...'; fi`
- **Can migrate to `if:`**: NO — checks project state
- **Action**: Keep inline, already optimal

### Entry 4: Stop — incomplete tasks check
- **Location**: Line 139 (Stop hook 1, sub-hook 1)
- **Current command**: `if [ -f .tinkerman/progress/*.md ] 2>/dev/null; then incomplete=$(grep -c '- \[ \]' .tinkerman/progress/*.md ...); ...; fi`
- **Can migrate to `if:`**: NO — checks project state
- **Action**: Keep inline

### Entry 5: Stop — evolved rules pending check
- **Location**: Line 152 (Stop hook 2)
- **Current command**: `if [ -f .tinkerman/knowledge/evolved-rules.md ] && grep -q 'PENDING' ...; then ...; fi`
- **Can migrate to `if:`**: NO — checks project state + file content
- **Action**: Keep inline

### Entry 6: Stop — phase verification nudge
- **Location**: Line 188 (Stop hook 6)
- **Current command**: `if [ -f .tinkerman/status.md ]; then phase=$(grep '^phase:' ...); ...; fi`
- **Can migrate to `if:`**: NO — checks project state
- **Action**: Keep inline

### Entry 7: TeammateIdle — phase check
- **Location**: Line 199 (TeammateIdle hook)
- **Current command**: `if [ -d .tinkerman/status ]; then status_file=...; else status_file='.tinkerman/status.md'; fi; phase=$(grep ...); ...`
- **Can migrate to `if:`**: NO — checks project state
- **Action**: Keep inline

## Summary

All 7 inline `if [` patterns check **project state** (file/directory existence), NOT tool input patterns. None can be migrated to `if:` permission-rule syntax.

However, **new `if:` filters should be added** to PreToolUse/PostToolUse entries to prevent unnecessary hook spawns:

| Hook | Current matcher | Recommended `if:` addition |
|------|----------------|---------------------------|
| PreToolUse Write\|Edit → frozen check | `Write\|Edit` | `if: "Write(.tinkerman/**)\|Edit(.tinkerman/**)"` |
| PreToolUse Bash → frozen check | `Bash` | `if: "Bash(git push*)"` or keep inline |
| PreToolUse Write\|Edit → sandbox check | `Write\|Edit` | Keep (needs all Write/Edit) |
| PreToolUse Bash → sandbox check | `Bash` | Keep (conditional on sandbox state) |
| PreToolUse Write\|Edit → context boundary | `Write\|Edit` | Keep (needs all Write/Edit) |
| PostToolUse Write\|Edit → progress reminder | `Write\|Edit` | `if: "Write(.tinkerman/**)\|Edit(.tinkerman/**)"` |
| PostToolUse Write\|Edit → cmux sync | `Write\|Edit` | `if: "Write(.tinkerman/**)\|Edit(.tinkerman/**)"` |
| PostToolUse Write\|Edit → feature dossier | `Write\|Edit` | `if: "Write(.tinkerman/**)\|Edit(.tinkerman/**)"` |

## Migration Actions

1. Add `if: "Write(.tinkerman/**)|Edit(.tinkerman/**)"` to frozen-zone check PreToolUse hook
2. Add `if: "Write(.tinkerman/**)|Edit(.tinkerman/**)"` to PostToolUse progress/cmux/dossier hooks
3. Add `if: "Bash(git push*)"` to PreToolUse Bash frozen check (if pattern works)
4. Keep sandbox/context-boundary hooks without `if:` (they need broader matching)
5. Keep all Stop/TeammateIdle hooks without `if:` (they check project state, not tool input)
