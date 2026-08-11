---
status: locked
feature: zcode-p1-base-integration
layout: tasks
created: 2026-07-09
tier: light
---

# Forge × ZCode P1 基础接入 — 任务拆解

## 任务总览

| Task | 类型 | 对应 Req | TDD | 依赖 |
|---|---|---|---|---|
| T1 init `--platform` flag 解析 | 改动型 | R1 | 是 | - |
| T2 ZCode 配置生成步骤（Stop hook） | 改动型 | R1 | 是 | T1 |
| T3 init 幂等 + 输出汇总 | 改动型 | R1 | 是 | T2 |
| T4 平台探测共享判定 | 改动型 | R2 | 是 | - |
| T5 hook 输出裁剪（inject-evolved-rules） | 改动型 | R2 | 是 | T4 |
| T6 hook 输出裁剪（message-display） | 改动型 | R2 | 是 | T4 |
| T7 evolved-rules 注入回归脚本 | 验证型 | R3 | 是 | - |
| T8 模板变量展开回归脚本 | 验证型 | R4 | 是 | - |
| T9 agent 加载回归脚本 | 验证型 | R5 | 是 | - |
| T10 证据文档三份 | 验证型 | R3/R4/R5 | 否 | T7/T8/T9 |
| T11 双平台透明聚合回归 | 横切 | R6 | 是 | T2/T5/T6/T7/T8/T9 |

每个 task 可独立 build → review → test，按列出的 TDD 步骤推进。

---

## T1: init `--platform` flag 解析

**目标**：init 接受 `--platform <name>` 标志，值校验仅 `zcode`，其他值 warn 不阻断；未传时行为不变。

**TDD**：
1. RED：写测试——`init --help` 输出含 `--platform`；`--platform zcode` 不报错；`--platform unknown` warn 但 exit 0；不带 `--platform` 时后续步骤不触发 ZCode 分支。
2. GREEN：在 init 的 flag 解析循环加 `--platform` case，存入变量；`--help` 文本加一行说明。
3. REFACTOR：校验逻辑（仅 `zcode` 合法）抽成独立判定。

**Done**：R1 AC1 满足；不带标志路径 byte-equal 基线（R6.1）。

---

## T2: ZCode 配置生成步骤（Stop hook）

**目标**：当 `--platform zcode` 时，在 `.tinkerman/` 创建后生成 `.zcode/config.json`，含 `hooks.enabled:true` + `hooks.events.Stop` 注入 status.md 摘要。

**TDD**：
1. RED：写测试——在临时目录跑 `init --platform zcode --non-interactive`，断言 `.zcode/config.json` 存在；解析 JSON 断言 `hooks.enabled===true`、`hooks.events.Stop` 是非空数组、数组元素的 command 含 `${CLAUDE_PLUGIN_ROOT}` 或 `${ZCODE_PROJECT_DIR}`（非绝对路径）；断言是合法 JSON。
2. GREEN：在 init Step 2 后插入"Step Z"：mkdir `.zcode/`，写 config.json（heredoc 或 node 写）。Stop 命令指向 Forge 提供的 status 摘要脚本（用现有 fallback chain 风格 `${CLAUDE_PLUGIN_ROOT:-}/scripts/... || ... || true`）。
3. REFACTOR：config.json 内容若复杂，抽成模板文件（与现有 templates/ 风格一致）。

**Done**：R1 AC2/AC3/AC4/AC7 满足。

**设计决策**：status 摘要脚本——若 Forge 已有读 status.md 的脚本（如 stop-additional-context 系列）则复用其摘要逻辑；否则新增一个极简脚本读 `.tinkerman/status.md` 头部输出 additionalContext。P1 取极简路径。

---

## T3: init 幂等 + 输出汇总

**目标**：`.zcode/config.json` 已存在时不覆盖（warn）；init 完成输出列出生成的文件。

**TDD**：
1. RED：写测试——预置 `.zcode/config.json` 后跑 init，断言文件内容不变；断言 stdout 含 warn 提示；跑 `--platform zcode` 后断言完成输出含 `.zcode/config.json` 行。
2. GREEN：生成前 `[ -f .zcode/config.json ]` 检查，存在则 warn 跳过；完成清单追加 `.zcode/config.json` 行（条件性，仅 `--platform zcode`）。
3. REFACTOR：幂等检查与现有 `.claude/settings.json` 合并检查风格对齐。

**Done**：R1 AC5/AC6 满足。

---

## T4: 平台探测共享判定

**目标**：提供一处共享的"当前是否 ZCode 运行时"判定 + "按平台裁剪 hook 输出"能力，供各 hook 复用。

**TDD**：
1. RED：写测试——模拟 `ZCODE_PLUGIN_ROOT` 存在 → 判定 true；模拟全无 `ZCODE_*` → 判定 false（保守按 Claude）；模拟 `ZCODE_PROJECT_DIR` 存在但 `ZCODE_PLUGIN_ROOT` 不在 → 判定 true。裁剪函数：输入含 reloadSkills 的对象 + ZCode 信号 → 输出仅白名单 key；输入同对象 + Claude 信号 → 输出不变。
2. GREEN：在 hook 公共库目录新增判定 + 裁剪模块。探测读 `ZCODE_PLUGIN_ROOT` / `ZCODE_PROJECT_DIR` / `ZCODE_SESSION_ID`（任一存在即 ZCode）。裁剪按事件白名单删 key。
3. REFACTOR：白名单 key 清单集中为常量表，按事件分组。

**Done**：R2 AC3/AC4 满足；模块可被 T5/T6 import。

**设计决策**：探测信号选 `ZCODE_*` 而非 `CLAUDE_*`——因为 `CLAUDE_*` 在 ZCode plugin hook 下也注入（v2 §7.3），无法区分；`ZCODE_*` 仅 ZCode 注入，是可靠的判别信号。

---

## T5: hook 输出裁剪（inject-evolved-rules）

**目标**：inject-evolved-rules 在 ZCode 下仅输出 `additionalContext`（删 hookSpecificOutput 含 reloadSkills/sessionTitle/hookEventName），Claude 下输出不变。

**TDD**：
1. RED：写测试——ZCode 信号下跑 hook，断言 stdout JSON keys ⊆ {additionalContext}；Claude 信号下跑，断言 stdout 含 hookSpecificOutput.reloadSkills===true 且（有 spec 时）sessionTitle。录两份基线快照。
2. GREEN：在 hook 的 `process.stdout.write(JSON.stringify(output))` 前调 T4 裁剪函数。
3. REFACTOR：无（裁剪逻辑在 T4）。

**Done**：R2 AC1/AC2/AC5/AC6（inject-evolved-rules 部分）满足。

---

## T6: hook 输出裁剪（message-display）

**目标**：message-display-hook 在 ZCode 下删 `hookSpecificOutput.updatedDisplay`（非白名单），Claude 下不变。

**TDD**：
1. RED：写测试——ZCode 信号下断言输出不含 updatedDisplay；Claude 信号下断言含 updatedDisplay 且值不变。录基线。
2. GREEN：在该 hook 输出前调裁剪函数。
3. REFACTOR：无。

**Done**：R2 AC1/AC2/AC6（message-display 部分）满足。

**注意**：盘点确认其余 hook（stop-additional-context 的 additionalContext、config-changed-hook 的 additionalContext、posttooluse-inject-warnings 的 updatedToolOutput）已在白名单，本 task 不动它们。

---

## T7: evolved-rules 注入回归脚本

**目标**：可复跑回归脚本，模拟 SessionStart stdin 跑 inject-evolved-rules，两场景断言。

**TDD**：
1. RED：写测试脚本——场景 A（有 evolved-rules.md）断言 additionalContext 非空含 Content；场景 B（无文件）断言静默 exit 0。
2. GREEN：实现脚本：预置临时 `.tinkerman/knowledge/evolved-rules.md`，用 child_process 跑 hook 喂 stdin，捕获 stdout/exit code，跑断言。
3. REFACTOR：脚本与现有 scripts/ 回归脚本风格对齐（如 check-*-sync.mjs）。

**Done**：R3 AC1/AC2/AC3 满足。脚本放 scripts/ 下，可独立 `node scripts/...mjs` 跑。

---

## T8: 模板变量展开回归脚本

**目标**：可复跑回归脚本，验证 `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PROJECT_DIR}` 在 ZCode plugin hook 下展开 + env 注入。

**TDD**：
1. RED：写测试脚本——构造临时 echo hook + node env hook，注册到临时 ZCode 工作区配置，触发 SessionStart，捕获输出，断言展开值非字面、非空、合法路径。注：真实触发部分需手动在 ZCode 跑，脚本提供"运行 + 记录"模式。
2. GREEN：实现脚本：生成临时 hook 脚本、临时 `.zcode/config.json`、打印手动触发步骤、捕获模式（读 `/tmp/` dump 文件或 ZCode log）。
3. REFACTOR：与现有 ZCode probe hook 风格（worktree 的 probe-hooks）对齐。

**Done**：R4 AC1/AC2/AC3 满足。CI 跑模拟部分，手动展开快照归档证据文档。

---

## T9: agent 加载回归脚本

**目标**：可复跑回归脚本，枚举 agents 目录断言 24 角色 + frontmatter。

**TDD**：
1. RED：写测试脚本——枚举 agents/*.md 排除 README，断言 count===24；断言每个含 frontmatter + name/description。
2. GREEN：实现脚本：用 fs 读 agents 目录，解析 frontmatter，跑断言。
3. REFACTOR：与 check-agent-links.mjs 风格对齐。

**Done**：R5 AC1/AC2/AC3/AC4 满足。

---

## T10: 证据文档三份

**目标**：为 R3/R4/R5 各产出一份证据文档，含实测命令、快照、判定、日期、机制依据。

**步骤**：
1. 跑 T7 回归 → 捕获 stdout 快照 → 写证据文档 A（evolved-rules 注入）。
2. 手动跑 T8 真实触发部分 → 捕获展开值 → 写证据文档 B（模板变量展开），含 zcode-guide 原文引用。
3. 跑 T9 回归 → 捕获 24 角色清单 → 写证据文档 C（agent 加载），含 plugin manifest agents 字段依据。

**Done**：R3 AC4/AC5、R4 AC4/AC5、R5 AC5 满足。文档放 `.tinkerman/specs/zcode-p1-base-integration/` 或 `docs/zcode/` 下。

---

## T11: 双平台透明聚合回归

**目标**：聚合入口一键跑完 T7/T8/T9 + 透明性断言（R6）。

**TDD**：
1. RED：写聚合脚本——调用 T7/T8/T9；在临时目录跑两次 init（带/不带 `--platform zcode`），diff 产物除 `.zcode/` 外 byte-equal；对 T5/T6 受影响 hook 在 Claude 信号下跑断言 == 基线快照。
2. GREEN：实现聚合脚本：编排子脚本调用 + diff + 快照比对，失败打印哪一项。
3. REFACTOR：聚合脚本可被 CI 调用（exit code 反映整体通过/失败）。

**Done**：R6 AC1/AC2/AC3/AC4 满足。

---

## 执行顺序建议

T1 → T2 → T3（R1 改动型链）；T4 → T5 → T6（R2 改动型链，可与 R1 并行）；T7/T8/T9（R3/R4/R5 验证型，可并行）；T10（依赖 T7/T8/T9）；T11（依赖前置全部）。

P1 总估时 1-2 天（对齐 v2 §8，撤销两项无效工程后）。
