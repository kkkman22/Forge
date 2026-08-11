import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetGateForTest } from "../../src/forge-dispatcher/cmux-gate.js";
import { checkIntegrity } from "../../src/forge-dispatcher/integrity-check.js";
import { dispatchForgeSubcommand } from "../../src/forge-dispatcher.js";

const LIB_ROOT = resolve(import.meta.dirname, "../../skills/tinkerman/lib");

describe("Integration: cmux gate with real manifest and paths", () => {
  beforeEach(() => {
    __resetGateForTest();
  });

  const CMUX_SUBS = [
    "forge-cmux-sidebar-sync",
    "forge-cmux-browser-qa",
    "forge-cmux-loop-signals",
  ] as const;

  it.each(CMUX_SUBS)("unavailable: %s returns SKILL_UNAVAILABLE", async (sub) => {
    const r = await dispatchForgeSubcommand(sub, {
      mode: "test",
      _mocks: {
        checkCmuxGate: () => ({
          ok: false,
          code: "SKILL_UNAVAILABLE",
          reason: "socket_missing",
          gate_result: "blocked",
          cmux_available: false,
        }),
      },
    });
    expect(r.code).toBe("SKILL_UNAVAILABLE");
  });

  it("available: forge-cmux-loop-signals resolves to correct path", async () => {
    const r = await dispatchForgeSubcommand("forge-cmux-loop-signals", {
      mode: "test",
      _mocks: {
        checkCmuxGate: () => ({
          ok: true,
          gate_result: "go",
          cmux_available: true,
        }),
      },
      _mockSteps: {
        resolveLibPath: () => ({
          ok: true,
          path: resolve(LIB_ROOT, "forge-cmux-loop-signals/instructions.md"),
        }),
        checkIntegrity: () => ({ ok: true }),
        resolveAllowedTools: () => ({ ok: true, tools: ["Read", "Bash"] }),
        resolveDispatchMode: () => "inline",
        wrapWorkspaceContext: vi.fn(),
        dispatch: vi.fn(),
        writeAuditLog: vi.fn(),
      },
    });
    expect(r.code).toBe("OK");
    expect(r.dispatchPath).toContain("forge-cmux-loop-signals/instructions.md");
  });

  it("manifest includes all 3 cmux subs", () => {
    const manifest = JSON.parse(readFileSync(resolve(LIB_ROOT, "manifest.json"), "utf-8"));
    const subs = Object.keys(manifest.subs);
    expect(subs.length).toBe(36);
    for (const sub of CMUX_SUBS) {
      expect(manifest.subs[sub]).toBeDefined();
      expect(manifest.subs[sub].instructions.sha256).toBeTruthy();
    }
  });

  it("integrity check passes for all 36 subs", () => {
    const manifest = JSON.parse(readFileSync(resolve(LIB_ROOT, "manifest.json"), "utf-8"));
    for (const sub of Object.keys(manifest.subs)) {
      const libPath = resolve(LIB_ROOT, sub, "instructions.md");
      const result = checkIntegrity(libPath);
      expect(result.ok, `integrity check failed for ${sub}`).toBe(true);
    }
  });
});
