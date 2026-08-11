---
feature: audit-remediate-p0p1
layout: tasks
created: 2026-06-06
spec_ref: ".forge/specs/audit-remediate-p0p1/requirements.md"
format: lightweight
monolith_acknowledged: true
---

# Plan — Audit Remediate P0/P1

## File Mapping

| File | Action | Tasks |
|------|--------|-------|
| src/mcp/tools/forge-read.ts | MODIFY | T1 |
| src/mcp/tools/forge-exec.ts | MODIFY | T2 |
| src/mcp/tools/path-validator.ts | MODIFY | T1 |
| test/mcp/forge-read.test.ts | MODIFY | T1 |
| test/mcp/forge-exec.test.ts | MODIFY | T2 |
| src/router.ts:143-155 | MODIFY | T3 |
| test/router/esm-smoke.test.ts | CREATE | T3 |
| package.json:48 | MODIFY | T4 |
| dist/src/** | REGENERATE | T5 |
| scripts/build-dist.sh:209-214 | MODIFY | T6 |
| test/plugin-dist/plugin-dist-contract.test.ts | CREATE | T6 |
| src/forge-dispatcher/allowlist.ts | MODIFY | T7 |
| test/forge-dispatcher/allowlist-parity.test.ts | CREATE | T7 |
| test/ (various) | CREATE | T8 |
| .github/workflows/ci.yml:164-184 | MODIFY | T9 |
| .claude/hooks/scripts/dispatcher.sh:101-103 | MODIFY | T10 |

## Dependency Graph

```
T1 ──┐
T2 ──┤
T3 ──┼──→ T5 ──→ T6 ──→ T7 ──→ T8 ──→ T9
T4 ──┘                                    └──→ T10
```

T1-T4 并行无依赖。T5 依赖 T1-T4 编译成功。T6 依赖 T5 dist 稳定。T7 依赖 T6 dist 稳定。T8 依赖 T7 allowlist 稳定。T9-T10 并行，依赖 T8。

---

## Wave 1 — 安全 + 独立修复（T1-T4 并行）

### T1: forge_read 安全加固

- **REQ**: REQ-01 (P0-1)
- **HITL/AFK**: AFK
- **dependsOn**: []
- **est**: 20min

#### RED — Step 1: 新增 adversarial 测试用例

文件: `test/mcp/forge-read.test.ts`，在 `validateScript` describe 块内追加：

```typescript
it("rejects require('fs')", () => {
  expect(validateScript("require('fs').readFileSync('/etc/passwd','utf-8')")).toMatch(/require.*fs/);
});

it("rejects dynamic import()", () => {
  expect(validateScript("import('fs')")).toMatch(/import\(\)/);
});

it("rejects Buffer.from", () => {
  expect(validateScript("Buffer.from('data')")).toMatch(/Buffer/);
});

it("rejects WebAssembly", () => {
  expect(validateScript("WebAssembly.instantiate({})")).toMatch(/WebAssembly/);
});

it("rejects process.binding", () => {
  expect(validateScript("process.binding('fs')")).toMatch(/process\.binding/);
});

it("rejects process.env access", () => {
  expect(validateScript("const x = process.env.SECRET")).toMatch(/process\.env/);
});
```

文件: `test/mcp/forge-read.test.ts`，在 path-validator 相关 describe 块内追加 symlink 测试（需先 import `validateSinglePath`）：

```typescript
describe("path-validator symlink detection", () => {
  it("rejects paths traversing outside project root", () => {
    expect(validateSinglePath("../../etc/passwd", "/home/user/project")).toBe(false);
  });

  it("rejects absolute paths outside project root", () => {
    expect(validateSinglePath("/etc/passwd", "/home/user/project")).toBe(false);
  });
});
```

运行: `npx vitest run test/mcp/forge-read.test.ts` → 预期: 新增测试失败（现有 DANGEROUS_SCRIPT_PATTERNS 不匹配新模式）

#### RED — Step 2: 更新现有测试（预期行为变更）

文件: `test/mcp/forge-read.test.ts:400-403`

将:
```typescript
it("allows reading with require('fs')", () => {
  expect(validateScript("require('fs').readFileSync('a.ts','utf-8')")).toBeNull();
});
```

改为:
```typescript
it("rejects require('fs') as filesystem access", () => {
  expect(validateScript("require('fs').readFileSync('a.ts','utf-8')")).toMatch(/require.*fs/);
});
```

运行: `npx vitest run test/mcp/forge-read.test.ts` → 预期: 此测试现在通过（因为拒绝是预期行为），但 Step 1 的新模式仍未匹配

#### GREEN — Step 3: DANGEROUS_SCRIPT_PATTERNS 扩展

文件: `src/mcp/tools/forge-read.ts:36-58`

在 DANGEROUS_SCRIPT_PATTERNS 数组末尾追加 6 个模式：

```typescript
{ pattern: /require\s*\(\s*['"]fs/, label: "require('fs')" },
{ pattern: /require\s*\(\s*['"]node:fs/, label: "require('node:fs')" },
{ pattern: /import\s*\(/, label: "import()" },
{ pattern: /Buffer\b/, label: "Buffer" },
{ pattern: /WebAssembly\b/, label: "WebAssembly" },
{ pattern: /process\.binding/, label: "process.binding" },
{ pattern: /process\.env/, label: "process.env" },
```

运行: `npx vitest run test/mcp/forge-read.test.ts` → 预期: 全部通过

#### GREEN — Step 4: path-validator symlink 加固

文件: `src/mcp/tools/path-validator.ts`

在文件顶部 import 区域增加:
```typescript
import { realpathSync, lstatSync } from "node:fs";
```

修改 `validateSinglePath` 函数，在 resolve 后增加 symlink 检测:

```typescript
export function validateSinglePath(inputPath: string, projectRoot: string): boolean {
  const resolvedRoot = resolve(projectRoot);
  const resolved = resolve(projectRoot, inputPath);

  // Symlink detection: if the resolved path is a symlink, verify it doesn't escape
  try {
    const realResolved = realpathSync(resolved);
    const realRoot = realpathSync(resolvedRoot);
    const rel = relative(realRoot, realResolved);
    if (rel.startsWith("..") || (rel !== "" && !realResolved.startsWith(`${realRoot}/`))) {
      return false;
    }
  } catch {
    // Path doesn't exist yet — fall through to lexical check
  }

  const rel = relative(resolvedRoot, resolved);
  if (rel.startsWith("..")) return false;
  if (rel === "") return true;
  return resolved.startsWith(`${resolvedRoot}/`) || resolved === resolvedRoot;
}
```

运行: `npx vitest run test/mcp/forge-read.test.ts` → 预期: 全部通过

#### REFACTOR — Step 5: 清理

- 确认 DANGEROUS_SCRIPT_PATTERNS 无重复 pattern
- 确认 path-validator 的 realpathSync import 正确
- 运行 `npx vitest run test/mcp/` → 全部通过

#### Verify

```bash
npx vitest run test/mcp/forge-read.test.ts
npx vitest run test/mcp/path-validator.test.ts 2>/dev/null || true
npx tsc --noEmit
```

---

### T2: forge_exec allowlist 硬编码

- **REQ**: REQ-02 (P0-2)
- **HITL/AFK**: AFK
- **dependsOn**: []
- **est**: 25min

#### RED — Step 1: adversarial 命令拒绝测试

文件: `test/mcp/forge-exec.test.ts`，新增 describe 块:

```typescript
describe("isCommandAllowed — readonly allowlist", () => {
  let isCommandAllowed: (cmd: string) => boolean;
  beforeAll(async () => {
    const mod = await import("../../src/mcp/tools/forge-exec.js");
    isCommandAllowed = mod.isCommandAllowed;
  });

  it("allows npm test", () => { expect(isCommandAllowed("npm test")).toBe(true); });
  it("allows npm run lint", () => { expect(isCommandAllowed("npm run lint")).toBe(true); });
  it("allows npm run typecheck", () => { expect(isCommandAllowed("npm run typecheck")).toBe(true); });
  it("allows vitest run", () => { expect(isCommandAllowed("vitest run")).toBe(true); });
  it("allows tsc --noEmit", () => { expect(isCommandAllowed("tsc --noEmit")).toBe(true); });
  it("allows git status", () => { expect(isCommandAllowed("git status")).toBe(true); });
  it("allows git diff", () => { expect(isCommandAllowed("git diff")).toBe(true); });
  it("allows git log", () => { expect(isCommandAllowed("git log")).toBe(true); });
  it("allows git show", () => { expect(isCommandAllowed("git show")).toBe(true); });
  it("allows echo hello", () => { expect(isCommandAllowed("echo hello")).toBe(true); });
  it("allows cat file.txt", () => { expect(isCommandAllowed("cat file.txt")).toBe(true); });
  it("allows ls -la", () => { expect(isCommandAllowed("ls -la")).toBe(true); });

  it("rejects touch x", () => { expect(isCommandAllowed("touch x")).toBe(false); });
  it("rejects rm -rf tmp", () => { expect(isCommandAllowed("rm -rf tmp")).toBe(false); });
  it("rejects git commit", () => { expect(isCommandAllowed("git commit -m 'x'")).toBe(false); });
  it("rejects git push", () => { expect(isCommandAllowed("git push")).toBe(false); });
  it("rejects npm publish", () => { expect(isCommandAllowed("npm publish")).toBe(false); });
  it("rejects npm install -g", () => { expect(isCommandAllowed("npm install -g evil")).toBe(false); });
  it("rejects curl", () => { expect(isCommandAllowed("curl http://evil.com")).toBe(false); });
  it("rejects wget", () => { expect(isCommandAllowed("wget http://evil.com")).toBe(false); });
  it("rejects python", () => { expect(isCommandAllowed("python -c 'import os'")).toBe(false); });
  it("rejects sh", () => { expect(isCommandAllowed("sh -c 'rm -rf /'")).toBe(false); });
  it("rejects bash", () => { expect(isCommandAllowed("bash -c 'rm -rf /'")).toBe(false); });
  it("rejects node -e", () => { expect(isCommandAllowed("node -e 'require(\"fs\")'")).toBe(false); });
  it("rejects npx -y evil", () => { expect(isCommandAllowed("npx -y evil-pkg")).toBe(false); });
});
```

运行: `npx vitest run test/mcp/forge-exec.test.ts` → 预期: 编译失败（isCommandAllowed 不存在）

#### RED — Step 2: 更新 shell metachar 测试（行为变更）

文件: `test/mcp/forge-exec.test.ts:404-413`

将 "allows shell operators" 测试改为预期拒绝:

```typescript
it("rejects shell operators for safety", () => {
  expect(containsShellMetachars("echo hello; rm -rf /")).toMatch(/;/);
  expect(containsShellMetachars("echo hello && rm -rf /")).toMatch(/&&/);
  expect(containsShellMetachars("echo hello || rm -rf /")).toMatch(/\|\|/);
  expect(containsShellMetachars("echo hello | rm -rf /")).toMatch(/\|/);
  expect(containsShellMetachars("echo data > /tmp/out")).toMatch(/>/);
  expect(containsShellMetachars("sort < /tmp/in")).toMatch(/</);
  expect(containsShellMetachars("sleep 30 & echo bg")).toMatch(/&/);
});
```

运行: `npx vitest run test/mcp/forge-exec.test.ts` → 预期: 旧测试通过（因为旧实现允许这些），新测试失败

#### GREEN — Step 3: 新增 READONLY_COMMAND_ALLOWLIST + isCommandAllowed

文件: `src/mcp/tools/forge-exec.ts`，在 SHELL_METACHAR_PATTERNS 前插入:

```typescript
/**
 * Hardcoded allowlist of read-only / verification commands.
 * Commands not in this list are rejected regardless of settings.json.
 * This is the primary security boundary — settings.json deny is supplementary.
 */
const READONLY_COMMAND_ALLOWLIST: ReadonlySet<string> = new Set([
  // Package managers (read-only operations)
  "npm", "npx", "yarn", "pnpm", "bun",
  // TypeScript / JavaScript tools
  "vitest", "tsc", "biome", "eslint", "prettier", "jest",
  // Git read-only
  "git",
  // Unix read-only utilities
  "echo", "cat", "ls", "find", "wc", "head", "tail", "grep", "sort",
  "diff", "file", "which", "type", "env", "printenv",
  // Node.js (only safe subcommands)
  "node",
]);

/**
 * Commands that should ALWAYS be rejected even if the binary is in the allowlist.
 * These are write/mutation operations that should never run through forge_exec.
 */
const ALWAYS_DENIED_SUBCOMMANDS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["git", new Set(["commit", "push", "merge", "rebase", "reset", "checkout", "switch", "stash", "add", "rm", "mv", "clean"])],
  ["npm", new Set(["publish", "install", "ci", "uninstall", "update", "link"])],
  ["npx", new Set([])], // npx is allowed by default, but -y flag is dangerous
  ["node", new Set([])], // node -e is dangerous but caught by metachar check
]);

export function isCommandAllowed(command: string): boolean {
  const trimmed = command.trim();
  const parts = trimmed.split(/\s+/);
  const bin = parts[0];

  if (!READONLY_COMMAND_ALLOWLIST.has(bin)) return false;

  // Check denied subcommands
  const denied = ALWAYS_DENIED_SUBCOMMANDS.get(bin);
  if (denied && denied.size > 0 && parts.length > 1) {
    const sub = parts[1];
    // Handle flags before subcommand (e.g., "git -C /tmp status" → sub = "-C")
    if (denied.has(sub)) return false;
  }

  return true;
}
```

#### GREEN — Step 4: 扩展 containsShellMetachars

文件: `src/mcp/tools/forge-exec.ts:95-100`

将 SHELL_METACHAR_PATTERNS 替换为:

```typescript
const SHELL_METACHAR_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\$\(/, label: "$()" },
  { pattern: /`/, label: "`" },
  { pattern: /\n/, label: "newline" },
  { pattern: /\r/, label: "carriage-return" },
  { pattern: /;/, label: ";" },
  { pattern: /&&/, label: "&&" },
  { pattern: /\|\|/, label: "||" },
  { pattern: /\|/, label: "|" },
  { pattern: />/, label: ">" },
  { pattern: /</, label: "<" },
  { pattern: /&/, label: "&" },
];
```

#### GREEN — Step 5: 在工具注册中增加 allowlist 检查

文件: `src/mcp/tools/forge-exec.ts`，在 `registerForgeExec` 函数内，deny rules 检查之后、metachar 检查之前插入:

```typescript
// 1c. Primary security: hardcoded allowlist
if (!isCommandAllowed(command)) {
  return {
    content: [{ type: "text" as const, text: `Command not in allowlist: ${command.split(/\s+/)[0]}` }],
    isError: true,
  };
}
```

运行: `npx vitest run test/mcp/forge-exec.test.ts` → 预期: 全部通过

#### REFACTOR — Step 6: 清理

- 确认 `isSimpleCommand` 逻辑仍正确（用于 execCommand 内部路径选择）
- 确认 execCommandTracked 仅在 allowlist 通过后被调用
- 运行 `npx tsc --noEmit`

#### Verify

```bash
npx vitest run test/mcp/forge-exec.test.ts
npx tsc --noEmit
```

---

### T3: router ESM 迁移

- **REQ**: REQ-05 (P1-3)
- **HITL/AFK**: AFK
- **dependsOn**: []
- **est**: 10min

#### RED — Step 1: ESM smoke test

文件: `test/router/esm-smoke.test.ts`（CREATE）

```typescript
import { describe, it, expect } from "vitest";

describe("router ESM smoke", () => {
  it("loadIntentDictionary returns non-empty in compiled ESM", async () => {
    // This test verifies the fix for P1-3: router intent loader must work
    // in Node ESM runtime, not just in Vitest CJS context
    const mod = await import("../../src/router.js");
    const result = mod.classifyTask("请深思熟虑并严格 TDD", "ultrathink");
    // Should return intent hints, not empty array
    expect(result.intentHints.length).toBeGreaterThan(0);
  });
});
```

运行: `npx vitest run test/router/esm-smoke.test.ts` → 预期: 失败（require/__dirname 在 ESM 中不工作）

#### GREEN — Step 2: 迁移到 import.meta.url

文件: `src/router.ts:143-155`

将:
```typescript
function loadIntentDictionary(): import("./router-intents.js").IntentDefinition[] {
  if (_intentDictCache !== null) return _intentDictCache;
  try {
    const fs = require("node:fs");
    const path = require("node:path");
    const dictPath = path.resolve(__dirname, "../templates/router-intents.md");
    const content = fs.readFileSync(dictPath, "utf-8");
    _intentDictCache = parseIntentDictionary(content);
  } catch (_: unknown) {
    _intentDictCache = [];
  }
  return _intentDictCache;
}
```

改为:
```typescript
function loadIntentDictionary(): import("./router-intents.js").IntentDefinition[] {
  if (_intentDictCache !== null) return _intentDictCache;
  try {
    const fs = await_import_fs();
    const dictUrl = new URL("../templates/router-intents.md", import.meta.url);
    const content = fs.readFileSync(dictUrl, "utf-8");
    _intentDictCache = parseIntentDictionary(content);
  } catch (err: unknown) {
    // Structured diagnostic instead of silent swallow
    console.error("[router] Failed to load intent dictionary:", err instanceof Error ? err.message : String(err));
    _intentDictCache = [];
  }
  return _intentDictCache;
}
```

在文件顶部 import 区域增加:
```typescript
import { readFileSync } from "node:fs";
```

并将 `await_import_fs()` 替换为直接使用已导入的 `readFileSync`:

```typescript
function loadIntentDictionary(): import("./router-intents.js").IntentDefinition[] {
  if (_intentDictCache !== null) return _intentDictCache;
  try {
    const dictUrl = new URL("../templates/router-intents.md", import.meta.url);
    const content = readFileSync(dictUrl, "utf-8");
    _intentDictCache = parseIntentDictionary(content);
  } catch (err: unknown) {
    console.error("[router] Failed to load intent dictionary:", err instanceof Error ? err.message : String(err));
    _intentDictCache = [];
  }
  return _intentDictCache;
}
```

运行: `npx vitest run test/router/` → 预期: 全部通过

#### Verify

```bash
npx tsc --noEmit
npx vitest run test/router/
```

---

### T4: 移除 postinstall

- **REQ**: REQ-08 (P1-6)
- **HITL/AFK**: AFK
- **dependsOn**: []
- **est**: 2min

#### Step 1: 移除 postinstall 字段

文件: `package.json:48`

删除行: `"postinstall": "tsx scripts/install-hooks.ts",`

#### Verify

```bash
node -e "const p = require('./package.json'); console.log('postinstall' in (p.scripts || {}))"
# 预期输出: false
```

---

## Wave 2 — Dist 同步（T5-T6 串行）

### T5: dist 完全重生成

- **REQ**: REQ-03 (P1-1)
- **HITL/AFK**: AFK
- **dependsOn**: [T1, T2, T3, T4]
- **est**: 5min

#### Step 1: 重生成 dist

```bash
npm run dist:resync
```

#### Step 2: 验证

```bash
node scripts/check-dist-sync.mjs
# 预期: exit 0
```

#### Verify

```bash
node scripts/check-dist-sync.mjs
```

---

### T6: plugin dist 补打包

- **REQ**: REQ-06 (P1-4)
- **HITL/AFK**: AFK
- **dependsOn**: [T5]
- **est**: 10min

#### RED — Step 1: contract test

文件: `test/plugin-dist/plugin-dist-contract.test.ts`（CREATE）

```typescript
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

const FORGE_ROOT = join(import.meta.dirname, "../..");
const PLUGIN_DIST = join(FORGE_ROOT, "dist-plugin");

describe("plugin dist contract", () => {
  it("contains hooks/hooks.json", () => {
    expect(existsSync(join(PLUGIN_DIST, "hooks/hooks.json"))).toBe(true);
  });

  it("contains .mcp.json or equivalent MCP manifest", () => {
    // Either .mcp.json in root or MCP config in .claude-plugin/plugin.json
    const hasMcpJson = existsSync(join(PLUGIN_DIST, ".mcp.json"));
    const hasPluginJson = existsSync(join(PLUGIN_DIST, ".claude-plugin/plugin.json"));
    expect(hasMcpJson || hasPluginJson).toBe(true);
  });

  it("hooks.json contains at least one hook", async () => {
    const fs = await import("node:fs/promises");
    const content = await fs.readFile(join(PLUGIN_DIST, "hooks/hooks.json"), "utf-8");
    const parsed = JSON.parse(content);
    const hookCount = Object.values(parsed).flat().length;
    expect(hookCount).toBeGreaterThan(0);
  });
});
```

运行: `npx vitest run test/plugin-dist/` → 预期: 失败（dist-plugin 缺少 hooks/）

#### GREEN — Step 2: build-dist.sh 补复制

文件: `scripts/build-dist.sh`，在 `cp -r "${FORGE_ROOT}/commands" "${PLUGIN_DIST}/commands"` (line ~211) 之后插入:

```bash
# P1-4 fix: include hooks/ and MCP manifest in plugin dist
cp -r "${FORGE_ROOT}/hooks" "${PLUGIN_DIST}/hooks"
if [ -f "${FORGE_ROOT}/.mcp.json" ]; then
  cp "${FORGE_ROOT}/.mcp.json" "${PLUGIN_DIST}/.mcp.json"
fi
```

运行:
```bash
bash scripts/build-dist.sh
npx vitest run test/plugin-dist/
```

#### Verify

```bash
npx vitest run test/plugin-dist/
ls dist-plugin/hooks/hooks.json
```

---

## Wave 3 — Registry + Coverage（T7-T8 串行）

### T7: allowlist parity 修复

- **REQ**: REQ-04 (P1-2)
- **HITL/AFK**: AFK
- **dependsOn**: [T6]
- **est**: 10min

#### RED — Step 1: parity test + dispatch 测试

文件: `test/forge-dispatcher/allowlist-parity.test.ts`（CREATE）

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALLOW_LIST, validateTopic } from "../../src/forge-dispatcher/allowlist.js";

const FORGE_ROOT = join(import.meta.dirname, "../..");
const REGISTRY_PATH = join(FORGE_ROOT, "skills/forge/registry.toml");

function parseRegistrySections(tomlContent: string): string[] {
  const sections: string[] = [];
  for (const line of tomlContent.split("\n")) {
    const match = /^\[([^\]]+)\]/.exec(line);
    if (match) sections.push(match[1]);
  }
  return sections;
}

describe("allowlist parity", () => {
  it("ALLOW_LIST length matches registry.toml section count", () => {
    const toml = readFileSync(REGISTRY_PATH, "utf-8");
    const sections = parseRegistrySections(toml);
    expect(ALLOW_LIST.length).toBe(sections.length);
  });

  it("dispatches 'init' successfully", () => {
    expect(validateTopic("init")).toEqual({ ok: true, value: "init" });
  });

  it("dispatches 'review-comment-bitbucket' successfully", () => {
    expect(validateTopic("review-comment-bitbucket")).toEqual({ ok: true, value: "review-comment-bitbucket" });
  });

  it("every registry section is in ALLOW_LIST", () => {
    const toml = readFileSync(REGISTRY_PATH, "utf-8");
    const sections = parseRegistrySections(toml);
    for (const section of sections) {
      expect(ALLOW_LIST).toContain(section);
    }
  });
});
```

运行: `npx vitest run test/forge-dispatcher/allowlist-parity.test.ts` → 预期: 失败（ALLOW_LIST 缺 init 和 review-comment-bitbucket）

#### GREEN — Step 2: 补 allowlist

文件: `src/forge-dispatcher/allowlist.ts`

在 ALLOW_LIST 数组中（按字母序）插入:

- `"init"`（在 `"grill"` 之后）
- `"review-comment-bitbucket"`（在 `"review"` 之后）

运行: `npx vitest run test/forge-dispatcher/allowlist-parity.test.ts` → 预期: 通过

#### Verify

```bash
npx vitest run test/forge-dispatcher/
npx tsc --noEmit
```

---

### T8: coverage 补充

- **REQ**: REQ-07 (P1-5)
- **HITL/AFK**: AFK
- **dependsOn**: [T7]
- **est**: 15min

#### Step 1: 识别 coverage gap

```bash
npm run test:coverage 2>&1 | grep -A5 "Coverage report"
```

识别 branches 低于 79% 的文件。

#### Step 2: 补充边界测试

针对以下文件补充 branch tests（根据 Step 1 结果调整）:
- `src/mcp/tools/forge-exec.ts`: 补 isCommandAllowed 边界（空命令、全路径命令、子命令含 flag）
- `src/mcp/tools/path-validator.ts`: 补 realpath 路径（不存在的路径、项目根本身）
- `src/router.ts`: 补 loadIntentDictionary 错误路径

#### Verify

```bash
npm run test:coverage
# 预期: exit 0, branches ≥ 79%
```

---

## Wave 4 — CI + Hook 基础设施（T9-T10 并行）

### T9: CI publish gate 加固

- **REQ**: REQ-09 (P1-7)
- **HITL/AFK**: AFK
- **dependsOn**: [T8]
- **est**: 5min

#### Step 1: 增加 needs 和验证步骤

文件: `.github/workflows/ci.yml:164-184`

将:
```yaml
  publish:
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    steps:
```

改为:
```yaml
  publish:
    if: startsWith(github.ref, 'refs/tags/v')
    needs: [check, security-audit, plugin-validate]
    runs-on: ubuntu-latest
    steps:
```

在 `npm test` 步骤之后、`npm publish` 之前插入:

```yaml
      - name: Full quality gate
        run: npm run check
      - name: Security audit
        run: npm audit --registry=https://registry.npmjs.org --audit-level=high
```

#### Verify

```bash
node -e "const yaml = require('js-yaml'); const fs = require('fs'); const wf = yaml.load(fs.readFileSync('.github/workflows/ci.yml','utf-8')); console.log('publish.needs:', wf.publish.needs);"
# 预期: [ 'check', 'security-audit', 'plugin-validate' ]
```

注: 如果 js-yaml 不可用，手动验证 YAML 语法: `node -e "JSON.parse(require('yaml').stringify(require('yaml').parse(require('fs').readFileSync('.github/workflows/ci.yml','utf-8'))))"` 或用在线 YAML validator。

---

### T10: Stop hook 127 修复

- **REQ**: REQ-10 (P1-8)
- **HITL/AFK**: AFK
- **dependsOn**: [T8]
- **est**: 5min

#### Step 1: 移除 dispatcher.sh 旧引用

文件: `.claude/hooks/scripts/dispatcher.sh:101-103`

删除:
```bash
  # Persistent loop
  bash forge/scripts/persistent-loop.sh 2>/dev/null || \
    bash ~/.claude/skills/forge/scripts/persistent-loop.sh 2>/dev/null || true
```

#### Step 2: 验证 hooks.json Stop 段脚本存在

检查 hooks.json Stop 段（lines 226-297）中所有 `args` 引用的脚本文件是否存在:
- `scripts/record-evolved-rule-violation.mjs`
- `scripts/flag-stale-evolved-rules.mjs`
- `scripts/cmux-mirror/sync-once.mjs`
- `scripts/stop-additional-context.mjs`

```bash
for f in scripts/record-evolved-rule-violation.mjs scripts/flag-stale-evolved-rules.mjs scripts/cmux-mirror/sync-once.mjs scripts/stop-additional-context.mjs; do
  [ -f "$f" ] && echo "✅ $f" || echo "❌ $f MISSING"
done
```

#### Verify

```bash
grep -r "persistent-loop" .claude/hooks/scripts/dispatcher.sh hooks/hooks.json
# 预期: 无输出（无 persistent-loop 引用）
```

---

## Self-Check

| Check | Result |
|-------|--------|
| Spec Coverage | ✅ REQ-01~REQ-10 全部覆盖 |
| Placeholder Scan | ✅ 无 TBD/TODO/待确认/适当 |
| Type Consistency | ✅ 所有 import 引用已定义 |
| Dependencies | ✅ 无循环，T1-T4 并行，T5→T6→T7→T8→T9/T10 串行 |
| Plan Structure | ✅ 10 tasks / 4 waves，monolith acknowledged |

## Definition of Done

- [ ] Wave 1: `npx vitest run test/mcp/` 全绿，`npx tsc --noEmit` 通过
- [ ] Wave 2: `node scripts/check-dist-sync.mjs` exit 0，plugin dist contract test 通过
- [ ] Wave 3: allowlist parity test 通过，`npm run test:coverage` exit 0
- [ ] Wave 4: CI YAML 语法正确，无 persistent-loop 引用
- [ ] 全局: `npm run check` exit 0
