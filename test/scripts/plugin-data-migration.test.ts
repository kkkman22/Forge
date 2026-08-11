import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const modulePath = resolve(ROOT, "scripts/lib/plugin-data-path.mjs");

describe("plugin-data backward compatibility", () => {
  let testTmpDir: string;
  let pluginDataDir: string;

  beforeEach(() => {
    testTmpDir = join(tmpdir(), `migration-test-${Date.now()}`);
    mkdirSync(testTmpDir, { recursive: true });
    pluginDataDir = join(testTmpDir, "plugin-data");
    mkdirSync(pluginDataDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testTmpDir, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  async function importFresh() {
    return import(`${modulePath}?t=${Date.now()}`);
  }

  it("migrates old cache to new path when new path is empty", async () => {
    process.env.CLAUDE_PLUGIN_DATA = pluginDataDir;
    const { getPluginDataDir, getCachePath, migrateOldCache } = await importFresh();

    // Simulate old cache location: .forge/.cache/evolved-rules-cache.json
    const projectDir = join(testTmpDir, "project");
    const oldCacheDir = join(projectDir, ".forge", ".cache");
    mkdirSync(oldCacheDir, { recursive: true });

    const oldData = { rules: ["old-rule"], compiledAt: "2026-01-01" };
    writeFileSync(join(oldCacheDir, "evolved-rules-cache.json"), JSON.stringify(oldData), "utf-8");

    const newCachePath = getCachePath("evolved-rules-cache.json");
    expect(existsSync(newCachePath)).toBe(false);

    // Run migration
    migrateOldCache(projectDir);

    // Old file should still exist (保留不删除)
    expect(existsSync(join(oldCacheDir, "evolved-rules-cache.json"))).toBe(true);

    // New file should have old data
    expect(existsSync(newCachePath)).toBe(true);
    const migrated = JSON.parse(readFileSync(newCachePath, "utf-8"));
    expect(migrated.rules).toEqual(["old-rule"]);
  });

  it("does not overwrite existing new cache during migration", async () => {
    process.env.CLAUDE_PLUGIN_DATA = pluginDataDir;
    const { getCachePath, migrateOldCache } = await importFresh();

    const projectDir = join(testTmpDir, "project");
    const oldCacheDir = join(projectDir, ".forge", ".cache");
    mkdirSync(oldCacheDir, { recursive: true });

    writeFileSync(
      join(oldCacheDir, "evolved-rules-cache.json"),
      JSON.stringify({ rules: ["old"] }),
      "utf-8",
    );

    // Pre-create new cache with newer data
    const newCachePath = getCachePath("evolved-rules-cache.json");
    const newData = { rules: ["new"], compiledAt: "2026-05-30" };
    writeFileSync(newCachePath, JSON.stringify(newData), "utf-8");

    migrateOldCache(projectDir);

    // New cache should NOT be overwritten
    const result = JSON.parse(readFileSync(newCachePath, "utf-8"));
    expect(result.rules).toEqual(["new"]);
  });

  it("degrades gracefully when env var is invalid — falls back to homedir", async () => {
    // Invalid env var (contains ..) — falls back to homedir
    process.env.CLAUDE_PLUGIN_DATA = "/tmp/../etc/../etc/passwd";
    const { getPluginDataDir } = await importFresh();

    const result = getPluginDataDir();
    // Falls back to homedir path (writable on this system)
    expect(result).toBeTruthy();
    expect(result).toMatch(/\.claude\/plugins\/data\/tinkerman$/);
  });
});
