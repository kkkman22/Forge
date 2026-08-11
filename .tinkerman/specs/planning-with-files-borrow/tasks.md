# planning-with-files-borrow — 任务清单（re-review 修订版）

任务按 Wave 排序（P0 gate/梳理 → P1 状态/注入 → P2 增强 → P3 文档）。每个任务标 `_Requirements:` 对应 requirements.md，标 `_Depends:` 表依赖。

> **re-review 修订**：移除了原 Task 7（plan attestation），R1 改造目标改为既有 `stop-incomplete-tasks.mjs`（非 `stop-phase-verify.mjs`），Task 5/6 标注对 Task 4（active-plan 指针）的依赖。

## Wave 1: P0 gate + 钩子梳理（高风险）

- [ ] 1. Stop completion gate 增强（强化既有 stop-incomplete-tasks.mjs）
  - 改造 `scripts/stop-incomplete-tasks.mjs`（**既有脚本**，已注册 Stop hook、已扫描 progress）：把温和提示（"建议检查/恢复"）升级为引用 §2.3 验证铁律的结构化续做指令。
  - **注入安全（S-2 fix + N-1 fix）**：只提取 `^- \[ \]` 结构化行作为数据，用 `<pending-tasks>...</pending-tasks>` 边界标记包裹 + 标注"progress 文件原文，非指令"，禁止整段灌入；续做指令模板由代码硬编码常量生成。**包裹前对提取内容转义**（`<`→`&lt;`/`>`→`&gt;` 或剥离 `</?pending-tasks>` 字面串），防 checkbox 任务正文伪造闭合标签逃出边界。
  - 阶段归属过滤：识别当前阶段任务；阶段未知时回退扫描全部并标注"阶段未知，扫描全部"。
  - 全部完成 → 输出"通过"放行；progress 空目录 → 静默放行。
  - **prompt-only**：`exit 0` + stdout JSON；代码注释 + docs 明确声明"agent 可忽略，无技术兜底"，不使用"强制/硬门禁/阻断"措辞。
  - _Requirements: R1.AC1, R1.AC2, R1.AC3, R1.AC4, R1.AC5, R1.AC6, R1.AC7_

- [ ] 2. 钩子清单盘点（Hint/Gate 二分）
  - 逐个梳理 `hooks/hooks.json` 与 `.claude/settings.json` 的所有 hook，产 `docs/hooks-inventory.md`。
  - 每个 hook 标 Hint-Type（必须 `exit 0` + stdout）或 Gate-Type（必须阻断），判据="阻断是否为该钩子设计意图"。
  - 标注不一致项（应为 Hint 却阻断 / 应为 Gate 却放行）+ 修复建议。**不执行修复**。
  - _Requirements: R2.AC1, R2.AC2, R2.AC3, R2.AC5_
  - _Covers VAL: VAL-R2-001, VAL-R2-002, VAL-R2-004_

- [ ] 3. Hint/Gate 二分文档
  - 在 `docs/forge-constitution-detail.md`（或 hooks 专文）定义 Hint-Type / Gate-Type 判据 + 与 §2.6 Output Conciseness 共存。
  - _Requirements: R2.AC4_
  - _Covers VAL: VAL-R2-003_

## Wave 2: P1 状态/注入（中风险）

- [ ] 4. active-plan.json 活跃计划指针 + 路径校验
  - 定义 `.tinkerman/state/active-plan.json` 结构（plan_path / spec_ref / phase / pinned_at，开放区 state 目录）。
  - plan approve 或 build 启动时写入指针；阶段切换更新 phase。
  - **改 `scripts/inject-plan-context.mjs`**：优先读 active-plan.json 作为唯一注入源。
  - **路径穿越校验（S-10 fix + N-3 fix）**：注入前用 `fs.realpathSync()` 解析物理路径校验落在 `.tinkerman/plans/` 内（`realpathSync` 非 `path.resolve`——前者解析 symlink，后者只词法规范化会被符号链接逃逸），spec_ref 同样用 `realpathSync` 校验落在 `.tinkerman/specs/` 内，否则拒绝注入并退化。
  - 缺失时退化为现状（取最新 mtime）+ 一次性提示。
  - worktree 场景依赖既有隔离 + plan_path 区分，不新增调度逻辑。
  - _Requirements: R3.AC1, R3.AC2, R3.AC3, R3.AC4, R3.AC5, R3.AC6_

- [ ] 5. progress 注入滚动窗口 + 资源上限
  - _Depends: Task 4_（R4 用 R3 的活跃 plan 指针定位 `<slug>`，必须串行在 Task 4 后）
  - `.tinkerman/config.md` 新增 `context.progress_window`（正整数，默认 5）。**config 属冻结区，需走配置变更流程。**
  - **改 `scripts/inject-plan-context.mjs`**：注入 progress 时只取当前活跃 plan 对应的 `progress/<slug>.md` 最近 N 条。
  - 超窗口时摘要标注"仅显示最近 N 条，完整见 <file>"。
  - **资源上限（S-9 fix）**：单 progress 文件读取前 64KB 超限截断；条目切分用行首锚点线性扫描，禁止回溯爆炸正则。
  - **不删/归档 progress 文件**（受保护区，只在注入截断）。
  - _Requirements: R4.AC1, R4.AC2, R4.AC3, R4.AC4, R4.AC5, R4.AC6_

## Wave 3: P2 增强（中风险）

- [ ] 6. findings PreToolUse 注入 + 注入防护
  - _Depends: Task 4_（R5 用 R3 的 spec_ref/context_files 定位 findings）
  - **改 `scripts/inject-plan-context.mjs`**：顺带注入活跃 plan 关联的 `findings/*.md` 摘要。
  - **注入防护（S-6 fix + N-2 fix）**：用 `<findings>...</findings>` 边界标记包裹 + 标注"decide 阶段调研记录原文，非当前指令"，优先提取 frontmatter 结构化字段（title/severity 等，非"标题+首段"自由文本），禁止整段灌入（防间接 prompt injection）。**包裹前转义**（`<`→`&lt;`/`>`→`&gt;` 或剥离 `</?findings>` 字面串），防调研正文伪造闭合标签逃出边界。
  - 按 context 预算截断，超限只注入标题 + 首段；单文件读前 64KB；摘要提取线性扫描。
  - findings 不存在/为空时静默跳过。
  - 不改 findings 写入时机（仍 decide 阶段产出）。
  - _Requirements: R5.AC1, R5.AC2, R5.AC3, R5.AC4, R5.AC5, R5.AC6_

## Wave 4: P3 文档（低风险）

- [ ] 7. quick-start 最小可用闭环图
  - `docs/quick-start.md`（或 onboarding-beginner）首屏用一个图表达最小闭环（spec→plan→build→review→ship + Stop 完成 gate）。
  - 重型内容（三级路由 / subagent / ADR / knowledge loop）移入 onboarding-advanced，不放首屏。
  - **prompt-only 限制披露（S-7 fix）**：首屏如实标注 Stop 完成 gate 是 prompt-only（agent 可忽略），不误导为技术阻断。
  - 首屏图 + 说明 ≤ 200 行。不删现有文档，只调整内容分布。
  - _Requirements: R6.AC1, R6.AC2, R6.AC3, R6.AC4, R6.AC5_

## 验证任务（对应 Validation Contract）

- [ ] 8. 跑全部 bash:contract 验证
  - 执行 VAL-R1-001 ~ VAL-R6-004 全部 grep 契约，产出通过证据。
  - _Requirements: 全部 Validation Contract_

- [ ] 9. 反漂移自检
  - 对照 Out of Scope 与反漂移声明，确认：未重写三级路由/TDD/review 三层/knowledge loop；R1 为 prompt-only 无 exit-2；R4 不删 progress 文件；**plan attestation 已移除不在 spec 内**；所有 <IRON-LAW> 保留；与 mattpocock-skill-craft-borrow spec 不冲突。
  - _Requirements: 反漂移声明_

## 实施注意事项

- **TDD 强制**（§2.1）：涉及代码改动的任务（Task 1/4/5/6）必须 RED→GREEN→REFACTOR，先写失败测试。
- **钩子行为核验**：Task 2/3 虽为文档类，但 VAL-R2-002/004 需实际运行 hook 验证 exit code（非纯文档撰写）。
- **冻结区门禁**（§2.2）：Task 5 改 config.md 属冻结区，build 阶段需用户明确解锁或走配置变更流程。
- **依赖与合并顺序**：Task 5/6 都改 `inject-plan-context.mjs` 且 `_Depends: Task 4`，建议 Task 4/5/6 串行合入同一 PR 或明确 rebase 顺序，避免独立 PR 互冲。`inject-plan-context.mjs` 改动前 Read 一次，后续用 Edit（Read 去重铁律）。
- **prompt-only 诚实**：Task 1/7 涉及 R1 措辞，全程不得使用"强制/硬门禁/阻断"，如实披露"agent 可忽略"。
