---
feature: ci-check-integration
layout: design
created: 2026-04-29
---

# Design Document: CI Check Integration

## Overview

本功能在 Forge 的三个 SKILL 文档（forge-build、forge-test、forge-ship）和初始化脚本（init.sh）中集成 `ci_check_command` 支持，确保 build 全量测试、test 验证清单和 ship 门禁检查统一使用项目配置的 CI 命令，消除 AI 自行拼凑命令导致的本地/CI 不一致问题。

**变更范围**：
- `skills/forge-build/SKILL.md` — Final Validation 步骤 + 新增失败模式
- `skills/forge-test/SKILL.md` — Layer 3 完成前验证清单
- `skills/forge-ship/SKILL.md` — Test 门禁检查
- `scripts/init.sh` — 新增 CI check command 交互步骤
- `templates/config.md` — 文档化优先级关系和回退链

**不涉及**：TypeScript 代码、测试代码、构建配置。

## Architecture

本功能是纯文档/脚本层面的变更，不涉及运行时架构。核心设计决策是 `ci_check_command` 与 `verify_commands` 的优先级关系：

```
┌─────────────────────────────────────────────────────┐
│                  验证命令优先级链                      │
│                                                     │
│  ci_check_command (非空)                             │
│       │                                             │
│       ├── 用于: build Final Validation               │
│       ├── 用于: test Layer 3 清单项 1-4              │
│       └── 用于: ship Test 门禁                       │
│                                                     │
│  ci_check_command (空/缺失)                          │
│       │                                             │
│       └── 回退到 verify_commands                     │
│              │                                      │
│              ├── 用于: build Final Validation        │
│              ├── 用于: test Layer 3 (逐条执行)       │
│              └── 用于: ship Test 门禁               │
│                                                     │
│  verify_commands (也空/缺失)                         │
│       │                                             │
│       └── 回退到 AI 自动检测                         │
│                                                     │
│  注意: verify_commands 始终用于 TDD 循环,            │
│        不受 ci_check_command 影响                    │
└─────────────────────────────────────────────────────┘
```

**设计决策**：
1. `ci_check_command` 只影响"全量验证"场景（build Final Validation、test 清单、ship 门禁），不影响 TDD 循环中的逐条验证（那里继续用 `verify_commands`）。
2. 所有变更都是 additive 的，gated behind `ci_check_command` 非空条件，确保向后兼容。

## Components and Interfaces

### Component 1: forge-build/SKILL.md 修改

**修改位置 1 — §3.2 标准路径，步骤 4（全量测试）**

当前文本（第 4 步）：
> 4. 所有任务完成后，运行全量测试确认无回归。

替换为包含 `ci_check_command` 优先级逻辑的指令：

```markdown
4. 所有任务完成后，执行 Final Validation：
   - 读取 `.tinkerman/config.md` YAML frontmatter 的 `ci_check_command` 字段。
   - **如果 `ci_check_command` 非空**：执行该命令作为全量验证（如 `npm run check`），禁止替换、省略或部分重构该命令。
   - **如果 `ci_check_command` 为空或缺失**：按 `verify_commands` 列表逐条执行；若 `verify_commands` 也为空或缺失，回退到 AI 自动检测验证命令。
   - 使用 P5 证据链格式报告结果：`[Command] → [Output] → [Claim]`。
```

**修改位置 2 — §3.3 全量路径**

全量路径的阶段二完成后也有全量测试步骤，需要同样的 `ci_check_command` 逻辑。在全量路径描述中添加与标准路径相同的 Final Validation 指令。

**修改位置 3 — "已知 AI 失败模式" 章节末尾**

新增失败模式 7：

```markdown
### 失败模式 7：自行拼凑验证命令

**错误行为**：在 Final Validation 步骤中，AI 不使用 `.tinkerman/config.md` 中配置的 `ci_check_command`（如 `npm run check`），而是自行拼凑部分验证命令（如单独运行 `npx tsc --noEmit`、`npx biome check src/`），遗漏了完整 CI 检查中包含的其他步骤（如 lint 对 test 文件的检查、typedoc 生成、dist 同步校验、readme metrics 检查等）。

**为什么这是错的**：自行拼凑的命令只覆盖 CI 检查的部分步骤，导致本地验证通过但 CI 失败。开发者在 push 后才发现遗漏的检查项，浪费时间并破坏 CI 信任。`ci_check_command` 的存在就是为了确保本地验证与 CI 完全一致。

**正确做法**：读取 `.tinkerman/config.md` 的 `ci_check_command` 字段，如果非空则原样执行该命令，不做任何替换、省略或拆分。如果 `ci_check_command` 为空，按 `verify_commands` 列表逐条执行。绝不自行拼凑验证命令。
```

### Component 2: forge-test/SKILL.md 修改

**修改位置 — §2 Layer 3 完成前验证清单**

在 Layer 3 的 7 项清单表格之前，新增 `ci_check_command` 优先级说明：

```markdown
**CI 检查命令优先级**：

执行 Layer 3 清单前，读取 `.tinkerman/config.md` YAML frontmatter 的 `ci_check_command` 字段：
- **如果 `ci_check_command` 非空**：执行该命令一次，覆盖清单项 1-4（测试、测试通过、类型检查、Lint）。从合并输出中提取各项的通过/失败状态，逐项报告。
- **如果 `ci_check_command` 为空或缺失**：按当前行为，为每个清单项分别运行对应的命令。
```

清单项 1-4 的验证方式列需要更新，增加 `ci_check_command` 场景的说明：

| # | 检查项 | 验证方式 |
|---|--------|---------|
| 1 | **测试刚运行过** | 若 `ci_check_command` 非空，由 CI 命令统一覆盖；否则单独运行测试命令。不接受引用之前的结果 |
| 2 | **所有测试通过** | 若 `ci_check_command` 非空，从 CI 命令输出中提取测试结果；否则检查测试输出零失败 |
| 3 | **类型检查通过** | 若 `ci_check_command` 非空，从 CI 命令输出中提取类型检查结果；否则运行 `tsc --noEmit` 或等效命令 |
| 4 | **Lint 通过** | 若 `ci_check_command` 非空，从 CI 命令输出中提取 Lint 结果；否则运行 `eslint`/`biome` 或等效命令 |

清单项 5-7 不受影响，保持原样。

**新增输出格式示例**（使用 `ci_check_command` 时）：

```
📋 完成前验证清单

ℹ️ 使用 ci_check_command: npm run check

✅ 1. 测试刚运行过（CI 命令在本次会话 14:35 运行）
✅ 2. 所有测试通过（42/42）
✅ 3. 类型检查通过（tsc --noEmit：0 errors）
✅ 4. Lint 通过（biome check：0 errors, 0 warnings）
✅ 5. 验收标准逐条确认（5/5 场景通过）
✅ 6. 无遗留 TODO/FIXME（扫描 6 个变更文件：0 个遗留项）
✅ 7. Progress 已更新（5/5 任务完成）

✅ 验证通过。下一步：/forge ship
```

### Component 3: forge-ship/SKILL.md 修改

**修改位置 — §2 门禁检查，Test 门禁**

在 Test 门禁的描述中增加 `ci_check_command` 验证逻辑：

```markdown
| **Test 门禁** | 测试是否通过 | Layer 1 + Layer 3 验证结果；若 `ci_check_command` 已配置，验证 CI 命令已执行并通过 | 测试未运行或有失败项；若 `ci_check_command` 已配置但仅运行了部分命令，标记为门禁警告 |
```

在门禁证据格式示例之后，新增 `ci_check_command` 相关的警告场景：

```markdown
**CI 命令一致性检查**：

如果 `.tinkerman/config.md` 中 `ci_check_command` 非空，但 `/forge test` 阶段只运行了单独的验证命令（未运行完整的 CI 命令），Ship 门禁输出警告：

​```
⚠️ CI 命令一致性警告

ci_check_command 已配置为 "npm run check"，但 test 阶段未运行该命令。
建议重新运行 /forge test 以确保使用完整的 CI 检查命令。
​```

此警告不阻断 ship（因为单独命令可能已覆盖相同检查），但强烈建议重新运行。
```

### Component 4: scripts/init.sh 修改

**修改位置 — Step 1 交互式收集配置，安全级别之后**

在安全级别收集完成后、配置确认输出之前，新增 CI check command 交互步骤：

```bash
# --- CI 检查命令 ---
echo ""
echo "  CI 检查命令（ci_check_command）："
echo "    运行所有 CI 检查的单条命令（如 npm run check）。"
echo "    build 全量测试和 test 验证清单将使用此命令，确保本地验证与 CI 一致。"
echo "    如果留空，将按 verify_commands 列表逐条执行。"
echo ""
read -rep "$(echo -e "${BLUE}?${NC}") CI 检查命令（留空跳过）: " ci_check_cmd
ci_check_cmd="$(sanitize "${ci_check_cmd}")"
```

**修改位置 — 配置确认输出**

在 `success "配置确认："` 块中增加 CI 检查命令的显示：

```bash
echo "  CI 检查命令：${ci_check_cmd:-（未配置，将使用 verify_commands）}"
```

**修改位置 — config.md 生成**

在 YAML frontmatter 中增加 `ci_check_command` 字段：

```yaml
ci_check_command: "${ci_check_cmd}"
```

在 config.md body 中，当 `ci_check_cmd` 非空时，增加 CI 检查命令说明段落：

```markdown
## CI 检查命令

build 阶段的全量测试和 test 阶段的验证清单必须使用以下命令，不得自行拼凑：

\`\`\`bash
${ci_check_cmd}
\`\`\`
```

### Component 5: templates/config.md 修改

**修改位置 1 — YAML frontmatter**

`ci_check_command` 字段已存在于模板中（当前值为空字符串），保持不变。确认注释说明清晰。

**修改位置 2 — "CI 检查命令" section**

当前模板已有基本说明，需要扩展为完整的优先级和回退链文档：

```markdown
## CI 检查命令

### 优先级规则

| 场景 | ci_check_command 非空 | ci_check_command 空/缺失 |
|------|----------------------|------------------------|
| build Final Validation | 执行 ci_check_command | 按 verify_commands 逐条执行；若也为空，AI 自动检测 |
| test Layer 3 清单项 1-4 | 执行 ci_check_command，从输出提取各项状态 | 为每项分别运行对应命令 |
| ship Test 门禁 | 验证 ci_check_command 已执行并通过 | 按 Layer 1 + Layer 3 结果判定 |
| TDD 循环（Forge Loop） | 不受影响，始终使用 verify_commands | 使用 verify_commands |

### 回退链

```
ci_check_command (非空) → 用于全量验证
       ↓ (空/缺失)
verify_commands → 逐条执行
       ↓ (也空/缺失)
AI 自动检测验证命令
```

### 配置示例

```yaml
ci_check_command: "npm run check"    # 完整 CI 检查（build/test/ship 使用）
verify_commands:                      # TDD 循环使用的逐条验证命令
  - "npm run lint"
  - "npm run typecheck"
  - "npm test -- --run"
```
```

## Data Models

本功能不引入新的数据模型。唯一涉及的数据结构是 `.tinkerman/config.md` YAML frontmatter 中已有的 `ci_check_command` 字段（字符串类型，默认空字符串）。

## Error Handling

| 场景 | 处理方式 |
|------|---------|
| `ci_check_command` 执行失败（非零退出码） | 按现有 Final Validation 失败处理：报告完整错误输出，阻断后续流程 |
| `ci_check_command` 命令不存在（如 `npm run check` 但 package.json 无 check script） | 报告命令未找到错误，建议检查 config.md 配置 |
| `ci_check_command` 包含 shell 注入字符 | init.sh 的 `sanitize()` 函数已处理；SKILL 文档中指示 AI 原样执行配置值，不做字符串拼接 |
| config.md 无 YAML frontmatter | 视为 `ci_check_command` 缺失，回退到 `verify_commands` |
| config.md 中 `ci_check_command` 字段存在但值为空字符串 | 等同于缺失，回退到 `verify_commands` |

## Testing Strategy

本功能仅涉及 SKILL.md 文档修改和 init.sh 脚本修改，不涉及 TypeScript 代码变更，因此不适用 property-based testing。

**验证方式**：

1. **文档审查**：逐条对照 requirements.md 的验收标准，确认每个 SKILL.md 的修改位置和内容正确。
2. **init.sh 手动测试**：在测试目录中运行 init.sh，验证：
   - CI check command 提示正确显示
   - 输入值正确写入 config.md
   - 留空时 config.md 中 `ci_check_command` 为空字符串
   - 特殊字符被 sanitize 函数正确清洗
3. **向后兼容验证**：确认不含 `ci_check_command` 的现有 config.md 不受影响，所有 SKILL 行为保持不变。
4. **端到端验证**：在配置了 `ci_check_command: "npm run check"` 的项目中，运行 `/forge build`、`/forge test`、`/forge ship`，确认使用了配置的 CI 命令。

**不适用 PBT 的原因**：本功能的变更对象是 Markdown 文档和 Shell 脚本中的文本内容，不存在可以用 property-based testing 验证的纯函数或数据转换逻辑。验证方式以文档审查和手动集成测试为主。
