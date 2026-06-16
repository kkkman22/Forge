import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkIntegrity } from "../../src/forge-dispatcher/integrity-check.js";
import { resolveAllowedTools } from "../../src/forge-dispatcher/tools-resolve.js";

const LIB_ROOT = resolve(import.meta.dirname, "../../skills/forge/lib");
const MANIFEST_PATH = resolve(LIB_ROOT, "manifest.json");

describe("Integration: dispatcher reads real lib (no mocks)", () => {
  it("resolveAllowedTools reads actual zoom-out instructions.md", () => {
    const content = readFileSync(resolve(LIB_ROOT, "zoom-out/instructions.md"), "utf-8");
    const result = resolveAllowedTools(content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tools).toContain("Read");
      expect(result.tools).toContain("Glob");
      expect(result.tools).toContain("Grep");
      expect(result.tools.length).toBeGreaterThan(1);
    }
  });

  it("resolveAllowedTools reads actual status instructions.md", () => {
    const content = readFileSync(resolve(LIB_ROOT, "status/instructions.md"), "utf-8");
    const result = resolveAllowedTools(content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tools).toContain("Read");
      expect(result.tools).toContain("Bash");
    }
  });

  it("checkIntegrity passes for real zoom-out lib", () => {
    const libPath = resolve(LIB_ROOT, "zoom-out/instructions.md");
    const result = checkIntegrity(libPath);
    expect(result.ok).toBe(true);
  });

  it("checkIntegrity passes for all subs against manifest", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    const subs = Object.keys(manifest.subs);
    expect(subs.length).toBe(37);

    for (const sub of subs) {
      const libPath = resolve(LIB_ROOT, sub, "instructions.md");
      const result = checkIntegrity(libPath);
      expect(result.ok).toBe(true);
    }
  });

  it("checkIntegrity rejects tampered content", () => {
    const tmpDir = resolve(import.meta.dirname, "__integrity_tmp__");
    const subDir = resolve(tmpDir, "test-sub");
    mkdirSync(subDir, { recursive: true });

    const instructionsPath = resolve(subDir, "instructions.md");
    writeFileSync(instructionsPath, "original content");

    const sha = createHash("sha256").update("original content").digest("hex");
    const manifestPath = resolve(tmpDir, "manifest.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        version: 1,
        subs: { "test-sub": { instructions: { path: "test-sub/instructions.md", sha256: sha } } },
      }),
    );

    const result = checkIntegrity(instructionsPath, { manifestPath });
    expect(result.ok).toBe(true);

    writeFileSync(instructionsPath, "tampered content");
    const result2 = checkIntegrity(instructionsPath, { manifestPath });
    expect(result2.ok).toBe(false);
    if (!result2.ok) {
      expect(result2.code).toBe("E_INTEGRITY_MISMATCH");
    }

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("checkIntegrity returns E_MANIFEST_MISSING when manifest absent", () => {
    const tmpDir = resolve(import.meta.dirname, "__integrity_missing__");
    const subDir = resolve(tmpDir, "test-sub");
    mkdirSync(subDir, { recursive: true });

    const instructionsPath = resolve(subDir, "instructions.md");
    writeFileSync(instructionsPath, "content");

    const result = checkIntegrity(instructionsPath, {
      manifestPath: resolve(tmpDir, "nonexistent-manifest.json"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("E_MANIFEST_MISSING");
    }

    rmSync(tmpDir, { recursive: true, force: true });
  });
});
