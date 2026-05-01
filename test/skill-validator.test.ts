import { describe, expect, it } from "vitest";
import type { SkillManifest } from "../src/skill-loader.js";
import { checkVersionCompatibility, validateManifest } from "../src/skill-validator.js";

const validManifest: SkillManifest = {
  name: "forge-deploy",
  version: "1.0.0",
  description: "Deploy SKILL",
  author: "test",
  forgeVersion: ">=2.0.0",
  phases: ["ship"],
};

describe("validateManifest", () => {
  it("accepts a valid manifest", () => {
    const result = validateManifest(validManifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects non-object input", () => {
    expect(validateManifest(null).valid).toBe(false);
    expect(validateManifest("string").valid).toBe(false);
    expect(validateManifest(42).valid).toBe(false);
  });

  it("rejects missing required fields", () => {
    const { valid, errors } = validateManifest({ name: "test" });
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects empty phases array", () => {
    const result = validateManifest({ ...validManifest, phases: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("phases"))).toBe(true);
  });

  it("rejects invalid version format", () => {
    const result = validateManifest({ ...validManifest, version: "not-semver" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("version"))).toBe(true);
  });

  it("rejects invalid forgeVersion format", () => {
    const result = validateManifest({ ...validManifest, forgeVersion: "bad" });
    expect(result.valid).toBe(false);
  });
});

describe("checkVersionCompatibility", () => {
  it("matches exact version", () => {
    expect(checkVersionCompatibility(validManifest, "2.0.0")).toBe(true);
  });

  it("matches version within range", () => {
    expect(checkVersionCompatibility(validManifest, "2.5.0")).toBe(true);
    expect(checkVersionCompatibility(validManifest, "3.0.0")).toBe(true);
  });

  it("rejects version below range", () => {
    expect(checkVersionCompatibility(validManifest, "1.9.0")).toBe(false);
  });

  it("handles caret range", () => {
    expect(checkVersionCompatibility({ ...validManifest, forgeVersion: "^2.0.0" }, "2.5.0")).toBe(
      true,
    );
  });

  it("handles tilde range", () => {
    expect(checkVersionCompatibility({ ...validManifest, forgeVersion: "~2.0.0" }, "2.0.5")).toBe(
      true,
    );
  });
});
