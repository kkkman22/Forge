---
status: retired-partial
feature: build-goal-replace-loop
layout: requirements
created: 2026-05-30
tier: standard
status_note: "Req1 (/goal drives TDD loop, skills/forge/lib/build/instructions.md §3.2a), Req3 (build.use_goal config + template), Req5 (CI sandbox SANDBOX_FAIL_IF_UNAVAILABLE) all delivered. Req2's literal AC (persistent-loop.sh retains phase-transition responsibility, reduced but not removed) SUPERSEDED: persistent-loop.sh was entirely deleted by forge-loop-native-fusion; phase transition now lives in the native loop SKILL + stop-*.mjs scripts. Intent satisfied (phase transitions work), literal 'persistent-loop.sh retains reduced responsibility' AC cannot hold post-fusion. Req4 (loop instructions document /goal) delivered in lighter form."
---
# Build /goal 替代 persistent-loop + CI sandbox — 需求文档

## 引言

Forge 的 `persistent-loop.sh` 在 Stop hook 中运行，负责两件事：（1）build 内的 TDD 循环（RED→GREEN→REFACTOR）；（2）阶段间转换（plan→build→review→test→ship）。这两个职责耦合在一起，导致循环逻辑难以调优、TDD 循环的状态追踪不透明。

Claude Code 2.1.139 引入 `/goal` 命令：设定一个目标条件，Claude 自动循环直到目标满足，显示 live elapsed/turns/tokens。这天然适合 build 内的 TDD 循环——设定目标为"所有 plan 任务完成 + `npm run check` 通过"，/goal 自动迭代。

同时，Claude Code 2.1.83 的 `sandbox.failIfUnavailable` 确保 CI 中 sandbox 不可用时阻断，防止绕过安全边界。

本特性用 `/goal` 替代 `persistent-loop.sh` 的 TDD 循环职责，并添加 CI sandbox 安全配置。

**来源**：Claude Code CHANGELOG §84 `/goal` 命令 `[2.1.139]`、§69 `sandbox.failIfUnavailable` `[2.1.83]`。

**设计决策**：§84 替代 persistent-loop.sh —— `/goal` 接管 build 内 TDD 循环，persistent-loop.sh 仅保留 phase transition。

## 术语

- **/goal**：Claude Code v2.1.139+ 的内置命令，设定目标条件后自动循环迭代，显示 live 进度（elapsed/turns/tokens）。
- **persistent-loop.sh**：Forge 当前的循环脚本，在 Stop hook 中运行，负责 TDD 循环 + phase transition。
- **Phase Transition**：Forge 工作流的阶段间切换（plan→build→review→test→ship），由 persistent-loop.sh 检测当前 phase 并自动进入下一阶段。
- **TDD Loop**：build 阶段内的 RED→GREEN→REFACTOR 循环，逐个完成 plan 中的 task。
- **Three-Strike Reroute**：同一修复连续失败 3 次时进入 `/forge debug`（CLAUDE.md §2.4 铁律）。
- **SANDBOX_FAIL_IF_UNAVAILABLE**：环境变量，设为 `1` 时 sandbox 不可用则阻断执行。

## 需求

### Requirement 1: /goal 替代 build 内 TDD 循环

**User Story:** 作为 Forge 用户，我希望 build 阶段使用 /goal 自动迭代 TDD 循环，以获得更透明的进度追踪和更可靠的状态管理。

#### 验收标准

1. THE `skills/forge/lib/build/instructions.md` SHALL 在 build 执行流程中使用 `/goal` 替代 persistent-loop.sh 的 TDD 循环职责。
2. THE `/goal` 的目标条件 SHALL 为："所有 plan 中的 task 已完成 AND `ci_check_command` 通过"。
3. THE `/goal` 循环 SHALL 在每个迭代中执行 RED→GREEN→REFACTOR 步骤，逐步完成 plan task。
4. WHEN 同一 task 连续失败 3 次，THE `/goal` 循环 SHALL 触发 Three-Strike Reroute（进入 `/forge debug`）。
5. THE `/goal` 循环 SHALL 显示 live 进度：elapsed time、turns、tokens consumed（/goal 内置功能）。
6. THE `/goal` 循环 SHALL 不暂停等待用户确认（遵循 §2.7 铁律）。

### Requirement 2: persistent-loop.sh 职责缩减

**User Story:** 作为 Forge 维护者，我希望 persistent-loop.sh 只负责 phase transition，不再负责 build 内循环。

#### 验收标准

1. THE `persistent-loop.sh` SHALL 保留 phase transition 逻辑：检测 `.forge/status.md` 的当前 phase，当 phase 未完成时自动触发下一阶段。
2. THE `persistent-loop.sh` SHALL NOT 再包含 TDD 循环逻辑（由 `/goal` 接管）。
3. THE `persistent-loop.sh` SHALL 保留在 `plugin.json` 的 Stop hook 中注册（phase transition 仍然需要）。
4. WHEN phase 为 `build`，THE persistent-loop.sh SHALL NOT 触发循环（/goal 在 build instructions 内处理）。

### Requirement 3: build.use_goal 配置项

**User Story:** 作为 Forge 用户，我希望可以配置是否使用 /goal，以支持回退到旧循环机制。

#### 验收标准

1. THE `.forge/config.md` SHALL 新增 `build.use_goal: true` 配置项（默认值 `true`）。
2. WHEN `build.use_goal` 为 `true`，THE build skill SHALL 使用 `/goal` 循环。
3. WHEN `build.use_goal` 为 `false`，THE build skill SHALL 回退到当前行为（依赖 persistent-loop.sh）。
4. THE `forge init` 模板 SHALL 包含 `build.use_goal: true`。

### Requirement 4: loop skill instructions 更新

**User Story:** 作为 Forge 用户，我希望 `/forge loop` 的文档反映新的循环机制。

#### 验收标准

1. THE `skills/forge/lib/loop/instructions.md` SHALL 更新说明：build 内循环由 `/goal` 驱动。
2. THE loop instructions SHALL 说明 persistent-loop.sh 的新职责范围（仅 phase transition）。
3. THE loop instructions SHALL 保留 dynamic mode 和 scheduled mode 的说明（不受影响）。

### Requirement 5: CI sandbox 安全配置

**User Story:** 作为 CI 管理者，我希望 CI 中 sandbox 不可用时阻断执行，以防止绕过安全边界。

#### 验收标准

1. THE `.github/workflows/ci.yml` 的 `check` job 中需要 Claude Code 运行的 step SHALL 添加环境变量 `SANDBOX_FAIL_IF_UNAVAILABLE: "1"`。
2. THE sandbox 配置 SHALL 仅应用于需要 Claude Code 运行的 step（如 ultrareview），普通 npm test step 不需要。
3. THE sandbox 配置 SHALL 包含注释说明安全边界的目的。

### Requirement 6: 向后兼容

**User Story:** 作为现有 Forge 用户，我希望 `build.use_goal: false` 时行为与升级前完全一致。

#### 验收标准

1. WHEN `build.use_goal` 为 `false`，THE build 流程 SHALL 与升级前完全一致（使用 persistent-loop.sh）。
2. WHEN `.forge/config.md` 无 `build.use_goal` 字段，THE 默认值 SHALL 为 `true`（新行为）。
3. ALL 现有测试 SHALL 在变更后继续通过。
