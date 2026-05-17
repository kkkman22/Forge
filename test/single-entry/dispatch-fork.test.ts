import { describe, it, expect, vi } from "vitest";
import { dispatchForgeSubcommand } from "../../src/forge-dispatcher.js";

describe("R3.1: fork mode dispatches via Agent tool", () => {
  it("fork sub calls Agent tool, not inline Read", async () => {
    const agentSpy = vi.fn().mockResolvedValue({ output: "done" });
    const readSpy = vi.fn();

    const r = await dispatchForgeSubcommand("zoom-out", {
      mode: "test",
      _mocks: { agent: agentSpy, read: readSpy },
    });

    expect(agentSpy).toHaveBeenCalled();
  });

  it("fork Agent prompt contains lib instructions.md path", async () => {
    const agentSpy = vi.fn().mockResolvedValue({ output: "done" });

    await dispatchForgeSubcommand("zoom-out", {
      mode: "test",
      _mocks: { agent: agentSpy, read: vi.fn() },
    });

    const call = agentSpy.mock.calls[0]?.[0];
    expect(call?.prompt ?? call).toContain("instructions.md");
  });
});
