---
feature: "prompt-assembly-snapshot"
status: "draft"
date: "2026-06-24"
workflow_variant: "design-first"
kind: "feature"
brownfield: true
---

## Purpose

Forge 的工程价值主张——"用工程纪律约束 AI 编码会得到更好的结果"——依赖 `forge-dispatcher` 把指令确定性拼装后喂给 LLM。`UNTRUSTED_PREAMBLE` fence、`generateHints` 的 additive 语义、dispatch_mode / allowed_tools 解析、integrity 校验共同构成模型行为的**输入契约**。但这一层目前只有针对 `generateHints` 的 golden-snapshot 测试，fence 包装、frontmatter 解析、allowed_tools 组合、dispatch_mode 选择等拼装结果**没有被整体锁定**。

本特性为 dispatch 拼装管线建立确定性的快照测试层（文档中"L3"），让任何把 fence 丢弃、把 hints 改成 override 语义、或解析条件写反的回归被 100% 拦截。

## Glossary

| Term | Definition |
|------|-----------|
| 拼装管线 (assembly pipeline) | `dispatchForgeSubcommand` 从 topic 到最终 `DispatchResult` 的全部确定性步骤 |
| 结构指纹 (structure fingerprint) | 从拼装结果中抽取的、与文案无关的结构断言集合 |
| additive hints | `generateHints` 的不变量：扩展命令序列只会增加 hint，永不删除命令 |

## Requirements

### Requirement 1: 拼装管线产出的结构契约被快照锁定

对代表性 `(tier × taskType × phase)` 组合，dispatch 拼装结果的结构指纹必须可重现且可对比。

#### Acceptance Criteria
- 当 对固定的代表性组合调用 dispatch 拼装时 系统应当 产出结构稳定的 `DispatchResult`，其 frontmatter / mode / resolved path / tools 集合可被序列化为 golden fixture
- 当 拼装结果缺少 `UNTRUSTED_PREAMBLE` 包装时 系统应当 被快照测试标红为破坏性回归
- 当 拼装结果缺失任一 structural field 时 系统应当 在快照测试中明确报出缺失字段名

### Requirement 2: additive hints 不变量被独立守护

`generateHints` 已有 golden-snapshot（`test/router-hint-rules-externalized.test.ts`），但 additive 性质未被显式断言。本特性补一个独立的不变量断言。

#### Acceptance Criteria
- 当 命令序列从单命令扩展为全命令序列时 系统应当 保证 hint tag 集合是超集（永不收缩）

### Requirement 3: 快照失败信息区分破坏性与文案性变更

快照测试面临一个现实问题：`skills/forge/lib/*.md` 的文案改动不应触发结构指纹失败。

#### Acceptance Criteria
- 当 仅 lib markdown 文案变化而结构未变时 系统应当 不触发结构指纹快照失败
- 当 拼装逻辑（fence / hints / dispatch_mode / tools 解析）变化时 系统应当 触发快照失败并提示需重新生成 golden

## Non-Functional Requirements

- **确定性**：快照测试零网络、零随机性、零时间依赖，纯函数输入输出对比
- **成本**：单次全量运行 < 2s（组合空间在百级，非千级）
- **维护**：golden fixture 更新必须经过 `npx tsx` 显式重新生成，禁止自动覆盖

## Out of Scope

- 不快照 `skills/forge/lib/*.md` 的 markdown 正文内容（那是源文件，改一行文案就全量失败会制造噪音）
- 不验证 LLM 收到指令后的**行为**是否正确（那是 L5 行为评测 Harness 的射程，本特性只锁"模型收到的是你意图的契约"）
- 不引入新的 CI 门禁脚本（复用 `npm test`，不进 `check` 的硬阻断链，先作为回归测试存在）

## Delta

### Added
- `src/forge-dispatcher/assemble-fingerprint.ts`：从 `DispatchResult` 抽取结构指纹的纯函数
- `test/forge-dispatcher/assembly-snapshot.test.ts`：代表性组合的快照测试
- `test/__fixtures__/assembly-golden.json`：golden 结构指纹

### Modified
- 无（纯新增测试 + 一个抽取辅助函数，不改 dispatch 主路径行为）

### Unchanged
- `dispatchForgeSubcommand` 的对外行为与 `DispatchResult` 形状
- 现有 `generateHints` golden-snapshot 测试
