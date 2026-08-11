---
updated: 2026-08-11
---
# Forge Verify — Workflow Reference

## Complete Execution Steps

### Step 1: Write Falsifiable_Claim

将输入（topic + 可选参数）重述为结构化 claim：

```yaml
---
condition: "在 N=1000 并发用户请求下"
metric: "p95 响应延迟"
threshold: "≤ 200ms"
baseline_ref: "origin/main"
topic: "perf-optimization"
created_at: "2026-05-08T10:00:00+08:00"
---
```

写入 `.forge/findings/<topic>/verify-this/claim.md`。

**验证**：三字段（condition / metric / threshold）任一为空 → INCONCLUSIVE，中止 artifact capture，记录缺失字段名到 verdict.md [R1.3]。

### Step 2: Resolve Baseline

调用 `resolveBaseline(topic, explicit?)` 获取 baseline 引用。详见 `baseline-resolution.md`。

解析失败 → INCONCLUSIVE + "no baseline reference available"。

### Step 3: Capture Artifacts

#### Baseline Capture

1. Checkout/switch to baseline ref
2. Run capture command(s) specified by claim's metric
3. Record command invocation log（command + exit status + stdout/stderr）
4. Record metric output（referenced by claim's metric field）
5. Write to `baseline/` directory

#### Treatment Capture

1. Switch to current HEAD / treatment state
2. Run same capture command(s)
3. Record same format
4. Write to `treatment/` directory

**Invariant**：`verdict === "VERIFIED"` → `baseline/` 和 `treatment/` 目录各至少一个文件 [R13.4]。

**失败处理**：
- baseline 捕获失败 → INCONCLUSIVE，记录失败原因，保留 treatment artifacts [R1.6]
- treatment 捕获失败 → INCONCLUSIVE，记录失败原因，保留 baseline artifacts [R1.6]

### Step 4: Compute Diff

预计算 baseline vs treatment metric 差异，写入 `diff/` 目录。格式：

```markdown
# Baseline vs Treatment Diff

## Metric: p95 响应延迟
- Baseline: 480ms
- Treatment: 180ms
- Delta: -62.5%
- Threshold: ≤ 200ms
- Satisfies threshold: ✓
```

### Step 5: Build Evidence Chain

每个 captured artifact 生成一条 Evidence Chain 条目：

```
- [Command] `npm run bench` → [Output] `baseline/bench.json` → [Claim] baseline p95 = 480ms
- [Command] `npm run bench` → [Output] `treatment/bench.json` → [Claim] treatment p95 = 180ms
- [Command] `diff` → [Output] `diff/bench.diff.md` → [Claim] -62.5% 满足 ≤200ms 阈值
```

### Step 6: Write Verdict

综合所有信息写入 `verdict.md`：

1. 判断三态结论
2. 写入 frontmatter（verdict / topic / claim_path / baseline_snapshot / treatment_snapshot / decided_at / missing_artifacts / inconclusive_reason）
3. 写入 Evidence Chain
4. 释放文件锁

## Error Handling Matrix

| 错误 | 处理 | verdict |
|------|------|---------|
| Claim 字段缺失 | 中止 capture，记录缺失字段 | INCONCLUSIVE |
| Baseline 解析失败 | 记录策略链全部失败 | INCONCLUSIVE |
| Artifact 捕获失败 | 保留已捕获，记录失败原因 | INCONCLUSIVE |
| File lock 获取失败 | 清晰错误信息，命名锁持有者 | abort |
| 首次运行无 baseline | 持久化当前状态为 baseline | INCONCLUSIVE + note |

## Bugfix Tier Auto-Trigger

当 `project_phase = "bugfix"` 时，`/tinkerman verify` 自动触发，无需用户确认 [R1.7]。

## Debug Phase 4 Integration

`/tinkerman debug` 完成修复验证时，以 reproduction test 作为 Falsifiable_Claim 自动调用 Forge_Verify [R1.8]。
