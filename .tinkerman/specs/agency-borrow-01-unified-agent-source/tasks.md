---
feature: agency-borrow-01-unified-agent-source
layout: tasks
created: 2026-06-23
spec_ref: ".tinkerman/specs/agency-borrow-01-unified-agent-source/requirements.md"
---

# Tasks

## Task 0: 三目录漂移回流迁移(前置)

- [ ] 0.1 diff 三目录,登记每个 agent 的字段差异清单(`.tinkerman/findings/agent-drift-inventory.md`)
- [ ] 0.2 仅在 `.claude/`+`.codex/` 的 11 个 `forge-*`/`business-analyst` → 以 `.claude/` 版为源复制到 `agents/`
- [ ] 0.3 仅在 `agents/` 的 3 个(`adversarial-check`/`frontend-check`/`validation-pass`)→ 保留,待 convert 补齐
- [ ] 0.4 共有 agent 的 description 统一(语义合并,语言策略待 R4)
- [ ] 0.5 在 `agents/README.md` 写明"唯一源"约定

**Verify-By**: bash — `comm -3 <(ls agents/*.md | xargs -n1 basename | sort) <(ls .claude/agents/*.md | xargs -n1 basename | sort)` 无输出(文件集一致)
**关联需求**: R1

## Task 1: 实现 convert-agents.mjs 生成器

- [ ] 1.1 搭建脚本骨架(参数解析 `--check`/`--tool`/`--verbose`,复用 lib 模式)
- [ ] 1.2 实现 YAML frontmatter 解析(用 Forge 已声明的 `yaml` 包)+ 正文提取
- [ ] 1.3 实现 `renderClaude(src)`:展平 frontmatter(合并 `claude:` 子对象到顶层)
- [ ] 1.4 实现 `renderCodex(src)`:TOML 输出 + `toml_escape_string`(移植自 agency-agents)
- [ ] 1.5 实现幂等保证:相同源 → 相同输出字节(确定性渲染)
- [ ] 1.6 处理工具不支持字段的静默跳过 + `--verbose` 报告

**Verify-By**: bash — `node scripts/convert-agents.mjs && git status --porcelain .claude/agents/ .codex/agents/` 输出空(幂等);再次运行仍空
**关联需求**: R2

## Task 2: 实现 check-agent-sync.mjs 门禁

- [ ] 2.1 薄包装 `convert-agents.mjs --check`,返回非零当检测到漂移
- [ ] 2.2 支持 `FORGE_SKIP_AGENT_SYNC=1` 与 `[agent-sync-skip]` 跳过(对齐 check-bundle-sync)
- [ ] 2.3 漂移时输出差异文件清单 + 修复命令提示
- [ ] 2.4 接入 `npm run check`(package.json scripts)
- [ ] 2.5 接入 `scripts/pre-push-ci-check.sh`

**Verify-By**: bash — 干净态 `node scripts/check-agent-sync.mjs; echo $?` 输出 0;人为改派生文件后输出 1
**关联需求**: R3

## Task 3: 源 frontmatter 命名空间改造

- [ ] 3.1 为每个源 agent 添加 `claude:` / `codex:` 子对象(承载工具特定字段)
- [ ] 3.2 将现有 `agent-frontmatter-hardening` 的字段(`disallowed-tools`/`effort`/`memory`/`initialPrompt`)迁入 `claude:` 子对象
- [ ] 3.3 验证 convert 后 `.claude/agents/` 的这些字段仍正确生成(回归 `agent-frontmatter-hardening` 的验收)

**Verify-By**: bash — `grep -c 'disallowed-tools\|effort\|memory' .claude/agents/spec-check.md .claude/agents/forge-decide-lead.md` 字段数不减少
**关联需求**: R2.3, R2.4

## Task 4: 厘清 init.sh 子集安装与 convert 全量同步的边界

> **背景**:`scripts/init.sh` L778-794 的语义是「从 Forge 仓库 `agents/` 复制 **7 个**精选 agent(product/architect/security/designer/spec-check/quality-check/security-check)到**用户项目**的 `.claude/agents/`」。这是**子集安装到外部项目**,与本 spec 的「仓库内三目录**全量**同步」是不同维度,职责不重叠,convert **不应**取代 init 的子集安装。

- [ ] 4.1 确认 init.sh 已从 `agents/`(唯一源)读取(现状 L789 已是 `${FORGE_ROOT}/agents/`),无需改动读取路径
- [ ] 4.2 确保 convert 生成器**只**作用于仓库内 `.claude/agents/` 与 `.codex/agents/`,不触及 init.sh 的目标(用户项目)
- [ ] 4.3 在 design/文档中明确两者边界:init.sh = 外部项目子集安装;convert = 仓库内派生同步
- [ ] 4.4 验证 `init.sh` 端到端行为不变(仍装 7 个 agent 到用户项目)

**Verify-By**: bash — 在沙箱项目跑 `scripts/init.sh --non-interactive --name testproj`,确认 `testproj/.claude/agents/` 含 7 个 agent 而非全量
**关联需求**: R2(边界澄清,非 R2 实现本身)

## Task 5: 回归验证

- [ ] 5.1 `npm run check` 通过(含新增 agent-sync 门禁)
- [ ] 5.2 `npm test` 全部通过
- [ ] 5.3 `/forge review` 走一遍,确认 review agent frontmatter(`disallowed-tools` 等)仍生效
- [ ] 5.4 手动验证:`agents/` 改一个 description → 运行 convert → `.claude/`+`.codex/` 同步更新

**Verify-By**: bash + manual
**关联需求**: 全部
