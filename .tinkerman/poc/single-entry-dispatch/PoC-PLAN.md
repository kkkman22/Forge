# PoC: Single-Entry Dispatch via Agent + lib/instructions.md

## 验证目的

方案 A 落地路径假设：把 27 个 forge-* skill 转为 `skills/forge/lib/<sub>/instructions.md`
markdown 指令文件，由 `skills/forge/SKILL.md` 在执行时通过 Agent tool 启动子会话
读取并执行。本 PoC 验证此链路在 Claude Code plugin 上下文里实际可工作。

## 验证范围

只迁 `forge-zoom-out`（74 行，最小 fork 类 skill）。**不动原 `skills/forge-zoom-out/`**。
新增以下文件：

- `skills/forge/lib/zoom-out/instructions.md` — 迁移后的指令文件
- `.tinkerman/poc/single-entry-dispatch/PoC-PLAN.md` — 本文档

## 三个验证点

### V1: Agent 子会话能读到 plugin 路径下的 lib 文件

**做法**：直接调用 Agent tool，prompt 内含 Read 指令读 `skills/forge/lib/zoom-out/instructions.md`。

**预期**：Agent 返回的内容包含 instructions.md 的章节标题（如 `## OUTPUT FORMAT`）。

**反例信号**：Agent 报路径找不到 / 权限错误。

### V2: Agent 能按 instructions.md 指令完成三段式 zoom-out

**做法**：Agent prompt = "Follow these instructions exactly. The instructions are
in `skills/forge/lib/zoom-out/instructions.md`. Topic to zoom out: `skills/forge-status`."

**预期**：Agent 返回三段式 markdown（整体位置 / 当前职责 / 与邻居的边界），每段 ≤5 行，
且末尾包含 `[PoC marker] zoom-out completed via Agent + lib/instructions.md`。

**反例信号**：返回散文 / 段数不对 / 没有 PoC marker / 主动写文件。

### V3: Agent 完成后主会话能继续推进

**做法**：观察 Agent 调用是否 fresh-context（不污染主会话），主会话能否在 Agent 返回后
立即响应下一条用户指令。

**预期**：主会话 token 增长 < Agent 实际消耗（说明只回传摘要）；后续工具调用不受影响。

**反例信号**：主会话 context 突然膨胀；Agent 卡死或回不来。

## 验证记录位置

`.tinkerman/poc/single-entry-dispatch/V1-result.md` / `V2-result.md` / `V3-result.md`
（验证后追加，由本次会话写入）

## 通过/不通过判据

- 三个 V 全部通过 → 方案 A 可推进到全量 spec/plan
- 任一 V 失败 → 记录失败原因，回退到方案 C（inline 指令展开 + 文档承诺降级）

## 不做

- 不动 `commands/forge.md`（dispatcher 当前已断，但 PoC 不修它，仅验证未来路径）
- 不动 `skills/forge-zoom-out/SKILL.md`（保留向后兼容，PoC 失败可零回滚）
- 不写测试代码 —— 这是探索性 PoC，结果以本会话内 Agent 调用真实输出为证据
