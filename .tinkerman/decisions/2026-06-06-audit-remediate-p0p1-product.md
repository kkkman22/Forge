---
date: "2026-06-06"
topic: "audit-remediate-p0p1"
perspective: "product"
tier: "full"
phase: "decide-round1"
---

# Product Perspective — Audit Remediate P0/P1

## Core Conclusion

10 项修复对用户价值分为两层：P0 MCP 安全是唯一积极安全风险（紧急），P1 项是静默故障（重要但不紧急）。建议分两批同日发布。

## User Value

1. **P0 MCP 安全**（最高价值）：用户信任 first-party MCP 工具的安全边界。绕过 = 信任崩塌。
2. **P1-1 dist sync**（高价值）：用户拿到 stale runtime = "在我这里可以运行"问题。
3. **P1-2/P1-3**（高价值）：子命令丢失 + 路由静默失败 = 不可预测的行为。
4. **P1-4 plugin dist**（中价值）：新安装用户缺少 hooks 和 MCP 配置。
5. **P1-5~P1-8**（标准价值）：CI/发布质量保障。

## Risk Assessment

**Risk Rating: Medium** — 基础设施层改动，CI 可验证。dist sync 如果是完全重生成而非增量修复，风险升至 High。

## Delivery Strategy

- Batch 1（发布阻断）：P0-1 + P0-2
- Batch 2（同日发布）：全部 P1

## Acceptance Criteria

- MCP forge-exec 拒绝所有注入尝试
- dist/registry/plugin artifacts 与源码内容一致
- npm run check exit 0（含 dist-sync gate）
- 0 P0/P1 残留

## Key Assumption

dist sync 修复是增量的（修复漂移来源），不是完全重生成。
