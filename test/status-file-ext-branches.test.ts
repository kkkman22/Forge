import { describe, expect, it } from "vitest";
import {
  clearExecutionMetadata,
  collectExecutionMetadataFromEnv,
  extractExecutionMetadata,
  extractPuaFields,
  writeExecutionMetadata,
  writePuaFields,
} from "../src/status-file-ext.js";

const FM = (fields: string[]): string => `---\n${fields.join("\n")}\n---\n\n# Status\n`;

describe("extractExecutionMetadata (branch coverage)", () => {
  it("returns empty for content with no frontmatter", () => {
    expect(extractExecutionMetadata("no frontmatter here")).toEqual({});
  });
  it("extracts claude_version", () => {
    expect(
      extractExecutionMetadata(FM(['execution_claude_version: "2.1.169"'])).claude_version,
    ).toBe("2.1.169");
  });
  it("extracts valid dispatch_mode", () => {
    for (const mode of ["inline", "agents", "auto"]) {
      expect(
        extractExecutionMetadata(FM([`execution_dispatch_mode: "${mode}"`])).dispatch_mode,
      ).toBe(mode);
    }
  });
  it("drops invalid dispatch_mode", () => {
    expect(
      extractExecutionMetadata(FM(['execution_dispatch_mode: "bogus"'])).dispatch_mode,
    ).toBeUndefined();
  });
  it("extracts diagnostic_mode true/false", () => {
    expect(extractExecutionMetadata(FM(["execution_diagnostic_mode: true"])).diagnostic_mode).toBe(
      true,
    );
    expect(extractExecutionMetadata(FM(["execution_diagnostic_mode: false"])).diagnostic_mode).toBe(
      false,
    );
  });
  it("extracts valid tier", () => {
    for (const tier of ["light", "standard", "full"]) {
      expect(extractExecutionMetadata(FM([`execution_tier: "${tier}"`])).tier).toBe(tier);
    }
  });
  it("drops invalid tier", () => {
    expect(extractExecutionMetadata(FM(['execution_tier: "x"'])).tier).toBeUndefined();
  });
  it("extracts branch", () => {
    expect(extractExecutionMetadata(FM(['execution_branch: "feature/x"'])).branch).toBe(
      "feature/x",
    );
  });
  it("extracts allowlisted forge_flags", () => {
    const m = extractExecutionMetadata(
      FM(['execution_forge_flags: "FORGE_ROOT,FORGE_DIAGNOSTIC_MODE"']),
    );
    expect(m.forge_flags).toEqual(["FORGE_ROOT", "FORGE_DIAGNOSTIC_MODE"]);
  });
  it("drops non-allowlisted forge_flags", () => {
    const m = extractExecutionMetadata(FM(['execution_forge_flags: "FORGE_ROOT,random_flag"']));
    expect(m.forge_flags).toEqual(["FORGE_ROOT"]);
  });
  it("extracts recorded_at", () => {
    expect(
      extractExecutionMetadata(FM(['execution_recorded_at: "2026-06-14T00:00:00Z"'])).recorded_at,
    ).toBe("2026-06-14T00:00:00Z");
  });
});

describe("writeExecutionMetadata + clearExecutionMetadata (branch coverage)", () => {
  it("writes metadata fields into frontmatter", () => {
    const written = writeExecutionMetadata(FM([]), {
      claude_version: "2.1",
      dispatch_mode: "inline",
      diagnostic_mode: true,
      tier: "standard",
      branch: "main",
      forge_flags: ["FORGE_ROOT"],
      recorded_at: "2026-06-14",
    });
    expect(written).toContain("execution_claude_version");
    expect(extractExecutionMetadata(written).claude_version).toBe("2.1");
  });
  it("omits forge_flags when empty array", () => {
    const written = writeExecutionMetadata(FM([]), { forge_flags: [] });
    expect(written).not.toContain("execution_forge_flags");
  });
  it("handles diagnostic_mode false", () => {
    const written = writeExecutionMetadata(FM([]), { diagnostic_mode: false });
    expect(typeof written).toBe("string");
  });
  it("clearExecutionMetadata removes execution_ fields", () => {
    const content = FM(['execution_claude_version: "x"', 'execution_branch: "y"']);
    const cleared = clearExecutionMetadata(content);
    expect(cleared).not.toContain("execution_claude_version");
    expect(cleared).not.toContain("execution_branch");
  });
  it("clearExecutionMetadata on content with no frontmatter returns string", () => {
    expect(typeof clearExecutionMetadata("no frontmatter")).toBe("string");
  });
});

describe("collectExecutionMetadataFromEnv (branch coverage)", () => {
  it("returns diagnostic_mode from FORGE_DIAGNOSTIC_MODE", () => {
    expect(collectExecutionMetadataFromEnv({ FORGE_DIAGNOSTIC_MODE: "1" }).diagnostic_mode).toBe(
      true,
    );
    expect(collectExecutionMetadataFromEnv({ FORGE_DIAGNOSTIC_MODE: "0" }).diagnostic_mode).toBe(
      false,
    );
  });
  it("collects allowlisted forge_flags from FORGE_ env vars", () => {
    const m = collectExecutionMetadataFromEnv({ FORGE_ROOT: "/x", FORGE_DIAGNOSTIC_MODE: "1" });
    expect(m.forge_flags).toContain("FORGE_ROOT");
    expect(m.forge_flags).toContain("FORGE_DIAGNOSTIC_MODE");
  });
  it("filters SECRET-like FORGE_ env vars", () => {
    const m = collectExecutionMetadataFromEnv({ FORGE_SECRET_KEY: "1", FORGE_ROOT: "1" });
    expect(m.forge_flags).toContain("FORGE_ROOT");
    expect(m.forge_flags).not.toContain("FORGE_SECRET_KEY");
  });
  it("returns no forge_flags when no FORGE_ vars", () => {
    expect(collectExecutionMetadataFromEnv({ PATH: "/usr/bin" }).forge_flags).toBeUndefined();
  });
});

describe("extractPuaFields + writePuaFields (branch coverage)", () => {
  it("extracts valid pua_pressure_level", () => {
    for (const lvl of ["L0", "L1", "L2", "L3", "L4"]) {
      expect(extractPuaFields(FM([`pua_pressure_level: "${lvl}"`])).puaPressureLevel).toBe(lvl);
    }
  });
  it("drops invalid pua_pressure_level", () => {
    expect(extractPuaFields(FM(['pua_pressure_level: "L9"'])).puaPressureLevel).toBeUndefined();
  });
  it("returns defaults for no frontmatter", () => {
    expect(extractPuaFields("no fm")).toBeDefined();
  });
  it("writePuaFields writes pressure level", () => {
    const written = writePuaFields(FM([]), { puaPressureLevel: "L2" });
    expect(written).toContain("pua_pressure_level");
    expect(extractPuaFields(written).puaPressureLevel).toBe("L2");
  });
});
