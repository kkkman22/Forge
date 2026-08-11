---
topic: "sprint-3-gap-remediation"
status: "approved"
date: "2026-05-10"
spec_ref: ".kiro/specs/sprint-3-gap-remediation"
format: "lightweight"
---

## Objective

补齐 2026-05-10 三 Sprint 审计暴露的 6 处缺口：business-analyst agent 文件未合并、glossary parser 不兼容 PMS Pack 聚合格式、loadOwnershipMap 为 stub、缺少 e2e dispatch 测试、Bonvoy 场景不足、lint rule 形态文档未对齐。目标：所有缺口修复、集成测试通过、npm run check 全绿。

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#31-srccglossaryregistryts` | Glossary parser 兼容聚合 YAML 格式 |
| `design.md#32-srccontext-boundaryts` | loadOwnershipMap 实装 + JSDoc @context 支持 |
| `design.md#33-claudeagentsbusiness-analystmd` | agent 文件从 worktree 合并到主分支 |
| `design.md#34-测试设计` | 三组集成测试设计 |
| `design.md#35-packspsms-marriott-samplescenariosbonvoy` | 3 个新 Bonvoy 场景 |
| `design.md#36-requirements-amendmentr7` | R7/R8 lint rule 形态澄清 amendment |
| `design.md#37-审计证据归档r8` | 审计报告 + 决策文档 |

## File Mapping

| File Path | Operation | Description |
|---------|------|------|
| `.claude/agents/business-analyst.md` | CREATE | 从 worktree 拷贝 agent 定义文件 |
| `src/glossary/registry.ts` | MODIFY | parseGlossaryFile 增加聚合格式检测 |
| `src/context-boundary.ts` | MODIFY | loadOwnershipMap 实装 + resolveFileContext JSDoc 扫描 |
| `test/glossary/format-compat.test.ts` | CREATE | 两种格式兼容性单元测试 |
| `test/glossary/pms-pack-integration.test.ts` | CREATE | PMS Pack 集成测试（≥80 entries） |
| `test/glossary/format-detection.property.test.ts` | CREATE | 格式检测 property test |
| `test/context-boundary/ownership-real.test.ts` | CREATE | ownership map 集成测试 |
| `test/context-boundary/boundary-props.test.ts` | CREATE | boundary 优先级 property test |
| `test/spec/business-analyst-dispatch.test.ts` | CREATE | dispatch e2e mock 测试 |
| `packs/pms-marriott-sample/scenarios/bonvoy/points-forfeit-on-no-show.feature` | CREATE | Bonvoy 场景 |
| `packs/pms-marriott-sample/scenarios/bonvoy/welcome-amenity-by-tier.feature` | CREATE | Bonvoy 场景 |
| `packs/pms-marriott-sample/scenarios/bonvoy/points-plus-cash-redemption.feature` | CREATE | Bonvoy 场景 |
| `packs/pms-marriott-sample/README.md` | MODIFY | 更新场景清单 |
| `packs/pms/lint-rules/README.md` | CREATE | lint rule 形态说明 |
| `.kiro/specs/ddd-tactical-bdd-collaboration/requirements.md` | MODIFY | 追加 Amendment 2026-05-10 |
| `.tinkerman/findings/sprint-audit-2026-05-10.md` | CREATE | 审计报告 |
| `.tinkerman/decisions/2026-05-10-sprint-audit-remediation.md` | CREATE | 决策转录文档 |

## Task Breakdown

### Task 1: 合并 business-analyst.md 到主分支
- **Goal**: agent 定义文件存在于主分支，/forge spec 能 dispatch business-analyst subagent
- **File**: `.claude/agents/business-analyst.md`
- **Design Reference**: `design.md#33-claudeagentsbusiness-analystmd` — 从 worktree 拷贝已 review 的 agent 文件
- **Depends On**: (none)
- **Verify**: `test -f .claude/agents/business-analyst.md && bash scripts/check-iron-laws.sh`
- **Commit**: `feat(sprint-3-gap): merge business-analyst agent definition to main branch`

### Task 2: Glossary parser 兼容聚合 YAML 格式
- **Goal**: parseGlossaryFile 同时支持 per-term frontmatter 格式和聚合 terms 数组格式
- **File**: `src/glossary/registry.ts`
- **Design Reference**: `design.md#31-srccglossaryregistryts` — 两阶段格式检测 + 两条解析路径
- **Property**: Format A (aggregated) / Format B (per-term) 互不干扰
- **Depends On**: (none)
- **Verify**: `npx vitest run test/glossary/format-compat.test.ts`
- **Commit**: `feat(glossary): support aggregated YAML format alongside per-term format`

### Task 3: Glossary 格式检测 property test
- **Goal**: 属性测试验证格式检测函数对所有合法 frontmatter 输入返回正确格式标识
- **File**: `test/glossary/format-detection.property.test.ts`
- **Design Reference**: `design.md#31-srccglossaryregistryts` — formatDetection 纯函数
- **Depends On**: Task 2
- **Verify**: `npx vitest run test/glossary/format-detection.property.test.ts`
- **Commit**: `test(glossary): add property tests for format detection`

### Task 4: Glossary PMS Pack 集成测试
- **Goal**: 启用 PMS Pack 后 loadGlossary 返回 ≥80 entries，Room 在 3+ context 中定义
- **File**: `test/glossary/pms-pack-integration.test.ts`
- **Design Reference**: `design.md#341-testglossarypms-pack-integrationtestts` — 真实 Pack 数据断言
- **Depends On**: Task 2
- **Verify**: `npx vitest run test/glossary/pms-pack-integration.test.ts`
- **Commit**: `test(glossary): add PMS Pack integration test for real data loading`

### Task 5: 实装 loadOwnershipMap
- **Goal**: loadOwnershipMap 从 .tinkerman/context-ownership.yaml 和 pack contexts 加载 mappings，非空输入不再返回 {}
- **File**: `src/context-boundary.ts`
- **Design Reference**: `design.md#32-srccontext-boundaryts` — 两源合并 + JSDoc @context 扫描
- **Property**: Source A > Source B > default; Zero-Pack → {}
- **Depends On**: (none)
- **Verify**: `npx vitest run test/context-boundary/ownership-real.test.ts`
- **Commit**: `feat(context-boundary): implement loadOwnershipMap with YAML + JSDoc support`

### Task 6: Context boundary 优先级 property test
- **Goal**: 属性测试验证 JSDoc > Source A > Source B 优先级单调性
- **File**: `test/context-boundary/boundary-props.test.ts`
- **Design Reference**: `design.md#32-srccontext-boundaryts` — 优先级规则
- **Depends On**: Task 5
- **Verify**: `npx vitest run test/context-boundary/boundary-props.test.ts`
- **Commit**: `test(context-boundary): add property tests for priority ordering`

### Task 7: business-analyst dispatch e2e 测试
- **Goal**: mock dispatch 路径验证 Core 子域 → 3 agents、非 Core → 2 agents、Zero-Pack → 2 agents
- **File**: `test/spec/business-analyst-dispatch.test.ts`
- **Design Reference**: `design.md#343-testspecbusiness-analyst-dispatchtestts` — mock subagent dispatch
- **Depends On**: Task 1
- **Verify**: `npx vitest run test/spec/business-analyst-dispatch.test.ts`
- **Commit**: `test(spec): add business-analyst dispatch e2e test`

### Task 8: 补齐 Bonvoy 场景
- **Goal**: bonvoy/ 目录从 2 个场景扩展到 5 个，全部通过 Linter + Leak Detector
- **Files**: `packs/pms-marriott-sample/scenarios/bonvoy/*.feature`, `packs/pms-marriott-sample/README.md`
- **Design Reference**: `design.md#35-packspsms-marriott-samplescenariosbonvoy` — 3 个新场景
- **Depends On**: (none)
- **Verify**: `npm run check`
- **Commit**: `feat(pms-sample): add 3 Bonvoy loyalty scenarios`

### Task 9: Lint rule 形态声明 (R7 amendment)
- **Goal**: requirements.md 追加 Amendment 段，新建 lint-rules README
- **Files**: `.kiro/specs/ddd-tactical-bdd-collaboration/requirements.md`, `packs/pms/lint-rules/README.md`
- **Design Reference**: `design.md#36-requirements-amendmentr7` — amendment 格式与内容
- **Depends On**: (none)
- **Verify**: `grep -c "Amendment 2026-05-10" .kiro/specs/ddd-tactical-bdd-collaboration/requirements.md`
- **Commit**: `docs(lint-rules): add shipped form README and requirements amendment`

### Task 10: 审计证据归档
- **Goal**: 创建审计报告 + 决策转录文档
- **Files**: `.tinkerman/findings/sprint-audit-2026-05-10.md`, `.tinkerman/decisions/2026-05-10-sprint-audit-remediation.md`
- **Design Reference**: `design.md#37-审计证据归档r8` — 报告结构 + 决策文档内容
- **Depends On**: (none)
- **Verify**: `test -f .tinkerman/findings/sprint-audit-2026-05-10.md && test -f .tinkerman/decisions/2026-05-10-sprint-audit-remediation.md`
- **Commit**: `docs(audit): add sprint audit report and remediation decisions`

### Task 11: 全量回归验证
- **Goal**: npm run check 全绿，zero-pack 测试无回退
- **Files**: (none — verification only)
- **Depends On**: Task 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
- **Verify**: `npm run check`
- **Commit**: (no separate commit)

### Task 12: CHANGELOG + 提交规范
- **Goal**: CHANGELOG.md 追加 Sprint 3 Gap Remediation 章节
- **Files**: `CHANGELOG.md`
- **Depends On**: Task 11
- **Verify**: `grep -c "Sprint 3 Gap Remediation" CHANGELOG.md`
- **Commit**: `docs: add Sprint 3 Gap Remediation changelog entry`

## Spec Coverage

| Spec Requirement | Covering Tasks |
|-----------|---------|
| R1: 合并 business-analyst agent | Task 1 |
| R2: Glossary parser 兼容两种格式 | Task 2, 3, 4 |
| R3: 实装 loadOwnershipMap | Task 5, 6 |
| R4: Evolved Rules R6/R7/R8 | (✅ 已完成 Wave 0) |
| R5: business-analyst dispatch e2e | Task 7 |
| R6: 补齐 Bonvoy 场景 | Task 8 |
| R7: Lint rule 最终形态声明 | Task 9 |
| R8: 审计证据归档 | Task 10 |
| R9: 非功能需求 | Task 11, 12 |

## Execution Waves

```
Wave 0 (done): R4 Evolved Rules
Wave 1 (parallel, ~1.5h): Task 1 + Task 9 + Task 10  (pure docs)
Wave 2 (parallel, ~5h): Task 2 + Task 5              (code fixes)
Wave 3 (parallel, ~2h): Task 3,4 + Task 6 + Task 7 + Task 8 (tests + data)
Wave 4 (~0.5h): Task 11 + Task 12                     (regression + changelog)
```
