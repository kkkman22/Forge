---
topic: mcp-compression-delegation
generated_at: 2026-06-18T00:00:00.000Z
auto_generated: true
stage_count: 3
total_files: 3
---

# Feature: mcp-compression-delegation

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | [requirements.md](../specs/mcp-compression-delegation/requirements.md) | draft | 2026-06-18 |
| Plan | [design.md](../specs/mcp-compression-delegation/design.md) · [tasks.md](../specs/mcp-compression-delegation/tasks.md) | pending | 2026-06-18 |
| Build | — | — | — |
| Review | — | — | — |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Requirements** (draft, 2026-06-18)：将 Forge 的上下文压缩职责移交给 Headroom，删除与 Headroom 重叠的压缩能力（RTK 集成、forge_read_cached），保留 Headroom 做不到的执行安全层（allowlist/metachar/进程清理）和内容隔离层（forge_read 沙箱分析）。基于 5 轮调研 + headroom v0.26.0 实测：失败输出 router:protected:error_output 零压缩、diff router:noop 零压缩、Structured Output 压 50% 但有 CCR 兜底。精简后 Forge MCP 与 Headroom 零功能重叠。
- **Design** (2026-06-18)：6 个设计决策——D1 RTK 彻底删不留 opt-in、D2 trimCommandOutput 保留作 fallback、D3 read_cached 彻底删、D4 Iron Law 双保险（formatFailureOutput + Headroom protected）、D5 安全层原样保留不重构、D6 文档从"五层防御"改"安全+隔离"。
- **Tasks** (2026-06-18)：3 Wave 9 Task。Wave1 RTK 删除（output.ts/forge-exec.ts）、Wave2 read_cached 删除（源文件+server+skills 6 处引用）、Wave3 init.sh+check-companions+文档定位。
