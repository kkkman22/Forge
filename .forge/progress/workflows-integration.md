# Progress: workflows-integration

## Build Phase

### T1: 插件 workflows 路径与契约测试 — ✅ 完成

**Spec deviation note**：原 plan T1 描述为「迁移 .claude/workflows/multi-agent-review.js → workflows/」，但探针发现 .claude/workflows/multi-agent-review.js 不存在。按用户指示「不存在的就不处理」，T1 退化为：纯创建 workflow 文件 + plugin.json 添加 workflows 字段 + 测试 + 校验脚本。AC 1.2 中「.claude/workflows/multi-agent-review.js 已删除或 redirect」自动满足（路径不存在）。

#### Handoff Block

- task_id: T1
- completed:
  - workflows/multi-agent-review.js (Forge 风格 review workflow，bp/phase/agent + chunkedParallel hook)
  - workflows/lib/ 目录已建立，T2 可放置 concurrency.js
  - .claude-plugin/plugin.json 顶部添加 `"workflows": ["./workflows"]` 字段，hooks/mcpServers 不动
  - test/plugin-manifest.test.ts 新增 4 个 workflows 契约测试 (R1.1, R1.2, R1.4)
  - scripts/validate-plugin-manifest.mjs 新建 + --help (符合 scripts-help 契约) + workflows[] 校验逻辑
  - test/scripts/validate-plugin-manifest.test.ts 4 个 unit-test (R1.5)
- not_completed:
  - AC 1.3 integration-test (claude /workflows list)：依赖外部 claude CLI，未在测试中验证；通过 validator script + AC 1.5 间接覆盖装载契约
- commands_executed:
  - `npx vitest run test/plugin-manifest.test.ts test/scripts/validate-plugin-manifest.test.ts` → 20/20 pass
  - `npx tsc --noEmit` → 0 errors
  - `npx biome check (T1 files)` → 0 errors, 1 warning (template-string in test, 非阻断)
  - `node scripts/validate-plugin-manifest.mjs` → `plugin manifest OK: forge@2.6.0`
  - dist/claude-code 17 个 baseline 失败 (worktree 无预构建 dist) 与 T1 无关
- issues_found:
  - 原 plan T1 假设的「迁移源」.claude/workflows/multi-agent-review.js 不存在 → 改为创建语义。Plan 文本未修改，但 progress 记录此偏差作为后续 review 输入。
- procedure_compliance:
  - RED：先写 7 个失败测试 (4 manifest + 3 validator) 验证全失败 ✅
  - GREEN：实现 workflow 文件 + plugin.json edit + validator script，20 测试通过 ✅
  - REFACTOR：移除未使用 import (cpSync/existsSync)，过 biome ✅
  - Atomic commit：本任务 1 commit

### T2: 并发桥接 helper — ✅ 完成

#### Handoff Block

- task_id: T2
- completed:
  - workflows/lib/concurrency.js (ESM 模块，导出 `chunkedParallel` + `resolveMaxConcurrency` + `DEFAULT_MAX_CONCURRENCY=6`)
  - 实现细节：worker-pool 模式，bounded concurrency；输出顺序与输入一致；first-error 触发 abort，不再调度后续任务
  - 环境变量优先级：`FORGE_MAX_PARALLEL_AGENTS_RUNTIME` > `FORGE_MAX_PARALLEL_AGENTS` > 默认 6；非数值/非正值降级为默认
  - workflows/multi-agent-review.js 改用 ESM `import { chunkedParallel } from "./lib/concurrency.js"` 替换原 require
  - test/workflows/concurrency.test.ts 13 个测试 (AC R12.1, R12.6)：导出契约、env 优先级、顺序保留、peak ≤ max、first-error 拒绝、50 轮属性测试 (peak 永不越限)、multi-agent-review.js import 契约（不直接调用 runtime.parallel）
- not_completed:
  - 无（T2 范围全部完成）
- commands_executed:
  - `npx vitest run test/workflows/concurrency.test.ts test/plugin-manifest.test.ts` → 29/29 pass
  - `npx tsc --noEmit` → 0 errors
  - `npx biome check workflows/ test/workflows/` → 0 errors（1 warning template-string，非阻断）
- issues_found:
  - 初版用 CommonJS (`module.exports`) 与 package.json `"type": "module"` 冲突；改 ESM `export`/`import` 后通过
  - 测试改用 dynamic `import()` + 查询字符串缓存破坏，确保 per-test env 突变被尊重
- procedure_compliance:
  - RED：先写 13 个测试全部失败 ✅
  - GREEN：实现 concurrency.js + 改写 multi-agent-review.js，29 测试通过 ✅
  - REFACTOR：biome --write 自动修复 import 顺序，无残留 lint ✅
  - Atomic commit：本任务 1 commit
