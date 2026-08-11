---
feature: pack-system
layout: tasks
created: 2026-05-09
spec_ref: ".tinkerman/specs/pack-system/requirements.md"
---

# Implementation Plan

按 TDD 铁律（RED → GREEN → REFACTOR）执行，每个任务粒度控制在 2-5 分钟或 0.5 个工作日。任务关联 Requirement AC 与 Design 章节。

**本 spec 的 src/ 新增模块**：`src/pack/`（4 文件）、`src/context/`（2 文件）、`src/glossary/`（2 文件）、`src/spec-leak-detector.ts`、`src/scenario-linter.ts`。既有 src/ 改动仅 `src/spec.ts`（集成 leak check 到 self-check）、`src/plan.ts`（集成 Expected Output check）、`src/build.ts`（集成 RED Verification Gate 解析）。

---

## Phase 1: 依赖与基础设施（≈ 0.5 天）

- [x] 1. 确认 `yaml` npm 依赖
  - [x] 1.1 检查 `package.json` 是否已有 `yaml` 依赖（cmux-integration spec 已引入）
  - [x] 1.2 若无，`npm install yaml --save --save-exact` 并更新 `check-deps.mjs` 白名单
  - 引用：R12 OBSERVABILITY 依赖纪律

- [x] 2. 建立 Pack 测试 fixtures 目录
  - [x] 2.1 创建 `test/pack/fixtures/packs/demo-empty/pack.yaml`（仅必填字段 + 空 extends）
  - [x] 2.2 创建 `test/pack/fixtures/packs/demo-full/` 含所有 9 类 extends 目录和示例文件
  - [x] 2.3 创建 `test/pack/fixtures/packs/demo-bad-manifest/pack.yaml` 缺 `forge_min_version`
  - [x] 2.4 创建 `test/pack/fixtures/custom/glossary/folio.md` 示例 custom override
  - [x] 2.5 创建 `test/pack/fixtures/specs/` 含含 leak 和无 leak 的 spec 样本各 2 份
  - 引用：Design §6.4

- [x] 3. 建立 Pack 类型定义
  - [x] 3.1 RED：`test/pack/types.test.ts` — 验证类型定义可被 import，无运行时测试
  - [x] 3.2 GREEN：`src/pack/types.ts` — 定义 `PackManifest`、`PackEntry`、`PackRegistry`、`EnabledPacks`
  - 引用：Design §3.1-3.4

---

## Phase 2: Pack 发现与加载（≈ 1 天）

- [x] 4. `src/pack/loader.ts` — Pack 扫描与解析
  - [x] 4.1 RED：`test/pack/loader.test.ts` 覆盖空目录 / 缺必填字段 / 坏 yaml / 正常 pack 四个场景
  - [x] 4.2 GREEN：实现 `loadPackRegistry(reposRoot, fs)`
    - `fs.readdir(packsDir)` 列出子目录
    - 对每个子目录读 `pack.yaml`，yaml 解析
    - 手写 schema 验证必填字段（不引入 Zod）
    - 失败 pack 进 warnings，不抛异常
  - [x] 4.3 Property test：`test/pack/loader.property.test.ts` fast-check 生成随机 manifest，断言 loader 不崩溃且 registry 序列化后反解析不变
  - [x] 4.4 REFACTOR：抽取 `validateManifest()` 为独立纯函数
  - 引用：R1.1-1.6，Design §4.1

- [x] 5. `src/pack/resolver.ts` — 分层路径解析
  - [x] 5.1 RED：`test/pack/resolver.test.ts` 覆盖 empty enabled / single pack / multi-pack / with custom / not-found
  - [x] 5.2 GREEN：实现 `resolvePath(relativePath, enabledPacks)` 和 `resolveAllPaths()`
    - 按 Custom > Pack 顺序尝试每个 layer
    - `resolvePath` 返回首个命中
    - `resolveAllPaths` 返回全部命中（用于 union 场景）
    - 路径穿越防护：`path.resolve` 后校验前缀
  - [x] 5.3 Property test：`test/pack/resolver.property.test.ts` 断言 Custom 总是优先、Resolution_Order idempotence
  - 引用：R11.1-11.5, R12.3，Design §4.2

- [x] 6. `src/pack/config.ts` — 项目级启用
  - [x] 6.1 RED：`test/pack/config.test.ts` 覆盖 `packs:` 字段不存在 / 空列表 / 未知 pack / 重复声明 / 正常
  - [x] 6.2 GREEN：实现 `parseEnabledPacks(configContent, registry, customLayerRoot)`
    - 复用 gray-matter 或 yaml 解析 frontmatter
    - 验证每个声明的 pack 存在于 registry
    - dedupe 保持首次出现顺序
    - 错误累计返回，不抛异常
  - 引用：R2.1-2.6，Design §4.3

---

## Phase 3: Pack 管理命令（≈ 1 天）

- [x] 7. `src/pack/commands.ts` — 7 个子命令实现
  - [x] 7.1 RED：`test/pack/commands.test.ts` 每个命令至少一个正路径一个错路径
  - [x] 7.2 GREEN：实现 `commandList(registry, enabled)` — 表格化输出
  - [x] 7.3 GREEN：实现 `commandEnable(name, config, registry)` — 追加/幂等
  - [x] 7.4 GREEN：实现 `commandDisable(name, config)` — 移除/幂等
  - [x] 7.5 GREEN：实现 `commandInspect(name, registry)` — 统计各类别计数
  - [x] 7.6 GREEN：实现 `commandOverride(path, enabled, force)` — 返回拷贝路径对
  - [x] 7.7 GREEN：实现 `commandValidate(name, registry)` — 校验 4 项
  - [x] 7.8 GREEN：实现 `commandNew(name)` — 返回脚手架文件列表
  - [x] 7.9 REFACTOR：提取共享辅助函数（frontmatter 读写、错误格式化）
  - 引用：R4.1-4.9，Design §4.4

- [x] 8. `skills/forge-pack/SKILL.md` — 新 skill
  - [x] 8.1 撰写 skill 主体 ≤120 行
    - 包含 frontmatter（name、description、disable-model-invocation: true）
    - 章节：Overview / 7 子命令使用说明 / Execution Flow / Edge Cases
  - [x] 8.2 添加 description 中的触发词（`/forge pack list`、`/forge pack enable` 等）
  - [x] 8.3 更新 `commands/forge.md` 将 `pack` 路由到本 skill
  - [x] 8.4 更新 `.claude/settings.json` 或 hooks（若需要）
  - 引用：R4，Design §4.11

---

## Phase 4: Bounded Context 引擎（≈ 1 天）

- [x] 9. `src/context/registry.ts` — Context 加载
  - [x] 9.1 RED：`test/context/registry.test.ts` 覆盖 empty / single layer / multi-layer override
  - [x] 9.2 GREEN：实现 `loadContexts(enabledPacks, fs)`
    - 遍历 `.tinkerman/custom/contexts/*.md` 和每个 pack 的 `contexts/*.md`
    - 解析 markdown frontmatter + body
    - Custom > Pack 同名覆盖
  - [x] 9.3 Property test：merge 顺序稳定性
  - 引用：R5.1-5.3, R5.6，Design §4.5

- [x] 10. `src/context/map.ts` — Context Map 加载
  - [x] 10.1 RED：`test/context/map.test.ts` 覆盖无 `_map.yaml` / 冲突边解析
  - [x] 10.2 GREEN：实现 `loadContextMap(enabledPacks, fs)`
    - 读各 layer 的 `_map.yaml`
    - 冲突边按 Custom > 先声明 pack > 后声明 pack 解决
  - 引用：R5.4-5.5，Design §4.6

---

## Phase 5: Glossary 引擎（≈ 1 天）

- [x] 11. `src/glossary/registry.ts` — 分 Context 术语加载
  - [x] 11.1 RED：`test/glossary/registry.test.ts` 覆盖空 / 单 context / 多 context / custom override / 回退到单文件
  - [x] 11.2 GREEN：实现 `loadGlossary(enabledPacks, fs)`
    - 遍历 `glossary/*.md` 各 layer
    - 文件名 → context 名（`_shared.md` → `_shared`）
    - 解析多个 `## <Term>` 段
    - Custom > Pack 同 context 同 term 覆盖
    - 向后兼容：空输入且无 custom → 读 `.tinkerman/glossary.md`
  - [x] 11.3 Property test：同 term 不同 context 不冲突
  - 引用：R6.1-6.6，Design §4.7

- [x] 12. `src/glossary/mismatch.ts` — 跨 Context 术语误用检测
  - [x] 12.1 RED：`test/glossary/mismatch.test.ts` 覆盖同 context 不报 / 跨 context 报 / `_shared` 不触发
  - [x] 12.2 GREEN：实现 `detectContextTermMismatch(text, currentContext, registry)`
    - 简单 tokenize（空格 + 标点边界 + CJK 启发式）
    - 查 `registry.byTerm`
    - 排除已在 `currentContext` 或 `_shared` 定义的 term
  - 引用：R6.4，Design §4.8

---

## Phase 6: Spec Leak Detector（≈ 1 天）

- [x] 13. `src/spec-leak-detector.ts` — 实现细节泄露检测
  - [x] 13.1 RED：`test/spec-leak-detector.test.ts` 覆盖
    - 代码块豁免（```...```）
    - 字面量 vs regex 模式
    - Glossary 白名单排除
    - 空 banned → 空结果
    - 多 layer banned union
  - [x] 13.2 GREEN：实现 `detectSpecLeak(specText, filePath, bannedRegistry, glossary, specContext)`
    - 按行遍历，维护 in_code_block 状态
    - 对每行应用每个 pattern（字面量用 `\b` 包裹，regex 直接编译）
    - 命中后查 glossary 白名单
    - 输出按 line 排序
  - [x] 13.3 Property test：`test/spec-leak-detector.property.test.ts`
    - 空 banned 空结果（∀ spec）
    - Glossary 覆盖单调性
  - [x] 13.4 Performance test：500 行 spec ≤100ms
  - 引用：R7.1-7.9, R12.2，Design §4.9

- [x] 14. banned-patterns 加载与 union
  - [x] 14.1 RED：`test/spec-leak/banned-loader.test.ts` 覆盖空 / 单 layer / 多 layer union / 同 pattern 去重
  - [x] 14.2 GREEN：实现 `loadBannedPatterns(enabledPacks, fs)` 返回 `BannedPatternRegistry`
    - 用 resolveAllPaths 拿到所有 layer 的 `banned-patterns.yaml`
    - union 各 category 的 patterns
    - 同 pattern 字面量去重
  - 引用：R7.3, R11.4，Design §4.2

- [x] 15. 集成 leak detector 到 forge-spec
  - [x] 15.1 RED：`test/spec/leak-integration.test.ts` 覆盖 lock 前有 leak 阻断 / 无 leak 通过
  - [x] 15.2 GREEN：修改 `src/spec.ts`
    - 在现有 self-check 后追加第 7 项 `Spec Leak Check`
    - 调 `detectSpecLeak()`，findings > 0 阻断 lock
    - 格式化输出 file:line + original + matched_term + suggested
  - [x] 15.3 新增 `skills/forge-spec/references/spec-leak-detector.md` 使用说明
  - [x] 15.4 更新 `skills/forge-spec/SKILL.md` §2 Step 2 self-check 表追加第 7 项
  - 引用：R7.7，Design §4.11

- [x] 16. 集成 leak detector 到 forge-review Layer 1
  - [x] 16.1 修改 `.claude/agents/spec-check.md` 执行逻辑，追加 leak 再扫步骤
  - [x] 16.2 更新 `skills/forge-review/SKILL.md` Layer 1 描述说明
  - [x] 16.3 测试：开发后引入 leak（如在代码注释中泄露到 spec），review 能 P1 报告
  - 引用：R7.8

---

## Phase 7: Scenario Linter（≈ 0.5 天）

- [x] 17. `src/scenario-linter.ts` — 4 条默认规则
  - [x] 17.1 RED：`test/scenario-linter.test.ts` 每条规则正反例
  - [x] 17.2 GREEN：实现 `lintScenarios(specText, filePath, options)`
    - SCN001：句号结尾（`.` 或 `。`）
    - SCN002：Scenario 结构完整
    - SCN003：THEN 外部可观察（关键词扫描）
    - SCN004：标题 kebab-case 或中文
  - [x] 17.3 Property test：clean input identity（清洁 spec 经过 linter 仍 clean）
  - 引用：R8.1-8.6，Design §4.10

- [x] 18. 集成 scenario linter 到 forge-spec
  - [x] 18.1 修改 `src/spec.ts` lock 前调 `lintScenarios()`
  - [x] 18.2 error-severity finding 阻断 lock；warning 仅提示
  - [x] 18.3 更新 `skills/forge-spec/references/spec-format.md` 加入 Scenario Linter 规则说明
  - 引用：R8.4

- [x] 19. 集成到 forge-accept
  - [x] 19.1 修改 `skills/forge-accept/` 加载时调 linter
  - [x] 19.2 lint-failed 的 scenario 标记为 skip，不执行
  - 引用：R8.5

---

## Phase 8: RED Verification Gate（≈ 0.5 天）

- [x] 20. 扩展 tdd-rules.md
  - [x] 20.1 在 `skills/forge-build/references/tdd-rules.md` 新增章节 `## RED Verification Gate`
  - [x] 20.2 详述三段证据字段（command / actual_output / expected_failure_reason）
  - [x] 20.3 添加 2 个完整示例（TS/vitest 一个、shell 一个）
  - [x] 20.4 添加"测试 PASS 或 ERROR 时的处理"说明
  - 引用：R9.1-9.6

- [x] 21. `src/build.ts` 集成
  - [x] 21.1 RED：`test/build/red-gate.test.ts` 覆盖 missing evidence / pass output / error output / valid fail output
  - [x] 21.2 GREEN：在 build subagent 输出解析处追加 RED Verification Gate 检查
    - 解析三段字段
    - 任一缺失 → 拒绝进入 GREEN
    - actual_output 不含失败指示符 → 要求重新 RED
  - 引用：R9.4

---

## Phase 9: Plan Expected Output（≈ 0.5 天）

- [x] 22. 扩展 atomic-task-format.md
  - [x] 22.1 在 `skills/forge-plan/references/atomic-task-format.md` Run 步骤格式中追加 `Expected:` 行
  - [x] 22.2 详述 3 种合法形式（exit code / substring / FAIL reason）
  - [x] 22.3 添加完整任务示例（RED + GREEN + REFACTOR 全含 Expected）
  - 引用：R10.1, R10.4

- [x] 23. `src/plan.ts` self-check 扩展
  - [x] 23.1 RED：`test/plan/expected-output-check.test.ts` 覆盖 missing expected / 3 种合法形式识别 / legacy plan warn
  - [x] 23.2 GREEN：添加 `Expected Output Completeness` 检查
    - 扫描每个 task 的 Run 步骤
    - 缺 Expected 的新 plan 报 error
    - Legacy plan（无 Expected 字段）报 warning
  - 引用：R10.2-10.3, R10.6

- [x] 24. `src/build.ts` 比对 Expected
  - [x] 24.1 RED：`test/build/expected-comparison.test.ts`
  - [x] 24.2 GREEN：在 subagent 执行完成后比对 actual 与 Expected
    - 不匹配记 P1 finding 到 progress
  - 引用：R10.5

---

## Phase 10: Zero-Pack 回归测试（≈ 0.5 天）

- [x] 25. `test/pack/zero-pack-invariant.test.ts`
  - [x] 25.1 设置 `packs:` 为空的 `.tinkerman/config.md` fixture
  - [x] 25.2 执行 forge-spec lock 场景，断言行为与 pre-Sprint snapshot 一致
  - [x] 25.3 执行 forge-plan approve 场景，同样断言
  - [x] 25.4 执行 forge-build TDD 循环场景
  - [x] 25.5 执行 forge-review 三层评审场景
  - [x] 25.6 验证 `detectSpecLeak()`、`loadGlossary()`、`loadContexts()` 在空输入返回空结果
  - 引用：R3.1-3.6

- [x] 26. CI 集成
  - [x] 26.1 更新 `.github/workflows/ci.yml` 增加 `zero-pack` 测试组
  - [x] 26.2 确保 `npm run check` 覆盖所有新测试
  - 引用：R3.2

---

## Phase 11: 文档与发布（≈ 0.5 天）

- [x] 27. README 与 CHANGELOG
  - [x] 27.1 `README.md` 新增"Pack 系统"章节，简述概念、启用方式、三层架构
  - [x] 27.2 `CHANGELOG.md` 追加本 Sprint 变更列表，按 R 编号列
  - [x] 27.3 `.tinkerman/knowledge/adr-index.md` 追加"Pack 机制引入"ADR 条目
  - [x] 27.4 生成 ADR `decide` 文档，`.tinkerman/decisions/ADR-NNNN-pack-system.md`

- [x] 28. 发布前 smoke test
  - [x] 28.1 手动执行 `/forge pack new demo-test` 创建测试 pack
  - [x] 28.2 手动执行 `/forge pack enable demo-test`、`list`、`inspect`、`disable`
  - [x] 28.3 手动执行 `/forge pack validate`
  - [x] 28.4 清理 `packs/demo-test/`
  - [x] 28.5 `npm run check` 全绿
  - [x] 28.6 `npx typedoc` 无错

---

## Task Dependencies

```
Phase 1 → Phase 2 → Phase 3
                  ↘
                    Phase 4 → Phase 5 → Phase 6 → Phase 10
                                     ↘
                                       Phase 7 ────↗
                  Phase 8 ────────────────────────↗
                  Phase 9 ────────────────────────↗

Phase 11 最后
```

## Exit Criteria

Sprint 1 完成的判定：

1. `/forge pack list` 能显示 `packs/` 下所有 Pack
2. 创建一个假 Pack（`packs/demo/`）并启用，`/forge pack inspect demo` 能工作
3. 写一个故意带 `ReservationService` 字样的 spec，leak detector 在 lock 时阻断
4. 写一个 scenario 缺句号，scenario linter 报 SCN001
5. 写一个 plan 缺 Expected，self-check 报 error
6. 写一个 RED 测试但不运行，build 阶段拒绝进入 GREEN
7. `packs:` 为空时所有现有测试通过（Zero-Pack 回归绿）
8. `npm run check` 全绿
9. `typedoc` 无错
