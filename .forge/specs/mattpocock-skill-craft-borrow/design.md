# mattpocock-skill-craft-borrow — 设计文档

## 概述

本 spec 是"文档/指导增强"为主(R1/R2/R5/R6/R9 纯文档,R3/R7 盘点+轻结构)、"门禁/结构增强"为辅(R4 debug 门禁、R8 review 单源)。设计核心是**增量非重写**:每条改动落到 Forge 已有的文档/SKILL/目录结构,不新建子系统。

落地分三波,按 ROI 与风险排序:
- **Wave 1(文档,低风险)**:R1 二分、R2 会话拓扑、R5 completion criterion、R6 failure modes、R9 leading words。全部落到 `docs/forge-constitution-detail.md` 与 `docs/`,不改代码、不改流程行为。
- **Wave 2(盘点+轻结构)**:R3 三分机制、R7 AGENTS.md 体检、R8 review 单源盘点。产出清单与共享文件,行为可逆。
- **Wave 3(门禁)**:R4 收紧现有 debug Phase 1 为 red-capable 回路 gate。唯一改"流程行为"的项,需谨慎,落到 debug SKILL。

## 设计决策

### D1: 用一个 spec 容纳 9 点,而非拆 9 个 spec

- **问题**:9 点都来自同一来源(mattpocock/skills v1.0.1)、同一主题(skill craft 借鉴),但颗粒度和波次不同。
- **候选**:
  - A. 拆 9 个独立 spec——语义分散,评审成本高,且多份是纯文档。
  - B. 一个 spec 9 个 Requirement——语义内聚,共享 Glossary/出处,分波次落地。
- **选择**:B。理由:9 点共享同一 Glossary(user-invoked/context load/leading word 等词在多个 Requirement 复用),拆开会重复定义;且大部分是文档,单 spec 更易整体评审"借鉴是否过度"。
- **风险**:spec 偏大。**缓解**:Wave 分波次 + 每个 Requirement 独立 AC/Validation Contract,build 可分批。

### D2: user/model-invoked 二分用 Forge 自有约定,不引入 Claude frontmatter

- **问题**:mattpocock 用 `disable-model-invocation: true` 这个 Claude Code 专有 frontmatter 表达二分。Forge 是多 harness(Claude/Codex/...),不能绑死 Claude 字段。
- **候选**:
  - A. 引入 `disable-model-invocation`——绑死 Claude,跨 harness 不一致。
  - B. Forge 自有约定(文档化 + 清单标注),frontmatter 层面不强求。
- **选择**:B。理由:Forge 宪法明确多 harness;二分的价值在**心智模型与 description 写法**,不在具体 frontmatter 字段。
- **风险**:缺机器可检字段,二分可能漂移。**缓解**:R1.AC5 的 skill 盘点清单作为人工锚点;后续若需可加 Forge 自有 frontmatter(非本 spec 范围)。

### D3: smart zone 用 ~120k 软阈值,不硬阻断

- **问题**:mattpocock 引用 smart zone(~120k)作为换会话信号。Forge §6 已有"超 100K tokens 记录建议开启新会话提示(不阻断)"。
- **候选**:
  - A. 沿用 100k 现状——与 mattpocock 不一致。
  - B. 改为 120k 与 mattpocock 对齐。
  - C. 保留 Forge 现有 100k,文档引用 mattpocock 120k 作为参考区间。
- **选择**:C。理由:不破坏现有行为;文档说明区间是模型相关(SOTA ~120k,旧模型更低),100k 是保守值。
- **风险**:两数字并存可能困惑。**缓解**:文档明确"100k 保守阈值 / 120k SOTA 参考"。

### D4: 强化现有 debug Phase 1 而非新增 Phase 编号,用文档约束不强制

- **问题**:R4 是唯一改流程行为的项。现有 `skills/forge/lib/debug/instructions.md` 已是 **Five-Phase** 结构:Phase 1 = Symptom Gathering(已含 reproduction conditions 判定),Phase 2 = Hypothesis Generation。直接"新增 Phase 0"会产生编号歧义(插入第六个 Phase?还是改造现有?),且与 Phase 1 现有职责重叠。
- **候选**:
  - A. 新增独立 Phase 0——编号歧义、与 Phase 1 重叠、改动面大。
  - B. 改造现有 Phase 1 的完成判定 + 新增 Phase 1→2 前置 gate——语义清晰,复用现有结构。
- **选择**:B。理由:mattpocock 的 "No red-capable command, no Phase 2" 本质就是"假设前置 gate",与现有 Five-Phase 的 Phase 1→2 边界天然对齐;改造而非新增,避免结构膨胀。
- **门禁力度**:不做代码硬门禁(debug 上下文动态,误判风险高、可能与 three-strike 冲突),用 SKILL/docs 强约束(leading word + 显式阻断指令),与 mattpocock 同级力度,agent 遵循率高。
- **风险**:agent 可能跳过。**缓解**:用 `tight`/`red-capable` leading word + 显式"If you catch yourself…stop"句式(mattpocock 原句模式),与 §2.4 three-strike 联动。

### D5: review 单源用 prose 引用,不用深路径交叉引用

- **问题**:R8 把三层 checker 重复规则单源化。mattpocock 明确:依赖用 `/skill` 式 prose 调用,不用 `../other/FILE.md`。
- **候选**:
  - A. 文件级交叉引用(`../shared/rules.md`)——脆弱、mattpocock 否定。
  - B. prose 引用("引用 review 共享词汇")——mattpocock 推荐。
  - C. 共享 model-invoked skill——最彻底但最重。
- **选择**:B 为主(轻),C 作为可选升级路径(若盘点发现重复量大)。理由:先轻后重,避免 over-engineering。
- **风险**:prose 引用无链接可能找不到。**缓解**:共享文件放固定路径 `skills/forge/lib/review/shared-vocabulary.md`,prose 点名该路径。

### D6: no-op 体检显式豁免 <IRON-LAW>

- **问题**:R7 用 no-op 测试过 AGENTS.md。但铁律的价值不是"提示模型默认行为",而是**阻断语义**(违反即违规)。no-op 测试会误判铁律。
- **候选**:
  - A. 铁律也过 no-op 测试——误删强制纪律,破坏 §2。
  - B. 铁律显式豁免——保留强制纪律,只删真正的散文 no-op。
- **选择**:B。理由:铁律是 Forge 比 mattpocock 强的核心,不可妥协。AC 已显式(R7.AC3)。
- **风险**:豁免边界模糊。**缓解**:体检清单对每条铁律标注"保留-阻断语义",对散文指令才跑 no-op 测试。

## 接口设计

无代码接口变更。文档"接口"为:
- `docs/forge-constitution-detail.md`:新增 §6 会话拓扑子节、user/model-invoked 小节。
- `docs/skill-craft-reference.md`(新):failure modes 词汇表 + completion criterion + leading words 词表。
- `docs/skill-inventory.md`(新):R1.AC5 盘点清单。
- `skills/forge/lib/review/shared-vocabulary.md`(新或改):R8 共享单源。
- `skills/forge/lib/debug/instructions.md`(改):R4 强化现有 Phase 1 完成判定 + 新增 Phase 1→2 gate,**不新增 Phase 编号**。
- `.forge/knowledge/out-of-scope/`(新目录约定):R3。
- `.forge/specs/mattpocock-skill-craft-borrow/agents-md-noop-audit.md`(附件):R7 体检清单。

## 数据模型

无数据模型变更。**skill frontmatter 不新增字段**(D2:user/model-invoked 二分用文档约定表达,不绑 Claude `disable-model-invocation`)。spec frontmatter 的 `pending_glossary_advisories` 是 Forge spec 指令 §6 step 9 的既有机制(记录 glossary-miss 供 learn 回写),非本 spec 新引入字段。

## Reversibility

- **Rollback Checklist**:
  - 删除新增文档章节:`docs/forge-constitution-detail.md` 的 user/model-invoked 小节、§6 会话拓扑子节;`docs/skill-craft-reference.md`、`docs/skill-inventory.md` 整文件删除。
  - 移除 review 单源:删除 `skills/forge/lib/review/shared-vocabulary.md`,恢复三个 checker 内联规则(git revert)。
  - 还原 `AGENTS.md`:git revert(R7 仅删除 no-op,git 可还原)。
  - 还原 debug SKILL:git revert `skills/forge/lib/debug/instructions.md` 的 Phase 1 gate 改动(恢复原 Phase 1 完成判定,Phase 编号本就未变)。
  - 移除目录约定:`.forge/knowledge/out-of-scope/`(若已创建)。
- **Mount Points**(本次改动挂在现有资产的何处):
  - 文档挂在 `docs/forge-constitution-detail.md §6`(会话拓扑)、新增 `docs/skill-craft-reference.md`。
  - 门禁挂在 `skills/forge/lib/debug/instructions.md` 现有 Phase 1→2 边界(不挂新 Phase)。
  - review 单源挂在 `skills/forge/lib/review/`。
  - no-op 体检挂在 `AGENTS.md`(增量删除,挂载点即原文)。

## 风险

| 风险 | 缓解 |
|------|------|
| 借鉴过度,稀释 Forge 已有强项 | 反漂移声明 + Out of Scope 明列不照搬项;每 Requirement 标出处 |
| 9 点单 spec 过大,build 拖长 | Wave 分波次;每 Requirement 独立可交付 |
| user/model-invoked 无机器字段会漂移 | R1.AC5 清单作人工锚;后续可加 Forge 自有 frontmatter |
| R4 与现有 debug Five-Phase 结构冲突/歧义 | D4 选改造现有 Phase 1 而非新增 Phase 编号;gate 挂 Phase 1→2 边界 |
| debug Phase 1 gate 文档约束 agent 可能跳过 | leading word + 显式 stop 句式 + three-strike 联动 |
| no-op 体检误删铁律 | R7.AC3 显式豁免 <IRON-LAW> |
| review 单源 prose 引用找不到文件 | 共享文件固定路径 + prose 点名 |
| smart zone 100k/120k 两数字困惑 | 文档明确"100k 保守 / 120k SOTA 参考" |
