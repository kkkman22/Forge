---
topic: "process-lifecycle-management"
status: "approved"
date: "2026-04-29"
spec_ref: ".kiro/specs/process-lifecycle-management"
format: "lightweight"
---

## Objective

为 Forge 引入三层防御架构的子进程生命周期管理：进程组隔离、进程注册表 + 统一清理、跨会话兜底清理。新增 ProcessRegistry、ProcessTreeCleaner、OrphanDetector 三个模块，修改 sleep-preventer、effect-executor、run-manager、sdk-driver、forge-loop-cli、vitest.config 六个现有模块。

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#1-processregistry` | ProcessRegistry 单例类：register/unregister/shutdownAll/serialize/deserialize/spawnTracked/execTracked |
| `design.md#2-processtreecleaner` | ProcessTreeCleaner：getDescendants/killProcessTree/killProcessGroup，叶子到根深度优先 |
| `design.md#3-orphandetector` | OrphanDetector：PID 文件管理、cleanupStaleSessions、detectPpidOrphans、cleanupOrphans |
| `design.md#4-现有模块修改` | forge-loop-cli 信号处理、sdk-driver requestStop、effect-executor/run-manager 超时、sleep-preventer detached、vitest 并发 |

## Research Findings

### 来自知识库

- **instincts.md**（confidence: 0.7）：外部命令使用纯函数 builder + `execFileSync`，禁止命令字符串拼接。新模块 spawnTracked/execTracked 需遵循此模式。
- **solutions/agent-team-migration.md**：并行 Subagent 执行模式，与进程管理无直接关联。

### 来自执行指标

- 历史 Plan 偏差率：无显著偏差（metrics.md 显示 100% 成功率）
- 验证命令健康度：全部健康

### 来自代码库分析

- **sleep-preventer.ts**：纯函数模式，返回 `{ executable, args, detached }` 描述符，由调用方执行。`detached` 当前为 `true`。
- **effect-executor.ts**：大量 `execFileSync` 调用，无 timeout/killSignal 设置。纯函数 builder 模式。
- **run-manager.ts**：`execFileSync` 用于 git 操作（branch、worktree），无 timeout。有文件锁机制。
- **sdk-driver.ts**：`requestStop()` 中 `void this.executeEffects(result.effects)` 为 fire-and-forget。
- **forge-loop-cli.ts**：已有 SIGINT/SIGTERM 处理，spawn sleep prevention 进程。
- **vitest.config.ts**：无 pool/maxForks 限制。
- **测试模式**：70+ 测试文件，属性测试使用 fast-check，示例测试使用 vitest describe/it。
- **三个新模块均不存在**，需从零创建。

## File Mapping

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `src/process-registry.ts` | CREATE | ProcessRegistry 单例类核心模块 |
| `test/process-registry.test.ts` | CREATE | ProcessRegistry 示例测试 |
| `test/process-registry.property.test.ts` | CREATE | ProcessRegistry 属性测试 (Property 1-5) |
| `src/process-tree-cleaner.ts` | CREATE | ProcessTreeCleaner 进程树发现和清理 |
| `test/process-tree-cleaner.test.ts` | CREATE | ProcessTreeCleaner 示例测试 |
| `test/process-tree-cleaner.property.test.ts` | CREATE | ProcessTreeCleaner 属性测试 (Property 9) |
| `src/orphan-detector.ts` | CREATE | OrphanDetector PID 文件和孤儿检测 |
| `test/orphan-detector.test.ts` | CREATE | OrphanDetector 示例测试 |
| `test/orphan-detector.property.test.ts` | CREATE | OrphanDetector 属性测试 (Property 6-8, 11) |
| `src/effect-executor.ts` | MODIFY | 为 execFileSync 添加 timeout:30000, killSignal:'SIGTERM' |
| `src/run-manager.ts` | MODIFY | 为 execFileSync 添加 timeout:30000, killSignal:'SIGTERM' |
| `test/git-timeout.test.ts` | CREATE | Git 超时示例测试 |
| `test/git-timeout.property.test.ts` | CREATE | Git 超时属性测试 (Property 10) |
| `src/sleep-preventer.ts` | MODIFY | 移除 detached:true，改为 detached:false |
| `src/sdk-driver.ts` | MODIFY | requestStop 存储 Promise，新增 getStopPromise() |
| `src/forge-loop-cli.ts` | MODIFY | SIGHUP 处理、统一清理、PID 文件管理、启动时孤儿清理 |
| `test/forge-loop-cli.integration.test.ts` | CREATE | CLI 集成测试（信号处理、清理流程） |
| `vitest.config.ts` | MODIFY | 添加 pool:'forks', maxForks:2, fileParallelism:true |
| `test/vitest-config.test.ts` | CREATE | vitest 配置冒烟测试 |
| `src/index.ts` | MODIFY | 导出 process-registry、process-tree-cleaner、orphan-detector |

## Task Breakdown

### Task 1: ProcessRegistry 类型定义和单例骨架

- **Goal**: 定义 ProcessMetadata、SerializedRegistry、ShutdownResult 接口和 ProcessRegistry 单例骨架（getInstance/resetInstance/register/unregister/getAll/size）
- **Files**: `src/process-registry.ts`
- **Design Reference**: `design.md#1-processregistry` — ProcessMetadata 接口定义和单例模式
- **Property**: Property 1（注册保留元数据）、Property 2（注销移除进程）
- **Depends On**: (none)
- **Verify**: `npx vitest run --grep "ProcessRegistry"`
- **Commit**: `feat(process-lifecycle): add ProcessRegistry types and singleton skeleton`

### Task 2: ProcessRegistry 属性测试 — 注册和注销

- **Goal**: 编写 Property 1（注册保留元数据）和 Property 2（注销移除进程）的属性测试，验证 register/unregister/getAll/size 的正确性
- **Files**: `test/process-registry.property.test.ts`
- **Design Reference**: `design.md#正确性属性` — Property 1 和 Property 2 定义
- **Property**: Property 1, Property 2
- **Depends On**: Task 1
- **Verify**: `npx vitest run --grep "Property 1\|Property 2"`
- **Commit**: `test(process-lifecycle): add ProcessRegistry property tests for register/unregister`

### Task 3: ProcessRegistry spawnTracked 和 execTracked

- **Goal**: 实现 spawnTracked（封装 spawn + 自动注册 + exit 监听）和 execTracked（封装 execFileSync + 自动超时）
- **Files**: `src/process-registry.ts`
- **Design Reference**: `design.md#1-processregistry` — spawnTracked/execTracked 封装方法
- **Property**: Property 1（spawnTracked 注册保留元数据）
- **Depends On**: Task 1
- **Verify**: `npx vitest run --grep "spawnTracked\|execTracked"`
- **Commit**: `feat(process-lifecycle): add spawnTracked and execTracked methods`

### Task 4: ProcessRegistry shutdownAll

- **Goal**: 实现 shutdownAll 异步清理方法：SIGTERM → 5s 等待 → SIGKILL，处理 ESRCH，返回 ShutdownResult，对 detached 进程使用 kill(-pgid)
- **Files**: `src/process-registry.ts`
- **Design Reference**: `design.md#1-processregistry` — shutdownAll 统一清理方法
- **Property**: Property 3（shutdownAll 终止所有已注册进程）
- **Depends On**: Task 1
- **Verify**: `npx vitest run --grep "shutdownAll"`
- **Commit**: `feat(process-lifecycle): add shutdownAll with SIGTERM→wait→SIGKILL sequence`

### Task 5: ProcessRegistry shutdownAll 属性测试

- **Goal**: 编写 Property 3（shutdownAll 终止所有）属性测试，验证 terminated + forcedKill + alreadyExited = size()
- **Files**: `test/process-registry.property.test.ts`
- **Design Reference**: `design.md#正确性属性` — Property 3 定义
- **Property**: Property 3
- **Depends On**: Task 4
- **Verify**: `npx vitest run --grep "Property 3"`
- **Commit**: `test(process-lifecycle): add shutdownAll property test`

### Task 6: ProcessRegistry serialize/deserialize

- **Goal**: 实现 serialize（返回 JSON 字符串）和 deserialize（静态方法，解析 JSON 并验证字段）方法
- **Files**: `src/process-registry.ts`
- **Design Reference**: `design.md#1-processregistry` — serialize/deserialize 序列化与持久化
- **Property**: Property 4（round-trip）、Property 5（拒绝无效 JSON）
- **Depends On**: Task 1
- **Verify**: `npx vitest run --grep "serialize\|deserialize"`
- **Commit**: `feat(process-lifecycle): add serialize/deserialize for PID file persistence`

### Task 7: ProcessRegistry 序列化属性测试

- **Goal**: 编写 Property 4（round-trip）和 Property 5（拒绝无效 JSON）属性测试
- **Files**: `test/process-registry.property.test.ts`
- **Design Reference**: `design.md#正确性属性` — Property 4 和 Property 5 定义
- **Property**: Property 4, Property 5
- **Depends On**: Task 6
- **Verify**: `npx vitest run --grep "Property 4\|Property 5"`
- **Commit**: `test(process-lifecycle): add serialize/deserialize property tests`

### Task 8: ProcessRegistry 示例测试

- **Goal**: 编写示例测试覆盖：单例验证、SIGTERM→5s→SIGKILL 序列、清理结果日志、detached PGID、spawnTracked 自动注册/exit 自动注销
- **Files**: `test/process-registry.test.ts`
- **Design Reference**: `design.md#1-processregistry` — 完整接口和行为
- **Depends On**: Task 4, Task 6
- **Verify**: `npx vitest run --grep "ProcessRegistry"`
- **Commit**: `test(process-lifecycle): add ProcessRegistry example tests`

### Task 9: 检查点 — ProcessRegistry

- **Goal**: 确保 ProcessRegistry 所有测试通过（属性 + 示例），无类型/lint 错误
- **Files**: (none)
- **Depends On**: Task 8
- **Verify**: `npm run check`
- **Commit**: (无代码变更，不提交)

### Task 10: ProcessTreeCleaner 进程树发现和清理

- **Goal**: 实现 ProcessTreeNode 接口、getDescendants（pgrep -P 递归）、killProcessTree（叶子到根深度优先逆序）、killProcessGroup（kill(-pgid) + 回退逐 PID）
- **Files**: `src/process-tree-cleaner.ts`
- **Design Reference**: `design.md#2-processtreecleaner` — 进程树发现和清理函数
- **Property**: Property 9（叶子到根清理顺序）
- **Depends On**: (none)
- **Verify**: `npx vitest run --grep "ProcessTreeCleaner"`
- **Commit**: `feat(process-lifecycle): add ProcessTreeCleaner for tree discovery and cleanup`

### Task 11: ProcessTreeCleaner 属性测试和示例测试

- **Goal**: 编写 Property 9（叶子到根顺序）属性测试 + 示例测试（pgrep 发现、3s SIGKILL 升级、日志完整性、进程组 kill 失败回退）
- **Files**: `test/process-tree-cleaner.property.test.ts`, `test/process-tree-cleaner.test.ts`
- **Design Reference**: `design.md#正确性属性` — Property 9；`design.md#2-processtreecleaner` — 验收场景
- **Property**: Property 9
- **Depends On**: Task 10
- **Verify**: `npx vitest run --grep "ProcessTreeCleaner"`
- **Commit**: `test(process-lifecycle): add ProcessTreeCleaner property and example tests`

### Task 12: OrphanDetector PID 文件管理和孤儿检测

- **Goal**: 实现 PidFileContent/OrphanProcess 接口、writePidFile/readPidFile/deletePidFile、cleanupStaleSessions（扫描过期 PID 文件）、detectPpidOrphans（ps 命令 PPID=1 检测）、cleanupOrphans（阈值清理）
- **Files**: `src/orphan-detector.ts`
- **Design Reference**: `design.md#3-orphandetector` — PID 文件管理和孤儿检测函数
- **Property**: Property 6（PID 文件容错）、Property 7（ps 输出过滤）、Property 8（清理阈值）、Property 11（PID 文件同步）
- **Depends On**: Task 6（依赖 ProcessRegistry.serialize 输出格式）
- **Verify**: `npx vitest run --grep "OrphanDetector"`
- **Commit**: `feat(process-lifecycle): add OrphanDetector for cross-session orphan cleanup`

### Task 13: OrphanDetector 属性测试和示例测试

- **Goal**: 编写 Property 6-8 和 Property 11 属性测试 + 示例测试（过期会话清理、PID 文件删除、PPID=1 平台检测、ps 命令失败容错）
- **Files**: `test/orphan-detector.property.test.ts`, `test/orphan-detector.test.ts`
- **Design Reference**: `design.md#正确性属性` — Property 6-8, 11；`design.md#3-orphandetector` — 验收场景
- **Property**: Property 6, 7, 8, 11
- **Depends On**: Task 12
- **Verify**: `npx vitest run --grep "OrphanDetector"`
- **Commit**: `test(process-lifecycle): add OrphanDetector property and example tests`

### Task 14: 检查点 — 三个新模块

- **Goal**: 确保 ProcessRegistry + ProcessTreeCleaner + OrphanDetector 所有测试通过
- **Files**: (none)
- **Depends On**: Task 9, Task 11, Task 13
- **Verify**: `npm run check`
- **Commit**: (无代码变更，不提交)

### Task 15: Git 命令超时保护 — effect-executor

- **Goal**: 为 effect-executor.ts 中所有 execFileSync 调用添加 timeout:30_000 和 killSignal:'SIGTERM'，超时错误消息包含 git 命令名和超时时长
- **Files**: `src/effect-executor.ts`
- **Design Reference**: `design.md#4-现有模块修改` — effect-executor 修改
- **Depends On**: Task 14
- **Verify**: `npx vitest run --grep "EffectExecutor"`
- **Commit**: `feat(process-lifecycle): add 30s timeout to effect-executor git commands`

### Task 16: Git 命令超时保护 — run-manager

- **Goal**: 为 run-manager.ts 中所有 execFileSync 调用添加 timeout:30_000 和 killSignal:'SIGTERM'
- **Files**: `src/run-manager.ts`
- **Design Reference**: `design.md#4-现有模块修改` — run-manager 修改
- **Depends On**: Task 14
- **Verify**: `npx vitest run --grep "RunManager"`
- **Commit**: `feat(process-lifecycle): add 30s timeout to run-manager git commands`

### Task 17: Git 超时属性测试和示例测试

- **Goal**: 编写 Property 10（超时错误消息格式）属性测试 + 示例测试（timeout:30000 设置、SIGTERM 终止）
- **Files**: `test/git-timeout.property.test.ts`, `test/git-timeout.test.ts`
- **Design Reference**: `design.md#正确性属性` — Property 10
- **Property**: Property 10
- **Depends On**: Task 15, Task 16
- **Verify**: `npx vitest run --grep "git-timeout\|Property 10"`
- **Commit**: `test(process-lifecycle): add git timeout property and example tests`

### Task 18: Sleep Prevention 安全管理

- **Goal**: 修改 sleep-preventer.ts：将 detached 改为 false，使用 ProcessRegistry.spawnTracked 替代直接 spawn
- **Files**: `src/sleep-preventer.ts`
- **Design Reference**: `design.md#4-现有模块修改` — sleep-preventer 修改
- **Depends On**: Task 14
- **Verify**: `npx vitest run --grep "SleepPreventer\|sleep"`
- **Commit**: `feat(process-lifecycle): register sleep prevention with ProcessRegistry`

### Task 19: Sleep Prevention 示例测试

- **Goal**: 编写示例测试：detached:false 验证、进程注册到注册表、kill() 失败日志
- **Files**: `test/sleep-preventer.test.ts` (修改现有或新增)
- **Design Reference**: `design.md#4-现有模块修改` — sleep-preventer 验收标准
- **Depends On**: Task 18
- **Verify**: `npx vitest run --grep "sleep"`
- **Commit**: `test(process-lifecycle): add sleep prevention safety tests`

### Task 20: 检查点 — 现有模块修改

- **Goal**: 确保 effect-executor、run-manager、sleep-preventer 修改后所有测试通过
- **Files**: (none)
- **Depends On**: Task 17, Task 19
- **Verify**: `npm run check`
- **Commit**: (无代码变更，不提交)

### Task 21: SdkDriver requestStop 等待清理

- **Goal**: 修改 requestStop()：存储 executeEffects Promise 而非 fire-and-forget，新增 getStopPromise() 方法
- **Files**: `src/sdk-driver.ts`
- **Design Reference**: `design.md#4-现有模块修改` — sdk-driver requestStop 修改
- **Depends On**: Task 20
- **Verify**: `npx vitest run --grep "SdkDriver"`
- **Commit**: `feat(process-lifecycle): await requestStop cleanup instead of fire-and-forget`

### Task 22: SdkDriver requestStop 测试

- **Goal**: 编写示例测试：requestStop 存储 Promise、getStopPromise 返回可 await 的 Promise
- **Files**: `test/sdk-driver.test.ts` (修改现有)
- **Design Reference**: `design.md#4-现有模块修改` — sdk-driver 验收标准
- **Depends On**: Task 21
- **Verify**: `npx vitest run --grep "requestStop\|getStopPromise"`
- **Commit**: `test(process-lifecycle): add requestStop await tests`

### Task 23: Forge CLI 信号处理和统一清理

- **Goal**: 修改 forge-loop-cli.ts：新增 SIGHUP 处理、信号处理中 await driver.getStopPromise() + ProcessRegistry.shutdownAll()、10s 最大等待、process.on('exit') 进程组兜底清理
- **Files**: `src/forge-loop-cli.ts`
- **Design Reference**: `design.md#4-现有模块修改` — forge-loop-cli 信号处理
- **Depends On**: Task 21
- **Verify**: `npx vitest run --grep "forge-loop-cli"`
- **Commit**: `feat(process-lifecycle): add SIGHUP handling and unified cleanup to CLI`

### Task 24: Forge CLI 启动时孤儿清理和 PID 文件管理

- **Goal**: 修改 forge-loop-cli.ts main() 开头：调用 cleanupStaleSessions + detectPpidOrphans + cleanupOrphans，创建当前会话 PID 文件，正常退出时删除
- **Files**: `src/forge-loop-cli.ts`
- **Design Reference**: `design.md#4-现有模块修改` — forge-loop-cli 启动时清理和 PID 文件
- **Depends On**: Task 12, Task 23
- **Verify**: `npx vitest run --grep "forge-loop-cli"`
- **Commit**: `feat(process-lifecycle): add startup orphan cleanup and PID file management to CLI`

### Task 25: Forge CLI 集成测试

- **Goal**: 编写集成测试：SIGINT/SIGTERM/SIGHUP 触发统一清理、10s 最大等待强制退出、进程组兜底清理
- **Files**: `test/forge-loop-cli.integration.test.ts`
- **Design Reference**: `design.md#4-现有模块修改` — forge-loop-cli 验收标准
- **Depends On**: Task 24
- **Verify**: `npx vitest run --grep "forge-loop-cli.*integration"`
- **Commit**: `test(process-lifecycle): add forge-loop-cli integration tests`

### Task 26: Vitest 并发控制

- **Goal**: 修改 vitest.config.ts：添加 pool:'forks', poolOptions.forks.maxForks:2, fileParallelism:true；编写冒烟测试验证配置
- **Files**: `vitest.config.ts`, `test/vitest-config.test.ts`
- **Design Reference**: `design.md#4-现有模块修改` — vitest 配置修改
- **Depends On**: Task 20
- **Verify**: `npx vitest run --grep "vitest-config"`
- **Commit**: `feat(process-lifecycle): add vitest concurrency limits`

### Task 27: Barrel file 导出更新

- **Goal**: 更新 src/index.ts 导出 process-registry、process-tree-cleaner、orphan-detector
- **Files**: `src/index.ts`
- **Design Reference**: (项目约定 — barrel file 模式)
- **Depends On**: Task 14
- **Verify**: `npm run check`
- **Commit**: `feat(process-lifecycle): export new modules from barrel file`

### Task 28: 最终集成验证

- **Goal**: 运行 npm run check 全量验证，确保三层防御架构完整串联：进程组隔离 → 注册表清理 → 跨会话兜底
- **Files**: (none)
- **Depends On**: Task 25, Task 26, Task 27
- **Verify**: `npm run check`
- **Commit**: (无代码变更，不提交)

## Task Dependency Graph

```
Task 1 (Registry 骨架)
├── Task 2 (属性测试 P1/P2)
├── Task 3 (spawnTracked/execTracked)
├── Task 4 (shutdownAll)
│   └── Task 5 (属性测试 P3)
├── Task 6 (serialize/deserialize)
│   └── Task 7 (属性测试 P4/P5)
│   └── Task 12 (OrphanDetector, 依赖 serialize 格式)
│       └── Task 13 (OrphanDetector 测试)
└── Task 8 (示例测试)
    └── Task 9 (检查点 Registry)

Task 10 (ProcessTreeCleaner)
└── Task 11 (TreeCleaner 测试)

Task 9 + Task 11 + Task 13 → Task 14 (检查点 三个模块)
Task 14 → Task 27 (barrel exports)

Task 14 → Task 15 (effect-executor 超时)
Task 14 → Task 16 (run-manager 超时)
Task 15 + Task 16 → Task 17 (Git 超时测试)

Task 14 → Task 18 (sleep-preventer)
Task 18 → Task 19 (sleep 测试)

Task 17 + Task 19 → Task 20 (检查点 现有模块)
Task 14 → Task 26 (vitest 配置)

Task 20 → Task 21 (sdk-driver requestStop)
Task 21 → Task 22 (requestStop 测试)
Task 21 → Task 23 (CLI 信号处理)
Task 12 + Task 23 → Task 24 (CLI 启动清理)
Task 24 → Task 25 (CLI 集成测试)

Task 25 + Task 26 + Task 27 → Task 28 (最终验证)
```

## Spec Coverage

| Spec 需求 | 覆盖任务 |
|-----------|---------|
| 需求 1：进程注册表核心 | Task 1, Task 2, Task 3, Task 8 |
| 需求 2：统一清理机制 | Task 4, Task 5, Task 23, Task 25 |
| 需求 3：进程组隔离 | Task 10, Task 11, Task 23, Task 25 |
| 需求 4：Sleep Prevention | Task 18, Task 19 |
| 需求 5：Git 超时保护 | Task 15, Task 16, Task 17 |
| 需求 6：跨会话孤儿检测 | Task 12, Task 13, Task 24 |
| 需求 7：PPID=1 兜底检测 | Task 12, Task 13, Task 24 |
| 需求 8：子进程启动封装 | Task 3, Task 8 |
| 需求 9：Vitest 并发控制 | Task 26 |
| 需求 10：requestStop 完整性 | Task 21, Task 22, Task 25 |
| 需求 11：序列化持久化 | Task 6, Task 7 |
| 需求 12：多层进程树清理 | Task 10, Task 11 |
