import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { glob } from "glob";

const ROOT = resolve(import.meta.dirname, "..", "..");
const REGISTRY_PATH = resolve(ROOT, "skills/forge/registry.toml");

describe("R2.5: registry as derived index", () => {
  it("registry.toml exists", () => {
    expect(existsSync(REGISTRY_PATH)).toBe(true);
  });

  it("registry.toml starts with AUTO-GENERATED header", () => {
    const content = readFileSync(REGISTRY_PATH, "utf-8");
    expect(content).toContain("# AUTO-GENERATED");
  });

  it("registry.toml contains all 29 subs", async () => {
    const content = readFileSync(REGISTRY_PATH, "utf-8");
    const SUBS = [
      "abort", "accept", "build", "build-light", "control-cli", "control-ui",
      "debug", "decide", "decide-teams", "fix", "fix-conflicts", "grill",
      "learn", "loop", "mutate", "pack", "plan", "recap", "refactor",
      "resume", "review", "router", "ship", "spec", "status", "storm",
      "test", "verify", "zoom-out",
    ];
    for (const sub of SUBS) {
      expect(content, `registry missing sub: ${sub}`).toMatch(new RegExp(`\\[${sub}\\]`));
    }
  });

  it("registry dispatch_mode values are fork or inline only", async () => {
    const content = readFileSync(REGISTRY_PATH, "utf-8");
    const modeMatches = content.match(/dispatch_mode\s*=\s*"([^"]+)"/g) || [];
    for (const match of modeMatches) {
      const value = match.match(/"([^"]+)"/)?.[1];
      expect(value).toMatch(/^(fork|inline)$/);
    }
  });
});
