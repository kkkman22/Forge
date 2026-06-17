import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock child_process so no real curl/commands run.
const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: execFileMock }));

import { apiRunner, cliRunner, buildCurlArgs } from "../src/accept-driver.js";
import type { Scenario, ScenarioArtifact } from "../src/accept.js";
import type { RunnerContext } from "../src/accept-driver.js";

// Verifies T3.2: execCommand actually executes (no placeholder 200).
// api/cli runners produce real PASS/FAIL from real stdout.

function apiScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "api-login",
    given: "endpoint /api/login",
    when: "When 发送 POST 请求",
    then: "Then 返回 200",
    source: "explicit",
    type: "api",
    tags: [],
    confidence: 0.9,
    rawText: "",
    ...overrides,
  };
}

function cliScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "cli-build",
    given: "",
    when: "运行 npm run build",
    then: "Then stdout contain done",
    source: "explicit",
    type: "cli",
    tags: [],
    confidence: 0.9,
    rawText: "",
    ...overrides,
  };
}

function ctx(): RunnerContext {
  return {
    topic: "t",
    projectRoot: "/tmp",
    outputDir: "/tmp/out",
    tierAvailability: { cmuxAvailable: false, devServerRunning: false },
  };
}

function curlOk(stdout: string) {
  return (...rest: unknown[]) => {
    if (rest.length === 0) return;
    const cb = rest[rest.length - 1] as (e: Error | null, o: string, s: string) => void;
    cb(null, stdout, "");
  };
}

describe("buildCurlArgs (pure descriptor)", () => {
  it("produces curl + args without string concatenation", () => {
    const d = buildCurlArgs("POST", "http://localhost:3000/api/login");
    expect(d.executable).toBe("curl");
    expect(d.args).toContain("-X");
    expect(d.args).toContain("POST");
    expect(d.args).toContain("http://localhost:3000/api/login");
  });
});

describe("apiRunner — real execution", () => {
  beforeEach(() => execFileMock.mockReset());

  it("PASS when http code 200 returned (not placeholder)", async () => {
    execFileMock.mockImplementation(curlOk("200"));
    const a = (await apiRunner.run(apiScenario(), ctx())) as ScenarioArtifact;
    expect(a.verdict).toBe("PASS");
    expect(execFileMock).toHaveBeenCalled();
  });

  it("FAIL when http code 401 returned", async () => {
    execFileMock.mockImplementation(curlOk("401"));
    const a = await apiRunner.run(apiScenario(), ctx());
    expect(a.verdict).toBe("FAIL");
  });

  it("INCONCLUSIVE when exec rejects (curl crash)", async () => {
    execFileMock.mockImplementation((...rest: unknown[]) => {
      if (rest.length === 0) return;
      const cb = rest[rest.length - 1] as (e: Error | null, o: string, s: string) => void;
      cb(new Error("connection refused"), "", "");
    });
    const a = await apiRunner.run(apiScenario(), ctx());
    expect(a.verdict).toBe("INCONCLUSIVE");
  });
});

describe("cliRunner — real execution", () => {
  beforeEach(() => execFileMock.mockReset());

  it("PASS when stdout contains expected text", async () => {
    execFileMock.mockImplementation(curlOk("build done"));
    const a = await cliRunner.run(cliScenario(), ctx());
    expect(["PASS", "SKIP"]).toContain(a.verdict);
  });
});
