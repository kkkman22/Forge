# Build Progress — workflows-integration-resilience

## Phase 1: stuck timeout + signal chain
- [x] T1: CliSubprocessDriver stuck timer + signal_chain.jsonl + tests
- [x] T2: shutdown 三段式信号链 + tests

## Phase 2: 退出码退避重试
- [x] T3: forge-loop-cli runMainLoopWithRetry 包装
- [x] T4: abort.json 写入
- [x] T5: IPC subprocess-retry warning
- [x] T6: SIGINT 中断 retry

## Phase 3: 背压保护
- [x] T7: StreamJsonAdapter backpressure 监控
- [x] T8: 背压 60s 持续触发等同 stuck timeout
- [x] T9: LineTooLargeError 64 MiB 单行上限

## Phase 4: 429 速率限制降级
- [x] T10: RateLimitDegrader 状态机
- [x] T11: tool-health.md flock-protected append
- [x] T12: StreamJsonAdapter 429 探测 + env 注入
- [x] T13: 子命令结束时 reset Degrader

## Phase 5: cleanup chain
- [x] T14: CleanupChain 5 步实现
- [x] T15: forge-loop-cli 接入 cleanup chain
- [x] T16: cleanup chain 不进入 dispatcher 链路

## Phase 6: record-replay
- [x] T17: baseline 录制
- [x] T18: ipc-compat.test.ts record-replay
- [x] T19: diff-ipc-schema.mjs 强化
- [x] T20: process_manager.rs forward-compat

## Phase 7: property-based 1000 次
- [x] T21: R2.2 dispatcher L1 trigger property test
- [x] T22: R2.5 dispatch jsonl schema property test
- [x] T23: R2.9 dispatcher no-blackhole property test
- [x] T24: R4.5 audit-writer prefix property test
- [x] T25: R5.3 + R6.1 stream-adapter FIFO property test
- [x] T26: R11.1 + R12.4 frozen-zone + state-id property test

## Phase 8: CI 跨版本
- [x] T27: CI 跨版本 + scan-recent-ci-logs.mjs

## Review
- [x] 3-layer review completed — 4 P1 findings (shell injection × 2, orphaned setTimeout, production wiring gaps)
- [x] All P1 findings fixed with atomic commit (d1bd2d06)

## Test (Layer 3 pre-completion checklist)
- [x] 1. Unit tests run: 7281 passed, 17 pre-existing failures (contract tests needing dist/ artifacts)
- [x] 2. All non-contract tests pass
- [x] 3. TypeScript type check passes (`tsc --noEmit`)
- [x] 4. Lint passes (`biome check` — 267 files, no issues)
- [x] 5. Acceptance criteria verified against spec (R1–R8 all implemented)
- [x] 6. No TODO/FIXME/HACK/XXX in changed files
- [x] 7. Progress file updated
