import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const HOOK_INPUT = JSON.stringify({ hook_event_name: "SessionStart" });

function runScript(forgeDir: string, pluginDataDir: string) {
  return execSync(`node ${ROOT}/scripts/inject-evolved-rules.mjs`, {
    cwd: forgeDir,
    input: HOOK_INPUT,
    env: { ...process.env, CLAUDE_PLUGIN_DATA: pluginDataDir },
    encoding: "utf-8",
  });
}

describe("inject-evolved-rules.mjs cache", () => {
  const originalEnv = process.env.CLAUDE_PLUGIN_DATA;
  let testTmpDir: string;
  let pluginDataDir: string;
  let forgeDir: string;

  beforeEach(() => {
    testTmpDir = join(tmpdir(), `evolved-rules-test-${Date.now()}`);
    mkdirSync(testTmpDir, { recursive: true });
    pluginDataDir = join(testTmpDir, "plugin-data");
    forgeDir = join(testTmpDir, "project");
    mkdirSync(forgeDir, { recursive: true });
    mkdirSync(pluginDataDir, { recursive: true });
  });

  afterEach(() => {
    process.env.CLAUDE_PLUGIN_DATA = originalEnv;
    try {
      rmSync(testTmpDir, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  it("creates cache file on first run", () => {
    const knowledgeDir = join(forgeDir, ".forge", "knowledge");
    mkdirSync(knowledgeDir, { recursive: true });
    writeFileSync(
      join(knowledgeDir, "evolved-rules.md"),
      `---
updated: "2026-05-30"
---

### R1: Test Rule

**Content**: Short rule for testing.
**Prevents**: Some error
`,
    );

    runScript(forgeDir, pluginDataDir);

    const cachePath = join(pluginDataDir, "tinkerman", "evolved-rules-cache.json");
    expect(existsSync(cachePath)).toBe(true);

    const cache = JSON.parse(readFileSync(cachePath, "utf-8"));
    expect(cache).toHaveProperty("sourceMtimeMs");
    expect(cache).toHaveProperty("compiledAt");
    expect(cache).toHaveProperty("rules");
  });

  it("reads from cache on second run when source unchanged", () => {
    const knowledgeDir = join(forgeDir, ".forge", "knowledge");
    mkdirSync(knowledgeDir, { recursive: true });
    writeFileSync(
      join(knowledgeDir, "evolved-rules.md"),
      `---
updated: "2026-05-30"
---

### R1: Cache Test

**Content**: Testing cache hit.
`,
    );

    // First run — creates cache
    runScript(forgeDir, pluginDataDir);

    const cachePath = join(pluginDataDir, "tinkerman", "evolved-rules-cache.json");
    const firstCache = JSON.parse(readFileSync(cachePath, "utf-8"));

    // Second run — should read cache (same mtime)
    runScript(forgeDir, pluginDataDir);

    const secondCache = JSON.parse(readFileSync(cachePath, "utf-8"));
    // compiledAt unchanged = cache was read, not rebuilt
    expect(secondCache.compiledAt).toBe(firstCache.compiledAt);
  });

  it("rebuilds cache when source file mtime changes", () => {
    const knowledgeDir = join(forgeDir, ".forge", "knowledge");
    mkdirSync(knowledgeDir, { recursive: true });
    const rulesPath = join(knowledgeDir, "evolved-rules.md");

    writeFileSync(
      rulesPath,
      `---
updated: "2026-05-30"
---

### R1: First Version

**Content**: Original content.
`,
    );

    // First run
    runScript(forgeDir, pluginDataDir);

    const cachePath = join(pluginDataDir, "tinkerman", "evolved-rules-cache.json");
    const firstCompiledAt = JSON.parse(readFileSync(cachePath, "utf-8")).compiledAt;

    // Update source with newer mtime
    writeFileSync(
      rulesPath,
      `---
updated: "2026-05-30"
---

### R1: Updated Version

**Content**: New content after update.
`,
    );

    // Brief pause to ensure mtime differs on filesystem
    execSync(`sleep 0.1`, { stdio: "pipe" });

    // Second run — should rebuild
    runScript(forgeDir, pluginDataDir);

    const secondCache = JSON.parse(readFileSync(cachePath, "utf-8"));
    expect(secondCache.compiledAt).not.toBe(firstCompiledAt);
  });

  it("rebuilds cache when cache file is corrupted", () => {
    const knowledgeDir = join(forgeDir, ".forge", "knowledge");
    mkdirSync(knowledgeDir, { recursive: true });
    writeFileSync(
      join(knowledgeDir, "evolved-rules.md"),
      `---
updated: "2026-05-30"
---

### R1: Corruption Test

**Content**: Should survive cache corruption.
`,
    );

    // First run
    runScript(forgeDir, pluginDataDir);

    const cachePath = join(pluginDataDir, "tinkerman", "evolved-rules-cache.json");
    // Corrupt the cache
    writeFileSync(cachePath, "{ corrupted json }}}");

    // Second run — should rebuild
    runScript(forgeDir, pluginDataDir);

    const cache = JSON.parse(readFileSync(cachePath, "utf-8"));
    expect(cache).toHaveProperty("compiledAt");
    expect(cache).toHaveProperty("rules");
  });

  it("degrades gracefully when CLAUDE_PLUGIN_DATA is not writable", () => {
    const knowledgeDir = join(forgeDir, ".forge", "knowledge");
    mkdirSync(knowledgeDir, { recursive: true });
    writeFileSync(
      join(knowledgeDir, "evolved-rules.md"),
      `---
updated: "2026-05-30"
---

### R1: Graceful Test

**Content**: Should work without cache.
`,
    );

    // Should not crash even with invalid plugin data path
    const result = execSync(`node ${ROOT}/scripts/inject-evolved-rules.mjs`, {
      cwd: forgeDir,
      input: HOOK_INPUT,
      env: {
        ...process.env,
        CLAUDE_PLUGIN_DATA: "/nonexistent-root-path/impossible",
      },
      encoding: "utf-8",
    });

    // Should still produce output (degraded mode — no cache)
    expect(result).toBeTruthy();
  });
});
