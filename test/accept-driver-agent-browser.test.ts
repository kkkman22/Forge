import { describe, expect, it } from "vitest";
import type { Scenario, ScenarioArtifact } from "../src/accept.js";
import { agentBrowserRunner, RUNNERS } from "../src/accept-driver.js";
import { FakeAgentBrowserClient, type AgentBrowserClient } from "../src/agent-browser-client.js";
import type { RunnerContext } from "../src/accept-driver.js";

// Verifies spec R1-AC1, R1-AC2, R1-AC3, R1-AC4, R3-AC6.
// T2.3 RED → GREEN

function uiScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "login-happy",
    given: "登录页 /login 已打开",
    when: "用户输入用户名 admin 并点击登录按钮",
    then: "跳转到 /dashboard 且显示 欢迎",
    source: "explicit",
    type: "ui",
    tags: ["@critical"],
    confidence: 0.9,
    rawText: "",
    ...overrides,
  };
}

function ctx(client?: unknown, devServerRunning = true): RunnerContext {
  return {
    topic: "login",
    projectRoot: "/tmp/proj",
    outputDir: "/tmp/out",
    tierAvailability: { cmuxAvailable: false, devServerRunning },
    agentBrowserClient: client as AgentBrowserClient | undefined,
    appUrl: "http://localhost:5173",
  };
}

describe("agentBrowserRunner — supports", () => {
  it("supports type:ui scenarios", () => {
    expect(agentBrowserRunner.supports(uiScenario())).toBe(true);
  });

  it("does NOT support type:api scenarios", () => {
    expect(agentBrowserRunner.supports(uiScenario({ type: "api" }))).toBe(false);
  });

  it("has type 'ui'", () => {
    expect(agentBrowserRunner.type).toBe("ui");
  });
});

describe("agentBrowserRunner — run happy path", () => {
  it("open→fill→click→snapshot, returns PASS with screenshot evidence", async () => {
    const client = new FakeAgentBrowserClient();
    // First snapshot: login form. Second (after click): dashboard.
    client.enqueueSnapshot({
      refs: [
        { ref: "e1", tag: "input", text: "用户名", role: "textbox" },
        { ref: "e3", tag: "button", text: "登录", role: "button" },
      ],
      url: "http://localhost:5173/login",
      title: "登录",
      text: "用户名 密码 登录",
    });
    client.enqueueSnapshot({
      refs: [],
      url: "http://localhost:5173/dashboard",
      title: "Dashboard",
      text: "欢迎 admin",
    });

    const artifact = (await agentBrowserRunner.run(uiScenario(), ctx(client))) as ScenarioArtifact;
    expect(artifact.verdict).toBe("PASS");

    // Sequence: open, snapshot, fill*, click, snapshot, screenshot, close
    const methods = client.calls.map((c) => c.method);
    expect(methods[0]).toBe("open");
    expect(methods).toContain("fill");
    expect(methods).toContain("click");
    expect(methods.filter((m) => m === "snapshot").length).toBeGreaterThanOrEqual(2);
    expect(methods).toContain("close");
  });

  it("FAIL when Then assertion not satisfied (no jump to /dashboard)", async () => {
    const client = new FakeAgentBrowserClient();
    client.enqueueSnapshot({
      refs: [{ ref: "e3", tag: "button", text: "登录", role: "button" }],
      url: "http://localhost:5173/login",
      title: "登录",
      text: "",
    });
    // after click, still on login (no redirect)
    client.enqueueSnapshot({
      refs: [],
      url: "http://localhost:5173/login",
      title: "登录",
      text: "凭证错误",
    });
    const artifact = await agentBrowserRunner.run(uiScenario(), ctx(client));
    expect(artifact.verdict).toBe("FAIL");
    expect(artifact.failureReason).toBeTruthy();
  });
});

describe("agentBrowserRunner — refs retry", () => {
  it("retries stale ref once, then PASS on second snapshot", async () => {
    const client = new FakeAgentBrowserClient();
    // snapshot sequence: [0] initial login form, [1] refreshed refs after stale,
    // [2] dashboard after successful click.
    client.enqueueSnapshot({
      refs: [{ ref: "e3", tag: "button", text: "登录", role: "button" }],
      url: "http://localhost:5173/login",
      title: "登录",
      text: "",
    });
    client.enqueueSnapshot({
      refs: [{ ref: "e3", tag: "button", text: "登录", role: "button" }],
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
    // Make click fail once then succeed.
    let clickAttempts = 0;
    const origClick = client.click.bind(client);
    client.click = async (sid: string, ref: string) => {
      clickAttempts++;
      if (clickAttempts === 1) throw new Error("stale ref");
      return origClick(sid, ref);
    };
    const artifact = await agentBrowserRunner.run(uiScenario(), ctx(client));
    expect(artifact.verdict).toBe("PASS");
  });

  it("FAIL when ref fails twice (after 1 retry)", async () => {
    const client = new FakeAgentBrowserClient();
    client.enqueueSnapshot({
      refs: [{ ref: "e3", tag: "button", text: "登录", role: "button" }],
      url: "http://localhost:5173/login",
      title: "登录",
      text: "",
    });
    client.click = async () => {
      throw new Error("stale ref");
    };
    const artifact = await agentBrowserRunner.run(uiScenario(), ctx(client));
    expect(artifact.verdict).toBe("FAIL");
  });
});

describe("agentBrowserRunner — environment unavailability", () => {
  it("INCONCLUSIVE when client missing (agent-browser not installed)", async () => {
    const artifact = await agentBrowserRunner.run(uiScenario(), ctx(undefined));
    expect(artifact.verdict).toBe("INCONCLUSIVE");
    expect(artifact.failureReason).toMatch(/agent-browser|unavailable|not installed/i);
  });

  it("INCONCLUSIVE when client.open throws (crash)", async () => {
    const client = new FakeAgentBrowserClient();
    client.open = async () => {
      throw new Error("connection refused");
    };
    const artifact = await agentBrowserRunner.run(uiScenario(), ctx(client));
    expect(artifact.verdict).toBe("INCONCLUSIVE");
  });

  it("INCONCLUSIVE when dev server not running", async () => {
    const client = new FakeAgentBrowserClient();
    const artifact = await agentBrowserRunner.run(uiScenario(), ctx(client, false));
    expect(artifact.verdict).toBe("INCONCLUSIVE");
  });
});

describe("RUNNERS registry", () => {
  it("contains agentBrowserRunner for ui (no legacy uiRunner)", async () => {
    const ui = RUNNERS.find((r) => r.type === "ui");
    expect(ui).toBeDefined();
    expect(ui?.supports(uiScenario())).toBe(true);
  });
});
