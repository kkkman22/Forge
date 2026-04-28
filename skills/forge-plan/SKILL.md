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

`/forge plan` 通过五步流程（Research → File Mapping → Task Breakdown → Self-Check → User Approval）将锁定的 Spec 转化为原子任务列表。每个原子任务包含精确文件路径、TDD 步骤、完整代码、验证命令和提交信息——拿到就能执行，不需要再猜。

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
6. **派发 explore agent 扫描代码库**（强制）——使用 `explore` Subagent 快速扫描项目结构、现有架构、命名约定、测试模式。explore agent 是只读的，专门做代码库搜索，比主 agent 直接扫描更高效。调用方式：`Agent(prompt="<搜索指令>", skills=[], permissionMode="default", maxTurns=10)`，使用 `explore` agent 类型。
7. 将研究发现记录下来，作为后续步骤的输入。

**知识回流输出格式**（必须出现在 Research Findings 中）：

```markdown
## Research Findings

### 来自知识库

- **<文件名>**（confidence: N.N）：<关键发现>
- **instincts.md**：<匹配的模式>（confidence: N.N）

### 来自执行指标

- 历史 Plan 偏差率：1.25（建议预估时间 ×1.25）
- ⚠️ `npx vitest run` 近期成功率 65%（🟡 退化）— 建议为测试任务预留额外时间

### 来自代码库分析

- <现有架构分析>
- <命名约定>
- <测试模式>
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
## File Mapping

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `src/services/notification.ts` | CREATE | 通知服务核心逻辑 |
| `src/services/notification.test.ts` | CREATE | 通知服务单元测试 |
| `src/routes/notification.ts` | CREATE | 通知 API 路由 |
| `src/models/user.ts` | MODIFY | 添加通知偏好字段 |
| `src/models/user.test.ts` | MODIFY | 补充通知偏好相关测试 |
```

### Step 3：Task Breakdown（任务拆解）

将 Spec 中的每个需求拆解为原子任务。每个原子任务是一个独立的、可在 2-5 分钟内完成的工作单元。

**拆解规则**：

1. **粒度**：每个任务预估执行时间 2-5 分钟。太大就拆，太小就合。
2. **独立性**：每个任务有明确的输入和输出，完成后可独立验证。
3. **顺序性**：任务按依赖关系排序，前置任务先执行。
4. **TDD 强制**：每个任务必须包含 RED → GREEN → REFACTOR 三步。
5. **完整性**：每个任务包含完整代码，不留空白让执行者去猜。

**原子任务格式**（详见第 3 节）。

### Step 4：Self-Check（自检）

对生成的计划执行三项自检，确保计划质量：

| 检查项 | 检查内容 | 通过标准 |
|--------|---------|---------|
| **Spec 覆盖率** | 计划中的任务是否覆盖了 Spec 中的所有需求和场景 | 每个 Spec 需求至少被一个任务覆盖 |
| **占位符扫描** | 计划中是否包含禁止内容（详见第 4 节） | 零占位符 |
| **类型一致性** | 计划中引用的所有类型和函数是否在某个任务中有定义 | 所有引用均有对应定义 |

**自检输出格式**：

```
📋 计划自检

✅ Spec 覆盖率：所有 N 个需求均已覆盖
✅ 占位符扫描：未发现禁止内容
✅ 类型一致性：所有引用的类型和函数均有定义

自检通过。请审阅计划，批准后开始执行。
```

如果任一检查项未通过，列出具体问题并自动修正，然后重新自检，直到全部通过。

### Step 5：User Approval（用户批准）

将完整计划呈现给用户，等待批准：

- **用户批准**（回复确认、是、ok、y 等）→ 将 YAML frontmatter 中的 `status` 设为 `"approved"`，写入输出文件。
- **用户提出修改意见** → 据此更新计划，回到 Self-Check。
- **用户拒绝**（回复 n、否、不等）→ 计划保持 `draft` 状态，等待进一步指示。

---

## 3. 原子任务格式

每个原子任务必须包含以下所有字段：

### 必需字段

| 字段 | 说明 | 示例 |
|------|------|------|
| **任务编号** | 顺序编号，格式 `Task N` | `Task 1` |
| **任务标题** | 一句话描述任务目标 | 创建通知服务核心接口 |
| **文件路径** | 从项目根目录开始的完整相对路径 | `src/services/notification.ts` |
| **预估时间** | 2-5 分钟 | 3 min |
| **TDD 步骤** | RED → GREEN → REFACTOR 三步（详见下方） | — |
| **验证命令** | 验证任务完成的具体命令 | `npm test -- --grep "notification"` |
| **提交信息** | 原子提交的 commit message | `feat(notification): add core service interface` |

### TDD 步骤格式

每个任务的 TDD 步骤必须包含三个阶段：

#### RED（写失败的测试）

```markdown
**RED** — 写失败的测试

文件：`src/services/notification.test.ts`

​```typescript
import { describe, it, expect } from 'vitest';
import { NotificationService } from './notification';

describe('NotificationService', () => {
  it('should send notification to user', async () => {
    const service = new NotificationService();
    const result = await service.send({
      userId: 'user-1',
      message: 'Hello',
      channel: 'email',
    });
    expect(result.success).toBe(true);
    expect(result.notificationId).toBeDefined();
  });
});
​```

运行测试，确认失败：
​```bash
npm test -- --grep "NotificationService"
​```
预期：测试失败（NotificationService 不存在）
```

#### GREEN（写最少代码让测试通过）

```markdown
**GREEN** — 写最少代码让测试通过

文件：`src/services/notification.ts`

​```typescript
export interface SendNotificationInput {
  userId: string;
  message: string;
  channel: 'email' | 'sms' | 'push';
}

export interface SendNotificationResult {
  success: boolean;
  notificationId: string;
}

export class NotificationService {
  async send(input: SendNotificationInput): Promise<SendNotificationResult> {
    const notificationId = crypto.randomUUID();
    // 实际发送逻辑
    return { success: true, notificationId };
  }
}
​```

运行测试，确认通过：
​```bash
npm test -- --grep "NotificationService"
​```
预期：测试通过
```

#### REFACTOR（重构，保持测试通过）

```markdown
**REFACTOR** — 重构（保持测试通过）

- 提取 `SendNotificationInput` 和 `SendNotificationResult` 到 `src/types/notification.ts`
- 添加输入验证（userId 非空、message 非空）
- 运行全部测试确认无回归：`npm test`
```

### 完整任务示例

```markdown
### Task 1：创建通知服务核心接口（3 min）

**文件**：`src/services/notification.ts`、`src/services/notification.test.ts`

**RED** — 写失败的测试
...（完整测试代码）

**GREEN** — 写最少代码让测试通过
...（完整实现代码）

**REFACTOR** — 重构
...（重构说明）

**验证命令**：
​```bash
npm test -- --grep "NotificationService"
​```

**提交信息**：`feat(notification): add core service interface`
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
| `类似 Task N` | 每个任务必须独立完整，不能引用其他任务的代码 |
| `添加适当的错误处理` | "适当的"是多适当？写出具体的错误处理代码 |

**扫描规则**：

1. 对计划全文进行大小写不敏感的文本扫描。
2. 匹配上述关键词的精确文本和常见变体（如 `tbd`、`Todo`、`TODO:`、`// TODO`）。
3. 发现任何匹配项时，定位到具体任务和行，要求替换为具体内容。

**为什么这么严格？** 因为计划是给 Subagent 执行的。Subagent 没有你的上下文，看到 "TBD" 只能猜。猜错了就是返工。

---

## 5. 自检标准详解

### 5.1 Spec 覆盖率

逐条对照 Spec 中的需求和场景，确保每个需求至少被一个任务覆盖。

**检查方法**：

1. 读取 Spec 的场景汇总表。
2. 对每个场景，在计划中找到对应的任务。
3. 如果某个场景没有对应任务，标记为未覆盖。

**未通过时的处理**：

```
❌ Spec 覆盖率：以下需求未被覆盖
  - 需求 3 场景 S5：当下载链接超过 24 小时，则链接失效
  → 需要补充任务覆盖此场景
```

自动补充缺失的任务，然后重新自检。

### 5.2 占位符扫描

对计划全文扫描禁止内容列表中的所有关键词。

**未通过时的处理**：

```
❌ 占位符扫描：发现 2 处禁止内容
  - Task 3 第 12 行：`// TODO: add error handling`
  - Task 5 第 8 行：`类似 Task 3 的实现`
  → 需要替换为具体代码
```

自动替换为具体内容，然后重新自检。

### 5.3 类型一致性

检查计划中引用的所有类型（interface、type、class）和函数是否在某个任务中有定义。

**检查方法**：

1. 扫描所有任务中的代码，提取 import 语句和类型引用。
2. 对每个引用，在计划的其他任务中查找定义。
3. 对于项目中已存在的类型/函数，检查项目代码库确认存在。
4. 如果某个引用既不在计划中定义，也不在项目中存在，标记为未定义。

**未通过时的处理**：

```
❌ 类型一致性：以下引用未找到定义
  - `NotificationChannel`（在 Task 3 中引用，但无任务定义此类型）
  → 需要在某个任务中添加此类型的定义
```

自动在合适的任务中补充定义，然后重新自检。

---

## 6. 门禁：Plan 未批准 → 阻断 `/forge build`

在标准路径和全量路径下，`/forge build` 启动前**必须检查** `.forge/plans/` 中是否存在批准的计划。

**检查逻辑**：

1. 扫描 `.forge/plans/` 下所有 `.md` 文件。
2. 读取每个文件的 YAML frontmatter。
3. 检查与当前任务相关的 plan 的 `status` 字段。

**阻断行为**：

如果相关 plan 的 status 不是 `"approved"`，阻断 build 并输出：

```
🚫 Build 阻断：计划未批准

当前任务的计划状态为 "draft"，需要先获得批准才能开始 build。
请运行 /forge plan 完成计划的审阅和批准流程。

计划路径：.forge/plans/<topic>.md
当前状态：draft
```

**轻量路径例外**：轻量路径不要求批准的 plan，直接执行 build。

---

## 7. Plan 文档格式

### 输出路径

`.forge/plans/<topic>.md`

其中 `<topic>` 为任务主题的 kebab-case 形式，如 `user-notification`、`order-batch-export`。

### YAML Frontmatter

```yaml
---
topic: "<主题>"
status: "draft" | "approved"
date: "YYYY-MM-DD"
spec_ref: ".forge/specs/<feature>/spec.md"
---
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `topic` | string | 计划主题，kebab-case 格式 |
| `status` | string | `draft`（草案）或 `approved`（已批准） |
| `date` | string | 创建或最后修改日期，YYYY-MM-DD 格式 |
| `spec_ref` | string | 对应的锁定 Spec 路径 |

### 正文结构

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

**RED** — 写失败的测试
...

**GREEN** — 写最少代码让测试通过
...

**REFACTOR** — 重构
...

**验证命令**：`<命令>`
**提交信息**：`<commit message>`

### Task 2：<任务标题>（N min）

...

## Spec Coverage

| Spec 需求 | 覆盖任务 |
|-----------|---------|
| 需求 1 场景 S1 | Task 1, Task 2 |
| 需求 1 场景 S2 | Task 3 |
| 需求 2 场景 S3 | Task 4 |
```

---

## 8. 执行流程

### 完整流程图

```
用户输入 /forge plan
        │
        ▼
  ┌─────────────┐
  │  前置检查    │  Spec 是否锁定？
  └──────┬──────┘
    是 │     │ 否
       │     ▼
       │   🚫 提示先运行 /forge spec
       ▼
  ┌─────────────┐
  │  Research   │  搜索 knowledge/、读取 Spec、扫描代码库
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │ File Mapping│  列出所有需要创建/修改的文件
  └──────┬──────┘
         │
         ▼
  ┌──────────────┐
  │Task Breakdown│  拆解为原子任务（每个 2-5 min）
  └──────┬───────┘
         │
         ▼
  ┌─────────────┐     未通过
  │ Self-Check  │────────────┐
  │  三项自检    │            │
  └──────┬──────┘            ▼
         │            ┌────────────┐
         │ 通过       │  自动修正   │
         │            │  重新自检   │
         │            └──────┬─────┘
         │                   │
         │◄──────────────────┘
         ▼
  ┌─────────────┐
  │  用户批准？  │
  └──────┬──────┘
    是 │     │ 否
       ▼     ▼
  ┌────────┐  ┌──────────┐
  │Approved│  │ 修改计划  │──→ 回到 Self-Check
  └──┬─────┘  └──────────┘
     │
     ▼
  输出 .forge/plans/<topic>.md
  status: "approved"
```

### Step 0：前置检查

1. 检查 `.forge/` 目录是否存在 → 不存在则提示 `forge init`。
2. 检查当前路径来源：
   - **全量路径**（从 `/forge spec` 进入）：Spec 必须已锁定，未锁定则阻断。
   - **标准路径**（从 `/forge` 路由进入）：检查 `.forge/specs/` 中是否有相关 Spec。
     - **有 Spec 且已锁定** → 正常进入 Step 1，基于 Spec 生成 Plan。
     - **有 Spec 但未锁定** → 提示先运行 `/forge spec` 完成锁定。
     - **无 Spec**（用户有明确需求但未走 spec 流程）→ 基于用户需求描述直接生成 Plan，在 Plan 文档中标注 `spec_ref: "none（基于用户需求描述）"`。此时 build 阶段的 Spec 门禁自动豁免。
   - **用户直接调用** `/forge plan` → 同标准路径逻辑。

### Step 1-5

详见第 2 节。

---

## 9. 边界情况处理

### 9.1 Spec 未锁定

**全量路径或有 Spec 但未锁定时**，阻断规划并输出：

```
🚫 规划阻断：规格未锁定

无法为未锁定的规格生成计划。请先运行 /forge spec 完成规格的 Review 和 Lock 流程。

规格路径：.forge/specs/<feature>/spec.md
当前状态：draft
```

**标准路径且无 Spec 时**，不阻断，基于用户需求描述直接生成 Plan：

```
ℹ️ 未找到锁定的 Spec，将基于你的需求描述直接生成计划。
如需更严格的需求管理，可先运行 /forge spec 固化需求。

注意：无 Spec 模式下，build 阶段的 Spec 门禁将自动豁免，
但 review 阶段的 Spec 对齐检查将跳过。
```

### 9.2 已有同名 plan

如果 `.forge/plans/<topic>.md` 已存在：

- **status 为 draft** → 读取现有计划作为基础，在其上修改而非重新生成。
- **status 为 approved** → 提示：

```
⚠️ 该主题的计划已批准：.forge/plans/<topic>.md
如需重新规划，请先将 status 改为 "draft"，然后重新运行 /forge plan。
```

### 9.3 Spec 需求过多导致任务数量过大

如果拆解后的任务数量超过 20 个，提醒用户：

```
⚠️ 当前计划包含 N 个任务，执行时间较长。建议：
1. 将 Spec 拆分为多个独立的 feature spec
2. 分批规划和执行
继续当前计划？(y/n)
```

### 9.4 自检反复不通过

如果自检在自动修正后仍然不通过（连续 3 次），停止自动修正，将问题呈现给用户：

```
⚠️ 以下检查项在自动修正后仍未通过：
- 类型一致性：`PaymentGateway` 接口无法自动生成，需要更多上下文

请提供更具体的接口定义，或确认是否接受当前状态。
```

### 9.5 无 knowledge/ 历史经验

如果 `.forge/knowledge/` 为空或不存在，跳过研究阶段的历史经验搜索，直接基于 Spec 和代码库生成计划。输出提示：

```
ℹ️ 未找到历史经验，将直接基于 Spec 和代码库生成计划。
```

### 9.6 无 `.forge/` 目录

提示先运行初始化：

```
⚠️ 未检测到 .forge/ 目录。请先运行 forge init 初始化项目。
```

---

## 10. 示例

### 示例 1：标准路径规划

Spec：`order-batch-export`（订单批量导出）

生成的计划（关键部分）：

```markdown
---
topic: "order-batch-export"
status: "draft"
date: "2025-01-15"
spec_ref: ".forge/specs/order-batch-export/spec.md"
---

## Objective

实现订单批量导出功能，支持按条件筛选导出和大数据量异步导出。对应 Spec：order-batch-export。

## Research Findings

- knowledge/ 中无相关历史经验
- 项目使用 Express + TypeScript + Vitest
- 现有导出功能：无（新功能）
- 现有测试模式：describe/it 结构，使用 vitest

## File Mapping

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `src/services/export.ts` | CREATE | 导出服务核心逻辑 |
| `src/services/export.test.ts` | CREATE | 导出服务单元测试 |
| `src/routes/export.ts` | CREATE | 导出 API 路由 |
| `src/routes/export.test.ts` | CREATE | 导出路由测试 |
| `src/jobs/async-export.ts` | CREATE | 异步导出任务 |
| `src/jobs/async-export.test.ts` | CREATE | 异步导出测试 |

## Task Breakdown

### Task 1：创建导出服务接口和筛选逻辑（4 min）

**文件**：`src/services/export.ts`、`src/services/export.test.ts`

**RED** — 写失败的测试

文件：`src/services/export.test.ts`

​```typescript
import { describe, it, expect } from 'vitest';
import { ExportService } from './export';

describe('ExportService', () => {
  it('should filter orders by date range', async () => {
    const service = new ExportService();
    const result = await service.filterOrders({
      startDate: '2025-01-01',
      endDate: '2025-01-07',
    });
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it('should return empty array when no orders match', async () => {
    const service = new ExportService();
    const result = await service.filterOrders({
      startDate: '1999-01-01',
      endDate: '1999-01-02',
    });
    expect(result).toEqual([]);
  });
});
​```

运行测试，确认失败：
​```bash
npx vitest run --grep "ExportService"
​```
预期：测试失败（ExportService 不存在）

**GREEN** — 写最少代码让测试通过

文件：`src/services/export.ts`

​```typescript
export interface OrderFilter {
  startDate: string;
  endDate: string;
  status?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface Order {
  id: string;
  date: string;
  status: string;
  amount: number;
}

export class ExportService {
  async filterOrders(filter: OrderFilter): Promise<Order[]> {
    // 查询数据库，按条件筛选
    return [];
  }
}
​```

运行测试，确认通过：
​```bash
npx vitest run --grep "ExportService"
​```
预期：测试通过

**REFACTOR** — 重构

- 添加 filter 参数验证（startDate 不晚于 endDate）
- 运行全部测试确认无回归：`npx vitest run`

**验证命令**：`npx vitest run --grep "ExportService"`
**提交信息**：`feat(export): add export service with order filtering`

### Task 2：实现大数据量异步导出判定（3 min）

...（完整的 RED/GREEN/REFACTOR 步骤）

## Spec Coverage

| Spec 需求 | 覆盖任务 |
|-----------|---------|
| 需求 1 场景 S1：选择"最近 7 天"并导出 | Task 1, Task 3 |
| 需求 1 场景 S2：筛选结果为空 | Task 1 |
| 需求 2 场景 S3：导出超过 10000 条 | Task 2 |
| 需求 2 场景 S4：后台导出完成通知 | Task 4 |
| 需求 2 场景 S5：下载链接过期 | Task 5 |
```

### 示例 2：自检发现问题

自检输出：

```
📋 计划自检

✅ Spec 覆盖率：所有 5 个场景均已覆盖
❌ 占位符扫描：发现 1 处禁止内容
  - Task 4 第 15 行：`// TODO: implement notification sending`
  → 替换为具体的通知发送代码
✅ 类型一致性：所有引用的类型和函数均有定义

正在修正...
```

修正后重新自检：

```
📋 计划自检

✅ Spec 覆盖率：所有 5 个场景均已覆盖
✅ 占位符扫描：未发现禁止内容
✅ 类型一致性：所有引用的类型和函数均有定义

自检通过。请审阅计划，批准后开始执行。
```


---

## 已知 AI 失败模式

以下是 Plan 阶段最常见的 AI 失败模式。在执行过程中，如果你发现自己正在做以下任何一件事——**立即停下来**。

### 失败模式 1：任务粒度过大（单任务超过 30 分钟）

**错误行为**：把一个大功能整体塞进一个任务里，比如"Task 1：实现完整的用户认证系统（含注册、登录、密码重置、JWT 刷新）"，预估时间 30 分钟甚至更长。或者虽然拆了多个任务，但每个任务仍然包含多个独立的功能点，无法在 2-5 分钟内完成。

**为什么这是错的**：§3 明确要求每个原子任务的预估执行时间为 2-5 分钟。粒度过大的任务意味着 Subagent 需要在一个上下文中处理太多事情，容易遗漏细节、跳过 TDD 步骤、或者在中途迷失方向。大任务也无法独立验证——如果失败了，你不知道是哪个部分出了问题，回滚和重试的成本极高。

**正确做法**：按"一个任务 = 一个可独立验证的行为变更"来拆解。如果一个任务的描述中出现了"和"、"以及"、"同时"，大概率需要继续拆分。每个任务完成后应该能通过一条验证命令确认结果。回到 §3 的拆解规则：太大就拆，太小就合，目标是 2-5 分钟。

### 失败模式 2：依赖关系遗漏

**错误行为**：任务列表中 Task 3 引用了 Task 1 中定义的类型，但 Task 2 被安排在 Task 1 之前执行。或者多个任务之间存在隐式依赖（比如 Task 4 的测试需要 Task 2 创建的 mock 数据），但任务排序中没有体现这种依赖关系。

**为什么这是错的**：Subagent 按顺序执行任务。如果依赖关系遗漏，Subagent 在执行某个任务时会发现缺少前置条件——类型未定义、函数不存在、测试数据缺失——导致任务失败或被迫跳过 TDD 的 RED 阶段。§3 的拆解规则明确要求"任务按依赖关系排序，前置任务先执行"。

**正确做法**：在 Task Breakdown 完成后，画出任务之间的依赖图（哪个任务的输出是哪个任务的输入）。确保每个任务引用的类型、函数、配置在之前的某个任务中已经定义。Self-Check 的"类型一致性"检查（§5.3）就是为此设计的——认真执行它，不要走过场。

### 失败模式 3：占位符未替换为具体内容

**错误行为**：在任务的 TDD 步骤中写 `// TODO: implement actual logic`，或者在 GREEN 阶段写 `// 添加适当的错误处理`，或者用 `类似 Task 2 的实现` 代替完整的代码。

**为什么这是错的**：§4 禁止内容列表明确列出了所有不允许出现的占位符——`TBD`、`TODO`、`待定`、`后续补充`、`类似 Task N`、`添加适当的错误处理`。计划是给 Subagent 执行的，Subagent 没有你的上下文，看到占位符只能猜。猜错了就是返工，猜对了也浪费了推理 token。

**正确做法**：每个任务的 RED/GREEN/REFACTOR 步骤必须包含完整的、可直接复制粘贴执行的代码。如果你写不出完整代码，说明你还没想清楚——回到 Step 1 Research 重新研究。Self-Check 的"占位符扫描"（§5.2）会捕获这些问题，但不要依赖自检来兜底，在写的时候就写完整。

### 失败模式 4：不读 spec 就拆任务

**错误行为**：跳过 Step 1 Research 中的"读取锁定的 Spec，逐条理解每个需求和场景"，凭对任务的"大概理解"直接开始 Task Breakdown。或者只读了 Spec 的标题和概述，没有逐条过场景。

**为什么这是错的**：Spec 是唯一真理源（§2 Step 1）。不读 Spec 就拆任务，等于在没有需求的情况下做设计——你不知道要覆盖哪些场景、有哪些边界条件、哪些是"明确不做"的。结果要么遗漏需求（Self-Check 的 Spec 覆盖率不通过），要么做了 Spec 没要求的东西（浪费时间），要么对需求的理解与 Spec 不一致（返工）。

**正确做法**：严格按照 §2 的五步流程执行，Step 1 Research 是强制步骤。读取 Spec 时逐条过每个需求和场景，确保理解每个场景的触发条件、预期行为和边界。在 Task Breakdown 时，对照 Spec 的场景汇总表逐条映射，确保每个场景至少被一个任务覆盖。Self-Check 的"Spec 覆盖率"检查（§5.1）是最后的安全网，但不要把它当作第一道防线。
