---
updated: 2026-08-11
purpose: "T2 命令委托矩阵 — 集中管理 Forge 命令与 Claude Code 官方原语的对应关系"
---

# Native Command Delegation Matrix

本文件是 T2 命令委托的唯一配置源。所有受委托 skill 的 SKILL.md 引用此文件获取：
- 委托的 Native_Command 名称
- 推荐最低 Claude Code 版本
- Fallback 行为

## 委托矩阵

| Forge 命令 | 委托的 Native_Command | 推荐最低 Claude Code 版本 | Fallback |
|------------|----------------------|--------------------------|----------|
| `/tinkerman recap` | `/compact` + `/context` | 2.0+ | 遗留 recap 行为 |
| `/tinkerman resume` | `/resume` + Checkpointing | 2.0+ | 遗留 resume 行为 |
| `/tinkerman abort` | 无（纯精简） | N/A | 无 fallback |
| `/tinkerman learn` | Auto_Memory | 2.1.59+ | 完整遗留 learn |
| `/tinkerman review --delegate-quality` | `/code-review` | 2.0+ | Forge 内建 quality reviewer |
| `/tinkerman review --delegate-security` | `/security-review` | 2.0+ | Forge 内建 security reviewer |

## 版本探测片段

SKILL.md 中引用此片段的标准 Bash 模式：

```bash
# Detect Claude Code version
CLAUDE_VERSION=$(claude --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
# Compare with min version (semantic comparison)
MIN_VERSION="2.0.0"  # Replace per matrix entry
if [ -n "$CLAUDE_VERSION" ]; then
  # Simple major.minor check
  CLAUDE_MAJ=$(echo "$CLAUDE_VERSION" | cut -d. -f1)
  CLAUDE_MIN=$(echo "$CLAUDE_VERSION" | cut -d. -f2)
  REQ_MAJ=$(echo "$MIN_VERSION" | cut -d. -f1)
  REQ_MIN=$(echo "$MIN_VERSION" | cut -d. -f2)
  if [ "$CLAUDE_MAJ" -gt "$REQ_MAJ" ] || { [ "$CLAUDE_MAJ" -eq "$REQ_MAJ" ] && [ "$CLAUDE_MIN" -ge "$REQ_MIN" ]; }; then
    echo "standard"
  else
    echo "legacy"
  fi
else
  echo "legacy"
fi
```

## Deprecation Notice 格式

每个 T2 受影响命令在 legacy 路径首次触发时输出到 stderr（per-session 去重）：

```
⚠️ [Forge Slimming] /tinkerman <cmd> 基础层可委托给 <native_cmd>（Claude Code ≥ <min_ver>）。
当前版本不满足，使用遗留实现。迁移指南：docs/slimming-migration.md
```

## Per-Session 去重机制

```
路径: .forge/.deprecation-notice/<session_id>/<command>.lock
内容: 0 字节（存在性即信号）
生命周期: SessionStart → 命令触发 O_EXCL 原子创建 → Stop hook 清理
Fallback: /tmp/.forge-deprecation-<session_id>/<command>.lock
```
