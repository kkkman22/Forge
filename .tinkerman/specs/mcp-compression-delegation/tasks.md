---
topic: mcp-compression-delegation
date: "2026-06-18"
spec_ref: mcp-compression-delegation
format: lightweight
monolith_acknowledged: true
---

# MCP 压缩职责移交 — 任务清单

> 三个需求按依赖与风险分三个 Wave 顺序交付：**Wave1 R1+R3（RTK 删除 + forge_exec 安全层保留）→ Wave2 R2（read_cached 删除）→ Wave3 R4+R5（init.sh + 文档）**。
>
> Wave1 和 Wave2 互相独立（改不同文件），但按"先动核心 MCP（forge_exec）、再动外围（read_cached）"的顺序，便于早期发现问题。Wave3 依赖前两步的代码状态稳定后统一更新文档和安装脚本。

## Design Reference Index

| Anchor | 位置 | 用途 |
|---|---|---|
| `design.md#d1-rtk-彻底删除不保留-opt-in` | D1 | RTK 彻底删，不留 opt-in |
| `design.md#d2-trimcommandoutput-保留作为-fallback` | D2 | trimmer 保留，Headroom 非强依赖 |
| `design.md#d3-forge_read_cached-彻底删除` | D3 | read_cached 删除，引导改 Grep |
| `design.md#d4-iron-law-双保险` | D4 | formatFailureOutput + Headroom protected 双保险 |
| `design.md#d5-安全层原样保留` | D5 | 安全层不重构，最小改动 |
| `design.md#d6-文档定位调整` | D6 | "五层防御"→"安全 + 隔离" |

## File Mapping

| 文件 | 动作 | 需求 |
|---|---|---|
| `src/mcp/trimmers/output.ts` | MODIFY（移除 isRtkAvailable/trimWithFallback/rtkCompress，保留 trimCommandOutput/formatFailureOutput） | 1 |
| `src/mcp/tools/forge-exec.ts` | MODIFY（移除 RTK import + 调用，保留安全层 + formatFailureOutput） | 1, 3 |
| `test/mcp/forge-exec-rtk.test.ts` | DELETE | 1 |
| `src/mcp/tools/forge-read-cached.ts` | DELETE | 2 |
| `src/mcp/read-cache.ts` | DELETE | 2 |
| `src/mcp/server.ts` | MODIFY（移除 registerForgeReadCached import + 调用） | 2 |
| `src/index.ts` | MODIFY（移除 read-cache 相关 barrel export） | 2 |
| `skills/forge/lib/build/instructions.md` | MODIFY（forge_read_cached 引用改 Grep 引导） | 2 |
| `skills/forge/lib/review/instructions.md` | MODIFY（同上） | 2 |
| `skills/forge/lib/test/instructions.md` | MODIFY（同上） | 2 |
| `skills/forge/lib/build/references/context-budget.md` | MODIFY（定位调整 + 移除 read_cached + 压缩移交说明） | 5 |
| `scripts/init.sh` | MODIFY（移除 RTK 安装，Headroom 单独装） | 4 |
| `scripts/check-companions.mjs` | MODIFY（移除 RTK 检测项） | 4 |

---

## Wave 1: RTK 删除 + forge_exec 安全层保留（R1 + R3）

### T1: 移除 RTK 集成（output.ts + forge-exec.ts）

**改动**：
- `src/mcp/trimmers/output.ts`：
  - DELETE `isRtkAvailable`（line 47-57）
  - DELETE `rtkCompress`（line 118-154）
  - DELETE `trimWithFallback`（line 175-201）
  - DELETE `execFile/spawn/promisify` import（仅 RTK 用）
  - DELETE `RTK_TIMEOUT_MS` 常量
  - 保留 `KEY_LINE_PATTERN` / `MAX_KEY_LINES` / `TRIM_THRESHOLD` / `TAIL_LINES`
  - 保留 `trimCommandOutput`（fallback trimmer，D2）
  - 保留 `formatFailureOutput`（Iron Law，D4）
- `src/mcp/tools/forge-exec.ts`：
  - MODIFY import（line 22）：移除 `isRtkAvailable` / `trimWithFallback`，保留 `trimCommandOutput`
  - MODIFY 工具 handler（line 586-595）：移除 `rtkAvailable` 探测和 `trimWithFallback` 分支，统一走 `trimCommandOutput`
- `test/mcp/forge-exec-rtk.test.ts`：DELETE

**验证**：
- `npx vitest run test/mcp/forge-exec.test.ts` → 安全测试全绿
- `npx vitest run test/mcp/adversarial-mcp-boundaries.test.ts` → P0 边界测试全绿
- `npx tsc --noEmit` → exit 0
- 确认 `formatFailureOutput` 仍在（grep）

### T2: forge_exec 失败输出行为回归验证

**改动**：无代码改动，纯验证 T1 后 Iron Law 行为不变。

**验证**：
- 审查 forge-exec.ts 工具 handler：确认 exitCode ≠ 0 时仍走 `formatFailureOutput`（原样返回 stdout + stderr）
- 审查 forge-exec.ts 工具 handler：确认 exitCode = 0 时走 `trimCommandOutput`（>30 行裁剪，≤30 行原样）
- `npx vitest run test/mcp/forge-exec.test.ts` 中"failure output preserved"用例通过

---

## Wave 2: forge_read_cached 删除（R2）

### T3: 删除 forge_read_cached 源文件 + server 注册

**改动**：
- `src/mcp/tools/forge-read-cached.ts`：DELETE
- `src/mcp/read-cache.ts`：DELETE
- `src/mcp/server.ts`：MODIFY
  - 移除 `import { registerForgeReadCached }`（line 21）
  - 移除 `registerForgeReadCached(server, root)` 调用
- `src/index.ts`：MODIFY
  - 移除 read-cache 相关 barrel export（grep `read-cache` / `ReadCacheIndex` / `CacheEntry` 定位）

**验证**：
- `npx tsc --noEmit` → exit 0（无悬空 import）
- `npm run check:public-api` → 通过（公开 API 数量更新）
- grep `forge_read_cached` src/ → 无残留

### T4: 清理 read_cached 测试文件

**改动**：
- 搜索 `test/` 下 read-cache 相关测试（`test/mcp/read-cache*.test.ts` 或 `forge-read-cached*.test.ts`），DELETE
- `test/barrel-file.test.ts`：若有 read-cache export 计数断言，MODIFY（数量 -1 或移除该 section）

**验证**：
- `npx vitest run test/barrel-file.test.ts` → 通过（barrel 计数更新）
- `npx tsc --noEmit` → exit 0

### T5: 清理 skills 中 forge_read_cached 引用（6 处）

**改动**：3 个 instructions.md + context-budget.md，共 6 处引用改为 Grep 引导：
- `skills/forge/lib/build/instructions.md`（line 466-472 区域）：`forge_read_cached` 引用改为"用 Grep 搜索特定片段而非全量重读"
- `skills/forge/lib/review/instructions.md`（line 553-558 区域）：同上
- `skills/forge/lib/test/instructions.md`（line 192-196 区域）：同上
- `skills/forge/lib/build/references/context-budget.md`（Layer 1 段落 + MCP 工具表）：移除 forge_read_cached 行

**统一引导文案**（替换原 forge_read_cached 引用）：
```
- 同一文件 Read ≤2 次/session
- 第 2 次起：使用 Grep（定向搜索）或 forge_read（结构化分析）替代完整 Read
- 回顾已读文件：使用 Grep 搜索特定片段而非全量重读
```

**验证**：
- grep `forge_read_cached` skills/ → 无残留
- `npm run check` → skill/doc 校验通过
- `scripts/check-skill-length` → 通过

---

## Wave 3: init.sh + check-companions + 文档定位（R4 + R5）

### T6: init.sh 移除 RTK 安装

**改动**：`scripts/init.sh`（line 876-884 区域）：
- `install_companion "Headroom + RTK"` → `install_companion "Headroom"`
- 描述 "API 级全量压缩 + Shell 输出压缩" → "API 级全量压缩"
- 安装命令 `'headroom-ai[all]'` 保留（不变）
- fallback 文案 "forge_exec 将使用内置 trimmer 回退方案" → "forge_exec 将使用内置 trimmer 回退方案（成功输出裁剪），失败输出 Iron Law 由 Headroom protected:error_output 或 formatFailureOutput 兜底"
- 安装摘要表（line 913-921）：移除 `"rtk"` 行
- Headroom 使用说明（line 923-926）：保留不变

**验证**：
- `bash -n scripts/init.sh` → 语法检查通过
- 审查确认 RTK 安装逻辑完全移除

### T7: check-companions.mjs 移除 RTK 检测

**改动**：`scripts/check-companions.mjs`：
- `COMPANIONS` 数组（line 28-53）：移除 rtk 条目（line 36-40）
- 文件头注释（line 11-15）：移除 rtk 描述行

**验证**：
- `node scripts/check-companions.mjs` → 输出不再包含 RTK 行
- RTK 检测项完全移除

### T8: context-budget.md 定位调整

**改动**：`skills/forge/lib/build/references/context-budget.md`：
- 标题从"五层上下文防御体系"调整为"安全执行 + 内容隔离边界"（D6）
- 移除 Layer 1（Read 去重缓存）段落——已在 T5 处理，此处确认彻底
- 新增"压缩职责移交 Headroom"说明段：
  ```
  ## 压缩职责分工

  Forge MCP 不再承担压缩职责（已移交 Headroom）。
  - Headroom（wrap 模式）：压缩对话历史、tool 输出、模型写回——实测对失败输出零压缩（protected:error_output）、对 diff 零压缩（noop）
  - Forge MCP：安全执行（allowlist/metachar/进程清理）+ 内容隔离（forge_read 沙箱分析，文件原文不进上下文）
  - 两者零功能重叠，互补不冗余
  ```
- MCP 工具表（line 116-120）：移除 `forge_read_cached` 行，`forge_exec` 描述改为"安全执行 + Iron Law 失败放行"

**验证**：
- grep `read_cached` context-budget.md → 无残留
- grep `五层` context-budget.md → 无残留
- skill-length 检查通过

### T9: 最终全量验证

**验证**：
- `npm run check` → 全绿（tsc + biome + vitest + public-api + dist-sync + skill/doc 校验）
- `npm run dist:resync` → dist 同步
- `node scripts/check-dist-sync.mjs` → exit 0
- 确认全仓库 `forge_read_cached` 无残留（除 CHANGELOG / .forge 历史文档）
- 确认全仓库 `isRtkAvailable` / `trimWithFallback` / `rtkCompress` 无残留
- adversarial-mcp-boundaries 安全测试全绿

---

## Dependencies

- Wave1（T1-T2）独立，无前置依赖。
- Wave2（T3-T5）独立，无前置依赖。但建议在 Wave1 后执行（核心 MCP 先稳定）。
- Wave3（T6-T9）依赖 Wave1 + Wave2 代码状态稳定。T9 依赖全部前置完成。

## Risk

- **低风险**：纯删除 + 文档调整，安全层原样保留（D5）。
- **注意点**：barrel-file.test.ts 的 export 计数断言需同步更新（T4），否则 dist-sync 误报。
- **回退**：若实测发现 Headroom 未启用场景下输出膨胀，重新启用 `trimCommandOutput` 的更激进裁剪（无需恢复 RTK）。
