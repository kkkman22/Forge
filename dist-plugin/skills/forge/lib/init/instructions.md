---
description: "Use when user runs `/forge init`, project has no .forge/ directory, or plugin is installed but project not yet initialized"
updated: 2026-06-05
dispatch_mode: inline
allowed_tools:
  - Bash
  - Read
---

# /forge init — 项目初始化

> **触发方式**：用户输入 `/forge init [--pack <name>]` 或 `/forge init --recipe <name>`
> **职责**：调用 `init.sh` 完成项目初始化（创建 `.forge/` 目录、复制 agent 角色、生成 CLAUDE.md 项目宪法）
> **输出路径**：init.sh 交互式输出

### `--recipe <name>` — 测试栈脚手架（ADR-0006 Req6）

`/forge init --recipe <name>` 向**用户项目本地**生成组件测试栈配置（MSW/vitest），
**Forge 包零依赖增量**（守 R6.5）。可用 recipe：`vue3-vitest-msw`、`react-vitest-msw`。

- 生成后**不自动 install**，只打印 `<pkg manager> add -D <deps>` 指引（由用户执行）。
- 自动探测包管理器（pnpm-lock.yaml / yarn.lock / package-lock.json / packageManager 字段）。
- 已存在的文件**跳过并报告冲突**，提示手动合并（不静默覆盖）。
- 未知 recipe → 非零退出 + 列出可用 recipe。

详见各 recipe 目录的 `README.md`（测试哲学、handler 复用边界、数据驱动分支范式、自定义请求层适配）。

---

## 1. 执行逻辑

按以下优先级尝试定位并执行 `init.sh`：

1. **Plugin 模式**：`"${CLAUDE_PLUGIN_ROOT}/scripts/init.sh"`
2. **Clone 模式**：`forge/scripts/init.sh`（项目根目录下）
3. **失败诊断**：两者都不存在时输出错误信息并停止

### 调用方式

```bash
# Plugin 模式
bash "${CLAUDE_PLUGIN_ROOT}/scripts/init.sh" <args>

# Clone 模式
bash forge/scripts/init.sh <args>
```

所有用户参数（如 `--pack pms`、`--help`）原样透传给 `init.sh`。

---

## 2. 分发步骤

1. 检测 `${CLAUDE_PLUGIN_ROOT}` 环境变量是否已设置
2. 若已设置，检查 `"${CLAUDE_PLUGIN_ROOT}/scripts/init.sh"` 是否存在
3. 若存在 → 执行并退出
4. 若不存在或变量未设置，检查 `forge/scripts/init.sh` 是否存在
5. 若存在 → 执行并退出
6. 两者都不存在 → 输出诊断信息：

```
❌ 未找到 init.sh
已尝试路径：
  ${CLAUDE_PLUGIN_ROOT}/scripts/init.sh
  forge/scripts/init.sh
请通过 marketplace 安装 Forge plugin，或克隆 Forge 仓库到项目下：
  git clone https://github.com/kkkman22/Forge.git forge
```

---

## 3. Edge Cases

| 条件 | 处理 |
|------|------|
| `.forge/` 已存在 | init.sh 自身会提示"重新初始化将覆盖"并要求确认，本 SKILL 不额外拦截 |
| `--help` 参数 | 透传给 init.sh，显示帮助后退出 |
| init.sh 执行失败（非零退出码） | 输出 init.sh 的错误信息，不做额外处理 |
| 无 Bash 工具权限 | 提示用户在终端手动运行对应命令 |

---

## 4. 注意事项

- `init.sh` 是交互式脚本（使用 `read -rp` 收集项目名、技术栈、安全级别等），需要 stdin 支持
- 若 Bash 工具不支持交互式输入，应告知用户在终端手动运行：
  - Plugin 用户：`bash "${CLAUDE_PLUGIN_ROOT}/scripts/init.sh"`
  - Clone 用户：`bash forge/scripts/init.sh`
- 本 SKILL 不修改任何文件，所有文件操作由 init.sh 完成

## 5. Charter 创建选项

init.sh 完成后，询问用户是否创建项目宪章（默认 Yes）：
- **选择创建**：调用 `/forge charter init` 的精简版，只问 3 个问题（核心问题、主要技术选型、1–3 条 invariants），生成 `.forge/charter.md`，`status: draft`
- **选择跳过**：正常完成，不阻断
- 提示用户后续可通过 `/forge charter update` 将 charter 激活为 `status: active`
