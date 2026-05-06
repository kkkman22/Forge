import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
import { describe, expect, it } from "vitest";

import { installSkill } from "../src/skill-loader.js";

describe("skill-loader types", () => {
  it("exports SkillManifest interface", async () => {
    const mod = await import("../src/skill-loader.js");
    expect(mod).toBeDefined();
  });

  it("exports mergeSkillLists function", async () => {
    const mod = await import("../src/skill-loader.js");
    expect(typeof mod.mergeSkillLists).toBe("function");
  });

  it("exports loadSkillsFromDir function", async () => {
    const mod = await import("../src/skill-loader.js");
    expect(typeof mod.loadSkillsFromDir).toBe("function");
  });

  it("exports installSkill function", async () => {
    const mod = await import("../src/skill-loader.js");
    expect(typeof mod.installSkill).toBe("function");
  });
});

describe("installSkill", () => {
  const currentVersion = "2.3.0";

  it("installs a valid skill successfully", () => {
    const tmpDir = mkdtempSync(pathJoin(tmpdir(), "forge-install-"));
    const sourceDir = pathJoin(tmpDir, "source", "my-skill");
    const targetRoot = pathJoin(tmpDir, "skills");

    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(
      pathJoin(sourceDir, "skill.json"),
      JSON.stringify({
        name: "my-skill",
        version: "1.0.0",
        description: "A test skill",
        author: "test",
        forgeVersion: ">=2.0.0",
        phases: ["build"],
      }),
      "utf-8",
    );
    writeFileSync(pathJoin(sourceDir, "SKILL.md"), "# Test SKILL\n", "utf-8");

    const result = installSkill(sourceDir, targetRoot, currentVersion);

    expect(result.success).toBe(true);
    expect(result.skillName).toBe("my-skill");
    expect(result.message).toContain("Installed my-skill v1.0.0");
    expect(existsSync(pathJoin(targetRoot, "my-skill", "skill.json"))).toBe(true);
    expect(existsSync(pathJoin(targetRoot, "my-skill", "SKILL.md"))).toBe(true);

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("fails when skill.json is missing", () => {
    const tmpDir = mkdtempSync(pathJoin(tmpdir(), "forge-install-"));
    const sourceDir = pathJoin(tmpDir, "source");
    const targetRoot = pathJoin(tmpDir, "skills");

    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(pathJoin(sourceDir, "SKILL.md"), "# Test\n", "utf-8");

    const result = installSkill(sourceDir, targetRoot, currentVersion);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Missing skill.json");

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("fails when SKILL.md is missing", () => {
    const tmpDir = mkdtempSync(pathJoin(tmpdir(), "forge-install-"));
    const sourceDir = pathJoin(tmpDir, "source");
    const targetRoot = pathJoin(tmpDir, "skills");

    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(
      pathJoin(sourceDir, "skill.json"),
      JSON.stringify({
        name: "my-skill",
        version: "1.0.0",
        description: "A test skill",
        author: "test",
        forgeVersion: ">=2.0.0",
        phases: ["build"],
      }),
      "utf-8",
    );

    const result = installSkill(sourceDir, targetRoot, currentVersion);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Missing SKILL.md");

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("fails when manifest is invalid", () => {
    const tmpDir = mkdtempSync(pathJoin(tmpdir(), "forge-install-"));
    const sourceDir = pathJoin(tmpDir, "source");
    const targetRoot = pathJoin(tmpDir, "skills");

    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(
      pathJoin(sourceDir, "skill.json"),
      JSON.stringify({ name: "my-skill" }), // missing required fields
      "utf-8",
    );
    writeFileSync(pathJoin(sourceDir, "SKILL.md"), "# Test\n", "utf-8");

    const result = installSkill(sourceDir, targetRoot, currentVersion);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Invalid manifest");

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("fails when forgeVersion is incompatible", () => {
    const tmpDir = mkdtempSync(pathJoin(tmpdir(), "forge-install-"));
    const sourceDir = pathJoin(tmpDir, "source");
    const targetRoot = pathJoin(tmpDir, "skills");

    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(
      pathJoin(sourceDir, "skill.json"),
      JSON.stringify({
        name: "my-skill",
        version: "1.0.0",
        description: "A test skill",
        author: "test",
        forgeVersion: ">=5.0.0", // incompatible
        phases: ["build"],
      }),
      "utf-8",
    );
    writeFileSync(pathJoin(sourceDir, "SKILL.md"), "# Test\n", "utf-8");

    const result = installSkill(sourceDir, targetRoot, currentVersion);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Incompatible forgeVersion");

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("fails when skill already exists", () => {
    const tmpDir = mkdtempSync(pathJoin(tmpdir(), "forge-install-"));
    const sourceDir = pathJoin(tmpDir, "source");
    const targetRoot = pathJoin(tmpDir, "skills");

    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(
      pathJoin(sourceDir, "skill.json"),
      JSON.stringify({
        name: "my-skill",
        version: "1.0.0",
        description: "A test skill",
        author: "test",
        forgeVersion: ">=2.0.0",
        phases: ["build"],
      }),
      "utf-8",
    );
    writeFileSync(pathJoin(sourceDir, "SKILL.md"), "# Test\n", "utf-8");

    // Pre-create target directory
    mkdirSync(pathJoin(targetRoot, "my-skill"), { recursive: true });

    const result = installSkill(sourceDir, targetRoot, currentVersion);

    expect(result.success).toBe(false);
    expect(result.message).toContain("already installed");

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("copies locale variants alongside SKILL.md", () => {
    const tmpDir = mkdtempSync(pathJoin(tmpdir(), "forge-install-"));
    const sourceDir = pathJoin(tmpDir, "source", "my-skill");
    const targetRoot = pathJoin(tmpDir, "skills");

    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(
      pathJoin(sourceDir, "skill.json"),
      JSON.stringify({
        name: "my-skill",
        version: "1.0.0",
        description: "A test skill",
        author: "test",
        forgeVersion: ">=2.0.0",
        phases: ["build"],
      }),
      "utf-8",
    );
    writeFileSync(pathJoin(sourceDir, "SKILL.md"), "# English\n", "utf-8");
    writeFileSync(pathJoin(sourceDir, "SKILL.zh.md"), "# Chinese\n", "utf-8");

    const result = installSkill(sourceDir, targetRoot, currentVersion);

    expect(result.success).toBe(true);
    expect(existsSync(pathJoin(targetRoot, "my-skill", "SKILL.zh.md"))).toBe(true);

    rmSync(tmpDir, { recursive: true, force: true });
  });
});
