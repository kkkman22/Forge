---
feature: feature-dossier-index
layout: tasks
created: 2026-05-11
spec_ref: ".forge/specs/feature-dossier-index/requirements.md"
---

# Implementation Plan

按 TDD 铁律（RED → GREEN → REFACTOR）执行。每个子任务末尾挂 `_Requirements: x.y_` 回指对应 AC。

总工作量估计：**约 1.5 个工作日**（含 R9 约 2 工作日）。

**新增文件**：
- `src/feature-dossier.ts`（核心纯函数 + 类型）
- `scripts/rebuild-feature-dossier.mjs`（CLI）
- `test/feature-dossier.test.ts`（单元测试）
- `test/feature-dossier.property.test.ts`（属性测试）
- `test/feature-dossier.hook.test.ts`（Hook 集成烟测）
- `test/fixtures/feature-dossier/`（测试 fixture）

**修改文件**：
- `package.json`（新增 2 个 scripts）
- `hooks/hooks.json`（新增一条 PostToolUse entry）
- `src/conflict-classifier.ts`（`.forge/features/**` 白名单到 open zone）
- `README.md`（`.forge/ 目录结构` 章节补一行说明）
- `src/learn.ts`（R9，可选）

---

## Wave 1: 类型与路径映射（约 2 小时）

- [x] 1. 定义核心类型
  - [x] 1.1 创建 `src/feature-dossier.ts` 并导出类型
    - 导出 `StageName`、`StageFileEntry`、`StageScanResult`、`DossierFrontmatter`、`DossierDocument`、`TopicDiscoveryResult` 六个类型
    - 类型定义严格按照 Design §3 Data Model
    - 零运行时逻辑，纯类型模块
    - _Requirements: 1.1, 2.1, 5.1_

- [x] 2. 实现 `deriveTopicFromPath` 纯函数
  - [x] 2.1 RED — 编写 `test/feature-dossier.test.ts` 对 `deriveTopicFromPath` 的覆盖
    - `decisions/2026-04-29-structured-observability.md` → `"structured-observability"`
    - `decisions/ADR-0012-agent-skills-learnings.md` → `"agent-skills-learnings"`
    - `specs/structured-observability/spec.md` → `"structured-observability"`
    - `plans/foo.md` / `reviews/foo.md` / `progress/foo.md` / `findings/foo.md` / `debug/foo.md` → `"foo"`
    - 无效输入 `decisions/ADR-TEMPLATE.md`、`specs/foo/notes.md`、`random.md` → `null`
    - 运行测试确认失败，预期：函数未实现
    - _Requirements: 4.7_
  - [x] 2.2 GREEN — 实现 `deriveTopicFromPath(relPath: string): string | null`
    - 按 Design §4.2 的 7 种模式匹配
    - 用正则而非字符串切片，便于处理边界
    - 运行测试确认通过
    - _Requirements: 4.7_
  - [x] 2.3 Property test — 轮转一致性
    - 在 `test/feature-dossier.property.test.ts` 中用 fast-check 生成任意合法 topic
    - 断言：对每种 Stage_File_Pattern 生成的路径调用 `deriveTopicFromPath` 都能拿回原 topic
    - _Requirements: 8.7_

- [x] 3. 实现 `Stage_File_Pattern` 正向匹配辅助
  - [x] 3.1 RED — 扩展测试
    - 给定一个模拟的 `readdir` 结果，对 `plans/` 精确匹配 topic 文件
    - 对 `decisions/` 同时识别 dated 和 ADR 两种前缀
    - topic 中含 `-` 等正则特殊字符时正确 escape
    - _Requirements: 2.2, 2.4_
  - [x] 3.2 GREEN — 实现 `matchStageFiles(stage: StageName, topic: string, files: string[]): string[]`
    - 纯函数（不做 I/O，接收已列好的文件名数组）
    - 内部调用 `escapeRegExp(topic)` 保证 topic 特殊字符安全
    - _Requirements: 2.2, 2.4_

---

## Wave 2: 扫描与构建（约 3 小时）

- [x] 4. 实现 `scanStagesForTopic`
  - [x] 4.1 RED — 测试在 `test/fixtures/feature-dossier/` 下准备最小 `.forge/` 树
    - 包含一个 topic `fixture-topic` 的 spec/plan/progress 三个文件
    - 包含 decisions 目录下一个 dated 文件 + 一个 ADR 文件（同 topic）
    - 另一个 topic `other-topic` 只有 plan
    - 断言 `scanStagesForTopic("fixture-topic", fixtureRoot).stages.decisions.length === 2`
    - 断言 `...stages.reviews.length === 0`（该 topic 没有 review）
    - _Requirements: 2.1, 2.3, 2.6_
  - [x] 4.2 GREEN — 实现 `scanStagesForTopic(topic, forgeRoot): StageScanResult`
    - 对 7 个 Stage_Directory 分别 `readdirSync`（失败时 catch 为空数组 — AC3）
    - 对每个匹配文件执行 `readFileSync` + 解析 frontmatter（复用 `src/frontmatter.ts` 若存在，否则内嵌最小 YAML 解析）
    - `firstSection` 取 `^##` 到下一个 `^##` 或 EOF，截断 500 字符
    - `mtime` 用 `fs.statSync().mtime.toISOString()`
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6_
  - [x] 4.3 验证 frontmatter 降级
    - 在 fixture 中加一个 frontmatter 破损的文件
    - 断言 `scanStagesForTopic` 返回的该文件 `frontmatter === {}`，不抛异常
    - _Requirements: 2.5_

- [x] 5. 实现 `buildDossier` 纯函数
  - [x] 5.1 RED — 测试全 7 阶段齐全的场景
    - 用固定的 `StageScanResult` 构造输入
    - 断言输出 body 包含 `# Feature: <topic>` 标题
    - 断言表格有 7 行（每个 stage 一行，含空 stage 的 `—` 占位）
    - 断言 frontmatter 含 `auto_generated: true`
    - _Requirements: 1.1, 1.3, 1.5_
  - [x] 5.2 GREEN — 实现 `buildDossier(input): DossierDocument`
    - 纯函数：不访问 FS
    - 表格行顺序固定：Decide / Spec / Plan / Build (progress) / Review / Test / Ship（注：Test/Ship 目前无专用目录，列为 `—`，留作未来扩展）
    - 按 Design §4.3 的模板生成 body
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 5.3 测试表格内容转义
    - fixture 中 `firstSection` 含 `|` 和 `<`
    - 断言生成的表格行 `|` 被转义为 `\|`，`<` 保留原样（markdown 表格不受 `<` 影响）
    - _Requirements: 1.4, 8.7_
  - [x] 5.4 测试部分阶段 + 缺 frontmatter
    - 只有 spec + plan 两个 stage 时，其余 5 行显示 `— | — | —`
    - stage 文件缺 frontmatter 时，状态列显示 `(no frontmatter)`
    - _Requirements: 1.5, 1.6_
  - [x] 5.5 测试 ADR 关联章节
    - 当 `decisions.stages` 含 `kind: "adr"` 的条目时，输出 `## 关联 ADR` 章节列出 ADR id + 标题
    - 不含 ADR 时省略该章节
    - _Requirements: 1.3_
  - [x] 5.6 Property test — 幂等性
    - `buildDossier(x) === buildDossier(x)` 对任意合法 `StageScanResult` 成立
    - _Requirements: 8.4, 8.7_

---

## Wave 3: Topic Discovery 与漂移检测（约 1.5 小时）

- [x] 6. 实现 `discoverTopics`
  - [x] 6.1 RED — 扩展 fixture：两个 topic `audit-remediation` 和 `audit-remediation-v221`
    - 断言 `discoverTopics(root).topics` 按字母序包含两者
    - 断言 `drifts` 含一条 `{ topicA, topicB, reason: "trailing-digit" }`
    - _Requirements: 5.1, 5.3_
  - [x] 6.2 GREEN — 实现 `discoverTopics(forgeRoot): TopicDiscoveryResult`
    - 遍历 7 个 Stage_Directory，对每个文件调用 `deriveTopicFromPath` 收集 Topic_Key
    - 对 `specs/<dir>/` 子目录：目录名即 Topic_Key；若目录下无 `spec.md` 则加入 `emptySpecDirs`
    - 对结果去重 + 字母序排序
    - 执行 O(n²) 配对比较生成 drifts（按 Design §4.4 的 4 种 reason）
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [x] 6.3 性能验证
    - 对当前 Forge 仓库 `.forge/` 根跑 `discoverTopics`
    - 断言耗时 ≤ 5 秒
    - _Requirements: 5.5_

---

## Wave 4: CLI 入口（约 1.5 小时）

- [x] 7. 创建 `scripts/rebuild-feature-dossier.mjs` 骨架
  - [x] 7.1 基础 CLI 参数解析
    - 用 Node 内置 `process.argv` 解析（零依赖）
    - 识别三种模式：`<topic>` / `--all` / `--from-path <p>`
    - 未提供参数时打印 usage 并 exit 1
    - `.forge/` 不存在时 exit 2 + 提示 `forge init`
    - _Requirements: 3.1, 3.5, 7.1_
  - [x] 7.2 单 topic 模式
    - 调用 `scanStagesForTopic` + `buildDossier`
    - 在 frontmatter 注入 `generated_at: new Date().toISOString()`
    - 写入 `.forge/features/<topic>.md`，目录不存在时 `mkdirSync({recursive: true})`
    - 成功输出 `dossier: wrote .forge/features/<topic>.md (N stages, M files)` + exit 0
    - _Requirements: 3.1, 3.2, 3.6, 7.2_
  - [x] 7.3 `--all` 模式
    - 调用 `discoverTopics` → 遍历每个 topic 重建
    - 单 topic 失败时 catch + stderr 输出 `failed: <topic> — <reason>`，继续下一个
    - 最后输出 `dossier: rebuilt N dossiers (K topics across 7 stages)`
    - _Requirements: 3.3, 7.3_
  - [x] 7.4 `--from-path` 模式（Hook 专用）
    - 调用 `deriveTopicFromPath`；返回 `null` 时静默 exit 0（Hook 防误触）
    - 写入成功不打印任何内容（Hook 静默）
    - 写入失败 stderr 输出短消息 + exit 0（fail-silent 保证不干扰会话）
    - _Requirements: 4.4, 4.6, 4.7, 7.4_
  - [x] 7.5 Shell 注入防护
    - Topic_Key 通过 `/^[a-z0-9][a-z0-9-]*$/` 校验；不合规 exit 1 + 明确错误
    - _Requirements: 7.3_

- [x] 8. `package.json` scripts 集成
  - [x] 8.1 新增 `dossier:rebuild` 和 `dossier:rebuild:all` 两个 script
    - `dossier:rebuild`: `node scripts/rebuild-feature-dossier.mjs`
    - `dossier:rebuild:all`: `node scripts/rebuild-feature-dossier.mjs --all`
    - 不加入 `check` 聚合脚本（dossier 是派生物，不是 CI 门禁）
    - _Requirements: 3.4_

---

## Wave 5: Hook 与集成（约 1 小时）

- [x] 9. 新增 PostToolUse Hook
  - [x] 9.1 修改 `hooks/hooks.json`
    - 在现有 PostToolUse 数组末尾新增一条 entry
    - matcher: `Write|Edit`
    - command: `node forge/scripts/rebuild-feature-dossier.mjs --from-path "$TOOL_INPUT_FILE" 2>/dev/null || node ~/.claude/skills/forge/scripts/rebuild-feature-dossier.mjs --from-path "$TOOL_INPUT_FILE" 2>/dev/null || true`
    - timeout: 5
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 9.2 验证路径过滤逻辑
    - CLI `--from-path` 模式已自带路径识别（`deriveTopicFromPath` 返回 null 时静默退出）
    - 无需在 hooks.json 里写 regex，避免多处维护路径列表
    - _Requirements: 4.1, 4.4, 4.6_

- [x] 10. Hook 烟测
  - [x] 10.1 新增 `test/feature-dossier.hook.test.ts`
    - 模拟 `TOOL_INPUT_FILE=.forge/plans/foo.md`（配合 fixture），`child_process.execSync` 调用 CLI `--from-path` 模式
    - 断言 `features/foo.md` 被生成
    - 断言 stdout 为空（Hook 静默契约）
    - _Requirements: 4.4, 4.7_
  - [x] 10.2 循环防护测试
    - `TOOL_INPUT_FILE=.forge/features/foo.md` 作为输入
    - 断言 exit 0 且 `features/foo.md` 的 mtime 未变化（CLI 识别为 dossier 自身，静默退出）
    - _Requirements: 4.4_
  - [x] 10.3 未知路径测试
    - `TOOL_INPUT_FILE=.forge/decisions/ADR-TEMPLATE.md` 作为输入
    - 断言 exit 0 且 `features/` 下无新增文件
    - _Requirements: 4.6_

---

## Wave 6: Zone 分类与文档（约 1.5 小时）

- [x] 11. `src/conflict-classifier.ts` 白名单更新
  - [x] 11.1 RED — 扩展 `test/conflict-classifier.test.ts`（若存在）或新建测试
    - 断言 `.forge/features/foo.md` 被分类为 `open` zone
    - 断言该路径不在 frozen / guarded 的 pattern 列表中
    - _Requirements: 6.1, 6.2, 6.3_
  - [x] 11.2 GREEN — 在 classifier 的 priority chain 中加入判定
    - 在 open zone 的匹配列表中显式列出 `.forge/features/**`
    - _Requirements: 6.1_
  - [x] 11.3 核对 `scripts/check-frozen.sh` 和 `src/check-frozen.ts`
    - 这两个模块本就只处理 `.forge/specs/`、`.forge/plans/`、`.forge/config.md`，`.forge/features/` 不在其中
    - 仅人工核对一次，无需修改
    - _Requirements: 6.2_

- [x] 12. README 文档更新
  - [x] 12.1 在 `.forge/ 目录结构` 章节加一行
    - 示例结构里加一行 `├── features/` 带注释说明"自动生成的功能索引（PostToolUse Hook 维护）"
    - _Requirements: 8.8_
  - [x] 12.2 在 `.gitignore 建议` 章节补充说明
    - 加一条注释："`.forge/features/` 可选纳入或排除：纳入则团队共享功能回顾索引；排除则作为本地派生状态"
    - _Requirements: 7.5_

---

## Wave 7: 首次启用（约 30 分钟）

- [x] 13. 一次性跑通当前仓库
  - [x] 13.1 `npm run dossier:rebuild:all`
    - 验证所有 30+ topic 的 dossier 被生成
    - 手动抽查 3-5 个 dossier 内容正确性：
      - `structured-observability`（具有 decide + spec + plan + progress）
      - `agent-skills-learnings`（用户正在编辑的当前 topic）
      - `sdk-driver-decomposition`（只存在于 `.forge/specs/`，预期不会出现在 Forge dossier 中——注意是 scope 边界）
  - [x] 13.2 `git status .forge/features/` 确认
    - 确认只新增了 `.forge/features/*.md`，无其它文件改动
    - 决定是否 commit（见 R7 AC5）

---

## Wave 8（可选）: /forge learn 归档集成（约 1 小时）

- [x] 14. R9 归档 dossier 到 archive
  - [x] 14.1 定位 `src/learn.ts` 中的 archive 逻辑
    - 找到把 topic 相关文件 copy 到 `.forge/archive/<date>-<topic>/` 的代码位
    - _Requirements: 9.1, 9.4_
  - [x] 14.2 在 copy 之前调用 `buildDossier`
    - 立即重建最新 dossier（捕获 archive 时刻的快照）
    - 把结果写入 `.forge/archive/<date>-<topic>/dossier.md`
    - frontmatter 额外加 `archived: true` 和 `archived_at` 字段
    - _Requirements: 9.1, 9.2, 9.3_
  - [x] 14.3 无 dossier 时的降级
    - 若该 topic 完全无阶段文件，跳过归档 dossier 步骤 + stderr 提示
    - _Requirements: 9.5_
  - [x] 14.4 扩展 `test/learn.test.ts`（若存在）覆盖新增逻辑
    - fixture 包含一个已完成的 topic，运行 archive 后断言 `archive/<date>-<topic>/dossier.md` 存在且含 `archived: true`
    - _Requirements: 9.1, 9.3_

---

## Verification & Sign-off

- [x] 15. 全量验证
  - [x] 15.1 `npm run typecheck` 通过
  - [x] 15.2 `npm run lint` 通过
  - [x] 15.3 `npm run test` 通过（新增测试全绿 + 已有测试不回归）
  - [x] 15.4 `npm run dossier:rebuild:all` 再次成功（幂等性）
  - [x] 15.5 在 Claude Code 中手动跑一次 `/forge plan foo`，观察 Hook 是否触发且无红色输出
  - _Requirements: 8.1, 8.2, 8.3, 8.5_

- [x] 16. 可选：添加 ADR
  - [x] 16.1 在 `.forge/decisions/` 下新增 `ADR-XXXX-feature-dossier-index.md`
    - 记录"派生视图 vs 物理重组"的架构选择
    - 记录"Hook 驱动而非 Skill 驱动"的理由
    - 更新 `.forge/knowledge/adr-index.md`

---

## Dependency Graph

```
Wave 1 (types + path mapping)
  ↓
Wave 2 (scan + build)
  ↓
Wave 3 (discovery)
  ↓
Wave 4 (CLI) ← 依赖 Wave 1-3
  ↓
Wave 5 (Hook) ← 依赖 Wave 4
  ↓
Wave 6 (zone + docs) ← 与 Wave 5 并行可做
  ↓
Wave 7 (bootstrap) ← 依赖 Wave 4-6
  ↓
Wave 8 (R9 可选) ← 可在主功能上线后独立做
  ↓
Verification (Wave 9)
```

Wave 5 和 Wave 6 可以并行，其余严格顺序。
