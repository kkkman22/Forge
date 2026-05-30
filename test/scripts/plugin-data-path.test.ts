import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// We test the ESM module by dynamic import in each test to reset module cache
const modulePath = resolve(__dirname, "../../scripts/lib/plugin-data-path.mjs");

describe("plugin-data-path", () => {
  const originalEnv = process.env.CLAUDE_PLUGIN_DATA;
  let testTmpDir: string;

  beforeEach(() => {
    testTmpDir = join(tmpdir(), `plugin-data-test-${Date.now()}`);
    mkdirSync(testTmpDir, { recursive: true });
    delete process.env.CLAUDE_PLUGIN_DATA;
  });

  afterEach(() => {
    process.env.CLAUDE_PLUGIN_DATA = originalEnv;
    try {
      rmSync(testTmpDir, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  async function importFresh() {
    // Bust ESM cache with a timestamp query
    const mod = await import(`${modulePath}?t=${Date.now()}`);
    return mod;
  }

  describe("getPluginDataDir", () => {
    it("uses CLAUDE_PLUGIN_DATA/forge when env var is set", async () => {
      const customDir = join(testTmpDir, "plugin-data");
      mkdirSync(customDir, { recursive: true });
      process.env.CLAUDE_PLUGIN_DATA = customDir;

      const { getPluginDataDir } = await importFresh();
      const result = getPluginDataDir();

      expect(result).toBe(join(customDir, "forge"));
      expect(existsSync(result)).toBe(true);
    });

    it("falls back to ~/.claude/plugins/data/forge/ when env var is unset", async () => {
      delete process.env.CLAUDE_PLUGIN_DATA;

      const { getPluginDataDir } = await importFresh();
      const result = getPluginDataDir();

      const expected = join(process.env.HOME || "~", ".claude", "plugins", "data", "forge");
      expect(result).toBe(expected);
    });

    it("returns an absolute path", async () => {
      const customDir = join(testTmpDir, "abs-test");
      mkdirSync(customDir, { recursive: true });
      process.env.CLAUDE_PLUGIN_DATA = customDir;

      const { getPluginDataDir } = await importFresh();
      const result = getPluginDataDir();

      expect(result).toBe(resolve(result));
    });

    it("auto-creates the directory on first call", async () => {
      const customDir = join(testTmpDir, "auto-create-test");
      // Don't create customDir yet — let the function handle it
      process.env.CLAUDE_PLUGIN_DATA = customDir;

      const { getPluginDataDir } = await importFresh();
      const result = getPluginDataDir();

      expect(existsSync(result)).toBe(true);
    });

    it("returns null when directory is not writable", async () => {
      // Use a path that can't be created — root-owned path
      process.env.CLAUDE_PLUGIN_DATA = "/proc/nonexistent/impossible/path";

      const { getPluginDataDir } = await importFresh();
      const result = getPluginDataDir();

      expect(result).toBeNull();
    });
  });

  describe("getCachePath", () => {
    it("returns path under plugin data dir with given filename", async () => {
      const customDir = join(testTmpDir, "cache-path-test");
      mkdirSync(customDir, { recursive: true });
      process.env.CLAUDE_PLUGIN_DATA = customDir;

      const { getCachePath } = await importFresh();
      const result = getCachePath("evolved-rules-cache.json");

      expect(result).toBe(join(customDir, "forge", "evolved-rules-cache.json"));
    });

    it("returns null when getPluginDataDir returns null", async () => {
      process.env.CLAUDE_PLUGIN_DATA = "/proc/nonexistent/impossible/path";

      const { getCachePath } = await importFresh();
      const result = getCachePath("test.json");

      expect(result).toBeNull();
    });
  });
});
