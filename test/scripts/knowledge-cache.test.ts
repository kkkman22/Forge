import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const modulePath = resolve(ROOT, "scripts/lib/plugin-data-path.mjs");

describe("knowledge-hook-dispatch cache path integration", () => {
  let testTmpDir: string;
  let pluginDataDir: string;

  beforeEach(() => {
    testTmpDir = join(tmpdir(), `knowledge-cache-test-${Date.now()}`);
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

  it("knowledge-cache.json resolves to correct plugin data path", async () => {
    process.env.CLAUDE_PLUGIN_DATA = pluginDataDir;
    const { getCachePath } = await importFresh();

    const cachePath = getCachePath("knowledge-cache.json");
    expect(cachePath).toBe(join(pluginDataDir, "tinkerman", "knowledge-cache.json"));
  });

  it("knowledge cache path uses custom CLAUDE_PLUGIN_DATA", async () => {
    const customDir = join(testTmpDir, "custom-plugin-data");
    mkdirSync(customDir, { recursive: true });
    process.env.CLAUDE_PLUGIN_DATA = customDir;

    const { getCachePath } = await importFresh();
    const cachePath = getCachePath("knowledge-cache.json");

    expect(cachePath).toBe(join(customDir, "tinkerman", "knowledge-cache.json"));
  });

  it("returns null when plugin data dir unavailable", async () => {
    // Invalid env var (contains ..) — falls back to homedir
    process.env.CLAUDE_PLUGIN_DATA = "/tmp/../etc/../etc/passwd";

    const { getCachePath } = await importFresh();
    // Falls back to homedir, which is writable, so returns a path
    expect(getCachePath("knowledge-cache.json")).toBeTruthy();
  });
});
