---
updated: 2026-08-11
---
# Function Contracts

## `buildZoomOutPrompt(input)`

- **参数**：
  - `input` — `{ currentSkill, currentTopic, focusedFile? }`
    - `currentSkill` — 当前正在执行的 skill 名称
    - `currentTopic` — 当前任务主题
    - `focusedFile` — 可选，当前聚焦的文件路径
- **返回**：Prompt 字符串
- **用途**：构造 zoom-out 探索子代理的 prompt，包含当前上下文信息

---

## `renderZoomOut(output)`

- **参数**：
  - `output` — 三段式字段对象
    - `overallPosition` — 整体位置描述
    - `currentResponsibility` — 当前职责描述
    - `neighborBoundaries` — 与邻居的边界描述
- **返回**：固定三段式 Markdown 字符串
- **用途**：将 zoom-out 输出渲染为统一的终端展示格式

---

## `validateZoomOutOutput(output)`

- **参数**：
  - `output` — `renderZoomOut` 的输入对象
- **返回**：`{ valid: boolean, violations: string[] }`
- **用途**：验证每段不超过 5 个非空行。超行时 driver 可重试一次

---

## `isZoomOutTrigger(userInput)`

- **参数**：
  - `userInput` — 用户输入文本
- **返回**：`boolean`
- **用途**：识别 zoom-out 触发信号：`zoom out`、`放大视角`、`讲整体`

---

## `pauseForZoomOut(statusContent)`

- **参数**：
  - `statusContent` — `.tinkerman/status.md` 的当前内容
- **返回**：新 status 内容（`phase` 改为 `zoom_out_paused`，原 `phase` 存入 `original_phase`）
- **用途**：在 zoom-out 开始前暂停当前 skill，保存原始阶段以便恢复

---

## `resumeFromZoomOut(statusContent)`

- **参数**：
  - `statusContent` — 暂停后的 status 内容
- **返回**：新 status 内容（`phase` 恢复为 `original_phase`，移除 `original_phase` 字段）
- **用途**：用户回复 `continue`/`继续` 或下次 `/tinkerman` 命令时恢复原始阶段
