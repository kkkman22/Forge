# build 阶段 Charter Grounding 注入 — 设计文档

## 概述

在 build skill 的 Pre-build Checks 后新增 "Charter Grounding" 节,读取 `.forge/charter.md`(status:active 时)注入 ≤500 tokens 的 invariant 摘要到主流程与 subagent prompt。复用 charter 现有的 graceful degradation,不新增门禁、不阻断 build。

## 设计决策

### D1: 注入位置选 §2.5(Pre-build Checks 之后)而非 §1.7

- **问题**:charter grounding 放在 build 流程的哪个位置?
- **候选方案**:
  - A. §1.7(Context 阶段,最早)——与 git/status 读取并列
  - B. §2.5(Pre-build Checks 之后,TDD 开始之前)——门禁通过后才注入
  - C. §3.x(每个 task 循环内)——每个 subagent 独立读
- **选择**:**B(§2.5)**
- **理由**:门禁通过意味着任务可执行,此时注入 grounding 才有意义;放在 task 循环外避免每个 subagent 重复读 charter 文件(主 agent 读一次,摘要传入各 subagent prompt)。subagent-orchestration 的 "Prompt 必须包含" 清单接收的是主 agent 已提取的摘要,不是让每个 subagent 自己 Read charter.md。
- **风险与缓解**:若 charter 在 build 过程中被修改(罕见),摘要会过期——可接受,因为 charter 修改应触发新 spec 而非 mid-build 改判。

### D2: 注入"摘要"而非"全文",复用现有格式

- **问题**:注入 charter 全文还是摘要?
- **候选方案**:
  - A. 全文注入——subagent 能看到所有细节
  - B. ≤500 tokens 摘要(核心问题/架构边界/INV-NNN 列表)——与 spec/plan/review 一致
- **选择**:**B**
- **理由**:`charter/instructions.md:55-64` 已定义摘要格式且 spec/plan/review 已在用;全文会撑爆 `agents-dispatcher.ts:201` 的 4096 字符 prompt 截断;一致性格式让 charter 在五阶段(decide/spec/plan/build/review)的呈现统一。
- **风险与缓解**:摘要可能漏掉细节——可接受,因为 subagent 若需详情可自行 Read charter.md(注入的是 grounding 锚点,不是完整约束文本)。

### D3: 不新增 src/ 纯函数,纯 skill 文本层增强

- **问题**:是否需要在 `src/build.ts` 加 `extractCharterGrounding` 纯函数 + property test?
- **候选方案**:
  - A. 加纯函数 + property test(与 `checkBuildGate` 风格一致)
  - B. 纯 skill 文本层,主 agent 按 `charter/instructions.md:55-64` 格式自行提取
- **选择**:**B(本 spec 范围),A 作为可选增强**
- **理由**:charter 注入是"内容可见性"增强,不是"流程门禁";spec/plan/review 都是 skill 文本层读 charter,build 对齐即可;加纯函数会扩大 scope。若未来要统一五阶段的 charter 提取逻辑,再抽纯函数。
- **风险与缓解**:主 agent 提取摘要可能不一致——由 instructions.md 给出明确的提取规则(直接复用 charter skill 的格式定义)约束。

## 接口设计

无新增 API。变更点是 skill markdown 文本:
- `skills/forge/lib/build/instructions.md` 新增 §2.5 Charter Grounding 节
- `skills/forge/lib/build/references/subagent-orchestration.md:29-39` "Prompt 必须包含" 新增 charter grounding 项
- `templates/CLAUDE.md:122` charter 下游列表追加 build
- `skills/forge/lib/charter/instructions.md` 下游消费者说明更新

## 数据模型

无变更。charter.md 的 frontmatter 与正文格式不变。

## 风险

| 风险 | 缓解 |
|------|------|
| charter 摘要增加 build token 占用,触发 compact-safe 降级 | ≤500 tokens 属 context-budget Layer 1 "Keep Highest",不触发降级;若实测影响,在 §2.5 加 token 预算检查 |
| subagent 收到 charter invariant 后过度保守,拒绝执行合法任务 | Requirement 1.3 明确:invariant 是约束不是门禁,冲突时报告到"关注点"区而非阻断 |
| charter 在 build 期间被修改导致摘要过期 | 接受;charter 修改应触发新 spec,不在本 spec 处理 |
| 与 context-injection-activation spec 的 subagent prompt 注入位置冲突 | 两者正交:charter 是常量摘要(固定段落),context-injection 是文件清单(动态列表);可在 subagent-orchestration.md 清单中并列两项 |
