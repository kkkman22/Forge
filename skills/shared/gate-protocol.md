# Gate 共享协议

> 本文档定义 Reframing Gate（decide）和 Clarification Gate（spec）的共享执行协议。
> 调用方通过参数表传入差异化配置，唯一不同的"问题选择算法"保留在各 skill 的 instructions.md 中。

---

## 参数表

| 参数 | decide 值 | spec 值 |
|------|----------|---------|
| `gate_name` | Reframing Gate | Clarification Gate |
| `max_questions` | 3 | 5 |
| `time_budget` | 1 min | 2 min |
| `injection_label` | Reframing Context | Clarification Context |
| `log_filename` | `*-reframing.jsonl` | `*-clarification.jsonl` |
| `skip_option_text` | 跳过，直接分析 | 跳过 |

---

## 1. Tier 路由

| Tier | Gate 行为 |
|------|----------|
| Light | 跳过 gate |
| Standard | 默认启用，`--no-gate` flag 可跳过 |
| Full | 强制启用，不可跳过 |

---

## 2. 提问方式

使用 AskUserQuestion tool，每次一个问题：

- **单问题模式**：每轮只展示一个问题，用户回答后进入下一轮
- **超时处理**：每个问题 20s 超时（interactive 模式），超时自动采用 AI 推荐答案
- **跳过选项**：提供 `skip_option_text` 参数指定的跳过选项
- **问题数上限**：`max_questions` 参数控制，达到上限自动终止

---

## 3. 回答注入 + Sanitize

Gate 完成后，将用户回答注入后续流程的 context：

**Context block 格式**：

```
### {injection_label}

- Q1: <question> → A: <answer>
- Q2: <question> → A: <answer>
...
```

**Sanitize 规则**：

1. 每个回答截断至 **200 字符**，超出部分用 `...` 标记
2. 剥离指令模式（匹配 `^(ignore|disregard|forget|override)\b` 的回答前缀）
3. 剥离 markdown 链接和代码块（防止注入）

---

## 4. 反馈记录

Gate 执行过程记录到 JSONL 日志：

**路径**：`.tinkerman/progress/{log_filename}`

**格式**：每行一条 JSON 记录：

```json
{"ts": "ISO-8601", "gate": "<gate_name>", "question": "...", "answer": "...", "skipped": false}
```

**规则**：

- `gate_name` 为显示名称（如 "Reframing Gate"），不做格式校验
- `log_filename` 中的 slug 部分必须匹配 `^[a-z][a-z0-9-]*`（如 `reframing`、`clarification`）
- 全跳过仍记录：即使所有问题都被跳过，也写入日志（`skipped: true`）
- 每个问题一行，不批量写入

---

## 5. 共享执行流程

Gate 被触发后，遵循以下执行流程：

```
触发条件满足
    │
    ▼
shouldTriggerInlineGrill({ mode, reason: <gate_reason>, alreadyTriggered })
    │
    ├── trigger: false (autonomous)
    │   └── renderInlineGrillAdvisory(<reason>) → 写入 advisory → 继续原流程
    │
    └── trigger: true (interactive)
        └── renderInlineGrillConfirmPrompt(<reason>) → 用户确认
            ├── 跳过 → 继续原流程（保留 warning）
            └── 确认 → inline grill loop → formatInlineGrillInjection(result, <phase>)
                └── 重新执行受影响的步骤
```

**频率约束**：每种 reason 每个 session 最多触发一次。
