[← 返回索引](./INDEX.md)

# Forge — 项目宪法详细内容

> 本文档是 CLAUDE.md 的详细版本，包含所有表格、示例和扩展说明。
> CLAUDE.md 中的规则通过 `→ 详见 docs/forge-constitution-detail.md §<章节>` 引用此处。

---

## §1 Task Routing Rules

### Three-Tier Routing Table

| Tier | Condition | Command Sequence |
|------|-----------|-----------------|
| **Light** | 影响文件 ≤ 1 且改动 ≤ 20 行 | `build → review` |
| **Standard** | 需求明确或已有 Spec | `plan → build → review → test → ship` |
| **Full** | 新服务 / 新数据库 / 认证变更 / 需求模糊 | `decide → spec → plan → build → review → test → ship → learn` |

### Routing Principles Details

1. **用户覆盖优先**：用户明确指定档位时，以用户为准，无论 AI 建议如何。
2. **宁重勿轻**：无法判定时，选择更重的档位。轻量路径跳过了 spec/plan/test，只适用于真正的小改动。
3. **不可跳步**：选定档位后，必须按序执行对应的命令序列，不得跳过任何步骤。

---

## §2 Execution Discipline

### §2.1 TDD Enforcement (Full Examples)

**TDD 循环示例**：

```typescript
// RED - 写失败的测试
describe('Calculator', () => {
  it('should add two numbers', () => {
    const calc = new Calculator();
    expect(calc.add(2, 3)).toBe(5);
  });
});
// 运行测试，确认失败：Calculator 不存在

// GREEN - 写最少代码让测试通过
class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
}
// 运行测试，确认通过

// REFACTOR - 重构（保持测试通过）
// 提取类型、添加验证、优化实现
```

**铁律**：如果发现代码先于测试编写——删除代码，从测试开始。没有例外。

### §2.2 Pre-build Checks (Full Gate Table)

| Gate | Condition | On Failure |
|------|-----------|------------|
| Spec 锁定 | `.forge/specs/` 中对应 Spec 的 status 为 `locked` | 阻断 build，提示先完成 `/forge spec` |
| Plan 批准 | `.forge/plans/` 中对应 Plan 的 status 为 `approved` | 阻断 build，提示先完成 `/forge plan` |
| 分支隔离 | 当前 Git 分支是 `feature/<topic>` 或 `forge/<topic>` | 自动切换或创建对应分支（工作树不干净时阻断） |

**分支隔离门禁详情**：每个功能的代码必须在其对应的 feature 分支上开发，防止多功能代码混入同一分支。Build 启动时，如果当前分支不是 `feature/<topic>` 或 `forge/<topic>`，自动创建或切换到正确分支。工作树有未提交变更时阻断并提示用户先处理。

### §2.3 Verification Iron Law (Full Prohibited Phrases List)

以下声明一律拒绝接受：
- "应该可以了"
- "看起来没问题"
- "之前测试通过了"
- "逻辑上没问题"

**铁律**：没有运行验证命令 = 不能声明通过。

### §2.4 Three-Strike Reroute (Full Escalation Flow)

当同一修复连续失败 **3 次**时：

```
第 1 次失败 → 第 2 次失败 → 第 3 次失败
                                ↓
                        立即停止修复
                                ↓
                    进入 /forge debug 根因分析
                                ↓
                        禁止第 4 次尝试同方向
```

在 `/forge debug` 中，如果同一假设连续验证失败 3 次：
1. 停止修复
2. 质疑架构——问题可能不在代码层面
3. 与开发者讨论，重新评估方向

### §2.4.1 Stop Hook 安全约束（Claude Code 2.1.143+）

Claude Code 在 Stop hook 连续 8 次返回 block（exit 2 或 block JSON）时会强制结束 turn。
Forge 的 Stop hook 链（plugin.json）以"提示式 echo"为主要交互方式，**禁止使用 exit 2
或输出 `{"continue":false}` / `{"decision":"block"}`**。该约束由 `test/contract.test.ts`
的 `stop-hook-no-block` 套件守护。

### §2.5 Context Refresh Discipline (Full Details)

在标准路径和全量路径的 build 阶段，主 Agent 必须执行周期性的 Restatement Checkpoint：

- **每完成 N 个任务**（N 由 config.md 的 restatement_interval 配置，默认 3），
  暂停编排，重读 progress 和 status，在上下文尾部追加 Restatement 摘要。
- **Sub-Agent 返回异常状态时**（BLOCKED / NEEDS_CONTEXT / DONE_WITH_CONCERNS），
  在处理之前先执行一次 Restatement。
- **Restatement 不修改 System Prompt**，只追加到对话尾部。

**目的**：对抗长任务中的注意力衰减。如果你发现自己在跳过探针、合并步骤、或不检查 Sub-Agent 状态，说明你需要一次 Restatement。

### §2.6 Output Conciseness (Full Prohibited Patterns Table)

#### Prohibited Output Patterns

在执行代码编辑操作时，以下 Narration 模式被禁止：

| Pattern Type | Example |
|---------|------|
| 操作预告 | "现在我要修改 X 文件" / "Now I'll modify X file" |
| 自我对话 | "让我添加 Y 字段" / "Let me add Y field" |
| 逐步解说 | "接下来将 Z 传入 W" / "Next, I'll pass Z into W" |
| 步骤枚举 | "首先...然后...最后..." / "First...then...finally..." |
| 工具调用预告 | 对即将执行的工具调用的重复描述 |

#### Preserved Output List

以下 Forge 结构化输出不受简洁性约束影响，必须完整保留：

- TDD 阶段标记：🔴 RED / 🟢 GREEN / 🔵 REFACTOR 及其测试运行结果
- Closure-First 探针结果：Probe #1, Probe #2, Verify #1 输出块
- Restatement 摘要：周期性上下文刷新的 3 区块格式
- P5 证据链：`[Command] → [Output] → [Claim]` 验证格式
- 评审报告：含严重度等级（P0/P1/P2/P3）的评审发现
- 路由分析：档位建议、任务类型、项目阶段输出
- 前置检查结果：门禁检查通过/失败输出
- 进度更新：任务完成标记和进度摘要

#### Decision Point Examples

在以下决策点，允许简要说明理由：

- **设计选择**：在多个实现方案间做选择时
- **意外情况**：遇到意外的代码状态、缺失文件或探针失败时
- **计划调整**：偏离计划或重新排序任务时
- **方向变更**：失败后切换方案时（如三次换路）
- **阻塞报告**：报告 BLOCKED 或 NEEDS_CONTEXT 状态时

**Decision_Point 输出模板**：`[原因] → [选择] → [依据]`

**示例**：
> 接口签名与 Spec 不一致 → 以 Spec 为准重新定义 → Plan Task 2 明确要求对齐 Spec §3.2

#### Priority

SKILL 定义的输出格式 > 简洁性约束。当 SKILL 要求特定输出（模板、标记、结构化块）时，简洁性规则自动让步。

### §2.8 Scripts as Black Box

**判定流程**：

1. agent 需要调用 scripts/<name> 时 → 先 `bash scripts/<name> --help`
2. --help 输出能决定用法 → 直接调用
3. --help 不足以决定用法 → 明确声明"需要查看源码"并标注原因
4. 脚本本身需要修改或扩展 → 允许读源码

**例外**：internal-only / one-off 类脚本（记录在 `scripts/.help-exempt`）无此约束。

**脚本分类**：每个脚本文件头声明 `# category: user-facing` / `internal-only` / `one-off`。由 `scripts/validate-scripts-help.mjs` 校验。

---

## §3 Review Discipline

### Three-Layer Review Table

| Layer | Reviewer | Check Content |
|-------|----------|--------------|
| **Layer 1: Spec Alignment** | spec-check | 每个需求是否实现、每个场景是否覆盖、是否存在超出 Spec 的实现（scope creep） |
| **Layer 2: Code Quality** | quality-check | 命名一致性、错误处理完整性、性能热点、测试覆盖率、代码重复、可维护性 |
| **Layer 3: Security & Risk** | security-check | 硬编码密钥、注入风险、不安全依赖、权限边界、敏感数据泄露 |

### Severity Table

| Level | Meaning | Handling |
|-------|---------|----------|
| **P0** | 阻塞发布 | 必须立即修复，**阻断 `/forge ship`** |
| **P1** | 高影响 | 必须在发布前修复，**阻断 `/forge ship`** |
| P2 | 中影响 | 应该修复，可协商时间 |
| P3 | 低影响 | 建议改进，开发者自行决定 |

**铁律**：存在 P0 或 P1 问题时，`/forge ship` 被阻断。修复后必须重新评审。

---

## §4 Knowledge Discipline

### Capture Dimensions (Full Details)

每次开发完成后，必须执行 `/forge learn` 从五个维度提取经验：

1. **问题模式**：遇到了什么类型的问题
2. **解决方案**：最终如何解决的
3. **踩坑记录**：走了哪些弯路
4. **决策理由**：为什么选择这个方案而非其他
5. **可复用模式**：哪些做法可以复用到未来的任务

### Knowledge Base Limit (Full Details)

- 知识库文档数量上限：**20** 个（默认 20，可在 `.forge/config.md` 中配置）
- 超出上限时，按置信度排序，清理最低置信度的文档
- **Confidence < 0.3 的模式自动清理**——低置信度的经验不值得保留
- 高频模式写入 `instincts.md` 时附带 Confidence Score（0.3 - 0.9）

### Backflow Details

- `/forge plan` 执行时自动搜索 Knowledge Base 中的相关经验
- `/forge build` 执行时自动搜索 Knowledge Base 中的历史踩坑记录
- 知识不是写完就放着——它必须在后续任务中被主动检索和应用

---

## §5 Self-Evolution Protocol

### Categories Table (Full Details)

| Category | Source | Threshold |
|----------|--------|-----------|
| Project-specific traps | known-failures.md | occurrence >= 3 |
| Repeated correction patterns | instincts.md | confidence >= 0.8 |
| Environment/tool quirks | skill-feedback.md | frequency >= 3 |
| Cross-session behavior corrections | session journals | same issue in 3+ sessions |
| Rule friction adjustments | metrics.md | 3+ session degradation trend |

### Constraints (Full Details)

- **15-rule cap** — evolved-rules.md holds at most 15 rules. New rules require retiring low-value existing rules when at capacity.
- **Staleness policy** — Rules not triggered in the last 5 sessions are flagged for retirement review.
- **Guarded zone** — evolved-rules.md is in the Guarded protection zone: updatable only by `/forge learn` rule distillation, not deletable outside maintenance.
- **Sections 1–4 are immutable** — Owned by `forge init`. The self-evolution mechanism never modifies them.

### Exclusions (Full Details)

The following are NOT valid rule candidates:
- Architecture descriptions inferable from code
- File path lists
- General best practices Claude already knows
- Raw knowledge data (belongs in knowledge files, not rules)
- Standards enforced by existing tools (e.g. Biome code style)
