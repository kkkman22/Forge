---
topic: "audit-phase1-security-quality"
status: approved
date: "2026-06-05"
spec_ref: "none"
format: full
source: "PROJECT_AUDIT_REPORT.md Phase 1"
---

# Plan: Audit Phase 1 — Security Hardening & Code Quality

## File Mapping

| File | Action | Task |
|------|--------|------|
| `src/mcp/tools/forge-exec.ts` | MODIFY | T1 |
| `test/mcp/forge-exec.test.ts` | MODIFY | T1 |
| `src/mcp/tools/forge-read.ts` | MODIFY | T2 |
| `test/mcp/forge-read.test.ts` | MODIFY | T2 |
| `src/review-comment-bitbucket/post.ts` | MODIFY | T3 |
| `src/review-comment-bitbucket/types.ts` | MODIFY | T3 |
| `test/review-comment-bitbucket/post.test.ts` | MODIFY | T3 |
| `src/feature-dossier.ts` | MODIFY | T4 |
| `src/harness-detector.ts` | MODIFY | T4 |
| `src/lint/pack-rules.ts` | MODIFY | T4 |
| `src/mcp/trimmers/output.ts` | MODIFY | T4 |
| `src/pack/loader.ts` | MODIFY | T4 |
| `src/process-registry.ts` | MODIFY | T4 |
| `src/rate-limit-degrader.ts` | MODIFY | T4 |
| `src/router.ts` | MODIFY | T4 |
| `src/stream-json-adapter.ts` | MODIFY | T4 |

---

## Task 1: isCommandDenied hardening + shell metachar detection

**Priority**: P0 (CRITICAL — command injection vector)
**File**: `src/mcp/tools/forge-exec.ts`
**Test**: `test/mcp/forge-exec.test.ts`
**Interaction**: AFK
**dependsOn**: []

### RED

在 `test/mcp/forge-exec.test.ts` 添加测试用例：

```typescript
describe("isCommandDenied — security hardening", () => {
  // Fix: `?` not escaped in glob→regex conversion
  it("blocks commands matching glob with ?", () => {
    const patterns = ["Bash(rm -?? *)"];
    expect(isCommandDenied("rm -rf /", patterns)).toBeTruthy();
  });

  // Shell metachar detection: semicolon injection
  it("blocks shell metachar injection via semicolon", () => {
    const patterns = ["Bash(rm *)"];
    expect(isCommandDenied("echo hello; rm -rf /", patterns)).toBe(
      "Command contains shell metacharacters: ;",
    );
  });

  // Shell metachar detection: && injection
  it("blocks shell metachar injection via &&", () => {
    const patterns = ["Bash(rm *)"];
    expect(isCommandDenied("echo hello && rm -rf /", patterns)).toBe(
      "Command contains shell metacharacters: &&",
    );
  });

  // Shell metachar detection: pipe injection
  it("blocks shell metachar injection via pipe", () => {
    const patterns = ["Bash(rm *)"];
    expect(isCommandDenied("echo hello | rm -rf /", patterns)).toBe(
      "Command contains shell metacharacters: |",
    );
  });

  // Shell metachar detection: command substitution
  it("blocks shell metachar injection via $()", () => {
    const patterns: string[] = [];
    expect(isCommandDenied("$(cat /etc/passwd)", patterns)).toBe(
      "Command contains shell metacharacters: $()",
    );
  });

  // Shell metachar detection: backtick injection
  it("blocks shell metachar injection via backtick", () => {
    const patterns: string[] = [];
    expect(isCommandDenied("`rm -rf /`", patterns)).toBe(
      "Command contains shell metacharacters: `",
    );
  });

  // Legitimate commands pass through when no deny match
  it("allows legitimate npm commands with no deny patterns", () => {
    expect(isCommandDenied("npm test", [])).toBeNull();
  });

  // Legitimate pipe usage in allowlisted commands
  it("allows pipe in explicit allowlist", () => {
    // Commands that are explicitly in allow patterns should pass
    const patterns = ["Bash(rm *)"];
    expect(isCommandDenied("npm run check", patterns)).toBeNull();
  });
});
```

运行 `npx vitest run test/mcp/forge-exec.test.ts` — 所有新测试应 **FAIL**。

### GREEN

在 `src/mcp/tools/forge-exec.ts` 中：

1. 修复 `escapeRegexChar` 缺失的 `?` 转义（当前正则 `/ [+^${}()|[\]\\]/g` 缺少 `?`）：

```typescript
function escapeRegexChar(ch: string): string {
  return `\\${ch}`;
}

// 修复：将 ? 也纳入转义范围
const escaped = glob.replace(/[.+^${}()|[\]\\?]/g, escapeRegexChar).replace(/\*/g, ".*");
```

2. 添加 `containsShellMetachars` 函数，在 deny 检查之后、执行之前检测 shell 元字符：

```typescript
const SHELL_METACHAR_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /;/, label: ";" },
  { pattern: /&&/, label: "&&" },
  { pattern: /\|\|/, label: "||" },
  { pattern: /\|/, label: "|" },
  { pattern: /\$\(/, label: "$()" },
  { pattern: /`/, label: "`" },
];

/**
 * Detect shell metacharacters that could enable command injection.
 * Returns the metachar label if found, or null if the command is safe.
 *
 * This is a defense-in-depth check: commands with metacharacters
 * that allow chaining multiple commands are flagged regardless of
 * deny-pattern matching.
 */
export function containsShellMetachars(command: string): string | null {
  for (const { pattern, label } of SHELL_METACHAR_PATTERNS) {
    if (pattern.test(command)) {
      return `Command contains shell metacharacters: ${label}`;
    }
  }
  return null;
}
```

3. 在 `registerForgeExec` 的 tool handler 中，deny 检查之后添加 metachar 检查：

```typescript
// 1. Check deny rules
const denyPatterns = await readDenyPatterns(settingsPath);
const denyReason = isCommandDenied(command, denyPatterns);
if (denyReason) {
  return { content: [{ type: "text" as const, text: denyReason }], isError: true };
}

// 1b. Defense-in-depth: shell metachar detection
const metacharReason = containsShellMetachars(command);
if (metacharReason) {
  return { content: [{ type: "text" as const, text: metacharReason }], isError: true };
}
```

运行 `npx vitest run test/mcp/forge-exec.test.ts` — 所有测试应 **PASS**。

### REFACTOR

- 提取 `SHELL_METACHAR_PATTERNS` 为模块级常量（已实现）
- 确认 `globRegexCache` 的 LRU 限制无需变更（deny patterns 数量有限）

### Verify

```bash
npx vitest run test/mcp/forge-exec.test.ts
```

### Commit

```
fix(security): harden isCommandDenied regex + add shell metachar detection

- Fix glob→regex conversion missing `?` escaping
- Add containsShellMetachars() defense-in-depth check for ;, &&, ||, |, $(), `
- Blocks command injection vectors before subprocess spawn

Closes: audit R1, R3
```

---

## Task 2: forge-read path validation + script safety

**Priority**: P0 (CRITICAL — arbitrary code execution vector)
**File**: `src/mcp/tools/forge-read.ts`
**Test**: `test/mcp/forge-read.test.ts`
**Interaction**: AFK
**dependsOn**: []

### RED

在 `test/mcp/forge-read.test.ts` 添加测试用例：

```typescript
describe("forge_read — security hardening", () => {
  // Path traversal: parent directory escape
  it("rejects paths escaping project root", () => {
    const invalid = validatePaths(["/etc/passwd"], "/home/user/project");
    expect(invalid).toBe("Path escapes project root: /etc/passwd");
  });

  // Path traversal: relative parent
  it("rejects relative paths with ..", () => {
    const invalid = validatePaths(["../../../etc/passwd"], "/home/user/project");
    expect(invalid).toBe("Path escapes project root: ../../../etc/passwd");
  });

  // Valid paths pass
  it("allows paths within project root", () => {
    const invalid = validatePaths(
      ["/home/user/project/src/index.ts"],
      "/home/user/project",
    );
    expect(invalid).toBeNull();
  });

  // Script safety: blocks require('child_process')
  it("rejects scripts importing child_process", () => {
    const reason = validateScript("require('child_process').exec('rm -rf /')");
    expect(reason).toBe("Script contains dangerous pattern: child_process");
  });

  // Script safety: blocks process.exit
  it("rejects scripts calling process.exit", () => {
    const reason = validateScript("process.exit(1)");
    expect(reason).toBe("Script contains dangerous pattern: process.exit");
  });

  // Script safety: blocks eval
  it("rejects scripts using eval", () => {
    const reason = validateScript("eval(' malicious code ')");
    expect(reason).toBe("Script contains dangerous pattern: eval(");
  });

  // Script safety: blocks import('fs') write operations
  it("rejects scripts importing fs for write", () => {
    const reason = validateScript("import('fs').then(f => f.writeFileSync('/tmp/x',''))");
    expect(reason).toBe("Script contains dangerous pattern: writeFileSync");
  });

  // Script safety: allows legitimate analysis scripts
  it("allows legitimate file analysis scripts", () => {
    const reason = validateScript(`
      const files = JSON.parse(process.env.FORGE_FILES);
      files.forEach(f => console.log(f));
    `);
    expect(reason).toBeNull();
  });
});
```

运行 `npx vitest run test/mcp/forge-read.test.ts` — 所有新测试应 **FAIL**。

### GREEN

在 `src/mcp/tools/forge-read.ts` 中添加：

1. 路径验证函数：

```typescript
import { resolve, relative } from "node:path";

/**
 * Validate that all paths resolve within the project root.
 * Returns an error message if any path escapes, or null if all safe.
 */
export function validatePaths(paths: string[], projectRoot: string): string | null {
  for (const p of paths) {
    const resolved = resolve(projectRoot, p);
    const rel = relative(projectRoot, resolved);
    if (rel.startsWith("..") || resolve(p) !== resolved && resolve(p).startsWith("/")) {
      // Absolute path that doesn't start with project root
      if (!resolved.startsWith(resolve(projectRoot))) {
        return `Path escapes project root: ${p}`;
      }
    }
    if (rel.startsWith("..")) {
      return `Path escapes project root: ${p}`;
    }
  }
  return null;
}
```

2. 脚本安全验证函数：

```typescript
const DANGEROUS_SCRIPT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /child_process/, label: "child_process" },
  { pattern: /process\.exit/, label: "process.exit" },
  { pattern: /eval\s*\(/, label: "eval(" },
  { pattern: /Function\s*\(/, label: "Function(" },
  { pattern: /writeFileSync/, label: "writeFileSync" },
  { pattern: /writeFile/, label: "writeFile" },
  { pattern: /appendFileSync/, label: "appendFileSync" },
  { pattern: /appendFile/, label: "appendFile" },
  { pattern: /mkdirSync/, label: "mkdirSync" },
  { pattern: /mkdir/, label: "mkdir" },
  { pattern: /unlinkSync/, label: "unlinkSync" },
  { pattern: /unlink/, label: "unlink" },
  { pattern: /rmSync/, label: "rmSync" },
  { pattern: /rmdir/, label: "rmdir" },
  { pattern: /renameSync/, label: "renameSync" },
  { pattern: /rename/, label: "rename" },
  { pattern: /chmodSync/, label: "chmodSync" },
  { pattern: /chownSync/, label: "chownSync" },
  { pattern: /execSync/, label: "execSync" },
  { pattern: /spawnSync/, label: "spawnSync" },
  { pattern: /execFileSync/, label: "execFileSync" },
  { pattern: /require\s*\(\s*['"]child_process/, label: "child_process require" },
  { pattern: /import\s+.*from\s+['"]child_process/, label: "child_process import" },
];

/**
 * Validate that a script does not contain dangerous patterns.
 * Returns an error message if dangerous, or null if safe.
 */
export function validateScript(script: string): string | null {
  for (const { pattern, label } of DANGEROUS_SCRIPT_PATTERNS) {
    if (pattern.test(script)) {
      return `Script contains dangerous pattern: ${label}`;
    }
  }
  return null;
}
```

3. 在 `registerForgeRead` 的 tool handler 中添加验证：

```typescript
async ({ paths, script, language }) => {
  // Security: validate paths stay within project root
  if (root) {
    const pathError = validatePaths(paths, root.path);
    if (pathError) {
      return {
        content: [{ type: "text" as const, text: pathError }],
        isError: true,
      };
    }
  }

  // Security: validate script for dangerous patterns
  if (language === "javascript") {
    const scriptError = validateScript(script);
    if (scriptError) {
      return {
        content: [{ type: "text" as const, text: scriptError }],
        isError: true,
      };
    }
  }

  // ... existing execution logic
```

运行 `npx vitest run test/mcp/forge-read.test.ts` — 所有测试应 **PASS**。

### REFACTOR

- 确认 `validatePaths` 使用 `relative()` + `startsWith("..")` 的标准模式
- 考虑将 `DANGEROUS_SCRIPT_PATTERNS` 提取为可配置列表

### Verify

```bash
npx vitest run test/mcp/forge-read.test.ts
```

### Commit

```
fix(security): add path traversal + script validation to forge-read

- Add validatePaths() to block paths escaping project root
- Add validateScript() to detect dangerous Node.js API usage
- Blocks arbitrary code execution via node -e

Closes: audit R2
```

---

## Task 3: post.ts type safety — eliminate `any` types

**Priority**: P1 (type safety consistency)
**Files**: `src/review-comment-bitbucket/post.ts`, `src/review-comment-bitbucket/types.ts`
**Test**: `test/review-comment-bitbucket/post.test.ts`
**Interaction**: AFK
**dependsOn**: []

### RED

在 `test/review-comment-bitbucket/post.test.ts` 添加测试用例：

```typescript
describe("post.ts — type safety", () => {
  it("extractForgeTasks handles missing fields gracefully", () => {
    const result = extractForgeTasks(
      [{ id: 1, content: "[forge:abc123] task text" }],
      "forge",
    );
    expect(result).toHaveLength(1);
    expect(result[0].task_id).toBe("1");
    expect(result[0].marker_hash).toBe("abc123");
  });

  it("extractForgeTasks returns empty for tasks without marker", () => {
    const result = extractForgeTasks(
      [{ id: 2, text: "regular task without marker" }],
      "forge",
    );
    expect(result).toHaveLength(0);
  });

  it("extractForgeComments handles nested content.raw", () => {
    const result = extractForgeComments(
      {
        active_comments: [
          { id: 10, content: { raw: "[forge:def456] comment" }, path: "a.ts", line: 5 },
        ],
      },
      "forge",
    );
    expect(result).toHaveLength(1);
    expect(result[0].comment_id).toBe("10");
  });

  it("extractForgeComments returns empty for comments without marker", () => {
    const result = extractForgeComments(
      {
        active_comments: [
          { id: 11, content: { raw: "regular comment" }, path: "b.ts", line: 1 },
        ],
      },
      "forge",
    );
    expect(result).toHaveLength(0);
  });
});
```

运行 `npx vitest run test/review-comment-bitbucket/post.test.ts` — 新测试可能 **PASS**（功能不变），但重点验证 `any` 类型已替换。

### GREEN

1. 在 `src/review-comment-bitbucket/types.ts` 中添加 Bitbucket API 响应类型（如果文件不存在，在 `post.ts` 文件内联定义）：

```typescript
/** Bitbucket PR task API response shape */
export interface BitbucketTaskResponse {
  id: number | string;
  content?: string;
  text?: string;
  state?: string;
  status?: string;
}

/** Bitbucket PR comment API response shape */
export interface BitbucketCommentResponse {
  id: number | string;
  content?: { raw?: string };
  text?: string;
  path?: string;
  file_path?: string;
  line?: number;
  line_number?: number;
}

/** Bitbucket PR API response shape */
export interface BitbucketPrResponse {
  active_comments?: BitbucketCommentResponse[];
  comments?: BitbucketCommentResponse[];
}
```

2. 在 `post.ts` 中：

a. 替换 `BitbucketClient` 接口中的 `any`：

```typescript
export interface BitbucketClient {
  list_pr_tasks(params: { pull_request_id: string }): Promise<BitbucketTaskResponse[]>;
  get_pull_request(params: { pull_request_id: string }): Promise<BitbucketPrResponse>;
  get_pull_request_diff(params: { pull_request_id: string }): Promise<string>;
  create_pr_task(params: {
    pull_request_id: string;
    text: string;
    anchor?: string;
  }): Promise<{ id: string }>;
  set_pr_task_status(params: { task_id: string; done: boolean }): Promise<void>;
  add_comment(params: {
    pull_request_id: string;
    file_path: string;
    line_number: number;
    line_type: string;
    comment_text: string;
    suggestion?: string;
    suggestion_end_line?: number;
    parent_comment_id?: string;
  }): Promise<{ id: string }>;
  set_review_status(params: {
    pull_request_id: string;
    request_changes: boolean;
    comment: string;
  }): Promise<void>;
}
```

b. 替换所有 8 处 `catch (e: any)` 为类型安全的错误提取：

```typescript
// 替换前:
} catch (e: any) {
  failures.push({ ..., error_message: e.message, ... });
}

// 替换后:
} catch (e: unknown) {
  failures.push({ ..., error_message: e instanceof Error ? e.message : String(e), ... });
}
```

c. 替换 `extractForgeTasks` 参数类型：

```typescript
function extractForgeTasks(raw: BitbucketTaskResponse[], prefix: string): TaskRecord[] {
  return raw
    .map((t) => {
      const text = t.content || t.text || "";
      // ...
    })
    // ...
}
```

d. 替换 `extractForgeComments` 参数类型：

```typescript
function extractForgeComments(rawPr: BitbucketPrResponse, prefix: string): CommentRecord[] {
  const comments = rawPr?.active_comments ?? rawPr?.comments ?? [];
  return comments
    .map((c) => {
      const text = c.content?.raw || c.text || "";
      // ...
    })
    // ...
}
```

运行 `npx vitest run test/review-comment-bitbucket/post.test.ts` — 所有测试应 **PASS**。

### REFACTOR

- 确认 `BitbucketTaskResponse`、`BitbucketCommentResponse`、`BitbucketPrResponse` 类型放在 `types.ts` 中（如存在）或 post.ts 顶部
- 运行 `npx tsc --noEmit` 确认无类型错误

### Verify

```bash
npx vitest run test/review-comment-bitbucket/post.test.ts
npx tsc --noEmit
```

### Commit

```
fix(types): eliminate `any` from post.ts and BitbucketClient interface

- Define BitbucketTaskResponse, BitbucketCommentResponse, BitbucketPrResponse types
- Replace 8 catch(e: any) with catch(e: unknown) + instanceof type guard
- Type extractForgeTasks and extractForgeComments parameters

Closes: audit §4.1
```

---

## Task 4: Biome noUnusedVariables — 11 处 catch(err) 修复

**Priority**: P1 (lint hygiene)
**Files**: 11 files (see mapping)
**Interaction**: AFK
**dependsOn**: []

### RED

运行基线确认 11 个警告：

```bash
npx biome check src/ 2>&1 | grep noUnusedVariables | wc -l
# Expected: 11
```

### GREEN

所有 11 处修复模式相同 — `catch (err: unknown)` → `catch (_: unknown)`：

| File | Line | Change |
|------|------|--------|
| `src/feature-dossier.ts` | 170 | `err` → `_` |
| `src/feature-dossier.ts` | 383 | `err` → `_` |
| `src/feature-dossier.ts` | 393 | `err` → `_` |
| `src/harness-detector.ts` | 35 | `err` → `_` |
| `src/lint/pack-rules.ts` | 333 | `err` → `_` |
| `src/mcp/trimmers/output.ts` | 53 | `err` → `_` |
| `src/pack/loader.ts` | 94 | `err` → `_` |
| `src/process-registry.ts` | 163 | `err` → `_` |
| `src/rate-limit-degrader.ts` | 77 | `err` → `_` |
| `src/router.ts` | 151 | `err` → `_` |
| `src/stream-json-adapter.ts` | 192 | `err` → `_` |

### REFACTOR

无 — 机械重命名，无行为变更。

### Verify

```bash
npx biome check src/ 2>&1 | grep noUnusedVariables
# Expected: (empty — 0 warnings)
```

### Commit

```
fix(lint): resolve 11 noUnusedVariables warnings in catch blocks

Rename unused `err` to `_` in catch clauses across 11 files.

Closes: audit §4.3
```

---

## Dependency Graph

```
T1 (forge-exec hardening)  ──┐
T2 (forge-read safety)    ──┤── 互相独立，可并行
T3 (post.ts types)        ──┤
T4 (Biome lint)           ──┘
```

所有 4 个任务互相独立（`dependsOn: []`），执行顺序：T1 → T2 → T3 → T4（按优先级 P0→P1 排序）。
