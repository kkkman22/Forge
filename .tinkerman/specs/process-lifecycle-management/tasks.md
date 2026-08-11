---
feature: process-lifecycle-management
layout: tasks
created: 2026-04-29
spec_ref: ".tinkerman/specs/process-lifecycle-management/requirements.md"
---

# 实现计划：进程生命周期管理

## 概述

为 Forge 引入三层防御架构的子进程生命周期管理机制。实现顺序为：先构建底层新模块（ProcessRegistry、ProcessTreeCleaner、OrphanDetector），再逐步修改现有模块（sleep-preventer、effect-executor、run-manager、sdk-driver、forge-loop-cli、vitest.config），最后进行集成串联。每个任务都包含对应的属性测试和单元测试子任务，确保增量验证。

## Tasks

- [x] 1. 实现 ProcessRegistry 核心模块（`src/process-registry.ts`）
  - [x] 1.1 创建 `src/process-registry.ts`，定义类型和单例类骨架
    - 定义 `ProcessMetadata` 接口（pid、pgid、startTime、source、detached、description?）
    - 定义 `SerializedRegistry` 接口（sessionPid、sessionPgid、sessionStartTime、processes）
    - 定义 `ShutdownResult` 接口（terminated、forcedKill、alreadyExited、errors）
    - 实现 `ProcessRegistry` 单例模式：`getInstance()`、`resetInstance()`
    - 实现 `register()`：将子进程及元数据加入内部 Map，自动监听 `exit` 事件触发 `unregister()`
    - 实现 `unregister()`：从 Map 中移除指定 PID
    - 实现 `getAll()`：返回所有已注册子进程元数据的只读数组
    - 实现 `size()`：返回当前已注册子进程数量
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x]* 1.2 编写属性测试：注册保留元数据（Property 1）
    - 创建 `test/process-registry.property.test.ts`
    - **Property 1: 注册保留元数据**
    - 使用 fast-check 生成任意有效的 ProcessMetadata（任意 source 字符串、description、detached 标志）
    - 断言 `register()` 后 `getAll()` 包含该条目且所有字段一致，`size()` 等于 `getAll().length`
    - **Validates: Requirements 1.1, 1.4, 1.5, 1.7, 8.1, 8.5**

  - [x]* 1.3 编写属性测试：注销移除进程（Property 2）
    - **Property 2: 注销移除进程**
    - 使用 fast-check 生成任意已注册子进程集合和任意注销子集
    - 断言注销后 `getAll()` 不包含已注销 PID，`size()` 减少相应数量，未注销进程保持不变
    - **Validates: Requirements 1.2, 1.3, 8.3**

  - [x] 1.4 实现 `spawnTracked()` 和 `execTracked()` 封装方法
    - `spawnTracked()`：封装 `child_process.spawn`，自动注册子进程、记录 PGID、监听 exit 事件
    - `execTracked()`：封装 `child_process.execFileSync`，自动设置 `timeout: 30_000` 和 `killSignal: 'SIGTERM'`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 1.5 实现 `shutdownAll()` 异步清理方法
    - 向所有已注册子进程发送 SIGTERM
    - 等待子进程退出，最长 5 秒
    - 超时后对未退出的子进程发送 SIGKILL
    - 捕获 ESRCH 错误（进程已退出），标记为 `alreadyExited`
    - 返回 `ShutdownResult`（terminated + forcedKill + alreadyExited = 调用前 size()）
    - 对 detached 子进程使用 `kill(-child.pgid, 'SIGTERM')` 终止整个进程树
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.5_

  - [x]* 1.6 编写属性测试：shutdownAll 终止所有已注册进程（Property 3）
    - **Property 3: shutdownAll 终止所有已注册进程**
    - 使用 fast-check 生成包含响应 SIGTERM 和不响应 SIGTERM 的 mock 子进程集合
    - 断言 `shutdownAll()` 后 `terminated + forcedKill + alreadyExited` 等于调用前 `size()`
    - **Validates: Requirements 2.7**

  - [x] 1.7 实现 `serialize()` 和 `deserialize()` 方法
    - `serialize()`：返回包含 sessionPid、sessionPgid、sessionStartTime、processes 数组的 JSON 字符串
    - `deserialize()`：静态方法，从 JSON 字符串解析出 `SerializedRegistry`，对无效 JSON 或缺少必要字段抛出描述性异常
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x]* 1.8 编写属性测试：序列化反序列化 round-trip（Property 4）
    - **Property 4: 序列化反序列化 round-trip**
    - 使用 fast-check 生成任意有效的 `SerializedRegistry` 对象
    - 断言 `serialize()` 后 `deserialize()` 产生与原始状态等价的元数据列表
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4**

  - [x]* 1.9 编写属性测试：deserialize 拒绝无效 JSON（Property 5）
    - **Property 5: deserialize 拒绝无效 JSON**
    - 使用 fast-check 生成非法 JSON 字符串（空字符串、截断 JSON、缺少必要字段、类型错误的字段值）
    - 断言 `deserialize()` 抛出包含描述性信息的异常
    - **Validates: Requirements 11.5**

  - [x]* 1.10 编写 ProcessRegistry 示例测试
    - 创建 `test/process-registry.test.ts`
    - 测试单例模式验证（Requirements 1.6）
    - 测试 SIGTERM → 5s 等待 → SIGKILL 序列（Requirements 2.4, 2.5）
    - 测试清理结果日志记录（Requirements 2.6）
    - 测试 detached 进程记录 PGID（Requirements 3.2）
    - 测试 spawnTracked 自动注册和 exit 自动注销
    - _Requirements: 1.6, 2.4, 2.5, 2.6, 3.2, 8.1, 8.3_

- [x] 2. 检查点 — ProcessRegistry 核心模块
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 3. 实现 ProcessTreeCleaner 模块（`src/process-tree-cleaner.ts`）
  - [x] 3.1 创建 `src/process-tree-cleaner.ts`，实现进程树发现和清理
    - 定义 `ProcessTreeNode` 接口（pid、command、children）
    - 实现 `getDescendants(pid)`：使用 `pgrep -P <pid>` 递归查找后代进程
    - 实现 `killProcessTree(pid, signal?, timeoutMs?)`：按叶子到根的深度优先逆序发送信号，3 秒超时后 SIGKILL 升级
    - 实现 `killProcessGroup(pgid, signal?)`：优先使用 `kill(-pgid)` 进程组级别清理，失败时回退到逐 PID 清理
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x]* 3.2 编写属性测试：进程树清理顺序为叶子到根（Property 9）
    - 创建 `test/process-tree-cleaner.property.test.ts`
    - **Property 9: 进程树清理顺序为叶子到根**
    - 使用 fast-check 生成任意进程树结构（单层、多层、宽树、深树）
    - 断言 `killProcessTree()` 发送信号的顺序满足：对于任意父子关系，child 收到信号早于 parent
    - **Validates: Requirements 12.2**

  - [x]* 3.3 编写 ProcessTreeCleaner 示例测试
    - 创建 `test/process-tree-cleaner.test.ts`
    - 测试 pgrep 后代进程发现（Requirements 12.1）
    - 测试后代进程 3 秒 SIGKILL 升级（Requirements 12.3）
    - 测试清理日志完整性（Requirements 12.4）
    - 测试进程组 kill 失败回退到逐 PID 清理（Requirements 12.5）
    - _Requirements: 12.1, 12.3, 12.4, 12.5_

- [x] 4. 实现 OrphanDetector 模块（`src/orphan-detector.ts`）
  - [x] 4.1 创建 `src/orphan-detector.ts`，实现 PID 文件管理和孤儿检测
    - 定义 `PidFileContent` 接口（sessionPid、sessionPgid、sessionStartTime、processes）
    - 定义 `OrphanProcess` 接口（pid、command、elapsedSeconds、source）
    - 实现 `writePidFile()`、`readPidFile()`、`deletePidFile()` — PID 文件存储在 `.tinkerman/.pids/` 目录
    - 实现 `cleanupStaleSessions(baseDir)`：扫描 PID 文件，清理已失效会话的孤儿进程
    - 实现 `detectPpidOrphans(patterns, maxAgeSeconds)`：通过 `ps -eo pid,ppid,etime,command` 查找 PPID=1 的 Forge 相关进程
    - 实现 `cleanupOrphans(orphans, autoKillThresholdSeconds)`：运行时长 > 1 小时自动 SIGTERM，其余仅日志
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x]* 4.2 编写属性测试：PID 文件解析容错（Property 6）
    - 创建 `test/orphan-detector.property.test.ts`
    - **Property 6: PID 文件解析容错**
    - 使用 fast-check 生成无效 PID 文件内容（损坏 JSON、空文件、二进制数据）
    - 断言 `readPidFile()` 返回 `null` 而非抛出异常
    - **Validates: Requirements 6.7**

  - [x]* 4.3 编写属性测试：ps 输出解析正确过滤 PPID=1 孤儿进程（Property 7）
    - **Property 7: ps 输出解析正确过滤 PPID=1 孤儿进程**
    - 使用 fast-check 生成任意 `ps -eo pid,ppid,etime,command` 输出（不同 PPID 值和命令行）
    - 断言解析结果仅包含 PPID=1 且命令行匹配 Forge 相关模式的进程
    - **Validates: Requirements 7.2**

  - [x]* 4.4 编写属性测试：孤儿进程自动清理阈值（Property 8）
    - **Property 8: 孤儿进程自动清理阈值**
    - 使用 fast-check 生成任意运行时长的孤儿进程集合
    - 断言运行时长 > 1 小时的被 SIGTERM，≤ 1 小时的仅记录警告
    - **Validates: Requirements 7.4, 7.5**

  - [x]* 4.5 编写属性测试：PID 文件与注册表状态同步（Property 11）
    - **Property 11: PID 文件与注册表状态同步**
    - 使用 fast-check 生成任意 register/unregister 操作序列
    - 断言每次操作后 PID 文件内容与 `ProcessRegistry.serialize()` 输出一致
    - **Validates: Requirements 6.1, 6.2**

  - [x]* 4.6 编写 OrphanDetector 示例测试
    - 创建 `test/orphan-detector.test.ts`
    - 测试过期会话 PID 文件清理（Requirements 6.3, 6.4, 6.5）
    - 测试正常退出删除 PID 文件（Requirements 6.6）
    - 测试 PPID=1 检测仅 macOS/Linux（Requirements 7.6）
    - 测试 ps 命令执行失败时的容错处理
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 7.6_

- [x] 5. 检查点 — 三个新模块完成
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 6. 修改现有模块：Git 超时保护和 Sleep Prevention
  - [x] 6.1 修改 `src/effect-executor.ts`：为所有 `execFileSync` git 调用添加超时
    - 为所有 `execFileSync` 调用添加 `timeout: 30_000` 和 `killSignal: 'SIGTERM'` 选项
    - 超时错误消息包含被执行的 git 命令名称和超时时长
    - _Requirements: 5.1, 5.3, 5.4_

  - [x] 6.2 修改 `src/run-manager.ts`：为所有 `execFileSync` git 调用添加超时
    - 为所有 `execFileSync` 调用添加 `timeout: 30_000` 和 `killSignal: 'SIGTERM'` 选项
    - _Requirements: 5.2_

  - [x]* 6.3 编写属性测试：Git 超时错误消息格式（Property 10）
    - 创建 `test/git-timeout.property.test.ts`
    - **Property 10: Git 超时错误消息格式**
    - 使用 fast-check 生成任意 git 命令字符串和超时时长
    - 断言超时错误消息包含 git 命令名称和超时时长（30 秒）
    - **Validates: Requirements 5.3**

  - [x]* 6.4 编写 Git 超时示例测试
    - 创建 `test/git-timeout.test.ts`
    - 测试 `execFileSync` 设置了 `timeout: 30000`（Requirements 5.1, 5.2, 5.4）
    - 测试超时后子进程被 SIGTERM 终止
    - _Requirements: 5.1, 5.2, 5.4_

  - [x] 6.5 修改 `src/sleep-preventer.ts`：移除 `detached: true`
    - 将 `buildCaffeinateCommand()` 返回的 `detached` 改为 `false`
    - 使用 `ProcessRegistry.spawnTracked()` 替代直接 `spawn()`，来源标识为 `"sleep-prevention"`
    - _Requirements: 4.1, 4.2_

  - [x]* 6.6 编写 Sleep Prevention 示例测试
    - 测试 caffeinate 使用 `detached: false`（Requirements 4.2）
    - 测试 Sleep Prevention 进程注册到注册表（Requirements 4.1）
    - 测试 `kill()` 失败时记录警告日志（Requirements 4.3）
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 7. 检查点 — 现有模块修改完成
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 8. 修改 `src/sdk-driver.ts`：requestStop 等待清理完成
  - [x] 8.1 修改 `requestStop()` 方法
    - 将 `void this.executeEffects(result.effects)` 改为存储 Promise
    - 新增 `getStopPromise(): Promise<void> | null` 方法，返回 requestStop 的清理 Promise
    - _Requirements: 10.1, 2.8_

  - [x]* 8.2 编写 requestStop 示例测试
    - 测试 `requestStop()` 存储 Promise 而非 fire-and-forget（Requirements 2.8）
    - 测试 `getStopPromise()` 返回可 await 的 Promise（Requirements 10.1）
    - _Requirements: 2.8, 10.1_

- [x] 9. 修改 `src/forge-loop-cli.ts`：信号处理、启动清理和 PID 文件管理
  - [x] 9.1 添加 SIGHUP 信号处理和统一清理逻辑
    - 在现有 SIGINT/SIGTERM 处理基础上新增 SIGHUP 处理
    - 信号处理中调用 `driver.requestStop()` 后 await `driver.getStopPromise()`
    - 调用 `ProcessRegistry.getInstance().shutdownAll()` 并等待完成
    - 设置 10 秒最大等待时间，超时后 `process.exit(1)` 强制退出
    - 在 `process.on('exit')` 中执行 `process.kill(-process.pid, 'SIGTERM')` 进程组兜底清理
    - _Requirements: 2.1, 2.2, 2.3, 2.8, 3.3, 3.4, 10.2, 10.3, 10.4_

  - [x] 9.2 添加启动时孤儿进程清理和 PID 文件管理
    - 在 `main()` 开头调用 `cleanupStaleSessions()` 扫描过期 PID 文件
    - 调用 `detectPpidOrphans()` 检测 PPID=1 孤儿进程
    - 调用 `cleanupOrphans()` 按阈值清理孤儿进程
    - 创建当前会话的 PID 文件（`session-<sessionId>.pid`）
    - 正常退出时删除 PID 文件
    - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x]* 9.3 编写 forge-loop-cli 集成测试
    - 测试 SIGINT/SIGTERM/SIGHUP 信号处理触发统一清理（Requirements 2.1, 2.2, 2.3）
    - 测试 10 秒最大等待时间和强制退出（Requirements 10.2, 10.3）
    - 测试进程组兜底清理在 exit handler 中执行（Requirements 3.3, 3.4）
    - _Requirements: 2.1, 2.2, 2.3, 3.3, 3.4, 10.2, 10.3_

- [x] 10. 修改 `vitest.config.ts`：并发控制
  - [x] 10.1 添加 vitest 并发限制配置
    - 设置 `pool: 'forks'`
    - 设置 `poolOptions: { forks: { maxForks: 2 } }`
    - 设置 `fileParallelism: true`
    - _Requirements: 9.1, 9.2, 9.3_

  - [x]* 10.2 编写 vitest 配置冒烟测试
    - 验证 `pool`、`maxForks`、`fileParallelism` 配置值正确
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 11. 最终检查点 — 全部集成完成
  - 确保所有测试通过，如有问题请向用户确认。
  - 验证三层防御架构完整串联：进程组隔离 → 注册表清理 → 跨会话兜底
  - 验证所有 11 个正确性属性的属性测试覆盖

## 备注

- 标记 `*` 的子任务为可选任务，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号，确保可追溯性
- 检查点任务确保增量验证，避免问题累积
- 属性测试验证通用正确性属性（使用 fast-check），单元测试验证具体示例和边界条件
- 所有新模块（process-registry、process-tree-cleaner、orphan-detector）均为纯 TypeScript 模块，无新外部依赖
- Mock 策略：ChildProcess mock、process.kill mock、execFileSync mock、fs mock、child_process.execSync mock
