---
feature: agency-borrow-02-catalog-governance
layout: tasks
created: 2026-06-23
spec_ref: ".forge/specs/agency-borrow-02-catalog-governance/requirements.md"
---

# Tasks

## Task 1: 移植 check-agent-originality.mjs

- [ ] 1.1 实现 8-gram shingle + Jaccard 相似度核心(Node Set)
- [ ] 1.2 实现实体中性化(agent name 集合 + 工具名集合 → `__ENT__`)
- [ ] 1.3 实现阈值逻辑(WARN 20% / FAIL 40%,env 可覆盖)
- [ ] 1.4 实现双模式:指定文件(CI)/ 空=全库审计
- [ ] 1.5 输出格式:每个候选 → 最高相似 agent + 相似度 + OK/WARN/FAIL 标记

**Verify-By**: bash — 构造一个与 `quality-check.md` 内容 90% 相同的测试 agent,运行脚本退出 1 并报告相似度 ≥40%
**关联需求**: R1

## Task 2: 移植 lint-agents.mjs

- [ ] 2.1 实现 frontmatter 解析(复用 spec #1 的解析逻辑)
- [ ] 2.2 ERROR 校验:`name`/`description` 存在、CRLF 检测
- [ ] 2.3 WARN 校验:`Identity`/`Mission`/`Critical Rules` section、正文 ≥50 词
- [ ] 2.4 `--strict` 选项:WARN 也退出 1
- [ ] 2.5 输出格式对齐 agency-agents(`ERROR/WARN <file>: <reason>`)

**Verify-By**: bash — 删除某 agent 的 `description` 字段后运行,退出 1 报 ERROR;正文删到 <50 词,退出 0 报 WARN
**关联需求**: R2

## Task 3: 门禁链接入

- [ ] 3.1 在 `package.json` 的 `check` script 串入 lint → originality → sync(短路)
- [ ] 3.2 originality 步骤用 `git diff --name-only` 限定改动文件(CI 模式)
- [ ] 3.3 接入 `scripts/pre-push-ci-check.sh`
- [ ] 3.4 文档:`docs/` 或 AGENTS.md 补充门禁链说明

**Verify-By**: bash — `npm run check` 干净态退出 0;人为制造 lint 错误后退出 1 且不跑后续
**关联需求**: R4

## Task 4: 基线审计

- [ ] 4.1 对现有全部 agent(以 `agents/` 目录实际文件为准,spec#1 快照约 25 个)跑全库 originality 审计,记录最高相似对
- [ ] 4.2 若发现现有 agent 对相似度 ≥ WARN,登记到 `.forge/findings/` 评估是否需重构
- [ ] 4.3 全库 lint 审计,修复所有 ERROR

**Verify-By**: bash — `node scripts/check-agent-originality.mjs` 全库模式退出 0(或仅 WARN 不阻断);`node scripts/lint-agents.mjs` 全库退出 0
**关联需求**: R1, R2

## Task 5: 回归验证

- [ ] 5.1 `npm run check` 通过
- [ ] 5.2 `npm test` 全部通过
- [ ] 5.3 新增脚本的单元测试(若 Forge 有 vitest 覆盖 scripts)

**Verify-By**: bash
**关联需求**: 全部
