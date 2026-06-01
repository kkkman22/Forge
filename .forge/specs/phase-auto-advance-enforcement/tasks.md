---
feature: phase-auto-advance-enforcement
status: approved
created: 2026-06-01
plan_hash: phase-auto-advance-v1
---

# Plan: Phase Auto-Advance Enforcement

## File Map

| File | Action | Reason |
|------|--------|--------|
| `scripts/phase-transition-guard.sh` | CREATE | PostToolUse hook 脚本 |
| `shared/next-step-protocol.md` | CREATE | 自动推进协议文档（填补幽灵引用） |
| `.claude/settings.json` | MODIFY | 注册 PostToolUse hook 条目 |
| `test/phase-transition-guard.test.ts` | CREATE | Hook 脚本 TDD 测试 |

---

## Wave 1: Foundation (TDD — Test First)

### Task 1.1: Write failing tests for phase-transition-guard.sh

**Depends On**: (none)
**File**: `test/phase-transition-guard.test.ts`
**Est**: 5 min

**RED Steps**:
1. Create test file with vitest describe/it blocks
2. Helper: `createStatusMd(dir, phase)` — writes .forge/status.md with given phase
3. Helper: `runGuard(dir)` — execSync(`bash scripts/phase-transition-guard.sh`, { cwd: dir })
4. Test cases (all should FAIL — script doesn't exist yet):
   - `phase transition build→review → stdout contains §2.7 reminder`
   - `no phase change → stdout empty`
   - `phase → completed → stdout empty`
   - `missing status.md → exit 0, stdout empty`
   - `empty phase field → exit 0, stdout empty`
   - `cache file updated after run → /tmp/forge-last-phase contains current phase`
   - `stale/missing cache → no crash, exit 0`
5. Run `npx vitest run test/phase-transition-guard.test.ts` → all RED

**Verify**: `npx vitest run test/phase-transition-guard.test.ts` → 0/7 pass
**Commit**: `test(phase-guard): add failing tests for phase transition detector`

---

### Task 1.2: Implement phase-transition-guard.sh (make tests GREEN)

**Depends On**: Task 1.1
**File**: `scripts/phase-transition-guard.sh`
**Est**: 5 min

**GREEN Steps**:
1. Create script, set -uo pipefail
2. Source `scripts/lib/forge-helpers.sh`
3. Define CACHE_FILE="/tmp/forge-last-phase"
4. Read current_phase from `.forge/status.md` via `read_field`
5. If no status.md or no phase → exit 0
6. Read last_phase from CACHE_FILE (default empty)
7. If current_phase ≠ last_phase AND current_phase ≠ "completed" AND current_phase ≠ "" → output reminder
8. Atomically write current_phase to CACHE_FILE (write tmp + mv)
9. Run `npx vitest run test/phase-transition-guard.test.ts` → all GREEN

**Reminder template**:
```
⚠️ §2.7 铁律触发：phase 已从 {last_phase} 过渡到 {current_phase}。
必须立即调用 Skill(skill="forge", args="<next>")。
不得只输出过渡文字而不实际调用 Skill。
→ 详见 shared/next-step-protocol.md
```

**Verify**: `npx vitest run test/phase-transition-guard.test.ts` → 7/7 pass
**Commit**: `feat(hooks): add phase transition guard script`

---

### Task 1.3: Create shared/next-step-protocol.md

**Depends On**: (none, parallel with 1.1)
**File**: `shared/next-step-protocol.md`
**Est**: 3 min

**Steps**:
1. Create file with frontmatter: `description: Phase auto-advance protocol`
2. Sections:
   - **原子动作要求**: 输出摘要 + 调用 Skill 必须在同一 turn
   - **阶段过渡映射表**: build→review, review→test, test→ship, etc.
   - **三种违规形态**: 显式询问 / 工作量承诺 / 隐式 idle
   - **失败时行为**: 停下来让用户决定
   - **引用**: 被 CLAUDE.md §2.7 和 hook 提醒消息引用
3. Verify: `test -f shared/next-step-protocol.md && grep -c '自动推进' shared/next-step-protocol.md`

**Verify**: `test -f shared/next-step-protocol.md`
**Commit**: `docs: add shared/next-step-protocol.md (fills ghost reference)`

---

## Wave 2: Integration

### Task 2.1: Register hook in .claude/settings.json

**Depends On**: Task 1.2
**File**: `.claude/settings.json`
**Est**: 2 min

**Steps**:
1. Add PostToolUse entry in existing array:
   ```json
   {
     "matcher": "Write|Edit",
     "hooks": [
       {
         "type": "command",
         "command": "bash scripts/phase-transition-guard.sh 2>/dev/null || true",
         "timeout": 3
       }
     ]
   }
   ```
2. Place after existing Write|Edit PostToolUse entries
3. Verify hook fires: edit status.md phase field, check for reminder output

**Verify**: `node -e "const s=require('./.claude/settings.json'); console.log(s.hooks.PostToolUse.some(e => JSON.stringify(e).includes('phase-transition-guard')))"` → true
**Commit**: `feat(hooks): register phase transition guard in settings.json`

---

### Task 2.2: Integration verification

**Depends On**: Task 2.1, Task 1.3
**Est**: 3 min

**Steps**:
1. Run `npm run check` (tsc + biome + vitest) → all pass
2. Run `npx vitest run test/phase-transition-guard.test.ts` → 7/7 pass
3. Verify no unintended modifications: `git diff --stat src/` → empty
4. Verify settings.json valid: `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))"` → no error

**Verify**: `npm run check`
**Commit**: (no commit — verification only)

---

## Definition of Done

- [ ] All 8 acceptance criteria from requirements.md pass
- [ ] `npm run check` passes (tsc + biome + vitest)
- [ ] Hook correctly detects phase transitions
- [ ] `shared/next-step-protocol.md` resolves CLAUDE.md §2.7 ghost reference
- [ ] No modification to `src/skill-scheduler.ts` or skill instructions
