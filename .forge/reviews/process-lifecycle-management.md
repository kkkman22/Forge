---
topic: "process-lifecycle-management"
date: "2026-04-29"
result: "pass"
p0_count: 0
p1_count: 0
p2_count: 4
p3_count: 1
---

# Review: process-lifecycle-management

## Layer 1 — Spec 对齐 (spec-check)

### 需求覆盖矩阵

| 需求 | 状态 | 说明 |
|------|------|------|
| R1 进程注册表核心 | ✅ 全部实现 | register/unregister/getAll/size/单例/元数据 |
| R2 统一清理 | ⚠️ 部分实现 | shutdownAll 存在但 CLI 未接入 (Tasks 23-24 deferred) |
| R3 进程组隔离 | ⚠️ 部分实现 | detached:false 和 kill(-pgid) 已实现，CLI process.on('exit') 未实现 |
| R4 睡眠预防 | ⚠️ 部分实现 | detached:false 已改，但 CLI 未通过 ProcessRegistry 注册 |
| R5 Git 超时保护 | ⚠️ 部分实现 | timeout/killSignal 已加，但错误消息缺命令详情 |
| R6 跨会话孤儿检测 | ⚠️ 库已实现 | 函数存在但 CLI 未接入 PID 文件生命周期 |
| R7 PPID=1 兜底 | ⚠️ 库已实现 | detectPpidOrphans/cleanupOrphans 存在但 CLI 未调用 |
| R8 子进程封装 | ✅ 基本实现 | spawnTracked/execTracked 已实现 |
| R9 Vitest 并发 | ✅ 全部实现 | pool:forks, maxForks:2, fileParallelism:true |
| R10 requestStop | ⚠️ 部分实现 | getStopPromise 已添加，CLI 10s 超时未实现 |
| R11 序列化 | ⚠️ 部分实现 | serialize/deserialize 存在，但 sessionStartTime 语义错误 |
| R12 进程树清理 | ✅ 基本实现 | getDescendants/killProcessTree/killProcessGroup 已实现 |

### Findings

#### [P1] serialize() 使用 Date.now() 而非会话启动时间

[severity: P1] [confidence: 0.95] [fix: gated_auto]
文件：src/process-registry.ts 第 181 行
[Evidence] `sessionStartTime: Date.now()` 在 serialize() 中每次调用都重新生成
[Claim] 需求 11.4 要求 sessionStartTime 代表会话启动时间。应在构造函数/getInstance 时捕获，而非序列化时生成。

#### [P1] 超时错误消息缺少命令和时长

[severity: P1] [confidence: 0.95] [fix: safe_auto]
文件：src/effect-executor.ts 第 256 行
[Evidence] `throw new UnexpectedEffectError('git add timed out: ${err.message}')` — 缺少被执行的 git 命令和超时时长
[Claim] 需求 5.3 要求错误消息包含"被执行的 git 命令"和"超时时长"。建议格式：`git command "git add -A" timed out after 30000ms`

#### [P2] shutdownAll 未记录清理结果

[severity: P2] [confidence: 0.95] [fix: safe_auto]
文件：src/process-registry.ts 第 98-174 行
[Evidence] shutdownAll 返回 ShutdownResult 但不记录日志
[Claim] 需求 2.6 要求记录清理结果（成功终止/强制终止数量）。建议在 shutdownAll 完成后 console.info 清理结果。

#### [P2] shutdownAll 未优先使用 kill(-pgid)

[severity: P2] [confidence: 0.85] [fix: gated_auto]
文件：src/process-registry.ts 第 98-125 行
[Evidence] shutdownAll 总是逐个 PID 发送 SIGTERM
[Claim] 需求 12.5 要求优先使用 kill(-pgid) 进程组清理。当前实现跳过了进程组 kill 直接走 per-PID。应先尝试 killProcessGroup，失败时回退。

#### [P2] execTracked 未注册到注册表

[severity: P2] [confidence: 0.90] [fix: advisory]
文件：src/process-registry.ts 第 85-96 行
[Evidence] execTracked 仅封装 execFileSync 的超时/killSignal，不注册任何条目
[Claim] 需求 8.4 要求 execTracked "完成后自动从注册表中移除对应记录"。由于 execFileSync 同步阻塞，短暂注册无实际价值。建议与 Spec 作者确认是否需要调整 Spec。

#### [P2] 缺少 Git 超时行为测试

[severity: P2] [confidence: 0.90] [fix: manual]
文件：test/git-timeout.test.ts (缺失)
[Evidence] Plan Task 17 被跳过，无专门测试验证 git 命令超时行为
[Claim] effect-executor 和 run-manager 的 timeout/killSignal 变更无对应测试覆盖。

---

## Layer 2 — 代码质量 (quality-check)

#### [P2] execSync 阻塞事件循环

[severity: P2] [confidence: 0.88] [fix: gated_auto]
文件：src/orphan-detector.ts 第 130 行, src/process-tree-cleaner.ts 第 11、18 行
[Evidence] `execSync("ps -eo pid,ppid,etime,command")` 和 `execSync("pgrep -P ${pid}")` 同步阻塞
[Claim] 函数签名是 async 但内部使用同步 execSync，阻塞事件循环。建议改用 execFile（异步）或至少保持与项目其他部分一致使用 execFileSync。

#### [P2] SIGTERM→SIGKILL 升级逻辑重复

[severity: P2] [confidence: 0.82] [fix: advisory]
文件：src/process-registry.ts shutdownAll vs src/process-tree-cleaner.ts killProcessTree
[Evidence] 两个模块都实现了 "SIGTERM → 等待 → SIGKILL" 的升级模式
[Claim] 可以提取为共享的 `escalatingKill(pid, {timeout, signal})` 工具函数。当前重复不影响正确性，但增加维护负担。

#### [P2] detectPpidOrphans 的 maxAgeSeconds 参数未使用

[severity: P2] [confidence: 0.90] [fix: safe_auto]
文件：src/orphan-detector.ts 第 119-121 行
[Evidence] `_maxAgeSeconds` 被标记为未使用（biome 自动加下划线前缀）
[Claim] 函数接受 maxAgeSeconds 但完全忽略。应在过滤逻辑中使用它（如 `if (elapsedSeconds > maxAgeSeconds)` 来过滤结果），或从签名中移除。

#### [P2] cleanupStaleSessions 逐 PID 而非进程组清理

[severity: P2] [confidence: 0.80] [fix: gated_auto]
文件：src/orphan-detector.ts 第 94-106 行
[Evidence] 对每个孤儿子进程单独 `process.kill(proc.pid, "SIGTERM")`
[Claim] 如果子进程有自己的后代进程，逐 PID 清理无法终止整个进程树。应使用 killProcessGroup 或 killProcessTree 进行清理。

---

## Layer 3 — 安全与风险 (security-check)

#### [P1] execSync + 模板字符串存在命令注入风险

[severity: P1] [confidence: 0.92] [fix: safe_auto]
文件：src/process-tree-cleaner.ts 第 11、18 行
[Evidence] `execSync("pgrep -P ${pid}")` 和 `execSync("ps -p ${childPid} -o comm=")` 通过模板字符串构造 shell 命令
[Claim] execSync 经过中间 shell (/bin/sh -c)，虽然 pid 类型为 number 且来源可控，但 execSync + 模板字符串是不安全的编码模式。应改用 execFileSync 避免中间 shell：
```ts
execFileSync("pgrep", ["-P", String(pid)], { encoding: "utf-8", timeout: 5000 })
execFileSync("ps", ["-p", String(childPid), "-o", "comm="], { encoding: "utf-8" })
```
↑ [spec-check, security-check] 跨评审者收敛

#### [P2] pgrep 输出未做数值验证

[severity: P2] [confidence: 0.85] [fix: safe_auto]
文件：src/process-tree-cleaner.ts 第 12-16 行
[Evidence] `.map(Number)` 后未验证结果是否为有效正整数
[Claim] 应添加 `.filter((p) => Number.isFinite(p) && p > 0 && Number.isInteger(p))` 防御性过滤。

#### [P3] execSync 用于静态命令

[severity: P3] [confidence: 0.90] [fix: advisory]
文件：src/orphan-detector.ts 第 130 行
[Evidence] `execSync("ps -eo pid,ppid,etime,command")` 命令完全硬编码，安全但与项目惯例不一致
[Claim] 建议改为 execFileSync 保持风格一致。

---

## 评审已知推迟项 (Tasks 23-25 — CLI 集成)

以下功能点需要修改 forge-loop-cli.ts，属于已规划的后续任务：
- R2.1-2.3: 信号处理器调用 shutdownAll
- R2.8: requestStop 调用 shutdownAll 并等待
- R3.3-3.4: process.on('exit') 进程组清理
- R4.1: Sleep prevention 通过 ProcessRegistry 注册
- R6.1-6.6: PID 文件生命周期管理
- R7.1: CLI 启动时调用 detectPpidOrphans
- R10.2-10.4: CLI 信号处理器 10s 最大等待和强制退出

---

## 总结

| 级别 | 数量 | 说明 |
|------|------|------|
| P0 | 0 | — |
| P1 | 3 | serialize sessionStartTime 语义错误; execSync 命令注入; 超时错误消息不完整 |
| P2 | 7 | 日志缺失; kill(-pgid) 优先级; execTracked 注册; 测试缺失; execSync 阻塞; 重复逻辑; 参数未使用 |
| P3 | 1 | 静态命令风格不一致 |

🚫 Ship 阻断：存在 3 个 P1 问题，必须修复后重新评审。
