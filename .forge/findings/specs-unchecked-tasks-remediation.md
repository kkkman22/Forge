# 详细修复建议 — 未完成任务收尾方案

> **审核日期**：2026-05-09
> **范围**：`.kiro/specs/` 下 5 个含未勾选任务的 spec
> **结论**：共 4 个 spec 存在可落地的缺项，按 spec 展开修复动作与验证方法。

## 目录

- [Spec 1 — phase-advance-hardening](#spec-1--phase-advance-hardening1-处偏差)
- [Spec 2 — oz-skills-inspiration](#spec-2--oz-skills-inspiration4-处偏差)
- [Spec 3 — cursor-team-kit-integration](#spec-3--cursor-team-kit-integration4-处偏差)
- [Spec 4 — cmux-integration](#spec-4--cmux-integration8-个集成测试缺失)
- [执行优先级建议](#执行优先级建议)

> 备注：`context-bloat-control` 下 9 条未勾选全部是 `*` 标记的可选测试任务，功能已完整实现，不进入修复清单。

---

## Spec 1 — phase-advance-hardening（1 处偏差）

### 偏差 1.1 · Task 15.1 — `glm-summary-ending.md` 档案不存在

**现状**：`evolved-rules.md` R3 条目的 `Source` 字段引用了 `.forge/knowledge/glm-summary-ending.md`，但该文件在 `.forge/knowledge/` 下不存在。该文件本应有"实施优先级"章节，需追加 phase-advance-hardening spec ID + 完成日期。

**两种修复路线（按偏好选一）**：

路线 A — 创建/补齐档案（符合原 spec 意图）：

1. 在 `.forge/knowledge/glm-summary-ending.md` 新建一个"实施优先级"章节，追加：
   ```markdown
   ## 实施优先级

   | Spec ID | 完成日期 | 状态 |
   |---|---|---|
   | phase-advance-hardening | 2026-05-08 | shipped |
   ```
2. 如果 R3 后续还有 R4（SKILL Reload After Context Recovery）等规则源自此文件，也一并登记。

路线 B — 改写 Source 字段（确认该档案已废弃）：

1. 编辑 `.forge/knowledge/evolved-rules.md` R3 条目的 `Source`，把 `.forge/knowledge/glm-summary-ending.md` 换成确实存在的证据来源（例如 `.forge/specs/phase-advance-hardening/requirements.md`）。
2. 运行 `npm run lint:rules` 确认一致。

**推荐**：先用 `grep -rn 'glm-summary-ending'` 搜一遍工作区，确认该档案是否真的曾经存在又被删掉。如果确实删了，走路线 B 更干净。

**验证**：

- 路线 A：`cat .forge/knowledge/glm-summary-ending.md | grep -q 'phase-advance-hardening'`
- 路线 B：`grep -rn 'glm-summary-ending' .forge/ CLAUDE.md` 应无输出。

---

## Spec 2 — oz-skills-inspiration（4 处偏差）

### 偏差 2.1 · Task 1.7 — `validate-skill-descriptions.mjs` 未默认 error 模式

**现状**：

- `src/skill-description.ts` 的 `ENFORCEMENT_MODE = "error"` ✓
- `scripts/validate-skill-descriptions.mjs` 默认仍 warning，`--strict` 才切 error
- `npm run check` 通过 `scripts/validate-skill-descriptions.sh` 调用，没传 `--strict`

**修复动作**：把 mjs 脚本默认切到 error，与 src 保持一致。

```diff
# scripts/validate-skill-descriptions.mjs
- const strict = args.includes("--strict");
+ const lenient = args.includes("--lenient");  // 新增逃生阀
+ const strict = !lenient;  // 默认严格
```

对应帮助文本改为：

```
--lenient  Downgrade sentence-count/imperative/use-when failures to warnings (default: strict)
```

**影响面审查**：切到 strict 后，所有 19 个 skill 的 description 必须过两句 + 祈使动词 + "Use when" 三条规则。先本地跑一下 `node scripts/validate-skill-descriptions.mjs` 看是否有 skill 还未被改写，有则先按 Task 1.5/1.6 补齐文案再切默认值。

**验证**：`npm run check` 绿灯。

### 偏差 2.2 · Task 2.6 — PR 模板缺 skill 勾选项

**现状**：`.github/pull_request_template.md` 存在但无 skeleton 相关勾选。

**修复动作**：在 `.github/pull_request_template.md` 末尾追加：

```markdown
## Skill Changes (if applicable)

- [ ] New or modified SKILL.md 包含 `## 2. Prerequisites` / `## 3. Workflow` / `## 4. Deliverable` 三段骨架
- [ ] 若不适用，已在 frontmatter 声明 `deliverable_exempt: true` 或 `skeleton_exempt_legacy: true` 并在描述中解释理由
- [ ] `bash scripts/validate-skill-skeleton.sh` 通过
- [ ] `node scripts/validate-skill-descriptions.mjs` 通过
```

**验证**：新开 PR 时模板里能看到上述勾选框。

### 偏差 2.3 · Task 5.12 — `src/review.ts` 未对接 `runLayer4FrontendCheck`

**现状**：

- `src/frontend-check.ts` 有 `scanVueTemplate` + `parseAxeResult` + `detectTierAvailability`，但没有 `scanVueProject` 驱动
- `src/review.ts` 完全没有 Layer 4 frontend-check 的集成点
- 因此 `/forge review` 即使在 Vue 项目里跑，也不会执行 frontend-check

**修复动作分两步**：

**Step A** — 在 `src/frontend-check.ts` 新增 `scanVueProject` 纯函数驱动：

```typescript
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

export function scanVueProject(
  projectRoot: string,
  rules: readonly VueA11yRule[],
  patterns: readonly string[] = ["src/**/*.vue", "src/**/*.tsx"],
): Vue3Violation[] {
  const violations: Vue3Violation[] = [];
  for (const pattern of patterns) {
    for (const file of globSync(pattern, { cwd: projectRoot, absolute: true })) {
      const content = readFileSync(file, "utf-8");
      violations.push(...scanVueTemplate(content, file, rules));
    }
  }
  return violations;
}
```

**Step B** — 在 `src/review.ts` 新增 driver，按 tier availability 分档执行：

```typescript
export async function runLayer4FrontendCheck(
  topic: string,
  projectRoot: string,
  tier: TierAvailability,
): Promise<Layer4Result> {
  // Tier A 恒真：静态扫描
  const rules = await loadFrontendCheckRules(projectRoot);
  const staticViolations = scanVueProject(projectRoot, rules);

  // Tier B/C：延迟实现（参考 frontend-check-tier-b.md / tier-c.md）
  // 首版可仅回写 Tier A 结果 + 标注 tier availability

  return {
    layer: 4,
    category: "decision",
    tierA: { violations: staticViolations },
    tierB: { status: tier.b, reason: tier.reasons.b },
    tierC: { status: tier.c, reason: tier.reasons.c },
  };
}
```

然后在现有 review 主流程里（`runReview` 或等价函数）调用并追加段落到 `.forge/reviews/<topic>.md`。

**Step C** — 新增集成测试 `test/review-layer4-frontend-check.test.ts`，fixture Vue 项目跑 `runLayer4FrontendCheck`，断言输出含 Vue3Violation + tier 状态。

**验证**：

- 单元：`npm test -- frontend-check`
- 集成：fixture Vue 项目 `.forge/reviews/<topic>.md` 有 `## Layer 4` 段落

### 偏差 2.4 · Task 6.16 — `src/ship.ts` 未对接 acceptance gate

**现状**：

- `commands/forge.md` 注册了 `--with-acceptance` / `--promote-derived` / `/forge accept`
- `src/accept.ts` / `accept-driver.ts` 实现了 parser、scenario 选择、runner 分发
- 但 `src/ship.ts` 里没有 `runAcceptanceGate`，ship 流程没任何接入

**修复动作**：在 `src/ship.ts` 新增 driver，由 ship 主流程按条件调用：

```typescript
import { parseScenariosFromSpec, selectScenariosForRun, aggregateVerdicts, renderAcceptanceReport } from "./accept.js";
import { runScenario } from "./accept-driver.js";

export interface AcceptanceGateResult {
  triggered: boolean;
  summary: { pass: number; fail: number; skip: number; warn: number };
  blocksShip: boolean;
  reportPath: string | null;
}

export async function runAcceptanceGate(
  topic: string,
  specFrontmatter: { acceptance_eval?: boolean; acceptance_blocks_ship?: boolean },
  cliFlags: { withAcceptance?: boolean; promoteDerived?: boolean },
  specContent: string,
  ctx: { projectRoot: string; cwd: string },
): Promise<AcceptanceGateResult> {
  const triggered =
    specFrontmatter.acceptance_eval === true || cliFlags.withAcceptance === true;
  if (!triggered) {
    return { triggered: false, summary: { pass: 0, fail: 0, skip: 0, warn: 0 }, blocksShip: false, reportPath: null };
  }

  const scenarios = parseScenariosFromSpec(specContent);
  const selected = selectScenariosForRun(scenarios, {
    promoteDerived: cliFlags.promoteDerived === true,
  });
  const artifacts = await Promise.all(selected.map((s) => runScenario(s, ctx)));
  const summary = aggregateVerdicts(artifacts);

  const blocksShip =
    specFrontmatter.acceptance_blocks_ship === true && summary.fail > 0;

  const report = renderAcceptanceReport({ topic, artifacts, summary });
  const reportPath = `.forge/reviews/${topic}-acceptance.md`;
  writeFileSync(join(ctx.projectRoot, reportPath), report, "utf-8");

  return { triggered: true, summary, blocksShip, reportPath };
}
```

然后在 ship 主函数里调用：

```typescript
const gate = await runAcceptanceGate(topic, specFm, cliFlags, specContent, ctx);
if (gate.blocksShip) {
  throw new ForgeError({ code: "ACCEPTANCE_FAIL", ... });
}
```

新增 `test/ship-acceptance-gate.test.ts` 覆盖 4 组合：

- spec.acceptance_eval=true × FAIL=0
- spec.acceptance_eval=true + blocks_ship=true × FAIL>0（阻断）
- cliFlags.withAcceptance=true（无视 spec flag）
- 未触发（两者都 false）

**验证**：

- `npm test -- ship-acceptance-gate`
- `npm run check` 绿灯

---

## Spec 3 — cursor-team-kit-integration（4 处偏差）

### 偏差 3.1 · Task 24.1 & 24.2 — agent frontmatter 未配 `background: true`

**现状**：`.claude/agents/quality-check.md` 与 `security-check.md` frontmatter 里都没 `background`。`spec-check.md` 没有符合预期（24.3 自然满足）。forge-review SKILL.md §18 文档有，但 agent 本身未生效。

**修复动作**：

```diff
# .claude/agents/quality-check.md
---
name: quality-check
description: ...
model: sonnet
maxTurns: 15
tools: Read, Glob, Grep
permissionMode: plan
memory: project
+background: true
---
```

```diff
# .claude/agents/security-check.md
---
name: security-check
description: ...
model: sonnet
maxTurns: 15
tools: Read, Glob, Grep, WebSearch
permissionMode: plan
memory: project
+background: true
---
```

**注意**：`spec-check.md` 保持**不**添加 background（Task 24.3 显式要求保持 foreground）。

**兼容性**：spec design.md §4.11 要求：

- Claude Code 旧版本会 gracefully ignore 未知字段（不破坏）
- forge-review fan-in 逻辑把背景 agent 失败标为 `failed` 而非 abort（Task 24.5）

需确认 `src/review.ts` 或 subagent-runner 里 fan-in 对 `failed` 状态的处理——如果目前是 `Promise.all` 会因一个 reject 导致整体 abort，需改为 `Promise.allSettled` 并把 rejected 标注到 Markdown 输出。快速查：

```bash
grep -n 'allSettled\|Promise.all' src/review.ts src/subagent-runner.ts
```

如果只用 `Promise.all`，补一个 fan-in 降级改造。

**验证**：

- `bash scripts/validate-skill-descriptions.sh` 仍绿
- 在 Claude Code 里跑 `/forge review` 观察 quality-check / security-check 是否以 background 模式启动
- 新增 `test/review-background-fan-in.test.ts`（mock 一个 agent 失败）断言其他两个继续完成且 Markdown 输出 schema 不变

### 偏差 3.2 · Task 25.1 & 25.2 — `findings_retention_days` 字段与 retention 清理缺失

**现状**：

- `.forge/config.md` 和 `templates/config.md` 都没 `findings_retention_days` 字段
- `scripts/prune-event-logs.sh` 虽然覆盖了 `.forge/reviews/assets/` 与 `.forge/acceptance/`，但未扩展到 `.forge/findings/`
- `.forge/findings/` 目前没有 retention 策略

**修复动作分三步**：

**Step A** — 在 `.forge/config.md` 和 `templates/config.md` 的 frontmatter 追加字段：

```yaml
---
project: "..."
...
event_log_retention_days: 30
findings_retention_days: 30   # 新增：.forge/findings/ 研究产物 retention
---
```

在"CI 检查命令"之后新增说明段落：

```markdown
## Findings Retention

`.forge/findings/` 目录下的研究产物按 `findings_retention_days`（默认 30 天）自动归档。
归档位置：`.forge/archive/findings/`。由 `scripts/prune-event-logs.sh` 在清理 runs 时同步执行。
```

**Step B** — 扩展 `scripts/prune-event-logs.sh`。在读取 retention 配置处新增：

```bash
# 复用现有 frontmatter 读取模式
FINDINGS_RETENTION_DAYS=30
if [[ -f "${CONFIG_FILE}" ]]; then
  CONFIGURED=$(sed -n '/^---$/,/^---$/p' "${CONFIG_FILE}" 2>/dev/null \
    | (grep -E '^findings_retention_days:' || true) \
    | head -1 | sed 's/findings_retention_days:[[:space:]]*//' \
    | tr -d '[:space:]')
  if [[ -n "${CONFIGURED:-}" ]] && [[ "${CONFIGURED}" =~ ^[0-9]+$ ]]; then
    FINDINGS_RETENTION_DAYS="${CONFIGURED}"
  fi
fi

FINDINGS_DIR=".forge/findings"
FINDINGS_ARCHIVE=".forge/archive/findings"

if [[ -d "${FINDINGS_DIR}" ]]; then
  STALE_FINDINGS=$(find "${FINDINGS_DIR}" -type f -mtime "+${FINDINGS_RETENTION_DAYS}" 2>/dev/null)
  if [[ -n "${STALE_FINDINGS}" ]]; then
    mkdir -p "${FINDINGS_ARCHIVE}"
    while IFS= read -r file; do
      [[ -z "${file}" ]] && continue
      if [[ "${DRY_RUN}" == "yes" ]]; then
        echo "would archive finding: ${file}"
      else
        mv "${file}" "${FINDINGS_ARCHIVE}/"
      fi
    done <<< "${STALE_FINDINGS}"
  fi
fi
```

关键点：**失败不阻塞活跃 run**（`|| true` 或严格的 `if -d` 判断）。按 Requirement 12.12 要求。

**Step C** — 新增测试 `test/prune-findings-retention.test.sh`（bats-core），覆盖：

1. 有配置字段 + 超期文件 → 归档
2. 无配置字段 → 用默认 30 天
3. `.forge/findings/` 不存在 → exit 0 不报错
4. `--dry-run` 只打印不移动

**验证**：

- `bash scripts/prune-event-logs.sh --dry-run` 输出包含 findings 条目
- `grep findings_retention_days templates/config.md` 有输出

### 偏差 3.3 · Task 21.4 — `.forge/ship/` 未登记 Open_Zone & `post_push_verify_enabled` 缺

**现状**：

- `.forge/config.md` 与 `templates/config.md` 的"开放区"清单里没有 `.forge/ship/*.md`
- templates/config.md 有 `ci_check_command` ✓，但无 `post_push_verify_enabled` 字段

**修复动作**：

**Step A** — 在两个文件的开放区清单追加：

```diff
 以下文件 AI 可以自由创建和修改：

 - `.forge/status.md`（状态更新）
 - `.forge/decisions/[0-9]*.md`（非 ADR 决策转录文档，...）
 - `.forge/runs/*/`（forge-loop 事件流...）
 - `.forge/findings/*.md`（研究发现）
 - `.forge/debug/*.md`（调试记录）
 - `.forge/knowledge/sessions/*.md`（会话上下文）
 - `.forge/knowledge/metrics.md`（指标追踪）
 - `.forge/knowledge/tool-health.md`（工具健康度）
 - `.forge/knowledge/skill-feedback.md`（SKILL 反馈）
+- `.forge/ship/*.md`（ship 阶段产物，含 post-push-verify 报告；保留 30 天）
```

**Step B** — 在 `templates/config.md` frontmatter 新增 `post_push_verify_enabled`：

```yaml
---
...
ci_check_command: ""
post_push_verify_enabled: true   # 新增：ship 后跑一次 ci_check_command 并可选留痕
---
```

同步到 `.forge/config.md`（如果当前仓库希望启用）。保持 optional 默认 true。

**Step C** — 确认 `src/ship.ts` 的 `executePostPushVerify` 读取了这个字段：

```bash
grep -n 'post_push_verify_enabled' src/ship.ts
```

如果没有，新增读取逻辑（缺失或 true 都执行，false 才跳过）。

**验证**：

- `grep post_push_verify_enabled templates/config.md` 有输出
- `grep '.forge/ship' .forge/config.md` 有输出

### 偏差 3.4 · Task 27.1 — `acceptance-matrix.md` 未创建

**现状**：`.kiro/specs/cursor-team-kit-integration/` 下无 `acceptance-matrix.md`。

**修复动作**：创建追溯矩阵文档，把 requirements.md 里 R1–R14 的 AC 与实现任务号 + 测试文件映射起来。

建议格式：

```markdown
# Acceptance Matrix — cursor-team-kit-integration

> Mapping R1–R14 acceptance criteria → implementation tasks → test files.
> Use as a pre-release review checklist.

| Requirement | AC | Task | Implementation | Test File |
|---|---|---|---|---|
| R1.1 | Three-state verdict output | 2.1/2.2 | `src/verdict-parser.ts` | `test/verify-verdict-totality.property.test.ts` |
| R1.10 | Baseline 4-level fallback | 3.1/3.2 | `src/baseline-resolver.ts` | `test/verify-baseline-resolver.test.ts` |
| R2.1 | Deslop dimension added | 6.1 | `.claude/agents/quality-check.md §7` | `test/contract.skills.test.ts` |
| R3.1 | rules/ starter set | 7.1 | `rules/*.md` | `test/rules-loader-starter-set.test.ts` |
| R4.1 | HTML canvas generation | 11.3 | `src/canvas-renderer.ts` | `test/canvas-renderer.integration.test.ts` |
| R5.1 | CLI tier detection | 14.5 | `src/cli-harness.ts` | `test/cli-harness-tier-selection.test.ts` |
| R6.2 | UI tier detection | 15.5 | `src/ui-harness.ts` | `test/ui-harness-tier-selection.test.ts` |
| R7.1 | Zone classification | 18.3 | `src/conflict-classifier.ts` | `test/conflict-classifier-totality.property.test.ts` |
| R8.1 | Post-push verify | 21.1 | `src/ship.ts#executePostPushVerify` | `test/ship-post-push-verify.test.ts` |
| R9.1 | Recap time window parsing | 22.3 | `src/recap.ts` | `test/recap-idempotent.property.test.ts` |
| R10.1 | From-chats extraction | 23.3 | `src/chat-preference-extractor.ts` | `test/from-chats-confidence.test.ts` |
| R11.1 | Background subagent flag | 24.1/24.2 | `.claude/agents/quality-check.md` frontmatter | — |
| R12.11 | Secret redaction | 9.1/9.2 | `src/secret-redactor.ts` | `test/secret-redactor.test.ts` |
| R13.1 | Zone totality invariant | 18.1 | `src/conflict-classifier.ts` | `test/conflict-classifier-totality.property.test.ts` |
| R14.1 | Bitbucket timeout handling | 10.1 | `src/bitbucket-mcp-adapter.ts` | `test/canvas-bitbucket-degradation.test.ts` |
```

把 requirements.md 里所有 AC 都登记一遍（上表只是样例，完整版需要逐条展开）。

**验证**：打开文件，按表格逐条点查对应测试文件存在即可。

---

## Spec 4 — cmux-integration（8 个集成测试缺失）

生产代码完整，缺的是 8 个 Sprint 3-4 的集成测试。建议分批补齐，每个测试文件都有现成的 mock-socket 基础设施可复用（`test/cmux-mirror/mock-socket.ts`）。

### 通用修复模板

所有 mirror-* 集成测试都遵循同一模式：

```typescript
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createMockSocket } from "./mock-socket.js";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("mirror — <scenario>", () => {
  let tmpDir: string;
  let socket: Awaited<ReturnType<typeof createMockSocket>>;
  let mirrorProc: ChildProcess;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "mirror-"));
    mkdirSync(join(tmpDir, ".forge", "progress"), { recursive: true });
    socket = await createMockSocket({ path: join(tmpDir, "cmux.sock") });
    mirrorProc = spawn("node", ["scripts/cmux-mirror/mirror.mjs"], {
      cwd: tmpDir,
      env: {
        ...process.env,
        CMUX_WORKSPACE_ID: "test",
        CMUX_SOCKET_PATH: socket.socketPath,
      },
    });
    // 等 daemon 就绪（observe 第一个 ping）
  });

  afterEach(async () => {
    mirrorProc.kill();
    await socket.close();
  });

  // it() 按各自场景填充
});
```

### 缺失 4.1 · Task 18.4 — `push-sh-integration.test.ts`

**场景**：

- socket 不存在时 `push.sh` exit 0 静默
- socket 存在时发 JSON，mock 收到

**要点**：

```typescript
it("exits 0 when socket missing", () => {
  const res = spawnSync("bash", ["scripts/cmux-mirror/push.sh", "resync_now"], {
    env: { ...process.env, CMUX_SOCKET_PATH: "/nonexistent" },
  });
  expect(res.status).toBe(0);
});

it("sends JSON when socket exists", async () => {
  await socket.listen();
  spawnSync("bash", ["scripts/cmux-mirror/push.sh", "resync_now"], {
    env: { CMUX_SOCKET_PATH: socket.socketPath },
  });
  expect(socket.requests).toContainEqual(
    expect.objectContaining({ type: "resync_now" }),
  );
});
```

### 缺失 4.2 · Task 19.3 — `mirror-fs-watch.test.ts`

**场景**（每条一个 it）：

1. 改写 `.forge/status.md` phase 字段 → 250ms 后看到 `cmux set-status` 调用
2. 写 `.forge/progress/topic.md` 标记任务完成 → `cmux set-progress` 被调用且 ratio 符合
3. 连续三次改写同一文件 → 只有最后一次被发送（防抖 250ms）

```typescript
it("emits set-status on phase change", async () => {
  writeFileSync(join(tmpDir, ".forge/status.md"), "---\nphase: build\n---\n");
  await waitFor(() => socket.requests.some((r) => r.method === "set-status"));
  const call = socket.requests.find((r) => r.method === "set-status");
  expect(call.params.state).toBe("build");
});
```

使用 `waitFor` helper 等异步事件（max 2s）。

### 缺失 4.3 · Task 19.4 — `mirror-polling-fallback.test.ts`

**场景**：环境变量 `MIRROR_USE_POLLING=1` 时仍能发射事件。

```typescript
it("falls back to polling when MIRROR_USE_POLLING=1", async () => {
  // spawn mirror with MIRROR_USE_POLLING=1
  // 写 status.md → 等事件（polling 默认 1s，设更短间隔测试用）
  writeFileSync(...);
  await waitFor(() => socket.requests.length > 0, { timeout: 5000 });
});
```

### 缺失 4.4 · Task 19.5 — `mirror-events-consume.test.ts`

**场景**：预置 events.ndjson 包含完整序列（`session_started` → `iter_started` × 2 → `circuit_breaker_tripped` → `loop_terminated`），断言 cmux set-status/set-progress/log/notify 按正确顺序被调用。

```typescript
const events = [
  { ts: "...", type: "session_started", schema_version: 1, run_id: "r1", objective: "..." },
  { ts: "...", type: "iter_started", schema_version: 1, run_id: "r1", i: 1 },
  { ts: "...", type: "circuit_breaker_tripped", schema_version: 1, run_id: "r1", reason: "..." },
  // ...
];
writeFileSync(join(tmpDir, ".forge/runs/r1/events.ndjson"), events.map(JSON.stringify).join("\n") + "\n");

await waitFor(() => socket.requests.some((r) => r.method === "notify" && r.params.body.includes("circuit")));
// 断言 set-status 调用了 forge.loop，且 notify 包含 circuit breaker 原因
```

### 缺失 4.5 · Task 19.6 — `mirror-review-observe.test.ts`

**场景**：

1. 写 `.forge/reviews/topic.md`，frontmatter `layers_status: { spec: pending, quality: pending, security: pending }`
2. 逐步改为 done → 每次触发一次 per-layer log
3. 三层全 done → 发出一次 aggregate notify（session 内同 topic 去重）
4. 旧格式（无 layers_status）→ 跳过聚合，body-diff 仍发 per-layer log

```typescript
it("emits per-layer log + final notify", async () => {
  writeReview({ layers_status: { spec: "pending", quality: "pending", security: "pending" } });
  updateReview({ spec: "done" });
  await waitFor(() => socket.requests.filter((r) => r.method === "log").length === 1);
  updateReview({ quality: "done" });
  updateReview({ security: "done" });
  await waitFor(() => socket.requests.some((r) => r.method === "notify"));
  const notifies = socket.requests.filter((r) => r.method === "notify");
  expect(notifies).toHaveLength(1);
});
```

### 缺失 4.6 · Task 19.7 — `mirror-session-boundary.test.ts`

**场景**：四种边界：

1. session-start：budget.reset 被调、`.cmux-respawn-count` 被重置
2. session-end：status 切 inactive
3. idle-timeout：模拟无活动 15 分钟后自动 active → inactive
4. event-triggered：某事件（例如 `loop_terminated`）触发立刻转 inactive

对于 idle-timeout 测试，使用 `vi.useFakeTimers()` 或给 session tracker 注入自定义 tick 函数加速。

### 缺失 4.7 · Task 19.8 — `mirror-push-socket.test.ts`

**场景**：

1. 发 `resync_now` → cmux set-status 被调用
2. 发白名单外 `force_notify` → 拒绝不调用
3. 连续 25 events/s → 多余的 5 个被丢弃

```typescript
it("rate limits to 20 events per second", async () => {
  for (let i = 0; i < 25; i++) {
    spawnSync("bash", ["scripts/cmux-mirror/push.sh", "resync_now"]);
  }
  await new Promise((r) => setTimeout(r, 1100));
  expect(socket.requests.filter((r) => r.method === "set-status").length).toBeLessThanOrEqual(20);
});
```

### 缺失 4.8 · Task 19.9 — `tmux-passthrough.test.ts`

**场景**：模拟 `$TMUX` + `$CMUX_WORKSPACE_ID` 同时设置，断言 notification 路径走 OSC_777 Passthrough 包装。

```typescript
it("uses OSC_777 passthrough when inside tmux", async () => {
  // spawn mirror with env TMUX=/tmp/tmux-xxx/default,123,0 + CMUX_WORKSPACE_ID=test
  // 触发一个 notify（写 status.md phase change）
  // 断言 cmux notify 调用时带有 OSC_777 特征（检查 cli.mjs 的 args 或 mock stdout）
});
```

这个测试可能需要在 `lib/cli.mjs` 里暴露一个 test hook（或让 mock-socket 识别 OSC_777 序列）。具体实现方式取决于 `cli.mjs` 当前如何决定是否走 passthrough。

### cmux-integration 验证总步骤

1. 逐个添加 8 个测试文件
2. `npm test -- cmux-mirror` 绿灯
3. 更新 README.md 的测试计数（当前写的是 25 tests，补完后是 33 tests）：

   ```
   - `test/cmux-mirror/` — 33 tests (including 10 property tests)
   ```

---

## 执行优先级建议

按"影响面 × 工作量"优先级排：

| 偏差 | Spec | 工作量 | 优先级 | 理由 |
|---|---|---|---|---|
| 2.3 Layer 4 集成 | oz-skills-inspiration | L（0.5d） | 🔴 高 | 产品能力缺失，frontend-check 无法被触发 |
| 2.4 Ship acceptance gate | oz-skills-inspiration | L（0.5d） | 🔴 高 | `/forge ship --with-acceptance` 命令存在但无效果 |
| 3.1 Agent background 配置 | cursor-team-kit-integration | S（5min + 兼容改造） | 🟡 中 | 有文档但 agent 自身未启用 |
| 3.2 findings retention | cursor-team-kit-integration | M（2h） | 🟡 中 | 长期运行会导致磁盘膨胀 |
| 4.1-4.8 cmux 集成测试 | cmux-integration | XL（1-2d） | 🟡 中 | 生产代码已齐，补测试属于防回归 |
| 2.1 validate default strict | oz-skills-inspiration | S（5min + 前置文案核查） | 🟢 低 | 功能 src 层已启用，只是 CI wrapper 未切 |
| 1.1 glm-summary-ending | phase-advance-hardening | S（5min） | 🟢 低 | 只是文档交叉引用 |
| 2.2 PR 模板勾选 | oz-skills-inspiration | S（2min） | 🟢 低 | 单纯流程改进 |
| 3.3 ship Open_Zone + post_push_verify_enabled | cursor-team-kit-integration | S（5min） | 🟢 低 | 配置登记 |
| 3.4 acceptance-matrix.md | cursor-team-kit-integration | M（30min） | 🟢 低 | 发布前清单，可晚做 |

**推荐分两批上线**：

- **第一批（高优 + 快项，~1 天）**：偏差 2.3 + 2.4 + 3.1 + 3.2 + 3.3 + 2.1 + 2.2 + 1.1 + 3.4
- **第二批（cmux 测试补全，1-2 天）**：偏差 4.1–4.8

---

## 附录 · 审核方法

- 读取 `.kiro/specs/*/tasks.md` 逐条核对未勾选（`- [ ]`）条目
- 对每条未勾选任务定位预期产物（源码文件、测试文件、配置字段、文档段落）
- 用 `grep_search` / `file_search` / `read_file` 验证产物是否存在且包含预期符号
- 已实现但未勾选的归为"实际完成"，真实缺失的归为"偏差"并给出最小修复路径
