---
status: locked
feature: zcode-p1-base-integration
layout: requirements
created: 2026-07-09
tier: light
---

# Forge × ZCode P1 基础接入 — 需求文档

## 背景

依据《Forge×ZCode 结合方案》v2 §8 P1 行。Forge 通过 GitHub 插件市场分发到 ZCode（`forge-official` marketplace），插件层已实测可用（hookCount=47，SessionStart/Stop 注入生效）。P1 是"基础接入"层——做最小改动让 Forge 在 ZCode 下可用，不动 plan/build/review/ship 的治理逻辑（那是 P2-P5）。

**前置事实**（来自 v2 复核）：
- 插件 hook 事件层通，29 条命令落在 ZCode 支持的 5 个事件，12 条在不支持事件静默跳过（设计预期）。
- `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PROJECT_DIR}` 在 plugin hook 下原生展开 + 注入环境变量（v2 §7.3 实测）。
- node 可用，.mjs 脚本零改动（v2 §6.3 撤销"改 bash"）。
- mjs hook 输出含 ZCode strict schema 不认的扩展字段（`reloadSkills`/`sessionTitle`/`updatedDisplay`/`hookEventName`），非阻断但产生 warn 噪声。

## 目标

1. `/forge init --platform zcode` 能生成 ZCode 工作区配置，补偿插件 hook 覆盖不到的场景。
2. Forge mjs hook 在 ZCode 下的 stdout JSON 符合 ZCode strict schema，消除校验 warn 噪声，同时 Claude 侧行为不变。
3. 用可复跑的证据确认 evolved-rules 注入、模板变量展开、agent 加载三项在 ZCode 下实际生效。

## 术语

- **ZCode strict schema**：ZCode 把 hook stdout 解析为 JSON，任何非白名单 key 会校验失败（warn 级，丢弃输出但不阻断）。白名单 key：`additionalContext`、`decision`（PreToolUse）、`updatedToolOutput`、Stop 的 continuation 字段。见 zcode-guide `diagnosing-hooks` pitfall #8。
- **工作区配置型 hook**：写在 `<repo>/.zcode/config.json` 的 `hooks.events.<Event>`，需 `hooks.enabled:true`，用于补充插件 hook 覆盖不到的场景（如 ZCode 不支持的 PreCompact 事件，用 Stop 补偿）。
- **双平台透明**：同一份 skills/commands/agents/hooks/.claude-plugin 源码，Claude Code 与 ZCode 共享。任何改动必须使 Claude Code 侧行为不变。
- **平台裁剪**：hook 输出前探测运行时是否为 ZCode，若否则保留全部字段（Claude 侧行为不变），若是则仅输出白名单字段。

## 约束

- **不撤销 v2 结论**：P1 不得复活 v2 已撤销的三项（"改 bash" / "建 shim" / "12 失败诊断"）。mjs 脚本不得为兼容 ZCode 而改写为 .sh；不得新建 platform-paths 跨平台路径 shim；不得把 ZCode host 的 `file.stat` 探测误诊为 hook 脚本失败。
- **双平台共享源码**：skills/commands/agents/hooks/.claude-plugin 是 Claude Code 与 ZCode 共享的单一真相源。改动必须对 Claude Code 透明。
- **不碰治理逻辑**：P1 只做基础接入验证 + 配置生成，不动 plan/build/review/ship 的治理逻辑。
- **写行为不写实现**：本 spec 禁止类名/函数名/具体文件路径作为验收条件（detectSpecLeak 会检查）。

## 需求

### Requirement 1: 工作区配置生成（--platform zcode）

**User Story:** 作为 ZCode 上的 Forge 用户，我希望运行 `/forge init --platform zcode` 时自动生成工作区级 ZCode 配置，补一个 Stop 事件 hook 注入 Forge 状态摘要，作为 PreCompact 不支持的补偿。

#### 验收标准

1. THE init 流程 SHALL 接受 `--platform zcode` 标志，且未传该标志时行为与现状完全一致（Claude Code 侧透明）。
2. WHEN `--platform zcode` 被传入，THE init SHALL 在项目根创建 `.zcode/config.json`，包含 `hooks.enabled: true`。
3. THE 生成的配置 SHALL 在 `hooks.events.Stop` 注册一条命令型 hook，其作用是把 `.forge/status.md` 的摘要作为 additionalContext 注入对话（compact 后首条消息即带状态）。
4. THE Stop hook 命令 SHALL 通过 `${CLAUDE_PLUGIN_ROOT}` 或 `${ZCODE_PROJECT_DIR}` 解析到 Forge 提供的脚本，不硬编码绝对路径。
5. IF `.zcode/config.json` 已存在，THE init SHALL 不覆盖（幂等），仅 warn 提示用户手动合并。
6. THE init 完成输出 SHALL 列出生成的 `.zcode/config.json` 及其用途说明（"Stop 注入 status.md 作为 compact 补偿"）。
7. THE 生成的配置 SHALL 是合法 JSON，且 `hooks.events` 下的事件名仅使用 ZCode 支持的七事件之一。

**Verify-By:** 在干净临时目录跑 `init --platform zcode`，断言 `.zcode/config.json` 存在、`hooks.enabled===true`、`hooks.events.Stop` 非空、命令字符串含模板变量而非绝对路径；再次跑断言不覆盖；不带 `--platform` 跑断言不生成该文件。

### Requirement 2: hook stdout JSON 平台裁剪

**User Story:** 作为 ZCode 上的 Forge 用户，我希望 Forge 的 SessionStart/Stop/PostToolUse hook 输出的 JSON 不触发 ZCode 的 strict schema 校验失败告警，同时 Claude Code 侧仍能拿到 reloadSkills/sessionTitle 等扩展字段。

#### 验收标准

1. THE 在 ZCode 运行时下（探测条件由设计文档定义），Forge 任何 mjs hook 输出到 stdout 的 JSON SHALL 仅包含 ZCode 白名单 key（`additionalContext`、`decision`、`updatedToolOutput`、Stop continuation 字段）。
2. THE 在非 ZCode（Claude Code）运行时下，THE 同一 hook SHALL 输出与现状完全相同的 JSON（含 reloadSkills/sessionTitle/hookEventName/updatedDisplay 等扩展字段），行为不变。
3. THE 平台探测 SHALL 基于运行时环境信号（不依赖配置文件、不依赖用户手动开关），且在探测失败时保守地按 Claude Code 行为输出（失败安全：宁可 ZCode 侧留 warn，也不破坏 Claude 侧）。
4. THE 裁剪逻辑 SHALL 集中在一处共享判定（不分散到每个 hook 各自判断），避免双平台行为漂移。
5. THE 裁剪 SHALL 仅删非白名单 key，保留白名单 key 的值与结构不变（additionalContext 内容、decision 的 systemMessage 等不因裁剪而改变）。
6. THE 裁剪后 Claude Code 侧的 reloadSkills/sessionTitle 行为 SHALL 有回归断言保护（防止后续误删扩展字段回归到 Claude 侧）。

**Verify-By:** 对每个受影响 hook，用模拟的 ZCode 环境信号跑一次、用模拟的 Claude 环境跑一次，断言前者输出 key 集合 ⊆ 白名单、后者输出 key 集合 == 现状基线；回归脚本固化两个基线快照。

### Requirement 3: evolved-rules SessionStart 注入验证

**User Story:** 作为 ZCode 上的 Forge 用户，我要确认 SessionStart hook 确实把 `.forge/knowledge/evolved-rules.md` 的规则注入到了对话上下文。

#### 验收标准

1. THE 验证 SHALL 产出一份可复跑的回归脚本，脚本能模拟 SessionStart hook 输入并执行 evolved-rules 注入 hook。
2. THE 回归脚本 SHALL 断言：当 `.forge/knowledge/evolved-rules.md` 存在时，hook stdout 的 additionalContext 非空且含规则内容摘要。
3. THE 回归脚本 SHALL 断言：当该文件不存在时，hook 静默退出（无输出、exit 0）。
4. THE 验证 SHALL 记录一份证据文档，含实测命令、stdout 快照、判定（通过/失败）与运行日期。
5. THE 证据文档 SHALL 说明 ZCode SessionStart 触发路径（插件 hook 自动启用，无需 `hooks.enabled:true`）与注入生效的判据（additionalContext 进入对话）。

**Verify-By:** 运行回归脚本全部断言通过；证据文档含可追溯的 stdout 快照。

### Requirement 4: 模板变量展开验证

**User Story:** 作为 ZCode 上的 Forge 用户，我要确认 `${CLAUDE_PLUGIN_ROOT}` 与 `${CLAUDE_PROJECT_DIR}` 在 ZCode plugin hook 下被原样展开（而非留作字面量或空串），保证 hook 命令的 fallback chain 第一段命中。

#### 验收标准

1. THE 验证 SHALL 产出可复跑回归脚本，在 ZCode plugin hook 上下文下捕获 `${CLAUDE_PLUGIN_ROOT}` 与 `${CLAUDE_PROJECT_DIR}` 的实际展开值。
2. THE 回归脚本 SHALL 断言两个变量均被展开为非空合法路径（非字面 `${...}`、非空串）。
3. THE 回归脚本 SHALL 断言展开后的路径指向 Forge 插件实体目录与项目根目录。
4. THE 证据文档 SHALL 记录 zcode-guide `diagnosing-hooks` 关于"plugin hook 下 `${CLAUDE_*}` 原样展开 + 注入环境变量"的原文依据，并附实测值对照。
5. THE 验证 SHALL 覆盖"命令字符串展开"与"环境变量注入"两条路径（hook 命令里的模板变量展开 + 脚本内读取注入环境变量，两者都拿到真实值）。

**Verify-By:** 回归脚本两条断言通过；证据文档含命令展开值 + env 注入值的实测快照。

### Requirement 5: agent 加载验证

**User Story:** 作为 ZCode 上的 Forge 用户，我要确认 Forge 的全部 agent 角色在 ZCode 下可被发现并加载（插件 `agents` 目录字段被 ZCode 识别），不因 `CLAUDE_AGENTS_DIR` 非标准变量而失效。

#### 验收标准

1. THE 验证 SHALL 产出可复跑回归脚本，枚举 Forge 插件 agents 目录下的全部 agent 角色文件。
2. THE 回归脚本 SHALL 断言 agent 角色数量与 Forge 声明的角色数一致（24 个，排除 README）。
3. THE 回归脚本 SHALL 断言每个 agent 文件是合法 markdown 且含 frontmatter（ZCode 加载前置）。
4. THE 验证 SHALL 确认 agent 目录定位不依赖 ZCode 不注入的环境变量（`CLAUDE_AGENTS_DIR`），而是经插件 `agents` 字段或 cwd 回退解析。
5. THE 证据文档 SHALL 记录 ZCode 识别插件 agents 字段的依据（zcode-guide plugin manifest 字段说明），并附 agent 角色清单与加载判据。

**Verify-By:** 回归脚本全部断言通过；证据文档含 24 角色清单 + 加载机制判定。

### Requirement 6: 双平台透明回归（横切）

**User Story:** 作为 Forge 维护者，我要确保 P1 的所有改动对 Claude Code 侧行为零影响，有回归保护防漂移。

#### 验收标准

1. THE P1 全部改动 SHALL 在不带 `--platform zcode` 的默认路径下，使 init 流程产物与改动前逐字节一致（`.forge/`、`.claude/`、`CLAUDE.md`、`.mcp.json` 均不变）。
2. THE P1 的 hook 裁剪改动 SHALL 在 Claude Code 运行时信号下，使受影响 hook 的 stdout 与改动前逐字节一致。
3. THE P1 SHALL 提供一个聚合回归入口，一键跑完 R3/R4/R5 的验证脚本 + R6.1/R6.2 的透明性断言。
4. THE 聚合回归 SHALL 在 CI 或本地可重复运行，失败时清晰指出是哪一项回归。

**Verify-By:** 聚合回归脚本在 Claude Code 路径下全部通过，产物 byte-equal 断言成立。

## 验收标准（整体）

- [ ] R1: `init --platform zcode` 生成合规 `.zcode/config.json`（含 Stop status 注入 hook），幂等不覆盖，不带标志不生成。
- [ ] R2: mjs hook 在 ZCode 下输出仅白名单 key，在 Claude 下输出与现状一致。
- [ ] R3: evolved-rules 注入回归脚本通过，证据文档归档。
- [ ] R4: 模板变量展开回归脚本通过，证据文档归档。
- [ ] R5: agent 加载回归脚本通过（24 角色），证据文档归档。
- [ ] R6: 双平台透明聚合回归通过。

## 依赖

- 《Forge×ZCode 结合方案》v2 §6.3/§6.4/§6.5/§7.3/§8 P1 行。
- zcode-guide 插件 `diagnosing-hooks` / `zcode-configuration-guide` SKILL。
- Forge 现有 `scripts/init.sh`（init 实现）与 `hooks/hooks.json`（41 命令清单）。

## 非目标

- **不**改 mjs 脚本为 .sh（v2 已撤销"改 bash"）。
- **不**建 platform-paths 跨平台 shim（v2 已撤销"建 shim"）。
- **不**动 plan/build/review/ship 治理逻辑（P2-P5）。
- **不**处理 PreCompact 不支持的完整补偿（仅 Stop 注入作为最小补偿，完整 compact 补偿是 P4 纪律恢复）。
- **不**改 hooks.json 事件结构（v2 §7.1 明确保持原样，不支持事件静默跳过是设计预期）。
