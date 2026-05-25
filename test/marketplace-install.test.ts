import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const ROOT = join(import.meta.dirname, "..");

describe("T13: Marketplace Distribution Regression", () => {
  const pluginPath = join(ROOT, ".claude-plugin", "plugin.json");

  it("plugin-manifest.test.ts has >= 13 test cases", () => {
    const testContent = readFileSync(join(ROOT, "test/plugin-manifest.test.ts"), "utf-8");
    const itCount = (testContent.match(/\bit\s*\(/g) || []).length;
    expect(itCount).toBeGreaterThanOrEqual(13);
  });

  it("workflows directory is non-empty with valid JS files", () => {
    const plugin = JSON.parse(readFileSync(pluginPath, "utf-8"));
    const wfDir = join(ROOT, plugin.workflows[0]);
    const jsFiles = readdirSync(wfDir).filter((f) => f.endsWith(".js"));
    expect(jsFiles.length).toBeGreaterThan(0);

    for (const file of jsFiles) {
      expect(() =>
        execSync(`node --check "${join(wfDir, file)}"`, { stdio: "pipe" }),
      ).not.toThrow();
    }
  });

  it("marketplace.json references forge plugin", () => {
    const marketplace = JSON.parse(
      readFileSync(join(ROOT, ".claude-plugin", "marketplace.json"), "utf-8"),
    );
    expect(marketplace.plugins).toBeInstanceOf(Array);
    const forge = marketplace.plugins.find((p: { name: string }) => p.name === "forge");
    expect(forge).toBeTruthy();
  });

  it("validate-plugin-manifest.mjs passes", () => {
    expect(() =>
      execSync(`node "${join(ROOT, "scripts/validate-plugin-manifest.mjs")}"`, {
        cwd: ROOT,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
