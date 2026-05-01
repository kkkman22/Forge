---
name: forge-plan
description: "规划引擎。将锁定的 Spec 拆解为包含 TDD 步骤的原子任务。"
disable-model-invocation: true
---

# /forge plan — 规划引擎

> **触发方式**：标准路径的第一步，全量路径的第三步，或用户直接输入 `/forge plan`
> **职责**：将锁定的 Spec 拆解为包含 TDD 步骤的原子任务，生成可直接执行的开发计划
> **输出路径**：`.forge/plans/<topic>.md`

---

## 1. Overview

`/forge plan` 通过五步流程（Research → File Mapping → Task Breakdown → Self-Check → User Approval）将锁定的 Spec 转化为原子任务列表。每个任务包含文件路径、TDD 步骤、完整代码、验证命令和提交信息——拿到就能执行。

**核心原则**：计划中不允许任何模糊内容。如果你写不出完整代码，说明你还没想清楚，回去重新研究。

---

**Not For**：
- 轻量路径任务（≤1 文件 ≤20 行）
- Spec 已包含完整任务拆解的情况

## 2. Five-Step Planning Process

### Step 1: Research

搜索历史经验和项目上下文，为规划提供信息基础。

| Input Source | Description |
|--------|------|
| `.forge/knowledge/solutions/` | Search related historical solutions |
| `.forge/knowledge/instincts.md` | Read high-frequency patterns and pitfall records |
| `.forge/knowledge/metrics.md` | Read historical execution metrics (Plan deviation rate, command health) |
| `.forge/knowledge/tool-health.md` | Check verification command health (degraded/unhealthy commands need warning) |
| `.forge/specs/<feature>/spec.md` | Read locked Spec (single source of truth) |
| `.forge/config.md` | Read project configuration (tech stack, security level) |
| Project codebase | Scan existing code structure, understand current architecture |

**研究规则**：

1. **先搜索 `knowledge/`**（强制）——看看有没有类似问题的解决方案或踩坑记录。有就复用，别重新发明轮子。搜索结果必须显式记录到 Research Findings 章节，标注来源文件和置信度。
2. **读取 `instincts.md`**（强制）——匹配当前任务涉及的技术领域标签，提取相关的经验模式。
3. **读取 `metrics.md`**（如有）——检查历史 Plan 偏差率，用于校准本次预估时间。如果历史偏差率 > 1.2，在预估时间上乘以偏差系数。
4. **读取 `tool-health.md`**（如有）——检查验证命令健康度。如果有退化或不健康的命令，在 Research Findings 中注入警告。
5. 读取锁定的 Spec，逐条理解每个需求和场景。
6. **派发 explore agent 扫描代码库**（强制）——调用：`Agent(prompt="<搜索指令>", skills=[], permissionMode="default", maxTurns=10)`。
7. 将研究发现记录下来，作为后续步骤的输入。

**Research Findings 输出格式**：

```markdown
## Research Findings

### 来自知识库
- **<文件名>**（confidence: N.N）：<关键发现>
- **instincts.md**：<匹配的模式>（confidence: N.N）

### 来自执行指标
- 历史 Plan 偏差率：1.25（建议预估时间 ×1.25）
- ⚠️ `npx vitest run` 近期成功率 65%（🟡 退化）

### 来自代码库分析
- <现有架构分析>、<命名约定>、<测试模式>
```

如果知识库为空，输出 `ℹ️ 知识库为空，跳过历史经验搜索。` 但不阻断。

### Step 2: File Mapping

列出计划中需要创建或修改的所有文件，形成完整的文件变更清单。

**映射规则**：

1. 每个文件标注操作类型：`CREATE`（new）或 `MODIFY`（modify）。
2. 修改的文件必须说明修改原因和影响范围。
3. 测试文件与源文件成对出现——有源文件就有测试文件。
4. 文件路径必须是从项目根目录开始的完整相对路径。

**输出格式**：

```markdown
| File Path | Operation | Description |
|---------|------|------|
| `src/services/notification.ts` | CREATE | Notification service core logic |
| `src/services/notification.test.ts` | CREATE | Notification service unit tests |
```

### Step 3: Task Breakdown

将 Spec 中的每个需求拆解为任务。根据是否有 design.md 选择任务格式：

1. **有 design.md** → **Lightweight Task** format. Plan provides File Mapping, Dependency Graph, Spec Coverage Matrix; concrete code left for build phase via TDD.
2. **无 design.md** → Falls back to **Atomic Task** format (includes complete RED/GREEN/REFACTOR code), see Section 3.

**通用拆解规则**：

1. **Granularity**: 每个任务是一个独立的行为变更，可在 2-5 分钟内完成。太大就拆，太小就合。
2. **Independence**: 每个任务有明确的输入和输出，完成后可独立验证。
3. **Ordering**: 任务按依赖关系排序，前置任务先执行。
4. **Completeness**: 每个任务包含足够信息让 build 阶段直接开始，不留空白。

**Lightweight Task 格式字段**（当 Spec 包含 design.md 时）：

| Field | Description |
|------|------|
| Task Number | Sequential number, e.g. Task 1 |
| Task Title | One-sentence description of task goal |
| Target File Path | Full relative path from project root |
| Target Description | One-sentence description of the behavioral change to implement |
| Design Reference | `design.md#<section-anchor>` + one-sentence summary |
| Property | Corresponding Correctness Property number from design.md (if applicable) |
| Verify Command | Command to verify task completion |
| Commit Message | Atomic commit message |
| Dependencies | Prerequisite task numbers (optional) |

**Lightweight Task 不包含完整 RED/GREEN/REFACTOR 代码**。build 阶段根据 Design Reference 读取 design.md 的相关章节，按 TDD 方式编写代码。

**Design Reference 规则**：

1. Format: `design.md#<section-anchor>` (GitHub-style anchor).
2. 每个引用必须包含被引用章节的一句话摘要。
3. Plan 文档头部的 Design Reference Index 汇总所有引用。

**Atomic Task 格式**（无 design.md 时回退，详见第 3 节）。

### Step 4: Self-Check

对生成的计划执行三项自检，确保计划质量：

| Check Item | Pass Criteria |
|--------|---------|
| **Spec Coverage** | Each Spec requirement is covered by at least one task |
| **Placeholder Scan** | Zero placeholders (see Section 4) |
| **Type Consistency** | All referenced types and functions have definitions (full format only) |
| **Design Reference Validity** | All references point to existing design.md sections (lightweight format only) |
| **Dependencies** | No circular dependencies, topological sort is correct |

**自检输出**：

```
📋 计划自检
✅ Spec 覆盖率：所有 N 个需求均已覆盖
✅ 占位符扫描：未发现禁止内容
✅ 类型一致性：所有引用均有定义（full）/ Design Reference 有效性：所有引用有效（lightweight）
✅ 依赖关系：无循环依赖，拓扑排序正确
自检通过。请审阅计划，批准后开始执行。
```

如果任一检查项未通过，列出具体问题并自动修正，然后重新自检，直到全部通过。

### Step 5: User Approval

将完整计划呈现给用户，等待批准：

- **用户批准**（回复确认、是、ok、y 等）→ 将 `status` 设为 `"approved"`，写入输出文件。
- **用户提出修改意见** → 据此更新计划，回到 Self-Check。
- **用户拒绝**（回复 n、否、不等）→ 计划保持 `draft` 状态，等待进一步指示。

---

## 3. Atomic Task Format

每个原子任务必须包含以下所有字段：

| Field | Description | Example |
|------|------|------|
| **Task Number** | `Task N` | `Task 1` |
| **Task Title** | One-sentence description of task goal | Create notification service core interface |
| **File Path** | Full relative path | `src/services/notification.ts` |
| **Estimated Time** | 2-5 minutes | 3 min |
| **TDD Steps** | RED → GREEN → REFACTOR | — |
| **Verify Command** | Command to verify task completion | `npm test -- --grep "notification"` |
| **Commit Message** | Atomic commit message | `feat(notification): add core service interface` |

### TDD Step Format

Each task's TDD steps must include three phases:

#### RED (Write Failing Test)

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

#### GREEN (Write Minimal Code to Pass)

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

#### REFACTOR (Refactor While Keeping Tests Passing)

```markdown
**REFACTOR** — 重构（保持测试通过）

- 提取类型到 `src/types/notification.ts`
- 添加输入验证（userId 非空、message 非空）
- 运行全部测试确认无回归
```

---

## 4. Prohibited Content List

计划中**严禁出现**以下占位符内容。出现任何一项，自检不通过，必须替换为具体内容。

| Prohibited Content | Description |
|---------|------|
| `TBD` | To be determined—if you don't know, research first |
| `TODO` | To do—no TODOs allowed in planning phase |
| `待定` | Chinese version of TBD |
| `后续补充` | Equivalent to not writing anything |
| `类似 Task N` | Each task must be independently complete |
| `添加适当的错误处理` | Write specific error handling code |

**扫描规则**：

1. Perform case-insensitive text scan across the entire plan, matching exact text and common variants (e.g. `tbd`, `Todo`, `TODO:`, `// TODO`).
2. When a match is found, locate the specific task and line, require replacement with concrete content.
3. **lightweight format**: scan scope is task descriptions and Design Reference fields (excluding code blocks). **full format**: scan entire document (including code blocks).

---

## 5. Self-Check Criteria Details

### 5.1 Spec Coverage

逐条对照 Spec 中的需求和场景，确保每个需求至少被一个任务覆盖。

**检查方法**：读取 Spec 场景汇总表 → 对每个场景在计划中找到对应任务 → 标记未覆盖场景 → 自动补充缺失任务。

**未通过输出**：`❌ Spec 覆盖率：需求 3 场景 S5 未覆盖 → 需要补充任务`

### 5.2 Placeholder Scan

对计划全文扫描禁止内容列表中的所有关键词。

**未通过输出**：`❌ 占位符扫描：Task 3 第 12 行 `// TODO: add error handling` → 需要替换为具体代码`

### 5.3 Type Consistency

检查计划中引用的所有类型和函数是否在某个任务中有定义。

**检查方法**：扫描所有任务代码提取 import 和类型引用 → 在其他任务中查找定义 → 对已存在类型检查项目代码库 → 标记未定义引用 → 自动在合适任务中补充定义。

**未通过输出**：`❌ 类型一致性：NotificationChannel（在 Task 3 中引用，但无任务定义此类型）→ 需要添加定义`

---

## 6. Gate: Plan Not Approved → Block `/forge build`

→ 遵循 CLAUDE.md §2.2 前置检查（Plan 批准门禁）。

**补充**：轻量路径不要求批准的 plan，直接执行 build。阻断时输出：

```
🚫 Build 阻断：计划未批准
当前状态：draft。请运行 /forge plan 完成审阅和批准。
计划路径：.forge/plans/<topic>.md
```

---

## 7. Plan Document Format

### Output Path

`.forge/plans/<topic>.md`（`<topic>` 为 kebab-case，如 `user-notification`）

### YAML Frontmatter

```yaml
---
topic: "<主题>"
status: "draft" | "approved"
date: "YYYY-MM-DD"
spec_ref: ".forge/specs/<feature>/spec.md"
format: "lightweight" | "full"
---
```

| Field | Description |
|------|------|
| `format` | `lightweight` (compact format, when design.md exists) or `full` (complete format), defaults to `full` |

### Lightweight Format Body Structure (when Spec includes design.md)

```markdown
---
topic: "<topic>"
status: "draft"
date: "YYYY-MM-DD"
spec_ref: ".kiro/specs/<feature>"
format: "lightweight"
---

## Objective
<一段话说明这个计划要实现什么>

## Design Reference Index
| Anchor | Summary |
|--------|---------|
| `design.md#components-and-interfaces` | 定义 LightweightTask 接口和验证函数 |

## File Mapping
| File Path | Operation | Description |
|---------|------|------|
| `src/plan.ts` | MODIFY | Add LightweightTask validation |

## Task Breakdown
### Task 1: <Title>
- **Goal**: <一句话描述行为变更>
- **File**: `<file-path>`
- **Design Reference**: `design.md#<anchor>` — <一句话摘要>
- **Property**: Property N（如适用）
- **Depends On**: (none | Task N, Task M)
- **Verify**: `<command>`
- **Commit**: `<commit message>`

## Spec Coverage
| Spec Requirement | Covering Tasks |
|-----------|---------|
| Requirement 1 | Task 1, Task 2 |
```

### Full Format Body Structure (when Spec does not include design.md)

```markdown
---
topic: "user-notification"
status: "draft"
date: "2025-01-15"
spec_ref: ".forge/specs/user-notification/spec.md"
---

## Objective
<一段话说明这个计划要实现什么，对应哪个 Spec>

## Research Findings
<研究阶段的发现：历史经验、现有代码分析、技术选型依据>

## File Mapping
| File Path | Operation | Description |
|---------|------|------|
| `src/...` | CREATE / MODIFY | ... |

## Task Breakdown
### Task 1：<任务标题>（N min）
**文件**：`<文件路径>`
**RED** — 写失败的测试 ...
**GREEN** — 写最少代码让测试通过 ...
**REFACTOR** — 重构 ...
**验证命令**：`<命令>`
**提交信息**：`<commit message>`

## Spec Coverage
| Spec Requirement | Covering Tasks |
|-----------|---------|
| Requirement 1 Scenario S1 | Task 1, Task 2 |
```

---

## 8. Execution Flow

### Process Steps

1. **Pre-check**: Check `.forge/` directory exists, check Spec status (locked/unlocked/no Spec)
2. **Research**: Search knowledge/, read Spec, dispatch explore agent to scan codebase
3. **File Mapping**: List all files to create/modify
4. **Task Breakdown**: Decompose into atomic tasks (2-5 min each)
5. **Self-Check**: Three self-checks (coverage/placeholders/type consistency), auto-correct and re-check if not passed
6. **User Approval**: User approves → `status: approved`; revision requested → return to Self-Check; rejected → remain draft

### Step 0: Pre-check

1. Check `.forge/` directory exists → if not, prompt `forge init`.
2. Check current path source:
   - **Full path**: Spec must be locked, block if not locked.
   - **Standard path / direct user call**: Check if relevant Spec exists in `.forge/specs/`.
     - Exists and locked → proceed to Step 1.
     - Exists but not locked → prompt to run `/forge spec` first.
     - **No Spec** → Generate Plan directly based on user requirements, mark `spec_ref: "none"`, Spec gate in build phase is automatically waived.

---

## 9. Edge Case Handling

| Case | Handling |
|------|------|
| **Spec not locked** (full path) | Block planning, prompt to run `/forge spec` first |
| **No Spec** (standard path) | Do not block, generate Plan based on user requirements directly. Spec alignment check skipped in review phase. |
| **Existing plan with same name (draft)** | Read existing plan as base, modify on top of it |
| **Existing plan with same name (approved)** | Prompt `⚠️ 已批准。如需重新规划，先改 status 为 draft。` |
| **Task count > 20** | Remind user to consider splitting Spec or executing in batches, wait for confirmation |
| **Self-check fails 3 times** | Stop auto-correction, present issues to user |
| **No knowledge/ history** | Skip historical experience search, output `ℹ️ 未找到历史经验` |
| **No `.forge/` directory** | Prompt to run `forge init` first |

---

## 10. Examples

### Example 1: Full Format Task (Standard Path)

```markdown
### Task 1：创建导出服务接口和筛选逻辑（4 min）

**文件**：`src/services/export.ts`、`src/services/export.test.ts`

**RED** — 写失败的测试
```typescript
describe('ExportService', () => {
  it('should filter orders by date range', async () => {
    const service = new ExportService();
    const result = await service.filterOrders({
      startDate: '2025-01-01', endDate: '2025-01-07',
    });
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});
```

**GREEN** — 写最少代码让测试通过
```typescript
export interface OrderFilter {
  startDate: string; endDate: string; status?: string;
  minAmount?: number; maxAmount?: number;
}
export class ExportService {
  async filterOrders(filter: OrderFilter): Promise<Order[]> {
    return [];
  }
}
```

**REFACTOR** — 重构
- 添加 filter 参数验证（startDate 不晚于 endDate）
- 运行全部测试确认无回归

**验证命令**：`npx vitest run --grep "ExportService"`
**提交信息**：`feat(export): add export service with order filtering`
```

### Example 2: Self-Check Found Issue

```
📋 计划自检
✅ Spec 覆盖率：所有 5 个场景均已覆盖
❌ 占位符扫描：Task 4 第 15 行 `// TODO: implement notification sending` → 替换为具体代码
✅ 类型一致性：所有引用均有定义
正在修正...
```

修正后重新自检至全部通过。

---

## Known AI Failure Modes

Plan 阶段最常见的 AI 失败模式。如果你发现自己正在做以下任何一件事——**立即停下来**。

| # | Failure Mode | Wrong Behavior | Correct Approach |
|---|---------|---------|---------|
| 1 | **Task granularity too large** (>5 min) | Stuffing an entire large feature into one task, e.g. "implement complete auth system" estimated 30 min | Decompose by "one task = one independently verifiable behavioral change". If you see "和" "以及" "同时", keep splitting. → §3 Granularity rule |
| 2 | **Missing dependencies** | Task 3 references Task 1's types but ordering is wrong; implicit dependencies not reflected | Draw dependency graph after Task Breakdown, ensure each reference is defined in a prior task. → §5.3 Type consistency check |
| 3 | **Placeholders not replaced** | Writing `// TODO: implement logic`, `添加适当的错误处理`, `类似 Task 2` | Each step must contain complete executable code. If you can't write it, you haven't thought it through—go back to Step 1. → §4 Prohibited content list |
| 4 | **Task breakdown without reading Spec** | Breaking down tasks based on "rough understanding", only reading titles not scenarios | §2 Step 1 Research is mandatory. Go through each requirement and scenario, map against scenario summary table. → §5.1 Spec coverage |

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "边做边想更高效" | 边做边想是产生混乱代码和返工的主要原因。10 分钟规划节省数小时调试 |
| "任务很明显不需要拆解" | 写下来。显式的任务列表能暴露隐藏的依赖和被遗忘的边界情况 |
| "规划是额外开销" | 规划就是任务本身。没有计划的实现只是在打字 |
