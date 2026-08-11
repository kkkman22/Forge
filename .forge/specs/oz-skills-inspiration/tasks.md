---
feature: oz-skills-inspiration
layout: tasks
created: 2026-05-08
spec_ref: ".forge/specs/oz-skills-inspiration/requirements.md"
---

# Implementation Plan: oz-skills-inspiration

## Overview

分 4 个 phase 共 6 个需求落地。Phase 内部按模块自底向上（类型 → 纯函数 → 集成 → 测试 → 文档）。每个顶级任务可独立发 PR，不产生大爆炸式合并。按"规则优先于工具，工具优先于能力"的顺序实施（R1 → R2 → R3 → R4 → R5 → R6）。

**落地纪律**：
- 每个子任务关联需求 ID（`_Requirements: X.Y_`）
- 纯函数任务必含 property-based test
- 新增脚本对齐既有 `validate-skill-*.mjs` 的内联实现风格
- 向后兼容优先：迁移分两步（warning → error）
- 既有 19 个 skill 默认豁免（`skeleton_exempt_legacy: true`），不强制回溯

**总工作量**：MVP ≤ 12 人日（所有 P1 + 选 P2 之一），完整实施 ≤ 20 人日。

## Tasks

- [x] 1. Phase 1.1 — Description 两句式强化（需求 1）
  - [x] 1.1 定义祈使动词白名单（`src/skill-description-imperatives.ts`）
    - 创建新模块，导出 `IMPERATIVE_WHITELIST: readonly string[]`
    - 初始清单：Build / Audit / Diagnose / Execute / Plan / Review / Ship / Test / Resume / Orchestrate / Capture / Refactor / Grill / Decompose / Decide / Restart / Fix / Verify / Accept
    - 每个动词附 JSDoc 注释说明首个使用的 skill
    - Unit test：清单非空、全大写首字母、无重复
    - _Requirements: 1.3, 1.7_

  - [x] 1.2 扩展纯函数（`src/skill-description.ts`）
    - 新增 `splitSentences(text: string): string[]` 纯函数，处理 `.` / `。` / 换行
    - 新增 `countSentences(text: string): number`
    - 新增 `startsWithImperative(sentence: string, whitelist: readonly string[]): boolean`
    - 新增 `secondSentenceStartsWithUseWhen(sentences: string[]): boolean`
    - 新增 `validateDescriptionExtended(content, options?: { mode: "warning" | "error" }): DescriptionValidationExtended`
    - 保持 `validateDescription` 既有签名不变，内部复用扩展逻辑
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 1.3 Property-based test（`test/skill-description-extended.property.test.ts`）
    - 任意输入：`countSentences(text) >= 0`
    - 任意合法两句 description：`validateDescriptionExtended(text)` 在 error 模式返回 `valid: true`
    - 一句或三句的 description：返回 `valid: false` 并含对应 error
    - 首词非白名单：返回 `valid: false`
    - 向后兼容：所有原 `validateDescription` fail 的输入，`validateDescriptionExtended` 也 fail
    - _Requirements: 1.13_

  - [x] 1.4 扩展校验脚本（`scripts/validate-skill-descriptions.mjs`）
    - 镜像 `src/skill-description.ts` 新函数到脚本内联实现
    - 新增 `--strict` flag：默认 warning 模式，`--strict` 切换到 error
    - 输出格式扩展：每个 skill 附 `sentenceCount`、首词校验结果
    - 保持既有通过的 skill 不被破坏——新规则仅当 warning 模式下附加信息
    - _Requirements: 1.6, 1.8, 1.9_

  - [x] 1.5 改写 4 个优先 skill description
    - `forge-plan`: 改写为恰好两句 + 祈使动词开头
    - `forge-build`: 同上
    - `forge-ship`: 同上
    - `forge-review`: 同上
    - 改写后各 skill 手工运行 `node scripts/validate-skill-descriptions.mjs --strict` 确认通过
    - 每个改写在 PR 描述中附 before/after 对照
    - _Requirements: 1.10, 1.11_

  - [x] 1.6 批量改写剩余 15 个 skill description
    - 逐个审视 `forge-abort` / `forge-build-light` / `forge-debug` / `forge-decide` / `forge-fix` / `forge-grill` / `forge-learn` / `forge-loop` / `forge-refactor` / `forge-resume` / `forge-router` / `forge-spec` / `forge-status` / `forge-test` / `forge-zoom-out`
    - 保持语义不变，仅调整句法
    - 运行 `npm run check` 全部通过
    - _Requirements: 1.1, 1.11_

  - [x] 1.7 切换到 error 模式
    - 修改 `scripts/validate-skill-descriptions.mjs` 的默认模式为 error
    - 修改 `src/skill-description.ts` 的 `ENFORCEMENT_MODE` 常量
    - `npm run check` 在任一 skill 违反新规则时失败退出
    - 在 CHANGELOG 记录"description 两句式进入 enforced 阶段"
    - _Requirements: 1.9_

---

- [x] 2. Phase 1.2 — SKILL.md 章节骨架统一（需求 2）
  - [x] 2.1 定义骨架类型与判定函数（`src/skill-skeleton.ts`）
    - 定义 `DeliverableCategory` 枚举：decision / execution / delivery / diagnostic / query / other
    - 定义 `DELIVERABLE_FIELD_MAP` 常量
    - 实现 `parseSkeleton(content: string): SkeletonCheck` 纯函数：扫描 `## 2. Prerequisites` / Workflow / Deliverable 章节
    - 实现 `renderSkeletonReport(checks)` 纯函数
    - 支持 frontmatter 的 `deliverable_exempt` / `skeleton_exempt_legacy` 字段
    - Unit test：对 fixture SKILL.md（3 种：完整 / 缺 Deliverable / 豁免）返回正确结构
    - _Requirements: 2.1, 2.4, 2.8, 2.13_

  - [x] 2.2 Property-based test（`test/skill-skeleton.property.test.ts`）
    - 任意输入不抛错
    - 含所有三段 → `valid: true`（且无豁免）
    - 缺 Deliverable 且无豁免 → `valid: false` 且 `errors` 含相应描述
    - 声明 `deliverable_exempt: true` → 跳过 Deliverable 检查
    - 声明 `skeleton_exempt_legacy: true` → 输出 warning 但不 fail
    - _Requirements: 2.13_

  - [x] 2.3 创建验证脚本（`scripts/validate-skill-skeleton.mjs`）
    - 风格对齐 `validate-skill-descriptions.mjs`（ESM、内联规则、无 dist 依赖）
    - 扫描 `skills/forge-*/SKILL.md`
    - 对每个文件调用 parseSkeleton，按豁免规则决定是否 fail
    - 输出格式：` ✓/✗ <path>  [category=<cat>]  [legacy]? ` + errors 列表
    - 退出码：任一非豁免 fail → 1
    - _Requirements: 2.9_

  - [x] 2.4 为 19 个既有 skill 添加 `skeleton_exempt_legacy: true`
    - 批量追加 frontmatter 字段（所有 `skills/forge-*/SKILL.md`）
    - 确保 `validate-skill-skeleton.mjs` 针对既有 skill 输出 warning 而非 fail
    - 新建 skill 默认不带此 flag，必须合规
    - _Requirements: 2.6, 2.10_

  - [x] 2.5 纳入 `npm run check`
    - 修改 `.forge/config.md` 的 `ci_check_command` 或 `package.json` 的 `check` 脚本
    - 合并进既有 `check` 序列：`tsc + biome + vitest + check-readme-metrics + validate-skill-descriptions + validate-skill-length + validate-skill-skeleton`
    - 确认既有 skill 带 legacy flag 时 CI 通过
    - _Requirements: 2.10_

  - [x] 2.6 PR 模板勾选项
    - 修改 `.github/pull_request_template.md`（或新建）
    - 新 skill PR 必勾：`✅ 包含 Prerequisites / Workflow / Deliverable 三段骨架`
    - 不适用的 skill：勾选"声明豁免并说明理由"
    - _Requirements: 2.11_


---

- [x] 3. Phase 1.3 — Skill Style Guide + Template（需求 3）
  - [x] 3.1 创建风格指南主文档（`.forge/knowledge/skill-style-guide.md`）
    - frontmatter：`style_guide_version: "1.0"` + `updated` + `related_specs`
    - 按 design §3.2 定义的 10 个章节骨架逐段编写
    - Overview 章节说明与 CLAUDE.md 的关系（宪法 vs 作者手册）
    - Frontmatter 字段章节：每个字段含类型、必填、示例、常见错误
    - 引用需求 1 与需求 2 的规则（链接、不重复正文）
    - _Requirements: 3.1, 3.2, 3.4, 3.11, 3.12_

  - [x] 3.2 编写反模式清单（章节 8）
    - ≥ 5 条，每条含"反模式 / 为何是反模式 / 正确做法"
    - 候选：避免 Emoji 装饰 / 避免写死绝对路径 / 避免版本号进 description / 避免散文式 Deliverable / 避免跨 references 嵌套引用
    - _Requirements: 3.4_

  - [x] 3.3 编写版本演进策略（章节 9）
    - 说明 style_guide_version 语义化规则
    - 小版本（1.x）兼容，大版本（2.x）须伴随 ADR
    - 变更记录落地到 `.forge/knowledge/skill-style-guide-changelog.md`
    - _Requirements: 3.3, 3.14_

  - [x] 3.4 编写快速核对清单（章节 10）
    - ≤ 10 条，可直接作为 PR 自检清单使用
    - 覆盖 description 两句式、骨架三段、命名 kebab-case、references 引用语法等
    - _Requirements: 3.9_

  - [x] 3.5 创建 Skill 模板（`templates/SKILL-TEMPLATE.md`）
    - 基于虚构 `forge-example` 示例，避免误导复制真实 skill
    - 含全部必需章节占位符与 `<!-- 此处说明 -->` 注释引导
    - frontmatter 示例含可选字段注释：`deliverable_exempt` / `style_guide_version`
    - _Requirements: 3.5, 3.6, 3.7, 3.8_

  - [x] 3.6 实现模板校验函数（`src/skill-template.ts`）
    - 定义 `TemplateValidation` interface
    - 实现 `validateSkillTemplate(filePath, content, requiredSections)` 纯函数
    - 接受 `guideVersion` 参数做兼容判定
    - Unit test：对符合 / 不符合模板的 skill 返回正确结果
    - _Requirements: 3.15_

  - [x] 3.7 Property-based test（`test/skill-template.property.test.ts`）
    - 对任意 content 不抛错
    - missingSections 总是 requiredSections 的子集
    - 同一输入 replay 产出稳定结果
    - _Requirements: 3.15_

  - [x] 3.8 在 CONTRIBUTING.md 引用风格指南
    - 新增"Creating a New Skill"章节
    - 链接 `.forge/knowledge/skill-style-guide.md`
    - 说明 PR 自检清单在指南末尾
    - _Requirements: 3.10_

---

- [x] 4. Phase 2.1 — Scripts as Black Box 纪律（需求 4，可与 Phase 1 并行）
  - [x] 4.1 修改 CLAUDE.md 新增 §2.8
    - 按 design §4.1 的措辞插入"Scripts as Black Box（铁律）"章节
    - 默认行为 / 禁止行为 / 两类例外 / 例外清单指向 `scripts/.help-exempt`
    - 引用需求 4 的完整规则链接
    - _Requirements: 4.1, 4.2_

  - [x] 4.2 定义类型与判定函数（`src/script-help.ts`）
    - 定义 `ScriptCategory` 枚举：user-facing / internal-only / one-off / unclear
    - 定义 `ScriptAuditEntry` interface
    - 实现 `parseScriptCategory(fileContent)`：扫描文件头 `# category:` 注释
    - 实现 `parseHelpOutput(output)`：校验 `Usage:` 字符串存在
    - 实现 `parseHelpExempt(content)`：行分隔解析 `scripts/.help-exempt`
    - 实现 `auditScript(path, content, helpOutput?)` 纯函数
    - _Requirements: 4.3, 4.7, 4.8, 4.12_

  - [x] 4.3 Property-based test（`test/script-help.property.test.ts`）
    - 任意 content 不抛错
    - parseHelpOutput 对空/含 Usage/无 Usage 返回正确结果
    - parseHelpExempt 对含空行 / 注释 / 路径的文件返回路径数组
    - parseScriptCategory 对含 / 不含 category 注释的内容返回正确值
    - _Requirements: 4.12_

  - [x] 4.4 首版脚本审计
    - 遍历 27 个 `scripts/*.{sh,mjs,py}`，逐个定性
    - 产出 `.forge/findings/scripts-help-audit.md`（见 design §4.5 格式）
    - 每条分类附 evidence（grep 结果：被哪些文件调用）
    - 未确定的标为 `unclear`，留待人工复核
    - _Requirements: 4.4_

  - [x] 4.5 创建豁免清单（`scripts/.help-exempt`）
    - 从审计结果提取 internal-only + one-off 条目
    - 每行 `<path>  # <evidence>` 格式
    - 初版预期包含：hook-check-frozen.sh / auto-resume.sh / persistent-loop.sh / inject-plan-context.mjs / render-bench-markdown.mjs 等
    - _Requirements: 4.10_

  - [x] 4.6 为既有 user-facing 脚本补齐 `--help`
    - 补齐列表：`init.sh` / `build-dist.sh` / `install-dist.sh` / `check-frozen.sh` / `check-readme-metrics.sh` / `prune-event-logs.sh` 等（以审计结果为准）
    - 每个脚本追加 `--help | -h` 分支，按 design §4.6 模板输出
    - 文件头注释 `# category: user-facing`
    - 手工验证 `bash scripts/<name> --help` 输出含 Usage
    - _Requirements: 4.5, 4.6, 4.7_

  - [x] 4.7 创建校验脚本（`scripts/validate-scripts-help.mjs`）
    - 风格对齐 `validate-skill-descriptions.mjs`
    - 扫描 `scripts/*.{sh,mjs,py}` + 读取 `.help-exempt`
    - 对非豁免 user-facing 脚本：
      - 执行 `bash|node <script> --help`（通过 child_process.spawnSync）
      - 捕获退出码 + stdout/stderr
      - 校验输出含 `Usage:` 字符串
    - 对 internal-only / one-off / exempt 条目：跳过
    - 退出码：任一 user-facing 不合规 → 1
    - _Requirements: 4.8_

  - [x] 4.8 纳入 `npm run check`
    - 合并进 check 序列
    - 确认既有 user-facing 脚本全部合规（tasks 4.6 完成后）
    - CI 绿灯验证
    - _Requirements: 4.9_

  - [x] 4.9 更新风格指南 scripts/ 章节
    - 修改 `.forge/knowledge/skill-style-guide.md` 的 scripts/ 用途边界章节
    - 引用 CLAUDE.md §2.8 + 本任务的豁免机制
    - _Requirements: 4.11_

---

- [x] 5. Phase 3.1 — Frontend-Check Review Agent（需求 5）
  - [x] 5.1 添加 axe-core vendor 文件（`scripts/vendor/axe.min.js`）
    - 下载 axe-core 4.10.x 最新 patch 版本
    - 文件头注释标注版本号与来源 URL
    - 作为 git-tracked 文件入库（检查 `.gitignore` 未排除）
    - 文件体积预期 ~600KB，可接受
    - _Requirements: 5.13_

  - [x] 5.2 创建 axe-core 升级脚本（`scripts/update-vendor-axe.sh`）
    - 文件头 `# category: user-facing`
    - 实现按 design §5.8 的 `--help` 输出
    - 通过 curl 下载 `https://unpkg.com/axe-core@<version>/axe.min.js`
    - 支持 `--version X.Y.Z` pin 特定版本
    - 无网络时输出明确错误 "network required to fetch axe-core"
    - 成功时更新文件头版本注释
    - 验证：`bash scripts/update-vendor-axe.sh --help` 输出含 Usage
    - _Requirements: 5.13, 5.14_

  - [x] 5.3 更新 `.gitignore` 排除登录态缓存
    - 追加条目：`.forge/cache/`
    - 确保 `scripts/vendor/axe.min.js` 不被任何条目误排除
    - _Requirements: 5.12_

  - [x] 5.4 定义 Tier 探测纯函数（`src/frontend-check.ts`）
    - 定义 `TierAvailability` interface
    - 实现 `detectTierAvailability(env)` 纯函数
    - env 结构：{ socketExists, workspaceIdSet, cmuxBinaryExists, mcpDevtoolsResponsive }
    - 返回：{ a: true, b: "preferred" | "degraded" | "unavailable", c: "available" | "unavailable", reasons }
    - 判定表按 design §5.3 实现
    - Unit test：覆盖 8 种 env 组合
    - _Requirements: 5.3, 5.17, 5.18_

  - [x] 5.5 Property-based test（`test/frontend-check.property.test.ts`）
    - 任意 env → 函数不抛错
    - Tier A 总是可用（a === true）
    - Tier B preferred 当且仅当 socket + workspace + binary 都成立
    - Tier B unavailable 当且仅当 cmuxBinaryExists === false
    - reasons 完整反映 env
    - _Requirements: 5.18_

  - [x] 5.6 编写 Vue3 静态扫描规则集（`skills/forge-review/references/frontend-check-patterns.md`）
    - 按 design §5.4 YAML 格式编写
    - 首版至少 8 条规则（对应需求 5 验收标准 4 的 8 种 Vue3 模式）
    - 每条含 id / pattern / severity / wcag / description / example_bad / example_good / false_positive_filter
    - 规则 id 命名规范：`vue-a11y-<pattern>` / `vue-router-<pattern>` / `vue-async-<pattern>`
    - _Requirements: 5.5, 5.6_

  - [x] 5.7 实现 Tier A 静态扫描（`src/frontend-check.ts` 扩展）
    - 定义 `Vue3Violation` / `VueA11yRule` interface
    - 实现 `scanVueTemplate(content, filePath, rules): Vue3Violation[]` 纯函数
    - 实现 `scanVueProject(projectRoot, rules): Vue3Violation[]` driver 函数
    - 遍历 `src/**/*.vue` + `src/**/*.tsx`，调用 scanVueTemplate 聚合
    - Integration test：fixture 项目含各类违规，统计命中数
    - _Requirements: 5.4, 5.6_

  - [x] 5.8 创建 frontend-check agent 定义（`agents/frontend-check.md`）
    - 按 design §5.2 的骨架编写
    - frontmatter 遵循需求 1 两句式：`"Audit Vue3 frontend for WCAG accessibility, Core Web Vitals, router stability, and console warnings. Use when /forge review runs on a project with Vue or .vue files, when router applies a11y-check or responsive-check hints, or when user explicitly requests a frontend audit."`
    - `allowedTools`: `Bash(cmux browser:*), mcp_chrome-devtools_*, Read, Grep, Bash(control_bash_process:*)`
    - 包含 Prerequisites / Workflow / Deliverable 三段骨架（按需求 2）
    - Workflow 覆盖 Tier A/B/C 三档流程
    - References 指向 `skills/forge-review/references/frontend-check-patterns.md`
    - _Requirements: 5.1, 5.2, 5.19_

  - [x] 5.9 编写 Tier B 工作流脚本参考（`skills/forge-review/references/frontend-check-tier-b.md`）
    - 按 design §5.5 的 bash 伪代码完整化
    - dev server 启动 + 登录态加载 + axe 注入 + 页面遍历 + 清理
    - 包含 `trap 'control_bash_process stop $TID' EXIT` 的异常保护
    - 示例关键页面配置格式（JSON）
    - _Requirements: 5.7, 5.16_

  - [x] 5.10 编写 Tier C 工作流参考（`skills/forge-review/references/frontend-check-tier-c.md`）
    - 按 design §5.6 的 TypeScript 伪代码完整化
    - Core Web Vitals 提取 + 阈值判定（web.dev 标准）
    - 覆盖 LCPBreakdown / CLSCulprits / RenderBlocking / DocumentLatency 四个 insight
    - _Requirements: 5.8_

  - [x] 5.11 实现 axe.run() 结果解析（`src/frontend-check.ts` 扩展)
    - 定义 `AxeResult` / `AxeViolation` interface
    - 实现 `parseAxeResult(json): { p0, p1, p2, p3, violations }` 纯函数
    - 按 axe-core 的 impact 字段（critical/serious/moderate/minor）映射到 P0/P1/P2/P3
    - Property test：任意合法 axe-core 输出不抛错、分级计数正确
    - _Requirements: 5.18_

  - [x] 5.12 集成到 forge-review（`src/review.ts` 扩展）
    - 新增 `runLayer4FrontendCheck(topic, tierAvailability)` driver 函数
    - 按 tierAvailability 分档调用 scanVueProject / Tier B / Tier C
    - 结果写入 `.forge/reviews/<topic>.md` 的 `## Layer 4: Frontend Check` 段落
    - 格式对齐需求 2 的 Deliverable 规范（Category: decision）
    - Integration test：fixture Vue 项目跑完整 review，Layer 4 段落含正确字段
    - _Requirements: 5.9, 5.10_

  - [x] 5.13 登录态缓存工具（`src/login-state-cache.ts`）
    - 实现 `getCachedStatePath(projectName): string`
    - 实现 `isStateCacheExpired(cookies, expirySafetyDays=1)` 纯函数
    - 实现 `promptForManualLogin(surfaceId): string`（返回引导命令文本）
    - 纯公开页面场景：`skipLoginState: true` 走快速路径
    - _Requirements: 5.12_

  - [x] 5.14 Dev server 生命周期管理（`src/dev-server-lifecycle.ts`）
    - 实现 `startDevServer(projectRoot, port=5173): Promise<{ terminalId }>`
    - 实现 `stopDevServer(terminalId): Promise<void>`（`control_bash_process.stop`）
    - 实现 `withDevServer<T>(projectRoot, fn): Promise<T>`，含 try/finally
    - 超时保护 5 分钟：超时后强制 stop + 抛错
    - _Requirements: 5.16_

  - [x] 5.15 路由器 hint 映射
    - 修改 `skills/forge-router/references/behavior-hints.md`
    - 将占位的 `a11y-check` / `responsive-check` 映射到 `frontend-check` agent
    - `visual-regression` 首版保留占位（tasks 阶段不实现）
    - Integration test：带 hint 的任务路由到 frontend-check
    - _Requirements: 5.15_

  - [x] 5.16 .forge/reviews/assets 纳入 retention
    - 修改 `scripts/prune-event-logs.sh`（或新建 `prune-review-assets.sh`）
    - 扫描 `.forge/reviews/assets/*` mtime > 30d 的文件自动归档到 `.forge/archive/reviews/`
    - 在 `.forge/config.md` 声明 retention 策略
    - _Requirements: 5.11_

  - [x] 5.17 端到端手工验证（非自动化）
    - 准备 fixture Vue3 项目（可能是 Forge 本身或临时脚手架）
    - 在 cmux workspace 内运行 `/forge review <topic>`
    - 确认 Layer 4 三档全跑、输出含 axe 结果 + screenshot + Core Web Vitals
    - 测试降级：退出 cmux workspace 再跑，确认 Tier B degraded 提示
    - _Requirements: 5.3, 5.17_

---

- [x] 6. Phase 4.1 — Acceptance Scenario Eval（需求 6，MVP）
  - [x] 6.1 定义核心类型（`src/accept.ts`）
    - 定义 `ScenarioSource` / `ScenarioType` / `Verdict` 枚举
    - 定义 `Scenario` / `ScenarioArtifact` / `AcceptanceRunResult` interface
    - 按 design §6.2 的字段完整化
    - 导出全部类型供 driver 层使用
    - _Requirements: 6.4, 6.6, 6.7_

  - [x] 6.2 实现显式 scenario 解析（`src/accept.ts` 扩展）
    - 实现 `parseExplicitScenarios(specContent: string): readonly Scenario[]` 纯函数
    - 扫描 `## Scenarios` 章节下的 `Scenario:` 块
    - 解析 Gherkin Given/When/Then 子句
    - 识别 `@critical` / `@happy-path` 等 tag
    - Unit test：fixture spec 含各类 scenario，验证解析结果
    - _Requirements: 6.4_

  - [x] 6.3 实现隐式 scenario 反向提取（`src/accept.ts` 扩展）
    - 实现 `deriveScenariosFromCriteria(criteria): readonly Scenario[]` 纯函数
    - 从 acceptance criteria 的 `WHEN <action>, THE <subject> SHALL <outcome>` 子句提取
    - `given` 从 user story 推断或留空
    - `confidence` 默认 0.7（derived），explicit 为 1.0
    - Unit test：fixture criteria 反向提取出合理的 scenario 草稿
    - _Requirements: 6.4_

  - [x] 6.4 实现 scenario 统一入口（`src/accept.ts` 扩展）
    - 实现 `parseScenariosFromSpec(specContent): readonly Scenario[]` 纯函数
    - 合并显式与隐式结果，去重（按 then 子句相似度）
    - 返回所有 scenarios，交由后续选择逻辑排序
    - _Requirements: 6.4_

  - [x] 6.5 实现 scenario 选择与排序（`src/accept.ts` 扩展）
    - 实现 `selectScenariosForRun(scenarios, options)` 纯函数
    - 排序规则：@critical > @happy-path > source === "explicit" > confidence > 声明顺序
    - 支持 `explicitIds` 指定子集
    - 支持 `promoteDerived` 让 derived 参与阻断判定
    - 默认取 min(5, total)
    - _Requirements: 6.5_

  - [x] 6.6 实现 scenario 类型识别（`src/accept.ts` 扩展）
    - 实现 `classifyScenarioType(scenario): ScenarioType` 纯函数
    - 按 design §6.5 的关键词匹配规则（API_KEYWORDS / UI_KEYWORDS / CLI_KEYWORDS）
    - 同时命中 UI + API → `mixed`
    - 无命中 → `unknown`
    - Unit test：覆盖四种明确类型 + 混合 + 未知
    - _Requirements: 6.8_

  - [x] 6.7 Property-based test（`test/accept.property.test.ts`）
    - parseScenariosFromSpec 对任意 Markdown 不抛错
    - deriveScenariosFromCriteria 从空 criteria 返回空数组
    - classifyScenarioType 对任意 scenario 返回合法枚举值
    - selectScenariosForRun 结果长度 ≤ maxCount
    - aggregateVerdicts 对空输入返回零计数
    - _Requirements: 6.16_

  - [x] 6.8 实现 API runner（`src/accept-driver.ts`）
    - 实现 `apiRunner: Runner`，supports 判定按 type === "api"
    - 从 `Given` 提取 endpoint / method / body（简单解析：`Given the API endpoint is X`）
    - 通过 curl 调用，捕获 HTTP 状态码 + response body
    - 按 `Then` 断言判定 verdict
    - 产出 artifact 写入 `.forge/acceptance/<topic>/<scenario-id>/response.json` + `output.log`
    - Integration test：mock HTTP server + fixture scenario → 验证产物
    - _Requirements: 6.6, 6.7, 6.8_

  - [x] 6.9 实现 UI runner（`src/accept-driver.ts`）
    - 实现 `uiRunner: Runner`，supports 判定按 type === "ui"
    - 复用需求 5 的 Tier B 基础设施（detectTierAvailability / dev server / 登录态 / cmux browser）
    - 从 `When` 子句提取用户动作序列（click / fill / navigate）
    - 按 `Then` 子句断言 UI 状态（visible / text content / URL）
    - 产出 artifact：screenshot + snapshot + verdict
    - Tier B 不可用时：verdict = SKIP 并标注原因
    - _Requirements: 6.6, 6.7, 6.8_

  - [x] 6.10 实现 CLI runner（`src/accept-driver.ts`）
    - 实现 `cliRunner: Runner`，supports 判定按 type === "cli"
    - 从 `Given` / `When` 提取 bash 命令
    - 执行并捕获 stdout / stderr / exit code
    - 按 `Then` 断言（exit === 0、stdout 含字符串等）
    - 首版可选实现（Phase 2 延后），标注 SKIP
    - _Requirements: 6.8, 6.17_

  - [x] 6.11 实现 Mixed runner（`src/accept-driver.ts`）
    - 实现 `mixedRunner: Runner`，supports 判定按 type === "mixed"
    - 按步骤分解：UI 前置 → API 断言 → UI 后置验证
    - 顺序执行并汇总 verdict
    - 任一步骤 FAIL → 整体 FAIL
    - 首版可选实现（Phase 2 延后）
    - _Requirements: 6.8, 6.17_

  - [x] 6.12 实现 Runner 分发（`src/accept-driver.ts`）
    - 定义 `RUNNERS: readonly Runner[]` 常量
    - 实现 `runScenario(scenario, ctx): Promise<ScenarioArtifact>` 函数
    - 按 scenario.type 选择首个 supports=true 的 runner
    - 无匹配 runner → verdict = SKIP，failureReason = "no runner available"
    - _Requirements: 6.6, 6.7, 6.8_

  - [x] 6.13 实现聚合与报告（`src/accept.ts` 扩展）
    - 实现 `aggregateVerdicts(artifacts): Summary` 纯函数
    - 计算 pass / fail / skip / warn 计数
    - 按 spec frontmatter `acceptance_blocks_ship` + FAIL 数判定 blocksShip
    - 实现 `renderAcceptanceReport(result): string` 纯函数
    - 输出写入 `.forge/reviews/<topic>-acceptance.md`（按 design §6.8 格式）
    - _Requirements: 6.11, 6.16_

  - [x] 6.14 创建 forge-accept skill（`skills/forge-accept/SKILL.md`）
    - 遵循需求 2 的三段骨架（Prerequisites / Workflow / Deliverable）
    - 遵循需求 1 的两句式 description
    - 内容 ≤ 150 行（需求 5 现有规则），详情引用 references/
    - description：`"Execute spec Scenarios end-to-end against real runtime and produce pass/fail verdicts with evidence. Use when /forge ship runs on a spec with acceptance_eval true, when user runs /forge accept explicitly, or when /forge ship --with-acceptance flag is provided."`
    - `disable-model-invocation: true`
    - _Requirements: 6.1, 6.2, 6.3, 6.14_

  - [x] 6.15 创建 references/（`skills/forge-accept/references/`）
    - `scenario-format.md`：显式与隐式 scenario 格式示例
    - `runners.md`：API / UI / CLI / Mixed runner 选择策略
    - `boundary-with-test.md`：forge-test vs forge-accept 边界（按 design §6.9 的 15 条）
    - _Requirements: 6.15_

  - [x] 6.16 集成到 forge-ship（`src/ship.ts` 扩展）
    - 实现 `runAcceptanceGate(topic, specFrontmatter, cliFlags): Promise<AcceptanceGateResult>`
    - 触发条件：spec.acceptance_eval === true OR cliFlags.withAcceptance
    - 按 spec.acceptance_blocks_ship + FAIL 数决定是否阻断 ship
    - 默认 `acceptance_blocks_ship: false`（警告级）
    - Integration test：fixture spec 两种 frontmatter × 两种 CLI flag = 4 组合
    - _Requirements: 6.2, 6.9, 6.10_

  - [x] 6.17 注册命令（`commands/forge.md` 扩展）
    - 新增 `/forge accept [scenario-id]` 入口
    - 新增 `/forge ship --with-acceptance` 参数识别
    - 新增 `/forge ship --promote-derived` 参数识别
    - _Requirements: 6.2_

  - [x] 6.18 Evolution marker 自动写入
    - 失败 scenario 触发写入 Evolution marker 到 acceptance 报告
    - 格式：`<!-- Evolution: YYYY-MM-DD | source: acceptance/<topic>/<scenario-id> | target: forge-build#scenario-gap -->`
    - 对齐 skills-cross-pollination 需求 8 的总体机制
    - _Requirements: 6.12_

  - [x] 6.19 Retention 策略
    - 修改 `scripts/prune-event-logs.sh`（或新建）
    - `.forge/acceptance/` 默认保留 30 天，超期归档到 `.forge/archive/acceptance/`
    - 在 `.forge/config.md` 声明
    - _Requirements: 6.13_

  - [x] 6.20 端到端手工验证（非自动化）
    - 准备含显式 scenarios 的 fixture spec
    - 准备仅有 acceptance criteria（WHEN/THEN）的 spec
    - 分别跑 `/forge ship --with-acceptance` 验证两种来源正确执行
    - 验证 blocksShip 开关的行为
    - _Requirements: 6.1, 6.9, 6.10_

---

## Summary

### 任务编号与需求映射

| Phase | Tasks | 需求编号 | 预期工作量 |
|---|---|---|---|
| Phase 1.1 | 1.1 – 1.7 | 需求 1 | S（≤1d） |
| Phase 1.2 | 2.1 – 2.6 | 需求 2 | S（≤1d） |
| Phase 1.3 | 3.1 – 3.8 | 需求 3 | M（≤3d） |
| Phase 2.1 | 4.1 – 4.9 | 需求 4 | M（≤3d） |
| Phase 3.1 | 5.1 – 5.17 | 需求 5 | L（≤1w） |
| Phase 4.1 | 6.1 – 6.20 | 需求 6 | L（≤1w） |

**总任务数**：65 个子任务，覆盖 6 个需求。

### 推荐实施顺序

1. **立即可并行**：Phase 1.1 + 1.2 + 2.1（规则层 + 纪律层，互不依赖）
2. **待 Phase 1 完成**：Phase 1.3（汇总前两者的文档化出口）
3. **较大投入**：Phase 3.1（frontend-check，需 cmux 环境验证）
4. **最后启动**：Phase 4.1（依赖 Phase 3.1 的 cmux 基础设施）

### 里程碑

- **MVP（≤12 人日）**：Phase 1.1 + 1.2 + 1.3 + 2.1 = 19 skill 规则全绿 + 风格指南发布 + scripts 纪律落地
- **完整（≤20 人日）**：加上 Phase 3.1 + 4.1 = frontend-check 上线 + acceptance eval MVP 可用

### 验收入口

- 每个 Phase 结束：`npm run check` 绿灯
- 整体完成：19 skill 全合规（切换 error 模式）+ 风格指南发布 + 4 类 validator 全在 CI + frontend-check Layer 4 可用 + acceptance eval 作为可选 ship gate

### 与其他 spec 的协调

- **skills-cross-pollination**：本 spec 需求 1 与 R3（description 失败模式重写）在同一轮 PR 内合并规则（语法 + 语义的并集）
- **skill-document-optimization**：本 spec 结束后，由该 spec 负责回溯 19 个 skill 的骨架与内容精简
- **engineering-governance-hardening**：本 spec 需求 3 的风格指南大版本升级走该 spec 的 ADR 机制
