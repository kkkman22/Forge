---
topic: "context-bloat-control"
status: "approved"
date: "2026-04-30"
spec_ref: ".kiro/specs/context-bloat-control"
format: "lightweight"
---

## Objective

实现六项针对 Forge 开发工作流的上下文膨胀控制优化，按 ROI 优先级排序：CLAUDE.md 瘦身、修剪铁律强化、三层输出截断防御、Code Review Graph 集成、并行 Agent 并发控制、会话边界文档化。

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#components-and-interfaces` | 定义六个组件的输入输出和结构 |
| `design.md#correctness-properties` | 定义 run-with-trim.sh 的四个正确性属性 |
| `design.md#testing-strategy` | 定义属性测试和结构验证测试策略 |

## Research Findings

### 来自知识库
- **instincts.md**（confidence: 0.8）：外部命令使用纯函数构建器 + execFileSync — run-with-trim.sh 遵循此模式，只使用 POSIX 工具且不拼接命令字符串

### 来自执行指标
- 历史 Plan 偏差率：会话 1 高(>1.5)，建议预估时间 ×1.25
- 验证命令健康度：npx vitest run 100%，npx biome check 83%

### 来自代码库分析
- `CLAUDE.md` 当前约 272 行，需瘦身至 100-150 行
- `skills/forge-build/SKILL.md` 需更新 §Context Budget Management、§3.4、§3.5
- `scripts/init.sh` 需添加 code-review-graph 安装步骤
- `templates/CLAUDE.md` 需同步瘦身结构

## File Mapping

| File Path | Operation | Description |
|---------|------|------|
| `docs/forge-constitution-detail.md` | CREATE | CLAUDE.md 瘦身后的详细内容参考文档 |
| `CLAUDE.md` | MODIFY | 瘦身至 100-150 行，添加 §6 Session Boundaries |
| `templates/CLAUDE.md` | MODIFY | 同步瘦身结构，保留模板变量 |
| `skills/forge-build/SKILL.md` | MODIFY | 强化 §CBM 修剪铁律、更新 §3.4 图探针、添加 §3.5 run-with-trim 指令 |
| `scripts/run-with-trim.sh` | CREATE | POSIX 验证命令包装脚本 |
| `scripts/init.sh` | MODIFY | 添加 code-review-graph 安装步骤 |
| `.tinkerman/config.md` | MODIFY | 添加 max_parallel_agents 配置 |
| `skills/forge-review/SKILL.md` | MODIFY | 添加并发控制引用 |
| `skills/forge-decide/SKILL.md` | MODIFY | 添加并发控制引用 |
| `skills/forge-resume/SKILL.md` | MODIFY | 添加会话边界恢复说明 |
| `test/docs/document-structure.test.ts` | CREATE | 文档结构验证测试 |
| `test/scripts/run-with-trim.property.test.sh` | CREATE | run-with-trim.sh 属性测试 |

## Task Breakdown

### Task 1: 创建 CLAUDE.md 瘦身后的详细参考文档
- **Goal**: 将当前 CLAUDE.md 的详细表格、示例和说明提取到独立参考文档
- **File**: `docs/forge-constitution-detail.md`
- **Design Reference**: `design.md#components-and-interfaces` — Component 1: CLAUDE.md Slimming, Reference_Doc Structure
- **Property**: N/A
- **Depends On**: (none)
- **Verify**: `test -f docs/forge-constitution-detail.md && grep -q "§1 Task Routing Rules" docs/forge-constitution-detail.md`
- **Commit**: `docs: create forge-constitution-detail.md with extracted CLAUDE.md details`

### Task 2: 瘦身 CLAUDE.md 至 100-150 行
- **Goal**: 将 CLAUDE.md 精简至 100-150 行，保留所有章节标识符和单行摘要，添加引用指针
- **File**: `CLAUDE.md`
- **Design Reference**: `design.md#components-and-interfaces` — Component 1: Slimming Rules
- **Property**: N/A
- **Depends On**: Task 1
- **Verify**: `bash -c 'lines=$(wc -l < CLAUDE.md); [ $lines -ge 100 ] && [ $lines -le 150 ]' && grep -q "→ 详见" CLAUDE.md`
- **Commit**: `refactor(claude): slim CLAUDE.md to 100-150 lines with reference pointers`

### Task 3: 同步 templates/CLAUDE.md 瘦身结构
- **Goal**: 将模板文件同步瘦身，保持与 CLAUDE.md 等价的结构（模板变量替换后）
- **File**: `templates/CLAUDE.md`
- **Design Reference**: `design.md#components-and-interfaces` — Component 1: Template Sync
- **Property**: N/A
- **Depends On**: Task 2
- **Verify**: `bash -c 'lines=$(wc -l < templates/CLAUDE.md); [ $lines -ge 100 ] && [ $lines -le 150 ]' && grep -q "{{project_name}}" templates/CLAUDE.md`
- **Commit**: `refactor(template): slim CLAUDE.md template to match main structure`

### Task 4: 强化 forge-build SKILL.md 中的修剪铁律
- **Goal**: 将 §Context Budget Management 的建议性规则升级为硬约束，使用强制性语言
- **File**: `skills/forge-build/SKILL.md`
- **Design Reference**: `design.md#components-and-interfaces` — Component 2: Trimming Iron Law
- **Property**: N/A
- **Depends On**: (none)
- **Verify**: `grep -q "MUST truncate\|MUST replace\|MUST NOT exceed" skills/forge-build/SKILL.md && grep -q "300 tokens\|200 tokens\|50 tokens" skills/forge-build/SKILL.md`
- **Commit**: `feat(skill): harden trimming iron law in forge-build SKILL.md`

### Task 5: 创建 run-with-trim.sh 包装脚本
- **Goal**: 创建 POSIX shell 脚本，包装验证命令，成功时截断输出，失败时原样传递
- **File**: `scripts/run-with-trim.sh`
- **Design Reference**: `design.md#components-and-interfaces` — Component 3: Layer 1 run-with-trim.sh
- **Property**: Property 1 (Exit code preservation), Property 2 (Success truncation), Property 3 (Failure passthrough), Property 4 (Header presence)
- **Depends On**: (none)
- **Verify**: `chmod +x scripts/run-with-trim.sh && bash -c 'exit 0' | scripts/run-with-trim.sh true; echo $?'; [ $? -eq 0 ]`
- **Commit**: `feat(script): add run-with-trim.sh for output truncation`

### Task 6: 编写 run-with-trim.sh 属性测试
- **Goal**: 使用 bats-core 编写四个正确性属性的测试，每个至少 100 次迭代
- **File**: `test/scripts/run-with-trim.property.test.sh`
- **Design Reference**: `design.md#correctness-properties` — Property 1-4 definitions
- **Property**: Property 1-4
- **Depends On**: Task 5
- **Verify**: `bats test/scripts/run-with-trim.property.test.sh`
- **Commit**: `test: add property tests for run-with-trim.sh`

### Task 7: 在 forge-build SKILL.md 添加 run-with-trim 指令
- **Goal**: 在 §3.5 添加使用 run-with-trim 包装 CI_Check_Command 的指令
- **File**: `skills/forge-build/SKILL.md`
- **Design Reference**: `design.md#components-and-interfaces` — Component 3: Layer 2 AI Trimming Iron Law
- **Property**: N/A
- **Depends On**: Task 5
- **Verify**: `grep -q "run-with-trim" skills/forge-build/SKILL.md && grep -q "scripts/run-with-trim.sh" skills/forge-build/SKILL.md`
- **Commit**: `docs(skill): add run-with-trim wrapper instruction to forge-build`

### Task 8: 在 init.sh 添加 code-review-graph 安装步骤
- **Goal**: 添加 code-review-graph pip 安装，失败时记录警告并继续
- **File**: `scripts/init.sh`
- **Design Reference**: `design.md#components-and-interfaces` — Component 4: Integration Points, Installation
- **Property**: N/A
- **Depends On**: (none)
- **Verify**: `grep -q "code-review-graph" scripts/init.sh && grep -q "pip install" scripts/init.sh`
- **Commit**: `feat(init): add code-review-graph installation with error handling`

### Task 9: 更新 forge-build SKILL.md §3.4 图探针策略
- **Goal**: 记录基于图的探针作为主要方法，grep 作为回退方案
- **File**: `skills/forge-build/SKILL.md`
- **Design Reference**: `design.md#components-and-interfaces` — Component 4: Probe #1/#2 replacement
- **Property**: N/A
- **Depends On**: Task 8
- **Verify**: `grep -q "code-review-graph query" skills/forge-build/SKILL.md && grep -q "fallback" skills/forge-build/SKILL.md`
- **Commit**: `docs(skill): document graph-based probes in forge-build §3.4`

### Task 10: 在 config.md 添加 max_parallel_agents 配置
- **Goal**: 添加并发控制配置字段，默认值为 6
- **File**: `.tinkerman/config.md`
- **Design Reference**: `design.md#components-and-interfaces` — Component 5: Config Addition Model
- **Property**: N/A
- **Depends On**: (none)
- **Verify**: `grep -q "max_parallel_agents:" .tinkerman/config.md && grep -q "6" .tinkerman/config.md`
- **Commit**: `feat(config): add max_parallel_agents configuration`

### Task 11: 在 CLAUDE.md 添加并发控制和会话边界文档
- **Goal**: 在 §Subagent 并行执行配置 添加并发控制说明，新增 §6 Session Boundaries
- **File**: `CLAUDE.md`
- **Design Reference**: `design.md#components-and-interfaces` — Component 5: Degradation Strategy, Component 6: CLAUDE.md §6 Content
- **Property**: N/A
- **Depends On**: Task 2, Task 10
- **Verify**: `grep -q "§6 Session Boundaries" CLAUDE.md && grep -q "429" CLAUDE.md && grep -q "degradation" CLAUDE.md`
- **Commit**: `docs(claude): add concurrency control and session boundaries documentation`

### Task 12: 在相关 SKILL 文件添加并发控制引用
- **Goal**: 在 forge-build、forge-review、forge-decide SKILL.md 添加并发控制引用
- **File**: `skills/forge-build/SKILL.md`, `skills/forge-review/SKILL.md`, `skills/forge-decide/SKILL.md`
- **Design Reference**: `design.md#components-and-interfaces` — Component 5: Logging
- **Property**: N/A
- **Depends On**: Task 10, Task 11
- **Verify**: `grep -q "max_parallel_agents" skills/forge-build/SKILL.md skills/forge-review/SKILL.md skills/forge-decide/SKILL.md`
- **Commit**: `docs(skills): add concurrency control references to build/review/decide skills`

### Task 13: 在 forge-resume SKILL.md 添加会话边界恢复说明
- **Goal**: 记录 /forge resume 是会话边界后恢复上下文的推荐方法
- **File**: `skills/forge-resume/SKILL.md`
- **Design Reference**: `design.md#components-and-interfaces` — Component 6: forge-resume/SKILL.md Addition
- **Property**: N/A
- **Depends On**: Task 11
- **Verify**: `grep -q "session boundary" skills/forge-resume/SKILL.md && grep -q "resume" skills/forge-resume/SKILL.md`
- **Commit**: `docs(skill): add session boundary recovery note to forge-resume`

### Task 14: 编写文档结构验证测试
- **Goal**: 创建 TypeScript 测试验证 CLAUDE.md 行数、章节标识符、引用指针有效性
- **File**: `test/docs/document-structure.test.ts`
- **Design Reference**: `design.md#testing-strategy` — Example-Based Tests, Requirement 1-6
- **Property**: N/A
- **Depends On**: Task 2, Task 3, Task 4, Task 9, Task 10, Task 11, Task 13
- **Verify**: `npx vitest run --grep "document-structure"`
- **Commit**: `test: add document structure validation tests`

## Spec Coverage

| Spec Requirement | Covering Tasks |
|-----------|---------|
| Requirement 1.1-1.8 (CLAUDE.md 瘦身) | Task 1, Task 2, Task 3 |
| Requirement 2.1-2.9 (修剪铁律) | Task 4 |
| Requirement 3.1-3.10 (三层输出截断) | Task 5, Task 6, Task 7 |
| Requirement 4.1-4.10 (Code Review Graph) | Task 8, Task 9 |
| Requirement 5.1-5.8 (并发控制) | Task 10, Task 11, Task 12 |
| Requirement 6.1-6.6 (会话边界) | Task 11, Task 13 |

## 依赖图

```
Task 1 → Task 2 → Task 3 → Task 14
        ↓
     Task 11 → Task 13 → Task 14
Task 4 ──┐
        ├────── Task 14
Task 5 → Task 7 ──┘
Task 8 → Task 9 ──┘
Task 10 → Task 11 → Task 12 ──┘
```
