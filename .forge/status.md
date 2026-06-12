---
current_task: "code-slim-0612"
tier: "full"
work_nature: "refactor"
task_type: "infra"
project_phase: "refactor"
phase: "build"
spec: ".forge/specs/code-slim-0612/"
updated: "2026-06-13"
current_package: "P1-Wave1"
completed_tasks: "T1"
next_task: "T2"
decision: ".forge/decisions/2026-06-12-code-slim.md"
adr: "ADR-0008"
branch: "forge/code-slim-0612"
hints: "behavior-preservation,refactor-scan,test-gate,backward-compat"
execution_strategy: "full + 按模块拆子任务（decide/spec 先产出整体清单与优先级，再逐模块 build→review→test）"
---

# 项目状态

## 当前任务：code-slim-0612

对整个项目做代码精简与重构（等价重构，不改对外行为）。

### 硬约束（来自用户任务描述）

- 现有功能行为**完全不变**
- 所有测试**继续通过**（`npm run check` = tsc + biome + vitest + readme-metrics）
- 公开 API / CLI 行为**不变**
- 仅：移除冗余代码、简化内部实现、清理死代码与重复逻辑
- 不新增功能，不改变对外行为

### 路由决策

- Tier: **full**（需求模糊 + 超大范围）
- work_nature: refactor
- 执行策略：Full + **按模块拆子任务**
- Sequence: `decide → spec → plan → build → review → test → ship → learn`（每个模块子任务独立走 build→review→test）

### 范围（项目扫描基线）

- src/: 172 个顶层 .ts 文件 + 子目录 ~16K 行（最大模块 mcp/2884、docs-governance/2825、review-comment-bitbucket/1559、error-recovery/1200、review/1049）
- test/: 626 个测试文件（行为保持的安全网）
- scripts/: 156 个脚本文件
- 技术栈: TypeScript / JavaScript / Shell

### 假设（基于实际扫描）

1. 技术栈 TypeScript 主导（src/172 文件 ~16K 行），辅 Shell/JS scripts 156 个
2. 范围超大，无法单分支单任务完成 → 按模块拆分
3. 测试保护网充足（626 测试 + `npm run check` 全量门禁），支持等价重构
4. 棕地成熟项目（v3.4.0）

### 提示标签（下游 skill 读取）

- `behavior-preservation`：每个改动须有测试/行为等价证据
- `refactor-scan`：先扫描识别死代码/重复/冗余，产出清单再动手
- `test-gate`：每步以测试全绿为安全网
- `backward-compat`：公开 API/CLI 签名与行为不变
