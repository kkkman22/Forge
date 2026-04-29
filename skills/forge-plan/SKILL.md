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

## 1. 概述

`/forge plan` 通过五步流程（Research → File Mapping → Task Breakdown → Self-Check → User Approval）将锁定的 Spec 转化为原子任务列表。每个任务包含文件路径、TDD 步骤、完整代码、验证命令和提交信息——拿到就能执行。

**核心原则**：计划中不允许任何模糊内容。如果你写不出完整代码，说明你还没想清楚，回去重新研究。

---

## 2. 五步规划流程

### Step 1：Research（研究）

搜索历史经验和项目上下文，为规划提供信息基础。

| 输入源 | 说明 |
|--------|------|
| `.forge/knowledge/solutions/` | 搜索相关的历史解决方案 |
| `.forge/knowledge/instincts.md` | 读取高频模式和踩坑记录 |
| `.forge/knowledge/metrics.md` | 读取历史执行指标（Plan 偏差率、命令健康度） |
| `.forge/knowledge/tool-health.md` | 检查验证命令健康度（退化/不健康的命令需要预警） |
| `.forge/specs/<feature>/spec.md` | 读取锁定的 Spec（唯一真理源） |
| `.forge/config.md` | 读取项目配置（技术栈、安全级别） |
| 项目代码库 | 扫描现有代码结构，理解当前架构 |

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

### Step 2：File Mapping（文件映射）

列出计划中需要创建或修改的所有文件，形成完整的文件变更清单。

**映射规则**：

1. 每个文件标注操作类型：`CREATE`（新建）或 `MODIFY`（修改）。
2. 修改的文件必须说明修改原因和影响范围。
3. 测试文件与源文件成对出现——有源文件就有测试文件。
4. 文件路径必须是从项目根目录开始的完整相对路径。

**输出格式**：

```markdown
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `src/services/notification.ts` | CREATE | 通知服务核心逻辑 |
| `src/services/notification.test.ts` | CREATE | 通知服务单元测试 |
```

### Step 3：Task Breakdown（任务拆解）

将 Spec 中的每个需求拆解为任务。根据是否有 design.md 选择任务格式：

1. **有 design.md** → **Lightweight Task** 格式。Plan 补充 File Mapping、Dependency Graph、Spec Coverage Matrix，具体代码留给 build 阶段按 TDD 编写。
2. **无 design.md** → 回退到 **Atomic Task** 格式（包含完整 RED/GREEN/REFACTOR 代码），详见第 3 节。

**通用拆解规则**：

1. **粒度**：每个任务是一个独立的行为变更，可在 2-5 分钟内完成。太大就拆，太小就合。
2. **独立性**：每个任务有明确的输入和输出，完成后可独立验证。
3. **顺序性**：任务按依赖关系排序，前置任务先执行。
4. **完整性**：每个任务包含足够信息让 build 阶段直接开始，不留空白。

**Lightweight Task 格式字段**（当 Spec 包含 design.md 时）：

| 字段 | 说明 |
|------|------|
| 任务编号 | 顺序编号，如 Task 1 |
| 任务标题 | 一句话描述任务目标 |
| 目标文件路径 | 从项目根目录的完整相对路径 |
| 目标描述 | 一句话说明要实现的行为变更 |
| Design Reference | `design.md#<章节锚点>` + 一句话摘要 |
| Property | 对应 design.md 的 Correctness Property 编号（如适用） |
| 验证命令 | 验证任务完成的命令 |
| 提交信息 | 原子提交的 commit message |
| 依赖 | 前置任务编号（可选） |

**Lightweight Task 不包含完整 RED/GREEN/REFACTOR 代码**。build 阶段根据 Design Reference 读取 design.md 的相关章节，按 TDD 方式编写代码。

**Design Reference 规则**：

1. 格式：`design.md#<章节锚点>`（GitHub 风格锚点）。
2. 每个引用必须包含被引用章节的一句话摘要。
3. Plan 文档头部的 Design Reference Index 汇总所有引用。

**Atomic Task 格式**（无 design.md 时回退，详见第 3 节）。

### Step 4：Self-Check（自检）

对生成的计划执行三项自检，确保计划质量：

| 检查项 | 通过标准 |
|--------|---------|
| **Spec 覆盖率** | 每个 Spec 需求至少被一个任务覆盖 |
| **占位符扫描** | 零占位符（详见第 4 节） |
| **类型一致性** | 所有引用的类型和函数均有定义（仅 full 格式） |
| **Design Reference 有效性** | 所有引用指向已存在的 design.md 章节（仅 lightweight 格式） |
| **依赖关系** | 无循环依赖，拓扑排序正确 |

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

### Step 5：User Approval（用户批准）

将完整计划呈现给用户，等待批准：

- **用户批准**（回复确认、是、ok、y 等）→ 将 `status` 设为 `"approved"`，写入输出文件。
- **用户提出修改意见** → 据此更新计划，回到 Self-Check。
- **用户拒绝**（回复 n、否、不等）→ 计划保持 `draft` 状态，等待进一步指示。

---

## 3. 原子任务格式

每个原子任务必须包含以下所有字段：

| 字段 | 说明 | 示例 |
|------|------|------|
| **任务编号** | `Task N` | `Task 1` |
| **任务标题** | 一句话描述任务目标 | 创建通知服务核心接口 |
| **文件路径** | 完整相对路径 | `src/services/notification.ts` |
| **预估时间** | 2-5 分钟 | 3 min |
| **TDD 步骤** | RED → GREEN → REFACTOR | — |
| **验证命令** | 验证任务完成的命令 | `npm test -- --grep "notification"` |
| **提交信息** | 原子提交的 commit message | `feat(notification): add core service interface` |

### TDD 步骤格式

每个任务的 TDD 步骤必须包含三个阶段：

#### RED（写失败的测试）

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

#### GREEN（写最少代码让测试通过）

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

#### REFACTOR（重构，保持测试通过）

```markdown
**REFACTOR** — 重构（保持测试通过）

- 提取类型到 `src/types/notification.ts`
- 添加输入验证（userId 非空、message 非空）
- 运行全部测试确认无回归
```

---

## 4. 禁止内容列表

计划中**严禁出现**以下占位符内容。出现任何一项，自检不通过，必须替换为具体内容。

| 禁止内容 | 说明 |
|---------|------|
| `TBD` | 待定——如果你不知道，先去研究 |
| `TODO` | 待办——计划阶段不允许留待办 |
| `待定` | 中文版 TBD |
| `后续补充` | 等于没写 |
| `类似 Task N` | 每个任务必须独立完整 |
| `添加适当的错误处理` | 写出具体的错误处理代码 |

**扫描规则**：

1. 对计划全文进行大小写不敏感的文本扫描，匹配精确文本和常见变体（如 `tbd`、`Todo`、`TODO:`、`// TODO`）。
2. 发现匹配项时，定位到具体任务和行，要求替换为具体内容。
3. **lightweight 格式**：扫描范围为任务描述和 Design Reference 字段（不含代码块）。**full 格式**：扫描全文（含代码块）。

---

## 5. 自检标准详解

### 5.1 Spec 覆盖率

逐条对照 Spec 中的需求和场景，确保每个需求至少被一个任务覆盖。

**检查方法**：读取 Spec 场景汇总表 → 对每个场景在计划中找到对应任务 → 标记未覆盖场景 → 自动补充缺失任务。

**未通过输出**：`❌ Spec 覆盖率：需求 3 场景 S5 未覆盖 → 需要补充任务`

### 5.2 占位符扫描

对计划全文扫描禁止内容列表中的所有关键词。

**未通过输出**：`❌ 占位符扫描：Task 3 第 12 行 `// TODO: add error handling` → 需要替换为具体代码`

### 5.3 类型一致性

检查计划中引用的所有类型和函数是否在某个任务中有定义。

**检查方法**：扫描所有任务代码提取 import 和类型引用 → 在其他任务中查找定义 → 对已存在类型检查项目代码库 → 标记未定义引用 → 自动在合适任务中补充定义。

**未通过输出**：`❌ 类型一致性：NotificationChannel（在 Task 3 中引用，但无任务定义此类型）→ 需要添加定义`

---

## 6. 门禁：Plan 未批准 → 阻断 `/forge build`

→ 遵循 CLAUDE.md §2.2 前置检查（Plan 批准门禁）。

**补充**：轻量路径不要求批准的 plan，直接执行 build。阻断时输出：

```
🚫 Build 阻断：计划未批准
当前状态：draft。请运行 /forge plan 完成审阅和批准。
计划路径：.forge/plans/<topic>.md
```

---

## 7. Plan 文档格式

### 输出路径

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

| 字段 | 说明 |
|------|------|
| `format` | `lightweight`（精简格式，有 design.md 时）或 `full`（完整格式），缺省默认 `full` |

### Lightweight 格式正文结构（当 Spec 包含 design.md 时）

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
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `src/plan.ts` | MODIFY | 添加 LightweightTask 验证 |

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
| Spec 需求 | 覆盖任务 |
|-----------|---------|
| 需求 1 | Task 1, Task 2 |
```

### Full 格式正文结构（当 Spec 不包含 design.md 时）

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
| 文件路径 | 操作 | 说明 |
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
| Spec 需求 | 覆盖任务 |
|-----------|---------|
| 需求 1 场景 S1 | Task 1, Task 2 |
```

---

## 8. 执行流程

### 流程步骤

1. **前置检查**：检查 `.forge/` 目录存在，检查 Spec 状态（锁定/未锁定/无 Spec）
2. **Research**：搜索 knowledge/、读取 Spec、派发 explore agent 扫描代码库
3. **File Mapping**：列出所有需要创建/修改的文件
4. **Task Breakdown**：拆解为原子任务（每个 2-5 min）
5. **Self-Check**：三项自检（覆盖率/占位符/类型一致性），未通过则自动修正并重新自检
6. **User Approval**：用户批准 → `status: approved`；修改意见 → 回到 Self-Check；拒绝 → 保持 draft

### Step 0：前置检查

1. 检查 `.forge/` 目录是否存在 → 不存在则提示 `forge init`。
2. 检查当前路径来源：
   - **全量路径**：Spec 必须已锁定，未锁定则阻断。
   - **标准路径/用户直接调用**：检查 `.forge/specs/` 中是否有相关 Spec。
     - 有且已锁定 → 正常进入 Step 1。
     - 有但未锁定 → 提示先运行 `/forge spec`。
     - **无 Spec** → 基于用户需求描述直接生成 Plan，标注 `spec_ref: "none"`，build 阶段 Spec 门禁自动豁免。

---

## 9. 边界情况处理

| 情况 | 处理 |
|------|------|
| **Spec 未锁定**（全量路径） | 阻断规划，提示先运行 `/forge spec` |
| **无 Spec**（标准路径） | 不阻断，基于用户需求直接生成 Plan。review 阶段 Spec 对齐检查跳过。 |
| **已有同名 plan（draft）** | 读取现有计划作为基础，在其上修改 |
| **已有同名 plan（approved）** | 提示 `⚠️ 已批准。如需重新规划，先改 status 为 draft。` |
| **任务数量 > 20** | 提醒用户建议拆分 Spec 或分批执行，等待确认 |
| **自检 3 次不通过** | 停止自动修正，将问题呈现给用户 |
| **无 knowledge/ 历史** | 跳过历史经验搜索，输出 `ℹ️ 未找到历史经验` |
| **无 `.forge/` 目录** | 提示先运行 `forge init` |

---

## 10. 示例

### 示例 1：Full 格式任务（标准路径）

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

### 示例 2：自检发现问题

```
📋 计划自检
✅ Spec 覆盖率：所有 5 个场景均已覆盖
❌ 占位符扫描：Task 4 第 15 行 `// TODO: implement notification sending` → 替换为具体代码
✅ 类型一致性：所有引用均有定义
正在修正...
```

修正后重新自检至全部通过。

---

## 已知 AI 失败模式

Plan 阶段最常见的 AI 失败模式。如果你发现自己正在做以下任何一件事——**立即停下来**。

| # | 失败模式 | 错误行为 | 正确做法 |
|---|---------|---------|---------|
| 1 | **任务粒度过大**（>5 min） | 把大功能整体塞进一个任务，如"实现完整认证系统"预估 30 min | 按"一个任务 = 一个可独立验证的行为变更"拆解。出现"和""以及""同时"就要继续拆。→ §3 粒度规则 |
| 2 | **依赖关系遗漏** | Task 3 引用 Task 1 的类型，但排序不对；存在隐式依赖未体现 | Task Breakdown 后画依赖图，确保每个引用在之前任务中已定义。→ §5.3 类型一致性检查 |
| 3 | **占位符未替换** | 写 `// TODO: implement logic`、`添加适当的错误处理`、`类似 Task 2` | 每步必须包含完整可执行代码。写不出说明没想清楚，回到 Step 1。→ §4 禁止内容列表 |
| 4 | **不读 Spec 就拆任务** | 凭"大概理解"直接拆任务，只读标题不读场景 | §2 Step 1 Research 是强制步骤。逐条过每个需求和场景，对照场景汇总表映射。→ §5.1 Spec 覆盖率 |
