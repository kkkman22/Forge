---
feature: skills-cross-pollination
layout: tasks
created: 2026-05-05
spec_ref: ".tinkerman/specs/skills-cross-pollination/requirements.md"
---

# Implementation Plan: skills-cross-pollination

## Overview

分 4 个 phase 共 8 个需求落地。phase 内部按模块自底向上（类型 → 纯函数 → 集成 → 测试 → 文档）。每个顶级任务可独立发 PR，不产生大爆炸式合并。按价值从高到低实施（R1 > R2 > R3 > R4 > R5 > R6 > R7 > R8）。

## Tasks

- [x] 1. Phase 1.1 — Glossary Registry（需求 1 共享语言）
  - [x] 1.1 定义 Glossary 类型与文件格式（`src/glossary.ts`）
    - 定义 `GlossaryTerm` interface：term / definition / aliases / last_updated / source_session
    - 定义 `Glossary` interface：schema_version / updated / terms[]
    - 实现 `parseGlossary(content: string): Glossary` 纯函数，处理 frontmatter + 二级标题术语
    - 实现 `renderGlossary(glossary): string` 纯函数
    - Property test: `parseGlossary(renderGlossary(g))` 等价于 `g`
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 实现术语查询、冲突检测、合并（`src/glossary.ts`）
    - 实现 `findTerm(glossary, query)` 纯函数，支持 term 与 aliases 查找
    - 实现 `detectConflict(glossary, candidate)` 纯函数，检测同名不同义与同别名不同术语
    - 实现 `mergeTerm(glossary, term, strategy)` 纯函数，支持 append / replace / add_alias
    - 实现 `findStaleterms(glossary, now, maxAgeDays)` 纯函数，默认 maxAgeDays=30
    - Property test：detectConflict 对同名不同义必返回 hasConflict=true；mergeTerm 幂等
    - _Requirements: 1.7, 1.11_

  - [x] 1.3 实现术语提取（`src/glossary-extractor.ts`）
    - 定义 `TermCandidate` 与 `ExtractionRules` 接口
    - 实现 `extractCandidates(text, existingTerms)` 纯函数
    - 实现 `filterCandidates(candidates, rules)` 纯函数
    - 实现默认规则：minFrequency=2、minLength=3、排除变量名/私有函数名正则、maxCandidatesPerSession=10
    - Property test：对任意文本 extractCandidates 不抛错；过滤规则单调
    - _Requirements: 1.2, 1.6, 1.8, 1.9_

  - [x] 1.4 懒创建与初始预置
    - 实现 `ensureGlossaryExists(fs): Glossary` 驱动层函数：文件不存在时懒创建含初始术语的 glossary.md
    - 初始术语：Tier、Spec、Plan、Hint、Subagent、Frozen Zone、Guarded Zone、Open Zone、Restatement Checkpoint、Three-Strike、Closure-First Probe、Vertical Slice（共 12 个）
    - Integration test：空目录下首次调用产生含 12 个术语的 glossary.md
    - _Requirements: 1.3, 1.10_

  - [x] 1.5 集成到 forge-spec（glossary-miss 提示）
    - 修改 `src/spec.ts`：输出结尾调用 `extractCandidates(specText, glossaryTerms)`
    - 未定义术语打印 `[glossary-miss] 未定义术语：[term1, term2, ...]`
    - 修改 `skills/forge-spec/SKILL.md` 末尾步骤声明此行为
    - Integration test：含未定义术语的 spec 输出 glossary-miss 提示
    - _Requirements: 1.4_

  - [x] 1.6 集成到 forge-plan（任务命名使用规范术语）
    - 修改 `src/plan.ts`：任务描述生成阶段调用 `findTerm(glossary, keyword)` 替换同义词
    - 修改 `skills/forge-plan/SKILL.md` 声明使用 glossary 规范术语
    - Integration test：plan 中出现的术语与 glossary 定义一致
    - _Requirements: 1.5_

  - [x] 1.7 集成到 forge-learn（新术语回写）
    - 修改 `src/learn.ts`：新增 `extractSessionTermCandidates(sessionData, glossary)` 导出函数
    - 修改 `skills/forge-learn/SKILL.md` 执行流：新增"Glossary 回写"步骤
    - 用户确认后调用 `mergeTerm` 追加到 glossary.md
    - Integration test：含新术语的会话经 learn 后 glossary 被更新
    - _Requirements: 1.6_

  - [x] 1.8 集成到 forge-decide（冲突检测）
    - 修改 `src/decide.ts`：Round 1 视角输出前调用 `detectConflict` 检查用户新术语
    - 冲突时暂停并询问用户澄清
    - _Requirements: 1.7_

  - [x] 1.9 陈旧术语归档命令
    - 在 `forge-learn` 新增可选子步骤：调用 `findStaleterms` 并提示归档
    - 归档指定术语时将其移到 glossary 底部的 `## Archived` 段落
    - _Requirements: 1.11_

---

- [x] 2. Phase 1.2 — ADR 三问筛（需求 2）
  - [x] 2.1 定义类型与判定函数（`src/adr-criteria.ts`）
    - 定义 `DecisionCandidate`、`DecisionSignals`、`AdrCriteriaResult` 接口
    - 实现 `evaluateAdrCriteria(decision, signals)` 纯函数
    - 实现 `decideOutputTarget(result, upstreamFile)` 纯函数：返回 WRITE_ADR / INLINE_NOTE / DISCARD 路径
    - Property test：任一问题为 no → shouldBecomeAdr=false；verdict 与三布尔映射唯一
    - _Requirements: 2.1, 2.2, 2.8_

  - [x] 2.2 实现结果渲染
    - 实现 `renderCriteriaCheck(result)` 纯函数：输出 "ADR Criteria Check" 四行固定格式
    - Unit test：对已知输入返回精确字符串
    - _Requirements: 2.5_

  - [x] 2.3 集成到 forge-decide
    - 修改 `src/decide.ts`：新增 `runCriteriaScreen(decisions, signals)` 导出函数
    - 在 Round 2 Critic 返回前调用三问筛
    - 修改 `skills/forge-decide/SKILL.md` 决策文档格式：新增 `## ADR Criteria Check` 段落
    - Integration test：高可逆低奇异的决策 → INLINE_NOTE；三问全 yes → 生成 ADR
    - _Requirements: 2.1, 2.3, 2.4, 2.10_

  - [x] 2.4 行内注释落点实现
    - verdict === "INLINE_NOTE" 时，将 `<!-- decision: ... | reason: ... -->` 追加到触发 decide 的上游文件
    - 上游文件识别：优先读 `.tinkerman/status.md` 的 `current_task` 关联的 spec/plan/progress
    - Integration test：inline note 被正确写入上游文件
    - _Requirements: 2.9_

  - [x] 2.5 用户覆盖机制
    - 在 decide 的 prompt 处理中识别 `--force-adr` / `--no-adr` 关键词
    - 覆盖 `evaluateAdrCriteria` 的 verdict 字段
    - Unit test：覆盖逻辑在两种方向上正确
    - _Requirements: 2.6_

  - [x] 2.6 ADR frontmatter 字段扩展
    - verdict === "WRITE_ADR" 时，生成的 ADR frontmatter 包含：reversibility、surprising、trade_off_alternatives
    - 保证与 `engineering-governance-hardening` spec 的 ADR frontmatter 结构兼容（扩展字段，非冲突字段）
    - _Requirements: 2.3, 2.7_

---

- [x] 3. Phase 1.3 — Skill Description 重写（需求 3）
  - [x] 3.1 实现 description 校验（`src/skill-description.ts`）
    - 定义 `SkillDescriptionCheck` 接口
    - 实现 `parseSkillFrontmatter(content)` 纯函数
    - 实现 `validateDescription(filePath, content)` 纯函数
    - 定义 FORBIDDEN_PATTERNS（营销语言、版本号、日期）与 USE_WHEN_PATTERN 正则
    - Property test：含 "Use when" 且 ≤1024 字符且无 forbidden → valid=true
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.2 实现批量验证入口
    - 实现 `validateAllSkills(skillsDir): SkillDescriptionCheck[]` 函数
    - 扫描 `skills/forge-*/SKILL.md`，逐一校验
    - Unit test：对 fixture 目录返回正确结果
    - _Requirements: 3.6_

  - [x] 3.3 创建验证脚本
    - 创建 `scripts/validate-skill-descriptions.sh`：调用 node 执行 `validateAllSkills`
    - 任何 skill 违规则退出码非零
    - 将脚本加入 `npm run check` 的执行序列
    - _Requirements: 3.6, 3.7_

  - [x] 3.4 重写 17 个 skill 的 description（第一批：流水线核心）
    - forge-router、forge-decide、forge-spec、forge-plan、forge-build、forge-review、forge-test、forge-ship、forge-learn
    - 每个改为 "<what>. Use when <trigger signals>."
    - 触发信号对齐 router 的 tier / task_type / project_phase 维度
    - 运行验证脚本确认全部通过
    - _Requirements: 3.8, 3.9, 3.10_

  - [x] 3.5 重写 skill description（第二批：辅助）
    - forge-status、forge-resume、forge-debug、forge-abort、forge-fix、forge-refactor、forge-loop、forge-build-light
    - 同 3.4 规范
    - 运行验证脚本确认全部通过
    - _Requirements: 3.8, 3.9, 3.10_

---

- [x] 4. Phase 2.1 — Grill Skill（需求 4）
  - [x] 4.1 定义核心类型与决策树生成（`src/grill.ts`）
    - 定义 `DecisionTreeNode` 与 `DecisionTree` 接口
    - 实现 `generateDecisionTree(description, glossary): DecisionTree` 纯函数
    - 决策树至少覆盖五类：functionality、boundary、dependency、assumption、non_goal
    - Property test：任意非空描述返回非空树
    - _Requirements: 4.4_

  - [x] 4.2 实现问题选择、答案应用、终止判定
    - 实现 `selectNextQuestion(tree)` 纯函数：优先选 pending 且父节点 resolved 的节点
    - 实现 `applyAnswer(tree, nodeId, answer)` 纯函数
    - 实现 `isComplete(tree)` 纯函数
    - Property test：applyAnswer 不引入新 pending；同序列 replay 产出同终态
    - _Requirements: 4.4, 4.6, 4.8_

  - [x] 4.3 实现 glossary 候选提取与 findings 渲染
    - 实现 `extractNewGlossaryCandidates(tree, glossary)` 纯函数（复用 1.3 的逻辑）
    - 实现 `renderGrillFindings(tree, summary)` 纯函数：生成 findings/grill-<topic>.md 完整内容
    - Unit test：输出含决策树、Q&A 对、对齐摘要、候选术语四段
    - _Requirements: 4.5, 4.7_

  - [x] 4.4 创建 forge-grill skill 文件
    - 创建 `skills/forge-grill/SKILL.md`（≤150 行），含 frontmatter description 遵循 R3 规范
    - 创建 `skills/forge-grill/references/decision-tree-format.md`
    - 创建 `skills/forge-grill/references/question-strategies.md`
    - 创建 `skills/forge-grill/references/examples.md`
    - description 示例："Socratic grilling loop driving one-question-at-a-time decision tree resolution. Use when user starts full-tier task / says 'grill me' / replies 'dig deeper' during decide phase / before locking an ambiguous spec."
    - _Requirements: 4.1, 4.2, 4.11_

  - [x] 4.5 集成触发入口
    - `skills/forge-router/SKILL.md`：全量档位新增可选前置步骤 grill（用户可跳过）
    - 识别用户 `/forge grill`、`grill me`、`再挖深点` 触发关键词
    - Integration test：全量档位路由输出含 grill 建议
    - _Requirements: 4.3_

  - [x] 4.6 与 glossary 的冲突检测集成
    - 每轮问答后调用 `detectConflict`，冲突时暂停 grill 并按 R1.7 规则处理
    - Integration test：grill 中引入与 glossary 冲突的术语触发澄清
    - _Requirements: 4.7_

  - [x] 4.7 Resume 支持
    - 修改 `src/resume.ts`：识别 `phase === "grill_abandoned"` 的 status.md
    - 读取 findings/grill-<topic>.md 还原决策树
    - 识别 pending 节点继续 grill 会话
    - Integration test：中途关闭会话后 resume 恢复 grill
    - _Requirements: 4.10_

  - [x] 4.8 Property test 集
    - 决策树的所有叶节点最终状态为 resolved
    - 同一问答序列 replay 产出同一 alignment_summary
    - generateDecisionTree 不抛错对任意输入
    - _Requirements: 4.8_

---

- [x] 5. Phase 2.2 — Progressive Disclosure（需求 5）
  - [x] 5.1 实现行数校验（`src/skill-length.ts`）
    - 定义 `SkillLengthCheck` 接口
    - 实现 `countEffectiveLines(content)` 纯函数：排除空行
    - 实现 `checkSkillLength(filePath, content, limit=150)` 纯函数
    - 实现 `validateAllSkillLengths(skillsDir)` 函数
    - `skills/shared/*.md` 加入豁免清单
    - Unit test：对已知输入返回预期行数
    - _Requirements: 5.1, 5.5, 5.8_

  - [x] 5.2 创建验证脚本
    - 创建 `scripts/validate-skill-length.sh`：调用 node 执行 `validateAllSkillLengths`
    - 加入 `npm run check` 执行序列
    - _Requirements: 5.8, 5.9_

  - [x] 5.3 批次 1 迁移（最严重）
    - 迁移 `forge-learn`（388 → ≤150）：知识库分层、错误预防规则蒸馏、维护阈值等移到 references/
    - 迁移 `forge-build`（260 → ≤150）：TDD 细节、Closure-First 探针格式等移到 references/
    - 每个 skill 迁移后运行 canary 集成测试确保行为一致
    - _Requirements: 5.2, 5.3, 5.4, 5.6, 5.7, 5.10, 5.11_

  - [x] 5.4 批次 2 迁移（中等）
    - 迁移 `forge-spec`（253 → ≤150）：spec 锁定规则、棕地验证详情移到 references/
    - 迁移 `forge-ship`（246 → ≤150）：四选项交付详情移到 references/
    - 迁移 `forge-decide`（245 → ≤150）：四视角格式详情移到 references/
    - 每个 skill 迁移后运行 canary 集成测试
    - _Requirements: 5.2, 5.3, 5.4, 5.6, 5.7, 5.10, 5.11_

  - [x] 5.5 批次 3 迁移（轻度）
    - 迁移 `forge-loop`（220 → ≤150）、`forge-resume`（168 → ≤150）、`forge-router`（167 → ≤150）、`forge-refactor`（158 → ≤150）
    - 每个 skill 迁移后运行 canary 集成测试
    - _Requirements: 5.2, 5.3, 5.4, 5.6, 5.7, 5.10, 5.11_

---

- [x] 6. Phase 3.1 — Zoom-out（需求 6）
  - [x] 6.1 实现 zoom-out 核心（`src/zoom-out.ts`）
    - 定义 `ZoomOutInput` 与 `ZoomOutOutput` 接口
    - 实现 `buildZoomOutPrompt(input): string` 纯函数
    - 实现 `renderZoomOut(output): string` 纯函数：三段式 Markdown
    - 实现 `validateZoomOutOutput(output)` 纯函数：每段 ≤5 行校验
    - Property test：renderZoomOut 确定性；validateZoomOutOutput 超行返回违规
    - _Requirements: 6.3, 6.4_

  - [x] 6.2 创建 forge-zoom-out skill
    - 创建 `skills/forge-zoom-out/SKILL.md`（≤100 行）
    - description 遵循 R3 规范：例如 "High-level architecture overview of the current code/decision in three sections. Use when user says 'zoom out' / '讲整体' / gets lost in details during any skill execution."
    - 工作流：暂停当前 skill → explore agent → 三段式输出 → 等待 continue
    - _Requirements: 6.1, 6.7, 6.9_

  - [x] 6.3 实现暂停与恢复
    - status.md 写 `phase: "zoom_out_paused"` 并记录原 phase
    - 用户回复 "continue" 后恢复原 phase
    - 30 秒无响应默认恢复
    - Integration test：zoom-out 触发后状态流转正确
    - _Requirements: 6.8_

  - [x] 6.4 确保不产生文件副作用
    - zoom-out 仅输出对话，不写 `.tinkerman/` 任何文件
    - Integration test：触发前后 `.tinkerman/` 内容不变
    - _Requirements: 6.5, 6.6_

  - [x] 6.5 与 three-strike 协同
    - 记录 zoom-out 与 forge-debug 的边界说明到 zoom-out/SKILL.md
    - 不修改 three-strike 机制
    - _Requirements: 6.10_

---

- [x] 7. Phase 4.1 — Episode & Confidence Lifecycle（需求 7）
  - [x] 7.1 定义 Episode 数据模型（`src/episode.ts`）
    - 定义 `Episode` interface 含 schema_version / id / date / skill / tier / situation / root_cause / solution / lesson / outcome / user_rating / related_pattern / related_skills / body
    - 实现 `parseEpisode(content): Episode | null` 纯函数
    - 实现 `renderEpisode(episode): string` 纯函数
    - 实现 `generateEpisodeId(date, sequenceInDay): string` 幂等纯函数
    - 旧格式（缺 schema_version）视为 v1，不需要回溯填充
    - Property test：parseEpisode(renderEpisode(e)) 等价于 e
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.12_

  - [x] 7.2 定义 Pattern Confidence 模型（`src/pattern-stats.ts`）
    - 定义 `Pattern` interface 含 pattern_id / confidence / applications / successes / failures / last_triggered / decay_threshold / tags / body
    - 实现 `parseInstinct(content): Pattern[]` 纯函数（兼容旧格式）
    - 实现 `renderInstincts(patterns): string` 纯函数
    - Property test：parseInstinct(renderInstincts(patterns)) 等价于 patterns
    - _Requirements: 7.5, 7.13, 7.14_

  - [x] 7.3 实现 Confidence 更新与衰减检测
    - 实现 `updatePatternStats(pattern, outcome, now): Pattern` 纯函数，使用 Beta 分布均值公式（α=β=2）
    - 实现 `findStaleOrDecayedPatterns(patterns, now, maxAgeDays=60): Pattern[]` 纯函数
    - 实现 `findUpgradableEpisodes(episodes, patterns, now, windowDays=60, min=3)` 纯函数
    - Property test：updatePatternStats 任意序列 confidence ∈ [0, 1]；successes ≤ applications
    - Property test：findStaleOrDecayedPatterns 输出是输入子集
    - _Requirements: 7.6, 7.7, 7.8, 7.11, 7.13_

  - [x] 7.4 集成到 forge-learn（自动生成 episode）
    - 修改 `src/learn.ts`：新增 `buildEpisodeFromSession(status, phaseHistory)` 导出函数
    - outcome 从 review/test/ship 结果判断，skill 从 status.md phase 历史取
    - 写入 `.tinkerman/knowledge/sessions/<date>-<topic>.md`（Guarded zone 追加）
    - 修改 `skills/forge-learn/SKILL.md`：收尾步骤新增"自动生成 episode"子步骤
    - Integration test：含成功任务的 learn 产出 schema_version=2 的 episode
    - _Requirements: 7.9_

  - [x] 7.5 集成到 forge-learn（陈旧 pattern 归档）
    - 修改 `src/learn.ts`：收尾阶段调用 `findStaleOrDecayedPatterns(patterns, now)` 产出待归档清单
    - 用户确认后将 pattern 移到 `knowledge/instincts.md` 底部 `## Archived` 段落
    - 不删除条目，只移动
    - Integration test：陈旧 pattern 正确归档，新文件行数不变
    - _Requirements: 7.10, 7.14_

  - [x] 7.6 集成到 forge-learn（episode 升级为 instinct）
    - 修改 `src/learn.ts`：调用 `findUpgradableEpisodes(episodes, patterns, now)` 检测同类高频 episode
    - 生成 instinct pattern 草稿，提示用户确认
    - 用户确认后走追加流程写入 `knowledge/instincts.md`
    - Integration test：3 条同类 episode 触发升级建议
    - _Requirements: 7.11_

  - [x] 7.7 user_rating 可选化
    - 修改 learn 提示流：outcome=success/partial 不强制要 rating
    - outcome=failure 时追问简短失败原因（不强制 1-10 数字）
    - _Requirements: 7.15_

---

- [x] 8. Phase 4.2 — Evolution 标记 & 失败自动沉淀（需求 8）
  - [x] 8.1 实现 Evolution 标记解析（`src/evolution-marker.ts`）
    - 定义 `EvolutionMarker` interface 含 date / source / target / description / filePath / lineNumber
    - 实现 `parseEvolutionMarkers(content): EvolutionMarker[]` 纯函数
    - 支持 HTML 注释格式 `<!-- Evolution: ... | source: ... | target: ... -->` + 后续描述文本
    - Property test：parseEvolutionMarkers 对任意文本不抛错
    - _Requirements: 8.1, 8.3_

  - [x] 8.2 实现 target 校验与聚合
    - 实现 `validateEvolutionTarget(target, skillsRegistry): ValidationResult` 纯函数
    - 实现 `aggregateEvolutionMarkers(markersByFile, skillsRegistry): EvolutionReport` 纯函数
    - 按 target skill 分组，统计 markerCount / sources / suggestAdr（≥3 条指向同一 skill#section）
    - orphan 列表收集 target 不存在的标记
    - Property test：aggregateEvolutionMarkers 空输入返回空报告；确定性
    - Property test：validateEvolutionTarget 对不存在 skill 返回 orphan=true
    - _Requirements: 8.4, 8.8, 8.13, 8.14_

  - [x] 8.3 实现失败自动沉淀（`src/failure-sink.ts`）
    - 定义 `FailureContext` interface 含 skill / topic / tier / trigger / situation / rootCause
    - 实现 `buildFailureEpisode(ctx, now, seq): Episode` 纯函数
    - 实现 `buildFailureEvolutionMarker(ctx, episodeId, now): string` 纯函数
    - Unit test：failure context 构建的 episode outcome=failure，含 trigger 信息
    - _Requirements: 8.6, 8.7_

  - [x] 8.4 集成到 forge-review
    - 修改 `src/review.ts` + `skills/forge-review/SKILL.md`：review 完成时检查两类条件
      - 新问题模式（与 knowledge/solutions/*.md 不同）→ 末尾追加 Evolution 标记
      - 与 knowledge/known-failures.md 已有失败同类 → updatePatternStats(pattern, "success")
    - 写入失败降级为 console.warn
    - Integration test：新模式触发 Evolution 标记追加
    - _Requirements: 8.5, 8.12_

  - [x] 8.5 集成到 forge-build（three-strike 触发）
    - 修改 `src/build.ts` + `skills/forge-build/SKILL.md`：同任务连续 3 次 TDD 失败时
      - 调用 `buildFailureEpisode(ctx, now, seq)` 写入 sessions/
      - 调用 `buildFailureEvolutionMarker` 在 progress 文件末尾追加标记 target=forge-build
    - 不阻断现有 three-strike 重路由流程
    - Integration test：3 次失败后 episode + marker 齐全
    - _Requirements: 8.6, 8.12_

  - [x] 8.6 集成到 forge-ship（gate 拦截触发）
    - 修改 `src/ship.ts` + `skills/forge-ship/SKILL.md`：gate 拦截时
      - outcome 根据拦截原因决定（uncommitted → partial；checklist 失败 → failure）
      - 写入 sessions/ + progress/ Evolution 标记
    - 写入失败降级为警告
    - Integration test：ship gate 拦截后 episode 正确生成
    - _Requirements: 8.7, 8.12_

  - [x] 8.7 集成到 forge-learn（生成 evolution-report）
    - 修改 `src/learn.ts`：新增 `generateEvolutionReport(skillsRegistry): EvolutionReport` 导出函数
    - 扫描 `.tinkerman/reviews/**`、`.tinkerman/progress/**`、`.tinkerman/findings/**`（忽略 `.tinkerman/archive/`）
    - 输出 `.tinkerman/knowledge/evolution-report.md`（开放区，每次覆盖）
    - report 头部突出显示 suggest_adr 的高频 target
    - 修改 `skills/forge-learn/SKILL.md`：新增"Evolution 聚合"子步骤
    - Integration test：多个 Evolution 标记 → report 含 suggest_adr 标注
    - _Requirements: 8.9, 8.11_

  - [x] 8.8 标记位置校验
    - 编写 `scripts/check-evolution-marker-zones.sh`：扫描冻结区文件中是否错误出现 Evolution 标记
    - 如在 `skills/**/SKILL.md` 或 `.tinkerman/config.md` 或 locked spec 中发现标记 → 报错并退出
    - 加入 `npm run check` 执行序列
    - _Requirements: 8.2, 8.10_

  - [x] 8.9 orphan 快照处理
    - `generateEvolutionReport` 不保留历史快照，只反映当前文件状态
    - 用户通过 `/forge learn --maintain` 清理后，下次 report 自动剔除
    - Integration test：删除标记所在文件后 report 不再出现该条
    - _Requirements: 8.14, 8.15_

---

## Dependency Graph

```
                       Phase 1.1 (Glossary)
                             │
                  ┌──────────┼──────────┐
                  v          v          v
          Phase 1.2       1.3        Phase 2.1 (Grill)
          (ADR 三问筛)  (description)
                  │                     │
                  │                     │
Phase 2.2 (Progressive) ──independent─┐ │
Phase 3.1 (Zoom-out)     ──independent┤ │
                                      │ │
Phase 4.1 (Episode)  ──independent────┤ │
                             │        │ │
                             v        │ │
                       Phase 4.2 (Evolution) <── 依赖 4.1 数据结构
```

- Phase 1.1 是所有跨 skill 集成的基础
- Phase 1.2 / 1.3 独立于 1.1，可并行
- Phase 2.1（Grill）依赖 1.1 的 glossary
- Phase 2.2 / 3.1 独立，无依赖
- Phase 4.1（Episode）独立于所有前置 phase
- Phase 4.2（Evolution 标记）依赖 4.1 的 episode 数据结构
- Phase 4.2 的 suggest_adr 功能对接 Phase 1.2（ADR 三问筛）但可独立合并

## Success Criteria

- [x] 8 个需求的验收标准全部通过
- [x] 不新增任何运行时依赖
- [x] 现有测试套件全部通过
- [x] 新增至少 100 个测试（含 property-based）
- [x] `npm run check` 新增三条验证（description / skill length / evolution marker zones）后通过时间 < 30 秒
- [x] 所有 17 个 skill 的 description 符合 "Use when" 规范
- [x] 所有 skill 主文件 ≤ 150 行（shared/ 豁免）— 8 个 SKILL 已压缩至 ≤150 行（forge-build 141, forge-loop 139, forge-decide 138, forge-spec 146, forge-learn 128, forge-resume 110, forge-review 146, forge-refactor 144）
- [x] `.tinkerman/glossary.md` 初始预置 12 个核心术语
- [x] `/forge grill`、`/forge zoom-out` 两个新入口可用
- [x] `/forge decide` 生成的每个决策附带 ADR Criteria Check 结果
- [x] `/forge learn` 自动生成结构化 episode 并产出 evolution-report.md
- [x] `forge-build` three-strike / `forge-review` 新模式 / `forge-ship` gate 拦截均自动写入 failure/partial episode
- [x] `knowledge/instincts.md` 的 pattern 含 Confidence 生命周期字段，陈旧项被自动识别
