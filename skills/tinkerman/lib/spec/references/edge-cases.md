---
updated: 2026-08-11
---
# Edge Case Handling

| Condition | Output |
|------|------|
| 无 decisions/ | 基于需求描述直接生成；如需决策分析可运行 /tinkerman decide |
| 同名 spec (draft) | 读取现有草案为基础修改 |
| 同名 spec (locked) | ⚠️ 先将 status 改为 draft，再重新运行 |
| 需求模糊 | 追问：问题？目标用户？关键场景？ |
| 自检反复失败（3次） | 停止自动修正，呈现问题给用户 |
| 无 `.tinkerman/` | ⚠️ 先运行 /tinkerman init |

→ 导入模式边界情况详见 references/import-mode.md
