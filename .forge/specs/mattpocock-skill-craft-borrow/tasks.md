# mattpocock-skill-craft-borrow — 任务清单

任务按 Wave 排序(ROI/风险递增)。每个任务标 `_Requirements:` 对应 requirements.md 的 Requirement 编号。文档类任务对应 `bash:contract` 验证,grep 即可。

## Wave 1: 文档(低风险)

- [ ] 1. user/model-invoked 二分文档
  - 在 `docs/forge-constitution-detail.md` 新增小节:定义 user-invoked / model-invoked、context load / cognitive load 权衡、description 写法分化、调用约束(user-invoked 不能调 user-invoked)。
  - 标注出处 mattpocock `docs/invocation.md`。
  - _Requirements: R1.AC1, R1.AC2, R1.AC3, R1.AC4_

- [ ] 2. Forge skill invocation 盘点清单
  - 盘点 `.agents/skills/`、`.Codex/agents/`、`skills/`,产 `docs/skill-inventory.md`,每个 skill 标 user-invoked / model-invoked + description 现状。
  - _Requirements: R1.AC5_

- [ ] 3. 会话拓扑 + smart zone 文档
  - 更新 `docs/forge-constitution-detail.md §6`:三节点(主流程/on-ramp/跨会话桥)、同窗规则、smart zone(~120k SOTA 参考 / 100k 保守)、handoff vs compact(fork vs continue)。
  - 与现有 §6 会话恢复/并发控制共存。
  - _Requirements: R2.AC1, R2.AC2, R2.AC3, R2.AC4, R2.AC5_

- [ ] 4. completion criterion 两属性文档
  - 在 skill-craft reference 文档定义 clarity + demand、防御顺序(先磨利边界再拆分)、demand 示例对照。
  - 作为 §2.5 / build 指导增强。
  - _Requirements: R5.AC1, R5.AC3, R5.AC4, R5.AC5_

- [ ] 5. failure modes 词汇表
  - 在 `docs/skill-craft-reference.md`(或同源文档)定义五词及判据:premature completion / duplication / sediment / sprawl / no-op。
  - no-op 测试表述:"这行 vs 模型默认,行为有变吗?"。
  - 在 skill-creator 类 skill 引用该清单。
  - _Requirements: R6.AC1, R6.AC2, R6.AC3, R6.AC4, R6.AC5_

- [ ] 6. leading words 词表
  - 产 Forge leading words 文档:选取原则(优先预训练已有词)、候选词清单(debug: tight/red-capable;verification 候选)。
  - _Requirements: R9.AC1, R9.AC2_

## Wave 2: 盘点 + 轻结构

- [ ] 7. CONTEXT/ADR/out-of-scope 三分文档 + 目录约定
  - 文档化三分(glossary 纯术语 / ADR 三条件 / rejected-requests)。
  - 约定 `.forge/knowledge/out-of-scope/` 为被拒需求库路径。
  - 与现有 `.forge/knowledge/` 五维度共存。
  - _Requirements: R3.AC1, R3.AC2, R3.AC5_

- [ ] 8. out-of-scope 库 triage/decide 查询机制
  - 在 `/forge decide`(及 triage 若存在)指导中加"先查 out-of-scope 库,命中即引用结论"。
  - 指导需求被拒时写入 out-of-scope。
  - _Requirements: R3.AC3, R3.AC4_

- [ ] 9. AGENTS.md no-op 体检清单
  - 逐句过 `AGENTS.md`,产体检清单附件(每条疑似 no-op + 删除/保留建议 + 判据)。
  - **显式豁免所有 <IRON-LAW>**(标注保留-阻断语义)。
  - 估算 context load 降幅。
  - 体检结论本身只产出清单,不执行删除(删除在 build 阶段)。
  - _Requirements: R7.AC1, R7.AC2, R7.AC3, R7.AC4, R7.AC5_

- [ ] 10. review 三层重复概念盘点
  - 盘点 spec-check/quality-check/security-check 重复规则/定义,产盘点文档。
  - _Requirements: R8.AC1_

- [ ] 11. review 共享词汇单源化
  - 把重复规则抽到 `skills/forge/lib/review/shared-vocabulary.md`(或等价路径)。
  - 三个 checker 改为 prose 引用("/引用 review 共享词汇"),删复制内容。
  - 验证:改一处三 checker 同步。
  - 不改三层架构/P0P1/fallback ladder。
  - _Requirements: R8.AC2, R8.AC3, R8.AC4, R8.AC5_

## Wave 3: 门禁(改流程行为)

- [ ] 12. /forge debug Phase 1 gate 文档
  - debug SKILL/docs 改造现有 Phase 1(Symptom Gathering):构建 tight red-capable 回路作为 Phase 1 产物 + Phase 1→2(Hypothesis Generation)前置 gate。**不新增 Phase 编号**。
  - 完成判定:能命名一条具体命令、已运行至少一次、red-capable/deterministic/fast/agent-runnable。
  - 显式阻断:无回路禁入 Phase 2(mattpocock 原句模式"If you catch yourself…stop")。
  - 非确定性 bug 允许高复现率替代。
  - 确实无法建回路:显式声明 + 列已尝试 + 请求授权,不继续假设。
  - 使用 leading words tight / red-capable。
  - 与 §2.4 three-strike 联动说明。
  - _Requirements: R4.AC1, R4.AC2, R4.AC3, R4.AC4, R4.AC5, R4.AC6_

- [ ] 13. leading words 在 debug SKILL 落地
  - 在 debug SKILL 中使用 tight / red-capable token 锚定行为。
  - _Requirements: R9.AC3, R9.AC4, R9.AC5_

## 验证任务(对应 Validation Contract)

- [ ] 14. 跑全部 bash:contract 验证
  - 执行 VAL-R1-001 ~ VAL-R9-002 全部 grep 契约,产出通过证据。
  - _Requirements: 全部 Validation Contract_

- [ ] 15. 反漂移自检
  - 对照 Out of Scope 与反漂移声明,确认未重写三级路由/TDD/review 三层/knowledge loop;所有 <IRON-LAW> 保留。
  - _Requirements: 反漂移声明_
