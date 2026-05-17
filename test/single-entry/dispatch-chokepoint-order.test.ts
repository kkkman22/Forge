import { describe, it, expect, vi } from "vitest";
import { dispatchForgeSubcommand } from "../../src/forge-dispatcher.js";

describe("R5.2: chokepoint orchestrator executes steps 1-9 in order", () => {
  it("steps execute in order: resolveMode → validateTopic → resolvePath → checkIntegrity → resolveTools → resolveDispatchMode → wrapContext → dispatch → auditLog", async () => {
    const callOrder: string[] = [];

    const mocks = {
      resolveDispatcherMode: vi.fn(() => { callOrder.push("resolveDispatcherMode"); return "collapsed"; }),
      validateTopic: vi.fn(() => { callOrder.push("validateTopic"); return { ok: true, value: "build" }; }),
      resolveLibPath: vi.fn(() => { callOrder.push("resolveLibPath"); return { ok: true, path: "/mock/build/instructions.md" }; }),
      checkIntegrity: vi.fn(() => { callOrder.push("checkIntegrity"); return { ok: true }; }),
      resolveAllowedTools: vi.fn(() => { callOrder.push("resolveAllowedTools"); return { ok: true, tools: ["Read"] }; }),
      resolveDispatchMode: vi.fn(() => { callOrder.push("resolveDispatchMode"); return "fork"; }),
      wrapWorkspaceContext: vi.fn(() => { callOrder.push("wrapWorkspaceContext"); return ""; }),
      dispatch: vi.fn(() => { callOrder.push("dispatch"); return { code: "OK" }; }),
      writeAuditLog: vi.fn(() => { callOrder.push("writeAuditLog"); }),
    };

    await dispatchForgeSubcommand("build", {
      mode: "test",
      _mockSteps: mocks,
    });

    expect(callOrder).toEqual([
      "resolveDispatcherMode",
      "validateTopic",
      "resolveLibPath",
      "checkIntegrity",
      "resolveAllowedTools",
      "resolveDispatchMode",
      "wrapWorkspaceContext",
      "dispatch",
      "writeAuditLog",
    ]);
  });

  it("step 2 reject stops pipeline (steps 3-9 not called)", async () => {
    const callOrder: string[] = [];

    const mocks = {
      resolveDispatcherMode: vi.fn(() => { callOrder.push("resolveDispatcherMode"); return "collapsed"; }),
      validateTopic: vi.fn(() => { callOrder.push("validateTopic"); return { ok: false, code: "E_UNKNOWN_SUB" }; }),
      resolveLibPath: vi.fn(() => { callOrder.push("resolveLibPath"); }),
      checkIntegrity: vi.fn(() => { callOrder.push("checkIntegrity"); }),
      resolveAllowedTools: vi.fn(() => { callOrder.push("resolveAllowedTools"); }),
      resolveDispatchMode: vi.fn(() => { callOrder.push("resolveDispatchMode"); }),
      wrapWorkspaceContext: vi.fn(() => { callOrder.push("wrapWorkspaceContext"); }),
      dispatch: vi.fn(() => { callOrder.push("dispatch"); }),
      writeAuditLog: vi.fn(() => { callOrder.push("writeAuditLog"); }),
    };

    const r = await dispatchForgeSubcommand("bogus", {
      mode: "test",
      _mockSteps: mocks,
    });

    expect(r.code).toBe("E_UNKNOWN_SUB");
    expect(callOrder).toEqual(["resolveDispatcherMode", "validateTopic"]);
  });
});
