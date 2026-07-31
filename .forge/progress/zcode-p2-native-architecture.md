# Progress — zcode-p2-native-architecture（运行期 HostAdapter + capability-driven 治理）

> Spec: `.forge/specs/zcode-p2-native-architecture/`（draft, supersedes P1 non-goals only）
> Branch: `forge/audit-2026-07-26-remediation`
> 来源: `docs/zcode-dual-platform-adaptation.md`（架构级重构提案）

## 背景与目标

P1（locked）验证了"插件格式兼容"，non-goals 把"内核解耦 + 治理参数化"推迟到 P2。本 Spec 正式
supersede P1 的两条 non-goal（"不建 shim" / "不动治理逻辑"），引入 **运行期 HostAdapter 架构 +
capability-driven 治理派生**：一套内核，运行期注入 Adapter；治理参数由模型能力单源派生，非平台名。

## Wave 进度（全部完成）

- [x] **Spec** — requirements.md（6 Req）/ design.md / tasks.md（12 TDD task），frontmatter 显式
  `supersedes: [zcode-p1-base-integration (non-goals only)]`。
- [x] **R1 HostAdapter 抽象** — `src/host/{types,capabilities,claude-adapter,zcode-adapter}.ts`。
- [x] **R2 governance 派生** — `src/host/governance.ts`（capability-driven，config override）。
- [x] **R3 探测 + 单例** — `src/host/detect.ts`（失败安全 + `getHostAdapter()` 单例 + reset）。
- [x] **R4 耦合收敛** — path-resolve/session-id 改经 adapter；`checkHostVersion()` Zcode 旁路 CC 门禁。
- [x] **R5 Zcode 产物** — `.zcode-plugin/plugin.json` + 顶层 `marketplace.json`。
- [x] **R6 透明回归 + V13** — 8 个测试文件，全绿；P1 verify 继承通过。

## Final Validation

`npm run check` **EXIT=0**（tsc + biome + vitest + readme/docs/dist/bundle 全过）。
`node scripts/zcode-p1-verify.mjs` **全 PASS**（P1 透明回归未回滚）。
新增 host 测试 **74 个**（types/adapters/governance/detect/path-resolve/compatibility/V13/manifest）。

## REQ 覆盖

| REQ | 状态 | 交付 |
|-----|------|------|
| R1 HostAdapter 抽象 | ✅ | `src/host/types.ts`（接口）+ Claude/Zcode 两实现，结构性属性 + 模型能力契约（Claude 200K / GLM-5.2 1M） |
| R2 capability-driven 派生 | ✅ | `src/host/governance.ts` `deriveGovernance`；三场景契约（Claude 160K / GLM-5.2 800K / 未来 1M）；config override；铁律边界不动 |
| R3 探测 + 失败安全 | ✅ | `src/host/detect.ts`；信号清单与 P1 `zcode-platform.mjs` 逐字一致；单例 + reset |
| R4 CLAUDE_* 收敛 | ✅ | `path-resolve.ts` → adapter.paths()；session-id 由 adapter 持有；`checkHostVersion()` Zcode 旁路 |
| R5 Zcode 产物 | ✅ | `.zcode-plugin/plugin.json`（userConfig 三项）+ `marketplace.json`；Claude manifest 不变 |
| R6 透明回归 + V13 | ✅ | `capability-adaptation.test.ts`（未来 Claude 1M 零代码自适应）；P1 verify 继承 |

## V13 决定性证据（capability-driven > 配置开关）

`test/host/capability-adaptation.test.ts` 模拟"未来 Claude 1M 模型"（contextWindow=1M, Long Horizon），
喂给同一个 `deriveGovernance`，断言自动输出 GLM-5.2 形策略（budget=800K / worker optional /
并发 8 / inline-lean / 含 reasoningEffort）—— **零代码改动**。配置开关（`if(isZcode)`）与
Strategy（`GlmBudget` 类）方案做不到：两者都要改代码才能处理 Claude 1M。

## 铁律边界（未触碰）

TDD / 验证 / 三振 / 隔离评审 / P0-P1 阻断 / Knowledge / Frozen Zone / Spec 系统 / gate 阈值
（`review_confidence_threshold` 等）—— 全部未进 `deriveGovernance`，宪法 §5.6 immutable。

## 双平台透明（capability-equal）

- Claude env：探测→ClaudeAdapter（失败安全）；派生→P1 后基线（160K/required/6/auto）；path/session/version→byte-equal。
- GLM-5.2 env：探测→ZcodeAdapter；派生→800K/optional/8/inline-lean。
- P1 代码（`zcode-platform.mjs` / `.zcode/config.json` 生成 / 三项验证）保留为 fallback 安全网，未删除。
