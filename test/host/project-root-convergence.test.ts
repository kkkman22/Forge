/**
 * P2 R4 (缺陷3): MCP project-root convergence to HostAdapter.
 *
 * resolveProjectRoot previously read CLAUDE_PROJECT_DIR directly (bypassing
 * the adapter). It must now source projectDir from the injected HostAdapter
 * (Zcode-aware: prefers ZCODE_PROJECT_DIR). Under a Claude host byte-equal;
 * under a Zcode host honours ZCODE_PROJECT_DIR.
 *
 * Validates: requirements R4-AC1 (project-root), design §2.5 injection point 3.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resetHostAdapter } from "../../src/host/detect";
import { resolveProjectRoot } from "../../src/mcp/project-root";

const ENV_KEYS = ["CLAUDE_PROJECT_DIR", "ZCODE_PROJECT_DIR", "ZCODE_PLUGIN_ROOT"];

describe("resolveProjectRoot — HostAdapter convergence", () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
    resetHostAdapter();
  });

  it("Claude host: uses CLAUDE_PROJECT_DIR via adapter", () => {
    process.env.CLAUDE_PROJECT_DIR = "/cc/proj";
    const r = resolveProjectRoot();
    expect(r.path).toBe("/cc/proj");
    expect(r.source).toBe("env");
  });

  it("Zcode host: prefers ZCODE_PROJECT_DIR over CLAUDE_*", () => {
    process.env.ZCODE_PROJECT_DIR = "/zc/proj";
    process.env.ZCODE_PLUGIN_ROOT = "/zc/root"; // Zcode detection signal
    process.env.CLAUDE_PROJECT_DIR = "/cc/proj"; // must be ignored
    const r = resolveProjectRoot();
    expect(r.path).toBe("/zc/proj");
    expect(r.source).toBe("env");
  });

  it("falls back to cwd when no projectDir injected", () => {
    const r = resolveProjectRoot();
    expect(r.source).toBe("cwd");
  });

  it("rejects traversal in the resolved path", () => {
    process.env.CLAUDE_PROJECT_DIR = "/cc/../etc";
    const r = resolveProjectRoot();
    expect(r.source).toBe("cwd");
  });
});
