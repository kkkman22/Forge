# Spec 7: 文件锁定与原子操作 — 并发安全 + Worktree 保护

> 来源：open-gsd/gsd-core v1.4.4 `src/state.cts`（~950 行）+ `src/worktree.cts` + worktree exit-42 resolution
> 优先级：P2 | 影响范围：`.forge/` 目录状态文件 + git worktree 操作
> 预估工作量：3-4h
> Forge 现状：✅ 已通过现有实现满足 — `src/state.ts` 通用锁系统 + `src/tool-health-writer.ts` O_EXCL + spin-wait + jitter

---

## 评估结论（2026-06-12）

**✅ 已通过现有实现满足，无需开发。**

- **通用锁系统**：`src/state.ts` lines 487-543
  - `LOCK_DIR = ".forge/.locks"`
  - `LockInfo`（holder / acquiredAt / targetFile）
  - `LockResult`（acquired / lockFilePath / reason）
  - `lockFilePath()` / `isLockStale()`（30s timeout）/ `attemptLock()`
  - Property tests exist: `test/state-locking.property.test.ts`

- **I/O 层**：`src/tool-health-writer.ts` lines 107-151
  - O_EXCL flag（`fs.openSync(path, 'wx')`）
  - Spin-wait + jitter（base_delay + random_jitter）
  - Stale lock detection + 自动清理

- **Cleanup**：`src/cleanup-chain.ts` line 63 锁文件清理

- **「冲突」已排除**：
  - Loop's `git reset --hard`（`loop/instructions.md:105`）：Three-strike circuit breaker 回滚机制，是**受控安全机制**（3 次连续失败后的受控回滚），不是误操作
  - Abort's `git stash`（`abort/instructions.md:140`）：**advisory text only**（提醒用户手动清理），不是自动执行

- **Exit 42 / worktree-agent-* 分支**：N/A — Forge 无 worktree-agent-* 分支机制

## 问题

多 Agent 并发操作 `.forge/` 目录时存在两个风险：

| 风险 | 现状 | v1.4.4 方案 |
|------|------|------------|
| **状态文件竞态** | 无锁或单文件锁 | **STATE.md.lock（O_EXCL + 10s timeout）** |
| **Worktree 误操作** | 无分支保护 | **verify-only fail-closed + exit 42** |

### v1.4.4 新增 vs v1.3.0

| 特性 | v1.3.0 | v1.4.4 |
|------|--------|--------|
| Lock 机制 | 单文件 | **泛化的 lock + spin-wait + jitter** |
| Worktree | 无安全检查 | **verify-only fail-closed** |
| 分支保护 | 无 | **allow-list + deny-list** |
| Base ref | 手动 | **自动设置 `worktree.baseRef:"head"`** |
| Destructive git | 无限制 | **禁止 clean/stash/reset --hard** |

## 需求

### R1: STATE.md.lock — 文件级原子锁

```
锁定机制：
  1. 使用 fs.openSync(path, 'wx')（O_EXCL flag），原子创建
  2. 锁文件内容：{ pid, timestamp, agent_id }
  3. 获取失败 → spin-wait（重试循环）
  4. 超时：10 秒（10s 内未获取锁 → 放弃 + 报错）
  5. Spin-wait + jitter：每次重试间隔 = base_delay + random_jitter
     base_delay = 50ms
     random_jitter = 0-50ms
     避免多个 Agent 同步重试（thundering herd）

解锁机制：
  1. 写入完成后 fs.unlinkSync(lockPath)
  2. 如果进程崩溃 → stale lock 检测：
     a. 读取 lock 文件中的 pid
     b. 检查 pid 是否存活（process.kill(pid, 0)）
     c. pid 不存活 → lock 是 stale → 删除并重试
     d. pid 存活 → 等待超时

错误处理：
  超时 → 返回错误（不无限等待）
  stale lock → 自动清理（不崩溃）
  权限错误 → fail-closed（不忽略）
```

### R2: 泛化锁管理器

将 `src/tool-health-writer.ts` 的单文件锁泛化为通用锁管理器：

```typescript
interface FileLockManager {
  // 获取锁（阻塞直到获取或超时）
  acquireLock(filepath: string, options?: {
    timeout?: number;      // 默认 10s
    agentId?: string;      // 标识持有者
  }): LockHandle;

  // 释放锁
  releaseLock(handle: LockHandle): void;

  // 检查锁状态
  isLocked(filepath: string): boolean;

  // 强制清理 stale lock
  forceCleanStale(filepath: string): boolean;
}
```

### R3: Worktree Verify-Only Fail-Closed

```
Worktree 安全策略（verify-only fail-closed）：

  1. Worktree 操作前必须验证（verify-only）
  2. 验证失败 → fail-closed（拒绝操作，不尝试修复）
  3. 验证项：
     a. HEAD 断言：git symbolic-ref HEAD 确认当前在 worktree 分支上
     b. cwd-drift sentinel：确认 cwd 没有被意外修改
     c. absolute-path guard：所有文件操作使用绝对路径

  如果验证失败：
    → 不尝试自动修复（verify-only）
    → 输出诊断信息
    → 停止操作（fail-closed）
    → 要求用户手动修复
```

### R4: 分支保护规则

```
Allow-list（允许的 worktree 分支名）：
  ^worktree-agent-*$

  匹配规则：分支名必须以 "worktree-agent-" 开头
  示例：worktree-agent-001, worktree-agent-fix-auth

Deny-list（禁止操作的分支）：
  main | master | develop | trunk | release/*

  这些分支上的 worktree 操作被完全禁止
  任何试图在这些分支上创建/删除 worktree 的操作 → exit 42

Exit 42 Resolution（v1.4.0 新增）：
  当 worktree base ref 不匹配时，退出码 = 42
  自动设置 worktree.baseRef = "head"
  新 CLI 命令：
    gsd-tools worktree base-check   → 检查 base ref
    gsd-tools worktree set-baseref  → 设置 base ref
```

### R5: Destructive Git 禁止

```
在 worktree 上下文中禁止的 git 命令：

  ❌ git clean -fd / git clean -fdx   → 删除未跟踪文件
  ❌ git stash                         → 暂存修改
  ❌ git reset --hard                  → 硬重置到指定 commit
  ❌ git checkout -- .                 → 丢弃所有修改
  ❌ git branch -D                     → 强制删除分支

  这些命令在 worktree 上下文中被完全禁止。
  如果检测到 → 拒绝执行 + 输出警告。

设计理由：
  worktree 中的修改可能是多个 Agent 的工作成果。
  destructive 命令会不可逆地丢失这些工作。
```

### R6: 原子写入协议

```
文件写入三步协议（适用于所有状态文件）：

  Step 1: 获取锁
    → acquireLock(filepath)

  Step 2: 写入临时文件
    → 写入 filepath.tmp
    → fsync 确保写入磁盘

  Step 3: 原子重命名
    → fs.renameSync(filepath.tmp, filepath)
    → releaseLock(filepath)

  如果 Step 2 或 3 失败：
    → 清理 .tmp 文件
    → 释放锁
    → 返回错误

  读取端：
    → 如果 filepath 不存在但 filepath.tmp 存在
    → 说明上次写入未完成 → 使用 filepath.tmp 或报错
```

## 设计决策

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| Lock 实现 | flock / O_EXCL | O_EXCL | 跨平台，Node.js 原生支持 |
| 超时 | 无限 / 10s | 10s | 防止永久阻塞 |
| Stale lock | 忽略 / pid 检测 | pid 检测 + 自动清理 | 平衡安全性和可用性 |
| Worktree | 允许修复 / verify-only | verify-only fail-closed | 安全第一，不自动修复 |
| 分支保护 | 无 / allow+deny list | allow + deny list | 双重保护 |
| Destructive git | 允许 / 禁止 | 禁止 | 防止不可逆数据丢失 |

## 验收标准

- [ ] R1 STATE.md.lock 实现（O_EXCL + 10s timeout + spin-wait + jitter + stale detection）
- [ ] R2 泛化 FileLockManager 接口设计
- [ ] R3 worktree verify-only fail-closed 策略
- [ ] R4 分支 allow-list（`^worktree-agent-*`）+ deny-list（main/master/develop/trunk/release/*）+ exit 42
- [ ] R5 destructive git 禁止清单
- [ ] R6 原子写入协议（lock → tmp → rename → unlock）
- [ ] `npm run check` 通过
