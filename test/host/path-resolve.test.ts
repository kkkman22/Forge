/**
 * P2 R4 (T6): path-resolve convergence to HostAdapter.
 *
 * resolveLibPath must source its pluginRoot from the injected HostAdapter
 * instead of reading process.env.CLAUDE_PLUGIN_ROOT directly. Under a Claude
 * host the result is byte-equal to the pre-P2 baseline; under a Zcode host it
 * resolves against the Zcode-injected root.
 *
 * Validates: requirements R4-AC1, R4-AC4 (path-resolve).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resolveLibPath } from "../../src/forge-dispatcher/path-resolve";
import { resetHostAdapter } from "../../src/host/detect";

const ENV_KEYS = [
  "CLAUDE_PLUGIN_ROOT",
  "ZCODE_PLUGIN_ROOT",
  "ZCODE_PROJECT_DIR",
  "ZCODE_SESSION_ID",
];

describe("resolveLibPath — HostAdapter convergence", () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
    resetHostAdapter();
  });

  it("uses Claude adapter.paths().pluginRoot when CLAUDE_PLUGIN_ROOT set", () => {
    process.env.CLAUDE_PLUGIN_ROOT = "/cc/plugin";
    const r = resolveLibPath("phase-build");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.path).toBe("/cc/plugin/skills/forge/lib/phase-build/instructions.md");
    }
  });

  it("uses Zcode adapter.paths().pluginRoot when ZCODE_PLUGIN_ROOT set", () => {
    process.env.ZCODE_PLUGIN_ROOT = "/zc/plugin";
    const r = resolveLibPath("phase-build");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.path).toBe("/zc/plugin/skills/forge/lib/phase-build/instructions.md");
    }
  });

  it("falls back to cwd when no plugin root injected (fail-safe)", () => {
    const r = resolveLibPath("phase-build", { cwd: "/proj" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.path).toBe("/proj/skills/forge/lib/phase-build/instructions.md");
    }
  });

  it("explicit opts.pluginRoot still wins (callers can override)", () => {
    process.env.CLAUDE_PLUGIN_ROOT = "/cc/plugin";
    const r = resolveLibPath("phase-build", { pluginRoot: "/explicit", cwd: "/proj" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.path).toBe("/explicit/skills/forge/lib/phase-build/instructions.md");
    }
  });

  it("byte-equal Claude baseline: same path shape as pre-P2 direct env read", () => {
    process.env.CLAUDE_PLUGIN_ROOT = "/cc/plugin";
    const adapterResult = resolveLibPath("phase-review");
    // Simulate the pre-P2 direct read for comparison.
    const directRoot = process.env.CLAUDE_PLUGIN_ROOT ?? process.cwd();
    const directPath = `${directRoot}/skills/forge/lib/phase-review/instructions.md`;
    expect(adapterResult.ok).toBe(true);
    if (adapterResult.ok) expect(adapterResult.path).toBe(directPath);
  });
});
