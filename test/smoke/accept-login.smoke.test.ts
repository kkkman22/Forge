import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { buildOpenArgs } from "../../src/agent-browser-client.js";

// @smoke contract test for agentic acceptance.
// Runs ONLY when agent-browser is installed; otherwise skips (no CI failure).
// T5.1

function agentBrowserAvailable(): boolean {
  try {
    execFileSync("which", ["agent-browser"], { encoding: "utf-8", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

const hasAgentBrowser = agentBrowserAvailable();

describe.skipIf(!hasAgentBrowser)("@smoke agent-browser end-to-end login", () => {
  it("buildOpenArgs descriptor is valid for real agent-browser open", () => {
    // Contract: the descriptor we hand to execFile must be exactly what
    // agent-browser expects. This guards against CLI arg drift.
    const d = buildOpenArgs("http://localhost:5173/login", "smoke-1");
    expect(d.executable).toBe("agent-browser");
    expect(d.args).toEqual(["open", "http://localhost:5173/login", "--session", "smoke-1"]);
  });

  it("real agent-browser open+screenshot against a static page", async () => {
    // This is the true end-to-end smoke: start agent-browser, open a page,
    // confirm we get a snapshot back. Requires a reachable URL.
    // Skipped in CI without the binary; locally confirms the full chain.
    const { AgentBrowserCliClient } = await import("../../src/agent-browser-client.js");
    const client = new AgentBrowserCliClient();
    const sid = `smoke-${Date.now()}`;
    try {
      await client.open("https://example.com", sid);
      const snap = await client.snapshot(sid);
      expect(snap).toBeDefined();
      expect(typeof snap.url).toBe("string");
    } finally {
      try {
        await client.close(sid);
      } catch {
        // best effort
      }
    }
  }, 30_000);
});

// Always-run guard so the suite has at least one assertion when skipped.
describe("@smoke availability probe", () => {
  it("reports agent-browser availability (informational)", () => {
    expect(typeof hasAgentBrowser).toBe("boolean");
    if (!hasAgentBrowser) {
      // eslint-disable-next-line no-console
      console.log("[smoke] agent-browser not installed — smoke tests skipped (expected in CI).");
    }
  });
});
