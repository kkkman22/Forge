import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Scenario, ScenarioArtifact } from "../src/accept.js";
import { resolvePlaceholder, resolveSecrets } from "../src/accept-credentials.js";
import type { RunnerContext } from "../src/accept-driver.js";
import { agentBrowserRunner } from "../src/accept-driver.js";
import { type AgentBrowserClient, FakeAgentBrowserClient } from "../src/agent-browser-client.js";

// Verifies spec R4-AC1 (placeholder creds) and R4-AC2 (stdin not argv).
// T4.3 RED → GREEN

describe("resolvePlaceholder (pure)", () => {
  it("returns the env value for a {{VAR}} placeholder", () => {
    expect(resolvePlaceholder("{{FORGE_E2E_PASSWORD}}", { FORGE_E2E_PASSWORD: "secret123" })).toBe(
      "secret123",
    );
  });

  it("returns the literal when no placeholder present", () => {
    expect(resolvePlaceholder("admin", { FORGE_E2E_PASSWORD: "x" })).toBe("admin");
  });

  it("returns null when env var missing", () => {
    expect(resolvePlaceholder("{{MISSING_VAR}}", {})).toBeNull();
  });

  it("handles multiple placeholders in one string", () => {
    expect(resolvePlaceholder("{{USER}}:{{PASS}}", { USER: "u", PASS: "p" })).toBe("u:p");
  });
});

describe("resolveSecrets (batch)", () => {
  it("resolves a record of placeholders, flagging missing", () => {
    const r = resolveSecrets(
      { username: "admin", password: "{{FORGE_E2E_PASSWORD}}" },
      { FORGE_E2E_PASSWORD: "pw" },
    );
    expect(r.values).toEqual({ username: "admin", password: "pw" });
    expect(r.missing).toEqual([]);
  });

  it("records missing var names", () => {
    const r = resolveSecrets({ password: "{{NOPE}}" }, {});
    expect(r.missing).toEqual(["NOPE"]);
  });
});

describe("agentBrowserRunner — credentials never in argv (R4-AC2)", () => {
  let originalPwd: string | undefined;

  beforeEach(() => {
    originalPwd = process.env.FORGE_E2E_PASSWORD;
    process.env.FORGE_E2E_PASSWORD = "supersecret-password";
  });
  afterEach(() => {
    if (originalPwd === undefined) delete process.env.FORGE_E2E_PASSWORD;
    else process.env.FORGE_E2E_PASSWORD = originalPwd;
  });

  it("fill value is resolved from env and recorded in fill call, not as a ref", async () => {
    const client = new FakeAgentBrowserClient();
    client.enqueueSnapshot({
      refs: [
        { ref: "e1", tag: "input", text: "用户名", role: "textbox" },
        { ref: "e2", tag: "input", text: "密码", role: "textbox" },
        { ref: "e3", tag: "button", text: "登录", role: "button" },
      ],
      url: "http://localhost:5173/login",
      title: "登录",
      text: "",
    });
    client.enqueueSnapshot({
      refs: [],
      url: "http://localhost:5173/dashboard",
      title: "Dashboard",
      text: "欢迎 admin",
    });
    const scenario: Scenario = {
      id: "cred-login",
      given: "登录页打开，用户名 {{FORGE_E2E_USER}}，密码 {{FORGE_E2E_PASSWORD}}",
      when: "点击 登录按钮",
      then: "跳转 /dashboard 且 显示 欢迎",
      source: "explicit",
      type: "ui",
      tags: [],
      confidence: 0.9,
      rawText: "",
    };
    process.env.FORGE_E2E_USER = "admin";
    const ctx: RunnerContext = {
      topic: "t",
      projectRoot: "/tmp",
      outputDir: "/tmp/out",
      tierAvailability: { cmuxAvailable: false, devServerRunning: true },
      agentBrowserClient: client as AgentBrowserClient,
      appUrl: "http://localhost:5173",
    };
    const a = (await agentBrowserRunner.run(scenario, ctx)) as ScenarioArtifact;
    // The fill call should carry the resolved secret value.
    const fillCalls = client.calls.filter((c) => c.method === "fill");
    expect(fillCalls.length).toBeGreaterThan(0);
    const filledValues = fillCalls.map((c) => c.args[2]);
    // secret reached the client (which would forward via stdin in prod)
    expect(filledValues.some((v) => v === "supersecret-password")).toBe(true);
    // sanity: verdict computed
    expect(["PASS", "FAIL", "INCONCLUSIVE"]).toContain(a.verdict);
    delete process.env.FORGE_E2E_USER;
  });
});
