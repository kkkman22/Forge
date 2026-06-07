import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const SCRIPT = resolve(ROOT, "scripts/generate-release-checklist.mjs");
const CI = resolve(ROOT, ".github/workflows/ci.yml");

describe("long-term evolution: release checklist artifact", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it("generates a machine-readable release evidence artifact", () => {
    tempDir = mkdtempSync(join(tmpdir(), "forge-release-checklist-"));
    const out = join(tempDir, "release-checklist.json");

    execFileSync("node", [SCRIPT, "--output", out], { cwd: ROOT, encoding: "utf-8" });
    const artifact = JSON.parse(readFileSync(out, "utf-8")) as {
      commit: string;
      generated_at: string;
      hashes: { dist: string; dist_plugin: string; npm_pack?: string };
      gates: Array<{ name: string; command: string; required: boolean }>;
      artifacts: { npm_pack_dry_run: string; plugin_validate: string };
    };

    expect(artifact.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(artifact.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(artifact.hashes.dist).toMatch(/^sha256:/);
    expect(artifact.hashes.dist_plugin).toMatch(/^sha256:/);
    expect(artifact.artifacts.npm_pack_dry_run).toBe("npm pack --dry-run");
    expect(artifact.artifacts.plugin_validate).toBe("claude plugin validate .");
    expect(artifact.gates.map((g) => g.command)).toEqual(
      expect.arrayContaining([
        "npm run check",
        "npm run test:coverage",
        "npm audit --registry=https://registry.npmjs.org --audit-level=high",
        "npm run test:e2e",
        "node scripts/check-dist-sync.mjs",
        "node scripts/check-bundle-sync.mjs",
      ]),
    );
    expect(artifact.gates.every((g) => g.required)).toBe(true);
  });

  it("tag publish uploads the release checklist artifact", () => {
    const workflow = readFileSync(CI, "utf-8");
    expect(workflow).toContain("Generate release checklist");
    expect(workflow).toContain("scripts/generate-release-checklist.mjs");
    expect(workflow).toContain("release-checklist.json");
    expect(workflow).toContain("actions/upload-artifact");
  });
});
