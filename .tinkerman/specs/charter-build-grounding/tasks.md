# build 阶段 Charter Grounding 注入 — 任务清单

- [ ] 1. build instructions.md 新增 Charter Grounding 节
  - 在 `skills/forge/lib/build/instructions.md` §2 Pre-build Checks 之后新增 §2.5 "Charter Grounding"
  - 内容:读取 `.tinkerman/charter.md` status:active → 注入 ≤500 tokens 摘要(核心问题/架构边界/INV-NNN 列表,格式同 `charter/instructions.md:55-64`)
  - 含 graceful degradation 三分支:active→注入 / draft·deprecated→标注 `ℹ No active charter` / 不存在→静默跳过
  - 明确声明:invariant 是"写代码时的约束",冲突报告到"关注点"区,不阻断 build
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 2. subagent-orchestration.md 的 Prompt 清单新增 charter 项
  - `skills/forge/lib/build/references/subagent-orchestration.md:29-39` "Prompt 必须包含" 新增 "Charter grounding 摘要(若 active):核心架构边界 + 相关 INV-NNN"
  - charter 不存在/非 active 时跳过此项,不产生空字段
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 3. CLAUDE.md charter 下游列表追加 build
  - `templates/CLAUDE.md:122` 的 charter 下游 skill 列表追加 `build`(与 decide/spec/plan/review 对齐)
  - _Requirements: 1.4_

- [ ] 4. charter skill 下游消费者说明同步
  - `skills/forge/lib/charter/instructions.md` 的"下游消费者"说明新增 build,标注注入位置 §2.5
  - `docs/forge-constitution-detail.md`(若含 charter 下游列表)同步更新
  - _Requirements: 3.1, 3.2_

- [ ] 5. 手动验证 graceful degradation 三分支
  - charter 不存在:build 不报错、不阻断
  - charter status:draft:build 标注 `ℹ No active charter` 继续
  - charter status:active:subagent prompt 可见 INV-NNN 列表
  - _Requirements: 验收标准_
