---
name: forge
description: Forge 统一入口 — 路由到 skills/forge/SKILL.md
argument-hint: "[子命令|任务描述] [--tier=light|standard|full]"
model: inherit
allowed-tools: Skill
---

# /forge

调用 `Skill(forge)` 并把所有参数透传。完整 dispatcher 逻辑见 `skills/forge/SKILL.md`。

> Plugin manifest 注册路径：本文件保留作为 `commands/` 字段的占位，实际逻辑由 skill `forge` 承载。详见 ADR-0004。

## 子命令分发表

| 子命令 | 类型 | 说明 |
|--------|------|------|
| `init` | (bash script) | 项目初始化（plugin/clone 通用） |
| `plan` | Skill | 生成实现计划 |
| `build` | Skill | TDD 执行实现 |
| `review` | Skill | 三层代码评审 |
| `test` | Skill | 测试验证 |
| `ship` | Skill | 推送与合并 |
| `learn` | Skill | 知识沉淀 |
| `decide` | Skill | 架构决策分析 |
| `spec` | Skill | 需求规格编写 |
| `debug` | Skill | 根因分析 |
| `loop` | Skill | 循环执行 |
| `status` | Skill | 项目状态查看 |
| `resume` | Skill | 会话恢复 |
| `abort` | Skill | 中止当前任务 |
| `refactor` | Skill | 重构模式 |
| `fix` | Skill | 修复模式 |

### 特殊子命令：`init`

`/forge init` 不是 Skill，而是 Bash 脚本入口。当参数第一个词为 `init` 时，按以下顺序尝试调用：

1. `"${CLAUDE_PLUGIN_ROOT}/scripts/init.sh"` —— plugin 模式
2. `forge/scripts/init.sh` —— clone 模式
3. 失败时输出诊断：

   ```
   ❌ 未找到 init.sh
   已尝试路径：
     ${CLAUDE_PLUGIN_ROOT}/scripts/init.sh
     forge/scripts/init.sh
   请通过 marketplace 安装 Forge plugin，或克隆 Forge 仓库到项目下：
     git clone https://github.com/kkkman22/Forge.git forge
   ```

`/forge init` 透传所有命令行参数（如 `/forge init --pack pms` 等价于 `init.sh --pack pms`）。

## 任务路由示例

- `/forge plan` → 路由到 plan skill
- `/forge build` → 路由到 build skill
- `/forge init` → 调用 init.sh，按 plugin / clone 模式自动选择路径
- `/forge init --pack pms` → 调用 init.sh --pack pms（透传参数）
- `/forge 增加用户认证功能` → router 分析任务，建议档位后执行
