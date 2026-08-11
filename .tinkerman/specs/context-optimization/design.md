---
feature: context-optimization
layout: design
created: 2026-05-01
---

# Design Document: Context Optimization

## Overview

本设计为 Forge 引入 MCP 协议层的输出裁剪能力，借鉴 context-mode 项目的沙箱执行思想，构建 Forge 自有的轻量 MCP server（forge-context）。核心思路：命令在子进程中执行，server 端裁剪后只返回摘要，原始数据不进入上下文。

**与 context-mode 的关系**：参考其 McpServer + StdioServerTransport 骨架模式和分层返回策略。不参考其 FTS5 知识库、会话持久化、多平台适配、路由拦截等重型模块。Forge 的 MCP server 定位是输出裁剪专用工具（~300 行），不是通用上下文管理中间件（context-mode ~2500 行）。

**与现有 context-budget.ts 的关系**：MCP 替代的是"工具输出裁剪"（Test、Git、通用 Bash），保留的是"语义压缩"（Explore_Summarizer、Review_Summarizer、Subagent_Summary_Protocol）。两者解决不同层面的问题——MCP 做事前拦截，prompt 指令做语义压缩。

## Architecture

### 系统架构

```
Claude Code
  ├── 原生工具（Bash, Read, Write, Edit, Grep, Glob）
  │     └── Forge Hooks（check-frozen, check-sandbox, auto-resume）  ← 不变
  │
  ├── forge-context MCP Server（新增）
  │     ├── forge_exec   → 沙箱命令执行 + 输出裁剪
  │     ├── forge_git    → Git 查询摘要化
  │     └── forge_read   → 批量文件分析（Think in Code 的 MCP 版）
  │
  └── SKILL.md 指令
        ├── forge_exec / forge_git 使用指导（更新）
        ├── Explore_Summarizer（保留，语义压缩）
        ├── Review_Summarizer（保留，语义压缩）
        └── Subagent_Summary_Protocol（保留，语义压缩）
```

### 输出裁剪分层

```
Layer 1: forge-context MCP（主要）
  ↓ MCP 不可用时降级
Layer 2: run-with-trim.sh（fallback）
  ↓ 失败输出不压缩
Layer 3: AI Trimming Iron Law（语义压缩）
```

### 文件结构

```
src/mcp/
├── server.ts              # MCP server 入口（stdio transport）
├── tools/
│   ├── forge-exec.ts      # 沙箱命令执行 + 输出裁剪
│   ├── forge-git.ts       # Git 操作摘要化
│   └── forge-read.ts      # 批量文件分析
└── trimmers/
    └── output.ts          # 输出裁剪逻辑（复用 context-budget.ts 格式）
```

## Components and Interfaces

### 1. MCP Server 入口（server.ts）

参考 context-mode 的 McpServer + StdioServerTransport 模式：

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "forge-context",
  version: "1.0.0",
});

// 注册三个工具
registerForgeExec(server);
registerForgeGit(server);
registerForgeRead(server);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### 2. forge_exec 工具（tools/forge-exec.ts）

**输入 Schema**：

```typescript
z.object({
  command: z.string().describe("要执行的 shell 命令"),
  timeout: z.number().optional().default(30000).describe("超时时间（ms）"),
})
```

**裁剪逻辑**（trimmers/output.ts）：

```typescript
function trimCommandOutput(stdout: string, stderr: string, exitCode: number): string {
  // 失败：完整返回（Forge 铁律）
  if (exitCode !== 0) {
    return stderr ? `${stdout}\n\nSTDERR:\n${stderr}` : stdout;
  }

  const lines = stdout.split("\n");
  // 小输出：直接返回
  if (lines.length <= 30) return stdout;

  // 大输出：提取关键行 + 统计
  const keyLines = lines.filter(l =>
    /pass|fail|error|warn|coverage|✓|✗|PASS|FAIL|\d+ tests?/i.test(l)
  );
  return [
    `✅ exit:0 | ${lines.length} lines`,
    "--- key lines ---",
    ...keyLines.slice(0, 15),
    "--- last 5 lines ---",
    ...lines.slice(-5),
  ].join("\n");
}
```

**安全策略**：执行前复用 Forge 已有的 deny 规则检查。从 `.claude/settings.json` 的 `permissions.deny` 读取 deny patterns，对命令做 deny-only 检查。

### 3. forge_git 工具（tools/forge-git.ts）

**输入 Schema**：

```typescript
z.object({
  subcommand: z.enum(["diff", "status", "log"]).describe("Git 子命令"),
  args: z.string().optional().describe("额外的 git 参数"),
})
```

**摘要逻辑**：

- **diff**：执行 `git diff --stat`，解析输出为文件级摘要。格式复用 `context-budget.ts` 的 `serializeGitDiff` 输出格式。
- **status**：执行 `git status --porcelain`，解析为分类计数。格式复用 `serializeGitStatus` 输出格式。
- **log**：执行 `git log --oneline -N`，直接返回。

### 4. forge_read 工具（tools/forge-read.ts）

**输入 Schema**：

```typescript
z.object({
  paths: z.array(z.string()).describe("要分析的文件路径列表"),
  script: z.string().describe("分析脚本代码"),
  language: z.enum(["javascript", "shell"]).default("javascript"),
})
```

**执行逻辑**：

1. 将 `paths` 序列化为 JSON，通过 `FORGE_FILES` 环境变量传入子进程
2. 在子进程中执行 `script`，脚本可通过 `process.env.FORGE_FILES` 获取文件路径列表
3. 只返回 stdout（分析结论），文件内容不进入上下文

### 5. init.sh MCP 配置集成

在 Step 5（安装 Hooks）之后增加 MCP 配置步骤：

```bash
# 检测 Forge 库路径中的 MCP server
mcp_server_path="${FORGE_ROOT}/dist/src/mcp/server.js"

if [ -f "$mcp_server_path" ]; then
  # 合并 forge-context 到 .claude/settings.json 的 mcpServers
  node -e "
    const fs = require('fs');
    const settings = JSON.parse(fs.readFileSync('${settings_file}', 'utf-8'));
    if (!settings.mcpServers) settings.mcpServers = {};
    if (!settings.mcpServers['forge-context']) {
      settings.mcpServers['forge-context'] = {
        command: 'node',
        args: ['${mcp_server_path}']
      };
      fs.writeFileSync('${settings_file}', JSON.stringify(settings, null, 2) + '\n');
    }
  "
fi
```

### 6. SKILL.md 更新

**forge-build/SKILL.md** Context Budget Management 章节更新：

Hard Token Limits 表格中 MCP 覆盖的条目：

| Source | 更新后指导 |
|--------|----------|
| Test output (all pass) | 通过 `forge_exec` 执行，server 端自动裁剪 |
| Test output (failures) | 通过 `forge_exec` 执行，失败输出完整返回 |
| Git diff (>50 lines) | 通过 `forge_git("diff")` 执行，server 端返回文件级摘要 |
| Git status (>30 files) | 通过 `forge_git("status")` 执行，server 端返回分类计数 |
| Command output (>100 lines) | 通过 `forge_exec` 执行，server 端提取关键行 |

未被 MCP 覆盖的条目保持不变：Explore Agent results（语义压缩）、Subagent execution results（语义压缩）。

Three-Layer Output Truncation Defense 更新为：
1. forge-context MCP（主要）
2. run-with-trim.sh（fallback）
3. AI Trimming Iron Law（语义压缩）

### 7. run-with-trim.sh 增强

成功路径从 `tail -10` 改为关键行提取：

```bash
if [ $exit_code -eq 0 ]; then
    line_count=$(wc -l < "$tmpfile" | tr -d ' ')
    if [ "$line_count" -gt 30 ]; then
        echo "Output truncated: ${line_count} lines → summary:"
        grep -E '(pass|fail|error|warn|coverage|✓|✗|PASS|FAIL|[0-9]+ tests?)' "$tmpfile" | tail -15
        echo "--- last 5 lines ---"
        tail -5 "$tmpfile"
    else
        cat "$tmpfile"
    fi
fi
```

### 8. Think in Code（agents/explore.md）

已实施。在 explore agent 定义中增加预制脚本模板（模块结构概览、依赖关系、测试覆盖），当目标目录文件 > 5 个时强制使用脚本替代逐个 Read。

## Data Models

### forge_exec 输入/输出

```typescript
// 输入
interface ForgeExecInput {
  command: string;
  timeout?: number; // default 30000
}

// 输出（MCP tool response content）
// 成功 + 小输出：原始 stdout
// 成功 + 大输出：裁剪摘要
// 失败：完整 stdout + stderr
```

### forge_git 输入/输出

```typescript
// 输入
interface ForgeGitInput {
  subcommand: "diff" | "status" | "log";
  args?: string;
}

// 输出
// diff → 文件级摘要（复用 serializeGitDiff 格式）
// status → 分类计数（复用 serializeGitStatus 格式）
// log → git log --oneline 原始输出
```

### forge_read 输入/输出

```typescript
// 输入
interface ForgeReadInput {
  paths: string[];
  script: string;
  language?: "javascript" | "shell"; // default "javascript"
}

// 输出：script 的 stdout
```

## Correctness Properties

### Property 1: forge_exec 失败输出完整性

*For any* command that exits with non-zero code, THE forge_exec tool SHALL return the complete stdout and stderr without any trimming or modification.

**Validates: Requirement 2.5**

### Property 2: forge_exec 裁剪阈值行为

*For any* command that exits with code 0, WHEN stdout has ≤30 lines THE forge_exec tool SHALL return the full output unchanged, AND WHEN stdout has >30 lines THE forge_exec tool SHALL return a trimmed summary containing the exit code, total line count, key lines, and last 5 lines.

**Validates: Requirements 2.3, 2.4**

### Property 3: forge_git diff 摘要格式

*For any* `git diff --stat` output, THE forge_git tool SHALL return a summary matching the `serializeGitDiff` format from `context-budget.ts`, containing file count, per-file change statistics, and total statistics.

**Validates: Requirement 3.2**

### Property 4: forge_git status 摘要格式

*For any* `git status --porcelain` output, THE forge_git tool SHALL return a summary matching the `serializeGitStatus` format from `context-budget.ts`, containing staged/modified/untracked counts and file lists (max 10 per category).

**Validates: Requirement 3.3**

### Property 5: forge_read 输出隔离

*For any* forge_read invocation, THE tool response SHALL NOT contain the raw content of any file listed in `paths` — only the script's stdout SHALL appear in the response.

**Validates: Requirement 4.3**

### Property 6: 向后兼容性

*For any* Forge workflow execution without the MCP server available, ALL existing functionality (hooks, SKILL execution, context-budget prompt directives) SHALL continue to work identically to the pre-MCP behavior.

**Validates: Requirement 9.3**

## Error Handling

| 场景 | 处理方式 |
|------|---------|
| MCP server 启动失败 | Claude Code 标记 MCP server 为不可用，模型回退到原生 Bash + run-with-trim.sh |
| forge_exec 命令超时 | 杀死子进程，返回 `isError: true` + 超时信息 |
| forge_exec 命令被 deny 规则阻断 | 返回 `isError: true` + deny 原因，不执行命令 |
| forge_git 命令失败 | 返回完整错误输出 + `isError: true` |
| forge_read 脚本执行失败 | 返回错误输出 + `isError: true` |
| forge_read 文件路径不存在 | 脚本内部处理（fs.existsSync），不在 MCP 层拦截 |
| init.sh 无法写入 MCP 配置 | 输出警告，不阻断初始化流程 |
| settings.json 已有 forge-context 配置 | 跳过，不覆盖 |

## Testing Strategy

### 单元测试

| 测试文件 | 测试内容 |
|---------|---------|
| `test/mcp/forge-exec.test.ts` | trimCommandOutput 裁剪逻辑：小输出直接返回、大输出提取关键行、失败完整透传、超时处理 |
| `test/mcp/forge-git.test.ts` | diff 解析为文件级摘要、status 解析为分类计数、log 直接返回、命令失败处理 |
| `test/mcp/forge-read.test.ts` | 文件路径注入、脚本执行、stdout 返回、文件内容不泄露 |
| `test/mcp/output-trimmer.test.ts` | 裁剪阈值边界（30 行）、关键行提取模式、失败透传 |

### 属性测试

| Property | 测试文件 | 生成器 |
|----------|---------|--------|
| Property 1: 失败输出完整性 | `test/mcp/forge-exec.property.test.ts` | 随机命令输出 + 非零退出码 |
| Property 2: 裁剪阈值行为 | `test/mcp/forge-exec.property.test.ts` | 随机行数（1-500）+ 退出码 0 |
| Property 5: 输出隔离 | `test/mcp/forge-read.property.test.ts` | 随机文件内容 + 分析脚本 |

### 集成测试

| 测试内容 | 验证方式 |
|---------|---------|
| MCP server 启动和工具注册 | 启动 server，发送 `tools/list` 请求，验证返回 3 个工具 |
| forge_exec 端到端 | 通过 MCP 协议调用 `forge_exec("echo hello")`，验证返回 "hello" |
| forge_git 端到端 | 在 git 仓库中调用 `forge_git("status")`，验证返回结构化摘要 |

### 回归测试

所有现有测试必须通过：`npm run check`（typecheck + lint + test）。
