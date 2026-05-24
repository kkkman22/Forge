import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetGateForTest } from "../../src/forge-dispatcher/cmux-gate.js";
import { dispatchForgeSubcommand } from "../../src/forge-dispatcher.js";

describe("Step 2.5: cmux gate integration in dispatcher", () => {
  beforeEach(() => {
    __resetGateForTest();
  });

  it("non-gated sub passes gate with n_a result", async () => {
    const r = await dispatchForgeSubcommand("build", {
      mode: "test",
      _mockSteps: {
        resolveLibPath: () => ({ ok: true, path: "/lib/build/instructions.md" }),
        checkIntegrity: () => ({ ok: true }),
        resolveAllowedTools: () => ({ ok: true, tools: ["Read"] }),
        resolveDispatchMode: () => "inline",
        wrapWorkspaceContext: vi.fn(),
        dispatch: vi.fn(),
        writeAuditLog: vi.fn(),
      },
    });
    expect(r.code).toBe("OK");
  });

  it("gated sub with cmux available returns OK", async () => {
    const dispatchMock = vi.fn();
    const r = await dispatchForgeSubcommand("forge-cmux-sidebar-sync", {
      mode: "test",
      _mockSteps: {
        resolveLibPath: () => ({
          ok: true,
          path: "/lib/forge-cmux-sidebar-sync/instructions.md",
        }),
        checkIntegrity: () => ({ ok: true }),
        resolveAllowedTools: () => ({ ok: true, tools: ["Read", "Bash"] }),
        resolveDispatchMode: () => "inline",
        wrapWorkspaceContext: vi.fn(),
        dispatch: dispatchMock,
        writeAuditLog: vi.fn(),
      },
      _mocks: {
        checkCmuxGate: () => ({
          ok: true,
          gate_result: "go",
          cmux_available: true,
        }),
      },
    });
    expect(r.code).toBe("OK");
    expect(dispatchMock).toHaveBeenCalled();
  });

  it("gated sub with cmux unavailable returns SKILL_UNAVAILABLE", async () => {
    const resolveLibPathMock = vi.fn().mockReturnValue({
      ok: true,
      path: "/lib/forge-cmux-browser-qa/instructions.md",
    });
    const r = await dispatchForgeSubcommand("forge-cmux-browser-qa", {
      mode: "test",
      _mockSteps: {
        resolveLibPath: resolveLibPathMock,
        checkIntegrity: () => ({ ok: true }),
        resolveAllowedTools: () => ({ ok: true, tools: ["Read"] }),
        resolveDispatchMode: () => "inline",
        wrapWorkspaceContext: vi.fn(),
        dispatch: vi.fn(),
        writeAuditLog: vi.fn(),
      },
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
    expect(resolveLibPathMock).not.toHaveBeenCalled();
  });
});
