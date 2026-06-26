# Atomic Task Format

> Extracted from forge-plan SKILL.md Section 3.

每个原子任务必须包含以下所有字段：

| Field | Description | Example |
|------|------|------|
| **Task Number** | `Task N` | `Task 1` |
| **Task Title** | One-sentence description of task goal | Create notification service core interface |
| **Depends On** | Prerequisite task numbers (empty array if none) | `[1, 2]` or `[]` |
| **File Path** | Full relative path | `src/services/notification.ts` |
| **Estimated Time** | 2-5 minutes | 3 min |
| **TDD Steps** | RED → GREEN → REFACTOR | — |
| **Verify Command** | Command to verify task completion | `npm test -- --grep "notification"` |
| **Commit Message** | Atomic commit message | `feat(notification): add core service interface` |
| **Interaction** | `AFK` or `HITL` | `AFK` |
| **Nature** | `feature` / `infrastructure` / `bugfix` | `feature` |

## TDD Step Format

**Vertical Slice Constraint**: 每个 Task 就是一个 Tracer Bullet——
它包含一条测试（RED）和让那条测试通过的最小实现（GREEN）。
一个 Task 禁止包含多条独立的测试-实现对。
如果需要多对，拆成多个 Task，每个一对。

Each task's TDD steps must include three phases:

### RED (Write Failing Test)

```markdown
**RED** — 写失败的测试

文件：`src/services/notification.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { NotificationService } from './notification';

describe('NotificationService', () => {
  it('should send notification to user', async () => {
    const service = new NotificationService();
    const result = await service.send({
      userId: 'user-1', message: 'Hello', channel: 'email',
    });
    expect(result.success).toBe(true);
    expect(result.notificationId).toBeDefined();
  });
});
```

运行测试，确认失败。预期：NotificationService 不存在
```

### GREEN (Write Minimal Code to Pass)

```markdown
**GREEN** — 写最少代码让测试通过

文件：`src/services/notification.ts`

```typescript
export interface SendNotificationInput {
  userId: string; message: string; channel: 'email' | 'sms' | 'push';
}
export interface SendNotificationResult {
  success: boolean; notificationId: string;
}
export class NotificationService {
  async send(input: SendNotificationInput): Promise<SendNotificationResult> {
    return { success: true, notificationId: crypto.randomUUID() };
  }
}
```

运行测试，确认通过。
```

### REFACTOR (Refactor While Keeping Tests Passing)

```markdown
**REFACTOR** — 重构（保持测试通过）

- 提取类型到 `src/types/notification.ts`
- 添加输入验证（userId 非空、message 非空）
- 运行全部测试确认无回归
```

## Expected Output Field

Every **Run** step in a task MUST include an `Expected:` line immediately after the command. This provides a ground-truth comparison for the build subagent.

### Format

```markdown
Run: `<command>`
Expected: <expected output specification>
```

### Three Legal Forms

| Form | Syntax | Example |
|------|--------|---------|
| **Exit code** | `Expected: exit <N>` | `Expected: exit 0` or `Expected: exit 1` |
| **Substring match** | `Expected: output contains "<string>"` | `Expected: output contains "test passed"` |
| **Fail reason** | `Expected: FAIL -- "<reason>"` | `Expected: FAIL -- "function not defined"` |

### Complete Task Example with Expected

```markdown
### Task 3: Pack type definitions

**Depends On**: [1, 2]
**Interaction**: AFK
**Nature**: feature

**RED** -- write failing test
File: `test/pack/types.test.ts`

Run: `npx vitest run test/pack/types.test.ts`
Expected: FAIL -- "Cannot find module ../../src/pack/types.js"

**GREEN** -- write minimal code to pass
File: `src/pack/types.ts`

Run: `npx vitest run test/pack/types.test.ts`
Expected: exit 0

**REFACTOR** -- reorder types alphabetically
Run: `npx vitest run test/pack/types.test.ts`
Expected: exit 0
```

### Legacy Plans

Plans created before this rule (no `Expected:` fields) are grandfathered: the self-check emits a **warning** (not error). New plans without Expected fields cause a self-check **error**.

## Pack Data Task Integration Test Requirement（源自 evolved-rules R7）

当原子任务的 `files` 字段包含 `packs/<name>/<category>/` 路径（即交付 Pack 数据），**Plan 必须同时包含一个配套的 integration test 任务**，验证对应的 Core loader 在启用该 Pack 后返回非空结果。

### 适用判定

适用该规则的路径前缀：

- `packs/<name>/contexts/` → 要求 `loadContexts(enabledPacks)` 测试
- `packs/<name>/glossary/` → 要求 `loadGlossary(enabledPacks)` 测试
- `packs/<name>/banned-patterns.yaml` → 要求 `loadBannedPatterns(enabledPacks)` 测试
- `packs/<name>/state-machines/` → 要求 `loadStateMachineDefinitions(enabledPacks)` 测试 **（未实现 — pms-pack-v1 R4.5 规划的 registry loader 从未交付；见下方说明）**
- `packs/<name>/lint-rules/` → 要求 `loadPackLintRules(enabledPacks)` 测试

> **⚠️ state-machines 例外（未实现）**：上表中 `loadStateMachineDefinitions(enabledPacks)` 是 `pms-pack-v1` spec R4.5 规划的 registry loader，但**从未交付**——`src/state-machine/` 只导出单文件的 `loadStateMachineDefinition(yaml, path)`（单数），没有 pack-aware 的复数 loader，`src/pack/loader.ts` 也不消费 `state_machines` category。因此当 Plan 的 `files` 含 `packs/<name>/state-machines/` 时，**不要套用本规则生成调 `loadStateMachineDefinitions` 的测试**（该函数不存在，编译会失败）。可选做法：用单数 API 写手写 integration test（读 yaml + `loadStateMachineDefinition` + `validateDefinition`），或先补齐 R4.5 的 loader 再适用本规则。追踪：`.forge/decisions/2026-06-26-arch-review-remediate-0626.md`（T-01 反转）+ 待定 spec（state-machine 接线 vs 退役）。

### 为什么 Zero-Pack 测试不够

Zero-Pack-Zero-Impact 测试验证的是"空输入 → 空输出"，这**只覆盖反面**。它看不到 Pack 实际数据格式与 loader 期望格式的 schema 断层。例如 PMS Pack 的 glossary 采用聚合 YAML 格式，而 loader 期望 per-term frontmatter — 两侧静态测试都绿，但运行时 loader 返回空 registry，Spec Leak Detector 白名单因此失效。

### 配套 integration test 任务模板

```markdown
### Task N+1: <PackName> Pack <Category> Integration Test

**Files**:
- Create: `test/<category>/<pack-name>-pack-integration.test.ts`

**RED** — 写失败测试

\```typescript
import { describe, it, expect } from "vitest";
import { load<Category> } from "../../src/<category>/registry.js";
import type { EnabledPacks, PackEntry } from "../../src/pack/types.js";

describe("<PackName> Pack <Category> integration", () => {
  it("load<Category> returns non-empty registry when pack is enabled", async () => {
    const entry: PackEntry = {
      name: "<pack-name>",
      rootPath: resolve(__dirname, "../../packs/<pack-name>"),
      // ... 完整 PackEntry 字段
    };
    const enabled: EnabledPacks = {
      order: ["<pack-name>"],
      entries: [entry],
      customLayerRoot: "/nonexistent",
    };

    const registry = await load<Category>(enabled, realFs);
    expect(registry.entries.size).toBeGreaterThanOrEqual(<最低预期数量>);
  });
});
\```

Run: `npx vitest run test/<category>/<pack-name>-pack-integration.test.ts`
Expected: FAIL — "Cannot find module" 或 loader 返回空结果

**GREEN** — 按 Pack 实际数据让测试通过（通常不需要改 loader，除非 schema 断层）
Run: `npx vitest run test/<category>/<pack-name>-pack-integration.test.ts`
Expected: exit 0
```

### 断言强度要求

| 断言类型 | 示例 | 适用场景 |
|---------|------|---------|
| **数量下限** | `expect(registry.entries.size).toBeGreaterThanOrEqual(80)` | 术语表、场景库等大量条目 |
| **关键键存在** | `expect(registry.byTerm.get("Room")).toBeDefined()` | 核心术语、核心 Context |
| **跨分区验证** | `expect(contexts.size).toBeGreaterThanOrEqual(3)` | 同词多 Context 定义（如 R6 的 Room） |

**不可接受的弱断言**：`expect(registry).toBeDefined()` — 只验证加载没崩溃，未验证内容非空。
