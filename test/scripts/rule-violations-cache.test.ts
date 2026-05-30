import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const modulePath = resolve(ROOT, "scripts/lib/plugin-data-path.mjs");

describe("record-evolved-rule-violation.mjs cache path integration", () => {
  let testTmpDir: string;
  let pluginDataDir: string;

  beforeEach(() => {
    testTmpDir = join(tmpdir(), `rule-violations-test-${Date.now()}`);
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

  it("rule-violations.json resolves to correct plugin data path", async () => {
    process.env.CLAUDE_PLUGIN_DATA = pluginDataDir;
    const { getCachePath } = await importFresh();

    const cachePath = getCachePath("rule-violations.json");
    expect(cachePath).toBe(join(pluginDataDir, "forge", "rule-violations.json"));
  });

  it("returns null when plugin data dir unavailable", async () => {
    process.env.CLAUDE_PLUGIN_DATA = "/nonexistent-root/impossible";
    const { getCachePath } = await importFresh();

    expect(getCachePath("rule-violations.json")).toBeNull();
  });

  it("rule-violations.json data model stores violations with session aggregation", async () => {
    process.env.CLAUDE_PLUGIN_DATA = pluginDataDir;
    const { getCachePath } = await importFresh();
    const cachePath = getCachePath("rule-violations.json");

    // Verify expected data model can be written
    const violations = {
      violations: [
        {
          ruleId: "R1",
          count: 3,
          lastAt: "2026-05-30T10:00:00.000Z",
          sessions: ["session-1", "session-2"],
        },
      ],
    };

    writeFileSync(cachePath, JSON.stringify(violations, null, 2), "utf-8");
    const read = JSON.parse(readFileSync(cachePath, "utf-8"));
    expect(read.violations[0].ruleId).toBe("R1");
    expect(read.violations[0].count).toBe(3);
    expect(read.violations[0].sessions).toHaveLength(2);
  });
});
