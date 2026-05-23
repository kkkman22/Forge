/**
 * T-12: Configuration switches for three-file spec layout.
 *
 * Validates: Requirement 12
 */
import { describe, expect, it } from "vitest";
import { parseSpecLayoutConfig, SpecLayoutConfig } from "../src/spec-config.js";

describe("parseSpecLayoutConfig", () => {
  it("defaults to 'three-file' when no config specified", () => {
    const config = parseSpecLayoutConfig(undefined);
    expect(config.layout).toBe("three-file");
  });

  it("reads 'legacy' layout from config.md", () => {
    const md = `
# Forge Config

spec_three_file_layout: legacy
`;
    const config = parseSpecLayoutConfig(md);
    expect(config.layout).toBe("legacy");
  });

  it("reads 'three-file' layout explicitly", () => {
    const md = "spec_three_file_layout: three-file";
    const config = parseSpecLayoutConfig(md);
    expect(config.layout).toBe("three-file");
  });

  it("reads 'experimental' layout for dual-mode", () => {
    const md = "spec_three_file_layout: experimental";
    const config = parseSpecLayoutConfig(md);
    expect(config.layout).toBe("experimental");
  });

  it("ignores unknown values and defaults to three-file", () => {
    const md = "spec_three_file_layout: unknown-value";
    const config = parseSpecLayoutConfig(md);
    expect(config.layout).toBe("three-file");
  });

  it("env FORGE_SPEC_LAYOUT overrides config.md", () => {
    const orig = process.env.FORGE_SPEC_LAYOUT;
    process.env.FORGE_SPEC_LAYOUT = "legacy";
    const config = parseSpecLayoutConfig("spec_three_file_layout: three-file");
    expect(config.layout).toBe("legacy");
    if (orig !== undefined) {
      process.env.FORGE_SPEC_LAYOUT = orig;
    } else {
      delete process.env.FORGE_SPEC_LAYOUT;
    }
  });
});
