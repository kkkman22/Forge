---
topic: "oz-skills-inspiration"
status: "approved"
date: "2026-05-08"
spec_ref: ".kiro/specs/oz-skills-inspiration"
format: "lightweight"
---

## Objective

借鉴 warpdotdev/oz-skills 的 6 项能力增强，落地到 Forge：description 两句式强化、SKILL.md 章节骨架统一、风格指南与作者模板、Scripts as Black Box 纪律、Frontend-Check 评审 Agent、Acceptance Scenario Eval。分 4 Phase 共 65 个子任务，按"规则优先于工具，工具优先于能力"顺序实施。

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#1` | Description 两句式强化 — 祈使动词白名单、splitSentences、validateDescriptionExtended |
| `design.md#2` | 章节骨架统一 — DeliverableCategory、parseSkeleton、validate-skill-skeleton.mjs |
| `design.md#3` | Style Guide + Template — skill-style-guide.md、SKILL-TEMPLATE.md、validateSkillTemplate |
| `design.md#4` | Scripts as Blackbox — CLAUDE.md §2.8、script-help.ts、validate-scripts-help.mjs |
| `design.md#5` | Frontend-Check Agent — Tier A/B/C、cmux browser、axe-core vendor、detectTierAvailability |
| `design.md#6` | Acceptance Scenario Eval — parseScenarios、Runner dispatch、AcceptanceGateResult |

## File Mapping

### Phase 1.1 — Description 两句式强化（R1）

| File Path | Operation | Description |
|-----------|-----------|-------------|
| `src/skill-description-imperatives.ts` | CREATE | 祈使动词白名单模块 |
| `src/skill-description.ts` | MODIFY | 新增 splitSentences/countSentences/startsWithImperative/validateDescriptionExtended |
| `test/skill-description-extended.property.test.ts` | CREATE | 新增三条规则的 property-based test |
| `scripts/validate-skill-descriptions.mjs` | MODIFY | 镜像新规则，新增 --strict flag |
| `skills/forge-{plan,build,ship,review}/SKILL.md` | MODIFY | 改写 description（4 个优先） |
| `skills/forge-{abort,build-light,debug,decide,fix,grill,learn,loop,refactor,resume,router,spec,status,test,zoom-out}/SKILL.md` | MODIFY | 批量改写 description（15 个） |

### Phase 1.2 — 章节骨架统一（R2）

| File Path | Operation | Description |
|-----------|-----------|-------------|
| `src/skill-skeleton.ts` | CREATE | parseSkeleton/renderSkeletonReport 纯函数 |
| `test/skill-skeleton.property.test.ts` | CREATE | 骨架判定 property-based test |
| `scripts/validate-skill-skeleton.mjs` | CREATE | 骨架校验脚本 |
| `skills/forge-*/SKILL.md` (×19) | MODIFY | 批量追加 skeleton_exempt_legacy: true |
| `package.json` | MODIFY | check 脚本纳入 validate-skill-skeleton |
| `.github/pull_request_template.md` | CREATE/MODIFY | 新 skill PR 勾选项 |

### Phase 1.3 — Style Guide + Template（R3）

| File Path | Operation | Description |
|-----------|-----------|-------------|
| `.tinkerman/knowledge/skill-style-guide.md` | CREATE | 风格指南主文档（开放区） |
| `templates/SKILL-TEMPLATE.md` | CREATE | 可 cp 使用的骨架模板 |
| `src/skill-template.ts` | CREATE | validateSkillTemplate 纯函数 |
| `test/skill-template.property.test.ts` | CREATE | 模板校验 property-based test |
| `CONTRIBUTING.md` | MODIFY | 引用风格指南 |

### Phase 2.1 — Scripts as Black Box（R4）

| File Path | Operation | Description |
|-----------|-----------|-------------|
| `CLAUDE.md` | MODIFY | 新增 §2.8 Scripts as Black Box |
| `src/script-help.ts` | CREATE | parseScriptCategory/parseHelpOutput/parseHelpExempt 纯函数 |
| `test/script-help.property.test.ts` | CREATE | Scripts 校验 property-based test |
| `.tinkerman/findings/scripts-help-audit.md` | CREATE | 27 个脚本分类审计结果 |
| `scripts/.help-exempt` | CREATE | internal-only/one-off 豁免清单 |
| `scripts/init.sh` | MODIFY | 补齐 --help + category 注释 |
| `scripts/build-dist.sh` | MODIFY | 补齐 --help + category 注释 |
| `scripts/install-dist.sh` | MODIFY | 补齐 --help + category 注释 |
| `scripts/check-frozen.sh` | MODIFY | 补齐 --help + category 注释 |
| `scripts/check-readme-metrics.sh` | MODIFY | 补齐 --help + category 注释 |
| `scripts/prune-event-logs.sh` | MODIFY | 补齐 --help + category 注释 |
| `scripts/validate-knowledge.sh` | MODIFY | 补齐 --help + category 注释 |
| `scripts/validate-scripts-help.mjs` | CREATE | 脚本 --help 校验器 |
| `package.json` | MODIFY | check 脚本纳入 validate-scripts-help |
| `.tinkerman/knowledge/skill-style-guide.md` | MODIFY | 引用 Scripts as Black Box 纪律 |

### Phase 3.1 — Frontend-Check Agent（R5）

| File Path | Operation | Description |
|-----------|-----------|-------------|
| `scripts/vendor/axe.min.js` | CREATE | axe-core 4.10.x vendor（git-tracked） |
| `scripts/update-vendor-axe.sh` | CREATE | axe-core 升级脚本 |
| `.gitignore` | MODIFY | 追加 .tinkerman/cache/ |
| `src/frontend-check.ts` | CREATE | detectTierAvailability/scanVueTemplate/parseAxeResult |
| `test/frontend-check.property.test.ts` | CREATE | Tier 探测 + Vue 扫描 property-based test |
| `skills/forge-review/references/frontend-check-patterns.md` | CREATE | Tier A 静态扫描规则集（≥8 条） |
| `agents/frontend-check.md` | CREATE | Layer 4 agent 定义 |
| `skills/forge-review/references/frontend-check-tier-b.md` | CREATE | Tier B cmux browser 工作流参考 |
| `skills/forge-review/references/frontend-check-tier-c.md` | CREATE | Tier C chrome-devtools 工作流参考 |
| `src/login-state-cache.ts` | CREATE | 登录态缓存管理 |
| `src/dev-server-lifecycle.ts` | CREATE | dev server start/stop/withDevServer |
| `skills/forge-router/references/behavior-hints.md` | MODIFY | hint 映射到 frontend-check |
| `scripts/prune-event-logs.sh` | MODIFY | 扩展覆盖 .tinkerman/reviews/assets/ |

### Phase 4.1 — Acceptance Scenario Eval（R6）

| File Path | Operation | Description |
|-----------|-----------|-------------|
| `src/accept.ts` | CREATE | Scenario 类型 + parseScenarios/classifyScenarioType/aggregateVerdicts |
| `src/accept-driver.ts` | CREATE | API/UI/CLI/Mixed Runner 实现 |
| `test/accept.property.test.ts` | CREATE | Scenario 解析 + 分类 property-based test |
| `skills/forge-accept/SKILL.md` | CREATE | Acceptance Eval skill 定义 |
| `skills/forge-accept/references/scenario-format.md` | CREATE | 显式/隐式 scenario 格式 |
| `skills/forge-accept/references/runners.md` | CREATE | Runner 选择策略 |
| `skills/forge-accept/references/boundary-with-test.md` | CREATE | forge-test vs forge-accept 边界 |
| `src/ship.ts` | MODIFY | 新增 runAcceptanceGate |

## Task Breakdown

> 详细任务见 `.kiro/specs/oz-skills-inspiration/tasks.md`（65 子任务）。
> 以下按 Phase 分组，每条为 lightweight task format。

### Phase 1.1 — Description 两句式强化（7 tasks）

#### Task 1: 定义祈使动词白名单
- **Goal**: 创建 IMPERATIVE_WHITELIST 常量模块
- **File**: `src/skill-description-imperatives.ts`
- **Design Ref**: `design.md#1.2` — 祈使动词白名单数据结构
- **Depends On**: (none)
- **Verify**: `npx vitest run test/skill-description-extended.property.test.ts`
- **Commit**: `feat(skill-description): add imperative verb whitelist`

#### Task 2: 扩展 description 纯函数
- **Goal**: 新增 splitSentences/countSentences/startsWithImperative/validateDescriptionExtended
- **File**: `src/skill-description.ts`
- **Design Ref**: `design.md#1.2` — DescriptionValidationExtended 接口与纯函数
- **Depends On**: Task 1
- **Verify**: `npx vitest run test/skill-description-extended.property.test.ts`
- **Commit**: `feat(skill-description): add two-sentence validation with imperative check`

#### Task 3: Property-based test 覆盖
- **Goal**: 覆盖 countSentences/startsWithImperative/secondSentenceStartsWithUseWhen + 向后兼容
- **File**: `test/skill-description-extended.property.test.ts`
- **Design Ref**: `design.md#1.2` — 边界情况
- **Depends On**: Task 2
- **Verify**: `npx vitest run test/skill-description-extended.property.test.ts`
- **Commit**: `test(skill-description): add property-based tests for extended validation`

#### Task 4: 扩展校验脚本
- **Goal**: 镜像新规则到 validate-skill-descriptions.mjs，新增 --strict flag
- **File**: `scripts/validate-skill-descriptions.mjs`
- **Design Ref**: `design.md#1.4` — 迁移序列（warning → error）
- **Depends On**: Task 2
- **Verify**: `node scripts/validate-skill-descriptions.mjs`
- **Commit**: `feat(scripts): extend skill description validator with two-sentence rules`

#### Task 5: 改写 4 个优先 skill description
- **Goal**: forge-plan/build/ship/review description 改为两句式 + 祈使动词开头
- **File**: `skills/forge-{plan,build,ship,review}/SKILL.md`
- **Design Ref**: `design.md#1.4` — 迁移序列 Step 2
- **Depends On**: Task 4
- **Verify**: `node scripts/validate-skill-descriptions.mjs --strict`
- **Commit**: `refactor(skills): rewrite plan/build/ship/review descriptions to two-sentence format`

#### Task 6: 批量改写剩余 15 个 skill description
- **Goal**: 所有 forge-* skill description 统一为两句式
- **File**: `skills/forge-{abort,build-light,debug,decide,fix,grill,learn,loop,refactor,resume,router,spec,status,test,zoom-out}/SKILL.md`
- **Design Ref**: `design.md#1.4` — 迁移序列 Step 2
- **Depends On**: Task 5
- **Verify**: `npm run check`
- **Commit**: `refactor(skills): batch rewrite remaining 15 skill descriptions`

#### Task 7: 切换到 error 模式
- **Goal**: 新规则从 warning 切换到 error，不合规时构建失败
- **File**: `src/skill-description.ts`, `scripts/validate-skill-descriptions.mjs`
- **Design Ref**: `design.md#1.4` — 迁移序列 Step 3
- **Depends On**: Task 6
- **Verify**: `npm run check`
- **Commit**: `feat(skill-description): enforce two-sentence rules in error mode`

### Phase 1.2 — 章节骨架统一（6 tasks）

#### Task 8: 定义骨架类型与判定函数
- **Goal**: 实现 parseSkeleton/renderSkeletonReport，支持 DeliverableCategory
- **File**: `src/skill-skeleton.ts`
- **Design Ref**: `design.md#2.1` — SkeletonCheck/DeliverableCategory 数据结构
- **Depends On**: (none)
- **Verify**: `npx vitest run test/skill-skeleton.property.test.ts`
- **Commit**: `feat(skill-skeleton): add parseSkeleton and renderSkeletonReport`

#### Task 9: Property-based test 覆盖
- **Goal**: 任意输入不抛错、三段验证、豁免逻辑
- **File**: `test/skill-skeleton.property.test.ts`
- **Design Ref**: `design.md#2.1` — SkeletonCheck 接口
- **Depends On**: Task 8
- **Verify**: `npx vitest run test/skill-skeleton.property.test.ts`
- **Commit**: `test(skill-skeleton): add property-based tests`

#### Task 10: 创建验证脚本
- **Goal**: validate-skill-skeleton.mjs 校验 Prerequisites/Deliverable 章节
- **File**: `scripts/validate-skill-skeleton.mjs`
- **Design Ref**: `design.md#2.4` — 校验脚本逻辑
- **Depends On**: Task 8
- **Verify**: `node scripts/validate-skill-skeleton.mjs`
- **Commit**: `feat(scripts): add skill skeleton validator`

#### Task 11: 19 个既有 skill 添加 skeleton_exempt_legacy
- **Goal**: 批量追加 frontmatter 字段，确保 warning 而非 fail
- **File**: `skills/forge-*/SKILL.md` (×19)
- **Design Ref**: `design.md#2.3` — 豁免声明格式
- **Depends On**: Task 10
- **Verify**: `node scripts/validate-skill-skeleton.mjs`
- **Commit**: `refactor(skills): add skeleton_exempt_legacy to 19 existing skills`

#### Task 12: 纳入 npm run check
- **Goal**: check 脚本序列加入 validate-skill-skeleton
- **File**: `package.json`
- **Design Ref**: `design.md#2.4` — CI 集成
- **Depends On**: Task 11
- **Verify**: `npm run check`
- **Commit**: `feat(ci): integrate skill skeleton validation into check`

#### Task 13: PR 模板勾选项
- **Goal**: 新 skill PR 勾选骨架合规声明
- **File**: `.github/pull_request_template.md`
- **Design Ref**: `design.md#2.5` — 回溯策略
- **Depends On**: Task 10
- **Verify**: 文件存在且含勾选项
- **Commit**: `docs: add skill skeleton checklist to PR template`

### Phase 1.3 — Style Guide + Template（8 tasks）

#### Task 14: 创建风格指南主文档
- **Goal**: 10 章节、frontmatter 含 style_guide_version: "1.0"
- **File**: `.tinkerman/knowledge/skill-style-guide.md`
- **Design Ref**: `design.md#3.2` — 文档章节结构
- **Depends On**: Task 7, Task 12
- **Verify**: 文件存在且含全部 10 章节
- **Commit**: `docs(skill-style-guide): create v1.0 style guide`

#### Task 15: 编写反模式清单
- **Goal**: ≥5 条反模式，含"为何是反模式 / 正确做法"
- **File**: `.tinkerman/knowledge/skill-style-guide.md` (section 8)
- **Design Ref**: `design.md#3.2` — 章节 8
- **Depends On**: Task 14
- **Verify**: 反模式条数 ≥ 5
- **Commit**: `docs(skill-style-guide): add anti-pattern checklist`

#### Task 16: 编写版本演进策略
- **Goal**: style_guide_version semver 规则 + changelog 落地策略
- **File**: `.tinkerman/knowledge/skill-style-guide.md` (section 9)
- **Design Ref**: `design.md#3.4` — 版本演进
- **Depends On**: Task 14
- **Verify**: 策略文档完整
- **Commit**: `docs(skill-style-guide): add version evolution strategy`

#### Task 17: 编写快速核对清单
- **Goal**: ≤10 条 PR 自检清单
- **File**: `.tinkerman/knowledge/skill-style-guide.md` (section 10)
- **Design Ref**: `design.md#3.2` — 章节 10
- **Depends On**: Task 14
- **Verify**: 清单条数 ≤ 10
- **Commit**: `docs(skill-style-guide): add quick checklist`

#### Task 18: 创建 Skill 模板
- **Goal**: 可 cp 骨架，基于虚构 forge-example，含全部占位符
- **File**: `templates/SKILL-TEMPLATE.md`
- **Design Ref**: `design.md#3.3` — 模板示例
- **Depends On**: Task 14
- **Verify**: 模板含 Prerequisites/Workflow/Deliverable 占位符
- **Commit**: `docs: add SKILL-TEMPLATE.md`

#### Task 19: 实现模板校验函数
- **Goal**: validateSkillTemplate 纯函数
- **File**: `src/skill-template.ts`
- **Design Ref**: `design.md#3.5` — validateSkillTemplate 接口
- **Depends On**: (none)
- **Verify**: `npx vitest run test/skill-template.property.test.ts`
- **Commit**: `feat(skill-template): add validateSkillTemplate function`

#### Task 20: Property-based test 覆盖
- **Goal**: 任意 content 不抛错、missingSections 子集验证
- **File**: `test/skill-template.property.test.ts`
- **Design Ref**: `design.md#3.5`
- **Depends On**: Task 19
- **Verify**: `npx vitest run test/skill-template.property.test.ts`
- **Commit**: `test(skill-template): add property-based tests`

#### Task 21: CONTRIBUTING.md 引用风格指南
- **Goal**: "Creating a New Skill" 章节链接风格指南
- **File**: `CONTRIBUTING.md`
- **Design Ref**: `design.md#3.2` — 面向新作者
- **Depends On**: Task 14
- **Verify**: 文件含风格指南链接
- **Commit**: `docs: reference skill style guide in CONTRIBUTING`

### Phase 2.1 — Scripts as Black Box（9 tasks）

#### Task 22: CLAUDE.md 新增 §2.8
- **Goal**: 插入 Scripts as Black Box 纪律条款
- **File**: `CLAUDE.md`
- **Design Ref**: `design.md#4.1` — 纪律条款文本
- **Depends On**: (none)
- **Verify**: grep "Scripts as Black Box" CLAUDE.md
- **Commit**: `docs(claude-md): add §2.8 Scripts as Black Box discipline`

#### Task 23: 定义脚本分类纯函数
- **Goal**: parseScriptCategory/parseHelpOutput/parseHelpExempt/auditScript
- **File**: `src/script-help.ts`
- **Design Ref**: `design.md#4.4` — ScriptAuditEntry 接口
- **Depends On**: (none)
- **Verify**: `npx vitest run test/script-help.property.test.ts`
- **Commit**: `feat(script-help): add script category and help validation functions`

#### Task 24: Property-based test 覆盖
- **Goal**: 覆盖 parseHelpOutput/parseHelpExempt/parseScriptCategory
- **File**: `test/script-help.property.test.ts`
- **Design Ref**: `design.md#4.4`
- **Depends On**: Task 23
- **Verify**: `npx vitest run test/script-help.property.test.ts`
- **Commit**: `test(script-help): add property-based tests`

#### Task 25: 首版脚本审计
- **Goal**: 27 个脚本逐个定性，产出 scripts-help-audit.md
- **File**: `.tinkerman/findings/scripts-help-audit.md`
- **Design Ref**: `design.md#4.5` — 审计产物格式
- **Depends On**: Task 23
- **Verify**: 文件存在且覆盖全部脚本
- **Commit**: `docs: add scripts help audit findings`

#### Task 26: 创建豁免清单
- **Goal**: scripts/.help-exempt 行分隔清单
- **File**: `scripts/.help-exempt`
- **Design Ref**: `design.md#4.2` — 豁免配置格式
- **Depends On**: Task 25
- **Verify**: 文件存在且含 internal-only/one-off 条目
- **Commit**: `feat(scripts): create help exempt list`

#### Task 27: 为 user-facing 脚本补齐 --help
- **Goal**: 审计标记为 user_facing_missing_help 的脚本补齐 --help 分支
- **File**: `scripts/{init,build-dist,install-dist,check-frozen,check-readme-metrics,prune-event-logs,validate-knowledge}.sh`（以审计结果为准）
- **Design Ref**: `design.md#4.6` — --help 模板
- **Depends On**: Task 25, Task 26
- **Verify**: `bash scripts/<name> --help` 输出含 Usage
- **Commit**: `feat(scripts): add --help to user-facing scripts`

#### Task 28: 创建校验脚本
- **Goal**: validate-scripts-help.mjs 对 user-facing 脚本执行 --help 校验
- **File**: `scripts/validate-scripts-help.mjs`
- **Design Ref**: `design.md#4.4` — 校验脚本逻辑
- **Depends On**: Task 26, Task 27
- **Verify**: `node scripts/validate-scripts-help.mjs`
- **Commit**: `feat(scripts): add scripts help validator`

#### Task 29: 纳入 npm run check
- **Goal**: check 脚本序列加入 validate-scripts-help
- **File**: `package.json`
- **Design Ref**: `design.md#4.4` — CI 集成
- **Depends On**: Task 28
- **Verify**: `npm run check`
- **Commit**: `feat(ci): integrate scripts help validation into check`

#### Task 30: 更新风格指南 scripts/ 章节
- **Goal**: 引用 CLAUDE.md §2.8 + 豁免机制
- **File**: `.tinkerman/knowledge/skill-style-guide.md`
- **Design Ref**: `design.md#3.2` — 章节 7
- **Depends On**: Task 14, Task 22
- **Verify**: 风格指南含 Scripts as Black Box 引用
- **Commit**: `docs(skill-style-guide): add scripts black box reference`

### Phase 3.1 — Frontend-Check Agent（17 tasks）

#### Task 31: 添加 axe-core vendor 文件
- **Goal**: 下载 axe-core 4.10.x，git-tracked 入库
- **File**: `scripts/vendor/axe.min.js`
- **Design Ref**: `design.md#5.8` — vendor 管理
- **Depends On**: (none)
- **Verify**: 文件存在且含版本头注释
- **Commit**: `feat(vendor): add axe-core 4.10.x`

#### Task 32: 创建 axe-core 升级脚本
- **Goal**: update-vendor-axe.sh 支持 --version + --help
- **File**: `scripts/update-vendor-axe.sh`
- **Design Ref**: `design.md#5.8` — 升级脚本
- **Depends On**: Task 31
- **Verify**: `bash scripts/update-vendor-axe.sh --help`
- **Commit**: `feat(scripts): add axe-core upgrade script`

#### Task 33: 更新 .gitignore
- **Goal**: 追加 .tinkerman/cache/ 条目
- **File**: `.gitignore`
- **Design Ref**: `design.md#5.7` — 登录态缓存
- **Depends On**: (none)
- **Verify**: grep ".tinkerman/cache/" .gitignore
- **Commit**: `chore: add .tinkerman/cache/ to .gitignore`

#### Task 34: 定义 Tier 探测纯函数
- **Goal**: detectTierAvailability — 8 种 env 组合判定
- **File**: `src/frontend-check.ts`
- **Design Ref**: `design.md#5.3` — TierAvailability 接口与判定表
- **Depends On**: (none)
- **Verify**: `npx vitest run test/frontend-check.property.test.ts`
- **Commit**: `feat(frontend-check): add detectTierAvailability`

#### Task 35: Property-based test 覆盖
- **Goal**: 任意 env 不抛错、Tier A 总是可用、Tier B 判定
- **File**: `test/frontend-check.property.test.ts`
- **Design Ref**: `design.md#5.3`
- **Depends On**: Task 34
- **Verify**: `npx vitest run test/frontend-check.property.test.ts`
- **Commit**: `test(frontend-check): add property-based tests`

#### Task 36: 编写 Vue3 静态扫描规则集
- **Goal**: ≥8 条规则，YAML 格式，含 pattern/severity/wcag/example
- **File**: `skills/forge-review/references/frontend-check-patterns.md`
- **Design Ref**: `design.md#5.4` — Tier A 规则集
- **Depends On**: (none)
- **Verify**: 规则条数 ≥ 8
- **Commit**: `docs(frontend-check): add Vue3 static scan rules`

#### Task 37: 实现 Tier A 静态扫描
- **Goal**: scanVueTemplate/scanVueProject 纯函数
- **File**: `src/frontend-check.ts` (扩展)
- **Design Ref**: `design.md#5.4` — Vue3Violation/VueA11yRule 接口
- **Depends On**: Task 34, Task 36
- **Verify**: `npx vitest run test/frontend-check.property.test.ts`
- **Commit**: `feat(frontend-check): implement Tier A static scan`

#### Task 38: 创建 frontend-check agent 定义
- **Goal**: agents/frontend-check.md，含 Prerequisites/Workflow/Deliverable
- **File**: `agents/frontend-check.md`
- **Design Ref**: `design.md#5.2` — Agent 定义骨架
- **Depends On**: Task 37
- **Verify**: agent 文件含完整三段骨架
- **Commit**: `feat(agents): add frontend-check Layer 4 agent`

#### Task 39: 编写 Tier B 工作流参考
- **Goal**: cmux browser 完整工作流文档
- **File**: `skills/forge-review/references/frontend-check-tier-b.md`
- **Design Ref**: `design.md#5.5` — Tier B 脚本
- **Depends On**: Task 38
- **Verify**: 文档含 dev server/登录态/axe 注入/清理流程
- **Commit**: `docs(frontend-check): add Tier B workflow reference`

#### Task 40: 编写 Tier C 工作流参考
- **Goal**: chrome-devtools MCP Core Web Vitals 提取文档
- **File**: `skills/forge-review/references/frontend-check-tier-c.md`
- **Design Ref**: `design.md#5.6` — Tier C MCP 流程
- **Depends On**: Task 38
- **Verify**: 文档含 LCP/CLS/RenderBlocking insights
- **Commit**: `docs(frontend-check): add Tier C workflow reference`

#### Task 41: 实现 axe.run() 结果解析
- **Goal**: parseAxeResult 纯函数，impact → P0/P1/P2/P3 映射
- **File**: `src/frontend-check.ts` (扩展)
- **Design Ref**: `design.md#5.4` — AxeResult/AxeViolation
- **Depends On**: Task 37
- **Verify**: `npx vitest run test/frontend-check.property.test.ts`
- **Commit**: `feat(frontend-check): add axe result parser`

#### Task 42: 集成到 forge-review
- **Goal**: runLayer4FrontendCheck driver + Layer 4 输出段落
- **File**: 扩展 review 集成点
- **Design Ref**: `design.md#5.2` — Deliverable 格式
- **Depends On**: Task 37, Task 41
- **Verify**: review 流程包含 Layer 4 输出
- **Commit**: `feat(review): integrate Layer 4 frontend check`

#### Task 43: 登录态缓存工具
- **Goal**: getCachedStatePath/isStateCacheExpired/promptForManualLogin
- **File**: `src/login-state-cache.ts`
- **Design Ref**: `design.md#5.7` — 登录态缓存策略
- **Depends On**: (none)
- **Verify**: `npx vitest run`
- **Commit**: `feat(frontend-check): add login state cache utilities`

#### Task 44: Dev server 生命周期管理
- **Goal**: startDevServer/stopDevServer/withDevServer + 5min 超时
- **File**: `src/dev-server-lifecycle.ts`
- **Design Ref**: `design.md#5.9` — Dev Server 生命周期
- **Depends On**: (none)
- **Verify**: `npx vitest run`
- **Commit**: `feat(frontend-check): add dev server lifecycle management`

#### Task 45: 路由器 hint 映射
- **Goal**: a11y-check/responsive-check 映射到 frontend-check
- **File**: `skills/forge-router/references/behavior-hints.md`
- **Design Ref**: `design.md#5.10` — Router Hint 映射表
- **Depends On**: Task 38
- **Verify**: grep "frontend-check" behavior-hints.md
- **Commit**: `feat(router): map a11y-check hints to frontend-check agent`

#### Task 46: reviews/assets 纳入 retention
- **Goal**: .tinkerman/reviews/assets/ 30 天自动归档
- **File**: `scripts/prune-event-logs.sh` (扩展)
- **Design Ref**: `design.md#5.1` — retention 策略
- **Depends On**: (none)
- **Verify**: 脚本覆盖 reviews/assets 目录
- **Commit**: `feat(scripts): add review assets retention`

#### Task 47: 端到端手工验证
- **Goal**: fixture Vue3 项目 + cmux workspace 内完整 review
- **File**: (手工验证，无代码产出)
- **Design Ref**: `design.md#5.3` — 降级行为
- **Depends On**: Task 42
- **Verify**: Layer 4 三档输出含 axe + screenshot + CWV
- **Commit**: (无 commit — 验证确认)

### Phase 4.1 — Acceptance Scenario Eval（20 tasks）

#### Task 48: 定义核心类型
- **Goal**: ScenarioSource/ScenarioType/Verdict 枚举 + Scenario/ScenarioArtifact/AcceptanceRunResult 接口
- **File**: `src/accept.ts`
- **Design Ref**: `design.md#6.2` — 核心类型
- **Depends On**: (none)
- **Verify**: `npx vitest run`
- **Commit**: `feat(accept): add core scenario types`

#### Task 49: 实现显式 scenario 解析
- **Goal**: parseExplicitScenarios — 扫描 ## Scenarios 下 Scenario: 块
- **File**: `src/accept.ts` (扩展)
- **Design Ref**: `design.md#6.3` — 显式解析
- **Depends On**: Task 48
- **Verify**: `npx vitest run test/accept.property.test.ts`
- **Commit**: `feat(accept): add explicit scenario parser`

#### Task 50: 实现隐式 scenario 反向提取
- **Goal**: deriveScenariosFromCriteria — WHEN/THEN 子句提取
- **File**: `src/accept.ts` (扩展)
- **Design Ref**: `design.md#6.3` — 隐式提取
- **Depends On**: Task 48
- **Verify**: `npx vitest run test/accept.property.test.ts`
- **Commit**: `feat(accept): add derived scenario extractor`

#### Task 51: 实现 scenario 统一入口
- **Goal**: parseScenariosFromSpec — 合并显式+隐式，去重
- **File**: `src/accept.ts` (扩展)
- **Design Ref**: `design.md#6.3` — 统一入口
- **Depends On**: Task 49, Task 50
- **Verify**: `npx vitest run test/accept.property.test.ts`
- **Commit**: `feat(accept): add unified scenario parser`

#### Task 52: 实现 scenario 选择与排序
- **Goal**: selectScenariosForRun — @critical > @happy-path > explicit > confidence
- **File**: `src/accept.ts` (扩展)
- **Design Ref**: `design.md#6.4` — 选择与排序
- **Depends On**: Task 51
- **Verify**: `npx vitest run test/accept.property.test.ts`
- **Commit**: `feat(accept): add scenario selector`

#### Task 53: 实现 scenario 类型识别
- **Goal**: classifyScenarioType — API/UI/CLI/Mixed 关键词匹配
- **File**: `src/accept.ts` (扩展)
- **Design Ref**: `design.md#6.5` — 类型识别规则
- **Depends On**: Task 48
- **Verify**: `npx vitest run test/accept.property.test.ts`
- **Commit**: `feat(accept): add scenario type classifier`

#### Task 54: Property-based test 覆盖
- **Goal**: 覆盖全部 accept 纯函数
- **File**: `test/accept.property.test.ts`
- **Design Ref**: `design.md#6.2-6.5`
- **Depends On**: Task 51, Task 52, Task 53
- **Verify**: `npx vitest run test/accept.property.test.ts`
- **Commit**: `test(accept): add property-based tests`

#### Task 55: 实现 API runner
- **Goal**: curl-based runner，endpoint/method/body 提取 + verdict 判定
- **File**: `src/accept-driver.ts`
- **Design Ref**: `design.md#6.6` — API Runner 示例
- **Depends On**: Task 48
- **Verify**: `npx vitest run`
- **Commit**: `feat(accept): add API scenario runner`

#### Task 56: 实现 UI runner
- **Goal**: cmux browser CLI runner，复用 Tier B 基础设施
- **File**: `src/accept-driver.ts` (扩展)
- **Design Ref**: `design.md#6.6` — Runner 分发
- **Depends On**: Task 55, Task 44, Task 34
- **Verify**: `npx vitest run`
- **Commit**: `feat(accept): add UI scenario runner`

#### Task 57: 实现 CLI runner
- **Goal**: bash runner，stdout/exit 捕获 + 断言（首版 SKIP）
- **File**: `src/accept-driver.ts` (扩展)
- **Design Ref**: `design.md#6.6`
- **Depends On**: Task 55
- **Verify**: `npx vitest run`
- **Commit**: `feat(accept): add CLI scenario runner (stub)`

#### Task 58: 实现 Mixed runner
- **Goal**: 顺序组合 UI+API+CLI（首版 SKIP）
- **File**: `src/accept-driver.ts` (扩展)
- **Design Ref**: `design.md#6.6`
- **Depends On**: Task 55, Task 56
- **Verify**: `npx vitest run`
- **Commit**: `feat(accept): add mixed scenario runner (stub)`

#### Task 59: 实现 Runner 分发
- **Goal**: RUNNERS 常量 + runScenario dispatch
- **File**: `src/accept-driver.ts` (扩展)
- **Design Ref**: `design.md#6.6` — Runner 分发
- **Depends On**: Task 55–58
- **Verify**: `npx vitest run`
- **Commit**: `feat(accept): add runner dispatch`

#### Task 60: 实现聚合与报告
- **Goal**: aggregateVerdicts + renderAcceptanceReport
- **File**: `src/accept.ts` (扩展)
- **Design Ref**: `design.md#6.8` — 汇总报告格式
- **Depends On**: Task 59
- **Verify**: `npx vitest run test/accept.property.test.ts`
- **Commit**: `feat(accept): add verdict aggregation and report rendering`

#### Task 61: 创建 forge-accept skill
- **Goal**: 三段骨架 + 两句式 description + disable-model-invocation
- **File**: `skills/forge-accept/SKILL.md`
- **Design Ref**: `design.md#6.1` — 文件结构
- **Depends On**: Task 60
- **Verify**: `node scripts/validate-skill-descriptions.mjs --strict`
- **Commit**: `feat(skills): add forge-accept skill`

#### Task 62: 创建 references/
- **Goal**: scenario-format.md / runners.md / boundary-with-test.md
- **File**: `skills/forge-accept/references/`
- **Design Ref**: `design.md#6.1`
- **Depends On**: Task 61
- **Verify**: 3 个 reference 文件存在
- **Commit**: `docs(accept): add skill references`

#### Task 63: 集成到 forge-ship
- **Goal**: runAcceptanceGate — 触发条件 + blocksShip 判定
- **File**: `src/ship.ts` (扩展)
- **Design Ref**: `design.md#6.9` — Ship Gate 集成
- **Depends On**: Task 60
- **Verify**: `npx vitest run`
- **Commit**: `feat(ship): add acceptance gate integration`

#### Task 64: 注册命令
- **Goal**: /forge accept + /forge ship --with-acceptance
- **File**: `commands/forge.md` 或 skills/forge/SKILL.md
- **Design Ref**: `design.md#6.10` — Command 注册
- **Depends On**: Task 63
- **Verify**: grep "accept" commands/forge.md
- **Commit**: `feat(commands): register /forge accept`

#### Task 65: Retention 策略
- **Goal**: .tinkerman/acceptance/ 30 天归档
- **File**: `scripts/prune-event-logs.sh` (扩展)
- **Design Ref**: `design.md#6.1`
- **Depends On**: (none)
- **Verify**: 脚本覆盖 acceptance 目录
- **Commit**: `feat(scripts): add acceptance artifact retention`

## Spec Coverage

| Requirement | Tasks | Coverage |
|------------|-------|----------|
| R1: Description 两句式 | 1–7 | 全覆盖（白名单→纯函数→测试→脚本→改写→error模式） |
| R2: 章节骨架统一 | 8–13 | 全覆盖（类型→测试→脚本→豁免→CI→PR模板） |
| R3: 风格指南+模板 | 14–21 | 全覆盖（指南→反模式→版本→清单→模板→校验→测试→CONTRIBUTING） |
| R4: Scripts as Black Box | 22–30 | 全覆盖（CLAUDE.md→纯函数→测试→审计→豁免→补help→脚本→CI→指南） |
| R5: Frontend-Check | 31–47 | 全覆盖（vendor→升级→gitignore→探测→测试→规则→扫描→agent→Tier B/C→解析→集成→登录态→dev server→hint→retention→E2E） |
| R6: Acceptance Eval | 48–65 | 全覆盖（类型→显式→隐式→统一→选择→分类→测试→API/UI/CLI/Mixed runner→分发→报告→skill→refs→ship集成→命令→retention） |

## Dependency Graph

```
Phase 1.1 (R1): 1 → 2 → 3, 2 → 4 → 5 → 6 → 7
Phase 1.2 (R2): 8 → 9, 8 → 10 → 11 → 12, 10 → 13
Phase 1.3 (R3): 14 → 15, 14 → 16, 14 → 17, 14 → 18, 19 → 20, 14 → 21
Phase 2.1 (R4): 22, 23 → 24, 23 → 25 → 26 → 27 → 28 → 29, 14+22 → 30
Phase 3.1 (R5): 31 → 32, 33, 34 → 35, 36, 34+36 → 37 → 38 → 39, 38 → 40, 37 → 41, 37+41 → 42, 43, 44, 38 → 45, 46, 42 → 47
Phase 4.1 (R6): 48 → 49, 48 → 50, 49+50 → 51 → 52, 48 → 53, 51+52+53 → 54, 48 → 55 → 56, 55 → 57, 55+56 → 58, 55-58 → 59 → 60, 60 → 61 → 62, 60 → 63 → 64, 65
```

## Milestones

- **M1 (Phase 1.1+1.2)**: 19 skill 规则全绿 + 骨架校验 CI 通行
- **M2 (Phase 1.3)**: 风格指南发布 + 模板可用
- **M3 (Phase 2.1)**: Scripts 纪律落地 + --help 全覆盖
- **M4 (Phase 3.1)**: Frontend-check Layer 4 可用
- **M5 (Phase 4.1)**: Acceptance eval MVP 作为可选 ship gate
