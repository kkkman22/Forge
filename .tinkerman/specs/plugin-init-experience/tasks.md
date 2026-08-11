---
feature: plugin-init-experience
layout: tasks
created: 2026-05-18
spec_ref: ".tinkerman/specs/plugin-init-experience/requirements.md"
---

# Implementation Plan: Plugin Init Experience

## Overview

实现"方案 A + 方案 C"组合：让 plugin 用户通过 `/forge init` 子命令完成初始化，并在 SessionStart 时输出非阻断引导。三层改动：Command 路由、init.sh 路径检测、SessionStart bootstrap 提示。附加 SKILL 文案统一、文档同步、知识库沉淀。

**路由档位**：Standard（多文件改动 + 新模块 + 文档更新 + 已有 Spec）。

**TDD 顺序**：先写纯函数 + 测试（Task 1、2 RED → GREEN），再做 Command 路由（Task 3）与 SKILL 文案（Task 4），随后接入 plugin 钩子（Task 5）与 init.sh 检测（Task 6），最后文档同步（Task 7）与知识沉淀（Task 8）。

每个原子任务完成后立即执行验证命令并提交。

## Tasks

- [ ] 1. 实现 `resolveForgeRoot` 纯函数（TDD）
  - 1.1 创建 `test/forge-root-resolver.test.ts`，写 5 个 unit case（design.md 单元测试表 §1-5）
  - 1.2 创建 `test/forge-root-resolver.property.test.ts`，写 Property 1-3 的 fast-check 测试
  - 1.3 运行 `npx vitest run test/forge-root-resolver` 确认全部 RED（模块不存在）
  - 1.4 创建 `src/forge-root-resolver.ts`，实现 `ResolveInput`、`FsProbe`、`ResolveResult` 类型与 `resolveForgeRoot` 函数
  - 1.5 运行 `npx vitest run test/forge-root-resolver` 确认全部 GREEN
  - 1.6 运行 `npm run lint` + `npm run typecheck` 通过
  - _Requirements: 2.4, 2.5_
  - _Commit_: `feat(init): add resolveForgeRoot pure function with property tests`

- [ ] 2. 实现 `shouldShowBootstrap` 纯函数 + bootstrap-check.mjs（TDD）
  - 2.1 创建 `test/bootstrap-check.test.ts`，写 5 个 unit case（design.md 单元测试表 §1-5）
  - 2.2 创建 `test/bootstrap-check.property.test.ts`，写 Property 4-5 的 fast-check 测试
  - 2.3 运行测试确认 RED
  - 2.4 创建 `scripts/bootstrap-check.mjs`，实现 `shouldShowBootstrap` 纯函数与 `main()` 入口（按 design.md Component 3）
  - 2.5 运行 `npx vitest run test/bootstrap-check` 确认 GREEN
  - 2.6 手工验证 CLI：在 tmp 目录无 `.tinkerman/` 时设置 `CLAUDE_PLUGIN_ROOT=/tmp/x` 运行脚本，断言 stdout 含 "Forge plugin 已激活"
  - 2.7 手工验证：tmp 目录创建 `.tinkerman/config.md` 后再次运行，stdout 为空
  - 2.8 运行 `bash scripts/validate-scripts-help.mjs` 确认无 help 校验缺失（bootstrap-check 标注 `internal-only`）
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.10_
  - _Commit_: `feat(plugin): add bootstrap-check SessionStart hook with shouldShowBootstrap`

- [ ] 3. `commands/forge.md` 暴露 `init` 子命令
  - 3.1 在 §1 子命令分发表新增 `| init | (bash script) | 项目初始化（plugin/clone 通用） |` 行
  - 3.2 在分发表后增加"特殊子命令：`init`"段落（按 design.md Component 1），描述三阶 fallback 路径与诊断输出
  - 3.3 在 §2 任务路由示例段增加两条 init 示例（`/forge init`、`/forge init --pack pms`）
  - 3.4 在 `test/contract.test.ts` 新增断言：`commands/forge.md` 含 `init` 行 + "特殊子命令：`init`" 段落
  - 3.5 同步 `dist-plugin/commands/forge.md`（运行 `bash scripts/build-dist.sh` 或对应同步命令）
  - 3.6 运行 `npm run check` 确认全部 CI 通过
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 5.5_
  - _Commit_: `feat(command): expose /forge init subcommand with plugin/clone fallback`

- [ ] 4. SKILL Edge Cases 文案统一为 `/forge init`
  - 4.1 在以下 13 个文件中将独立 `forge init` 替换为 `/forge init`：build/spec/plan/test/ship/debug/learn/resume/abort/decide/status/loop instructions.md + spec/references/edge-cases.md（详见 Requirements 4.1 列表）
  - 4.2 验证未误改：`grep -n "forge init" templates/CLAUDE.md templates/AGENTS.md AGENTS.md CLAUDE.md scripts/init.sh README.md` 仍保留历史出处描述
  - 4.3 在 `test/contract.test.ts` 新增断言：扫描上述 13 个文件确保不含独立 `forge init` 字符串（前缀非 `/`）
  - 4.4 运行 `bash scripts/check-doc-links.sh` + `bash scripts/check-doc-structure.sh` 确认文档变更无破链
  - 4.5 运行 `bash scripts/build-dist.sh` 同步到 `dist-plugin/skills/forge/lib/**`
  - 4.6 运行 `npm run check` 全套通过
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - _Commit_: `docs(skills): unify edge case text to /forge init across 13 instruction files`

- [ ] 5. `.claude-plugin/plugin.json` 注册 bootstrap-check SessionStart hook
  - 5.1 在 `.claude-plugin/plugin.json` `hooks.SessionStart` 数组追加 bootstrap-check 钩子项（按 design.md Component 5）
  - 5.2 在同样位置确保命令同时支持 `${CLAUDE_PLUGIN_ROOT}` 与 `forge/scripts/bootstrap-check.mjs` 双路径
  - 5.3 在 `test/contract.test.ts` 新增断言：`hooks.SessionStart` 至少含一个引用 `bootstrap-check.mjs` 的命令；`timeout` 为 5
  - 5.4 在 `test/non-frozen-hook-preservation.property.test.ts`（如已存在）补一条期望项：bootstrap-check 命令的 timeout=5
  - 5.5 运行 `npx vitest run test/contract test/non-frozen-hook-preservation` 确认 GREEN
  - 5.6 运行 `npm run check` 确认 CI 通过
  - _Requirements: 3.7, 5.5_
  - _Commit_: `chore(plugin): register bootstrap-check hook in SessionStart`

- [ ] 6. `scripts/init.sh` 集成 plugin 根检测
  - 6.1 修改 `detect_forge_root()` 在最前面加入"情况 0：`${CLAUDE_PLUGIN_ROOT}/agents/` 检测"分支（按 design.md Component 2）
  - 6.2 失败分支输出"已检查路径"诊断信息（含 `${CLAUDE_PLUGIN_ROOT}`、`script_dir/..`、`$HOME/.claude/skills/forge`）
  - 6.3 创建 `test/init-resolver.integration.test.ts`：在 tmp 目录设置 `CLAUDE_PLUGIN_ROOT` 指向桩 plugin 根（仅 `agents/`），运行 `init.sh --help` 断言可见 plugin 模式资源；同时验证 clone 模式回退
  - 6.4 验证 `bash scripts/init.sh --help` 在 plugin 与 clone 两种环境均能输出 help
  - 6.5 运行 `bash scripts/build-dist.sh` 同步到 `dist-plugin/scripts/init.sh`
  - 6.6 运行 `npm run check` 全套通过
  - _Requirements: 2.1, 2.2, 2.3, 2.6_
  - _Commit_: `fix(init): detect CLAUDE_PLUGIN_ROOT in detect_forge_root`

- [ ] 7. 文档同步：README、onboarding、CHANGELOG
  - 7.1 在 `README.md` "Plugin 安装"章节后追加"下一步：在你的项目中运行 `/forge init`"
  - 7.2 在 `docs/onboarding.md`（或最相关 onboarding 文档）增加段落：plugin 用户用 `/forge init`，clone 用户用 `bash forge/scripts/init.sh`，两者等价
  - 7.3 在 `CHANGELOG.md` `## [Unreleased]` 段加 Added / Changed 三条目（按 design.md Component 6）
  - 7.4 运行 `bash scripts/check-readme-metrics.sh` + `bash scripts/check-doc-links.sh` 确认文档无破链
  - 7.5 运行 `npm run check` 确认全套通过
  - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - _Commit_: `docs(onboarding): document /forge init for plugin users`

- [ ] 8. `/forge learn` 沉淀知识
  - 8.1 运行 `/forge learn`，确认 `.tinkerman/knowledge/known-failures.md` 新增 "新分发渠道引入但 SKILL 提示与 Command 入口未同步" 模式条目，置信度 ≥ 0.7
  - 8.2 确认条目包含：检测信号、验证命令（`grep -r "forge init" skills/`）、修复参考（本 spec 路径）
  - 8.3 运行 `bash scripts/lint-evolved-rules.mjs` 确认知识文件格式合法
  - 8.4 运行 `npm run check` 全套通过
  - _Requirements: 6.1, 6.2, 6.3_
  - _Commit_: `docs(knowledge): record plugin distribution channel sync gap pattern`

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "2"],
      "description": "纯函数实现（resolveForgeRoot、shouldShowBootstrap），可并行 TDD"
    },
    {
      "wave": 2,
      "tasks": ["3", "4", "6"],
      "description": "Command 子命令暴露、SKILL 文案统一、init.sh 检测；3 与 6 共同使用 Component 1/2，4 独立"
    },
    {
      "wave": 3,
      "tasks": ["5"],
      "description": "plugin.json 注册 bootstrap-check 钩子（依赖 Task 2 已完成）"
    },
    {
      "wave": 4,
      "tasks": ["7"],
      "description": "文档同步：README / onboarding / CHANGELOG"
    },
    {
      "wave": 5,
      "tasks": ["8"],
      "description": "/forge learn 沉淀知识，所有前序任务 ship 完成后触发"
    }
  ],
  "dependencies": {
    "1": [],
    "2": [],
    "3": [],
    "4": [],
    "5": ["2"],
    "6": ["1"],
    "7": ["3", "5"],
    "8": ["3", "4", "5", "6", "7"]
  }
}
```

**关键依赖说明**：

- Task 5（plugin.json 注册 bootstrap-check）依赖 Task 2（脚本本体存在），否则 hook 引用空文件。
- Task 6（init.sh 检测 plugin 根）依赖 Task 1（纯函数已落地，便于 contract 测试与未来 shell 重构对齐）。
- Task 7（文档同步）依赖 Task 3、5：需要 `/forge init` 与 SessionStart hook 都已生效后才在 README 中宣称。
- Task 8 最后触发，沉淀整体改动。

## Notes

**冻结区操作**：本 spec 不修改 `.tinkerman/config.md`、`.tinkerman/specs/*/spec.md`、`.tinkerman/plans/*.md` 等冻结/受保护文件。Task 8 通过 `/forge learn` 写入 `.tinkerman/knowledge/known-failures.md`（受保护区，仅追加，不删除）。

**双路径维护提醒**：所有新增脚本（`bootstrap-check.mjs`、`init.sh` 修改）需确保 `scripts/build-dist.sh` 与 plugin 构建脚本同步复制到 `dist-plugin/scripts/`。Task 3、5、6 的验证命令均包含 `bash scripts/build-dist.sh` 同步步骤。

**验证清单**（全部任务完成后核对）：

- `commands/forge.md` 子命令分发表含 `init` 行
- `commands/forge.md` 含"特殊子命令：`init`"段落
- `.claude-plugin/plugin.json` `hooks.SessionStart` 含 bootstrap-check 命令
- `scripts/bootstrap-check.mjs` 存在，可执行（chmod 0755）
- `scripts/init.sh detect_forge_root` 含 `CLAUDE_PLUGIN_ROOT` 检测分支
- `src/forge-root-resolver.ts` 通过 typecheck，纯函数有 ≥ 5 unit + ≥ 3 property tests
- 13 个 SKILL instructions / edge-cases 文件无独立 `forge init` 字符串
- `README.md` "Plugin 安装"段含 "运行 `/forge init`" 提示
- `CHANGELOG.md` `[Unreleased]` 段含本 spec 三条变更
- `npm run check` 通过
- `.tinkerman/knowledge/known-failures.md` 含新模式条目

**Out of Scope**（本 spec 不做）：

- 不实现 `--non-interactive` / `--auto` init
- 不修改 init.sh 现有交互问题集
- 不为 npm 包、GitHub Release zip 等渠道实现等价路径
- 不引入 inquirer / prompts 等新依赖
- 不为 bootstrap 提示提供"忽略此提示"的 UI 按钮（CC plugin 不支持）
- 不修改 `templates/CLAUDE.md` / `templates/AGENTS.md` 中"本文件由 `forge init` 自动生成"的历史描述
