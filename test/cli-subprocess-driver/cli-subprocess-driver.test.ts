import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildArgs,
  buildEnv,
  type CliSpawnRequest,
  type SubprocessOptions,
  scheduleSignalChain,
} from "../../src/cli-subprocess-driver.js";

let tmpRunDir: string;

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "cli-subproc-"));
  tmpRunDir = join(root, ".forge", "runs", "run_t6");
});

afterEach(() => {
  // OS reclaims tmp
});

function baseOpts(over: Partial<SubprocessOptions> = {}): SubprocessOptions {
  return {
    runDir: tmpRunDir,
    runId: "run_t6",
    permissionMode: "default",
    allowedTools: [],
    disallowedTools: [],
    additionalDirectories: [],
    maxTurns: 10,
    ...over,
  };
}

describe("CliSubprocessDriver: AC 5.1 — buildArgs", () => {
  it("includes core flags --print, --output-format=stream-json, --include-partial-messages", () => {
    const args = buildArgs(baseOpts());
    expect(args).toContain("--print");
    expect(args).toContain("--output-format=stream-json");
    expect(args).toContain("--include-partial-messages");
  });

  it("includes --input-format=stream-json so stdin accepts NDJSON frames", () => {
    const args = buildArgs(baseOpts());
    expect(args).toContain("--input-format=stream-json");
  });

  it("maps permissionMode to --permission-mode <mode>", () => {
    const args = buildArgs(baseOpts({ permissionMode: "acceptEdits" }));
    const idx = args.indexOf("--permission-mode");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("acceptEdits");
  });

  it("appends --dangerously-skip-permissions when allowDangerouslySkipPermissions=true", () => {
    const args = buildArgs(baseOpts({ allowDangerouslySkipPermissions: true }));
    expect(args).toContain("--dangerously-skip-permissions");
  });

  it("maps allowedTools/disallowedTools to comma-list flags", () => {
    const args = buildArgs(baseOpts({ allowedTools: ["Read", "Edit"], disallowedTools: ["Bash"] }));
    const ai = args.indexOf("--allowed-tools");
    const di = args.indexOf("--disallowed-tools");
    expect(args[ai + 1]).toBe("Read,Edit");
    expect(args[di + 1]).toBe("Bash");
  });

  it("does not emit --allowed-tools when list is empty", () => {
    const args = buildArgs(baseOpts({ allowedTools: [], disallowedTools: [] }));
    expect(args).not.toContain("--allowed-tools");
    expect(args).not.toContain("--disallowed-tools");
  });

  it("maps mcpConfig to --mcp-config <path>", () => {
    const args = buildArgs(baseOpts({ mcpConfig: "/tmp/mcp.json" }));
    const i = args.indexOf("--mcp-config");
    expect(args[i + 1]).toBe("/tmp/mcp.json");
  });

  it("maps additionalDirectories to repeated --add-dir flags", () => {
    const args = buildArgs(baseOpts({ additionalDirectories: ["/a", "/b"] }));
    const adds = args.reduce<number>((n, a) => (a === "--add-dir" ? n + 1 : n), 0);
    expect(adds).toBe(2);
  });

  it("maps systemPromptPath to --system-prompt-file <path>", () => {
    const args = buildArgs(baseOpts({ systemPromptPath: "/tmp/sp.txt" }));
    const i = args.indexOf("--system-prompt-file");
    expect(args[i + 1]).toBe("/tmp/sp.txt");
  });

  it("includes --max-turns <n>", () => {
    const args = buildArgs(baseOpts({ maxTurns: 25 }));
    const i = args.indexOf("--max-turns");
    expect(args[i + 1]).toBe("25");
  });
});

describe("CliSubprocessDriver: AC 5.6 — session resume vs new id", () => {
  it("emits --resume <id> when resumeSessionId provided", () => {
    const args = buildArgs(baseOpts({ resumeSessionId: "sess_abc" }));
    const i = args.indexOf("--resume");
    expect(args[i + 1]).toBe("sess_abc");
  });

  it("emits --session-id <uuid> when newSessionId provided and no resume", () => {
    const args = buildArgs(baseOpts({ newSessionId: "uuid_xyz" }));
    const i = args.indexOf("--session-id");
    expect(args[i + 1]).toBe("uuid_xyz");
  });

  it("when both provided, --resume wins and --session-id is omitted", () => {
    const args = buildArgs(baseOpts({ resumeSessionId: "sess_abc", newSessionId: "uuid_xyz" }));
    expect(args).toContain("--resume");
    expect(args).not.toContain("--session-id");
  });
});

describe("CliSubprocessDriver: AC 5.1(e) — buildEnv", () => {
  it("includes ANTHROPIC_API_KEY and CLAUDE_CODE_OAUTH_TOKEN passthrough", () => {
    const env = buildEnv(
      {
        ANTHROPIC_API_KEY: "sk-test",
        CLAUDE_CODE_OAUTH_TOKEN: "oa-test",
      },
      {},
    );
    expect(env.ANTHROPIC_API_KEY).toBe("sk-test");
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("oa-test");
  });

  it("forwards CLAUDE_CODE_WORKFLOWS gate by default", () => {
    const env = buildEnv({ CLAUDE_CODE_WORKFLOWS: "1" }, {});
    expect(env.CLAUDE_CODE_WORKFLOWS).toBe("1");
  });

  it("overrides allow caller to set CLAUDE_CODE_WORKFLOWS", () => {
    const env = buildEnv({}, { CLAUDE_CODE_WORKFLOWS: "1" });
    expect(env.CLAUDE_CODE_WORKFLOWS).toBe("1");
  });

  it("does not mutate the original process env object", () => {
    const orig = { ANTHROPIC_API_KEY: "k" };
    buildEnv(orig, { EXTRA: "v" });
    expect(orig).not.toHaveProperty("EXTRA");
  });

  it("F15: drops non-whitelisted vars (AWS_SECRET_ACCESS_KEY, GITHUB_TOKEN, ...)", () => {
    const env = buildEnv(
      {
        // Whitelisted — must survive.
        ANTHROPIC_API_KEY: "sk-x",
        PATH: "/usr/bin",
        HOME: "/home/u",
        USER: "u",
        // Not whitelisted — must be dropped to prevent leakage.
        AWS_SECRET_ACCESS_KEY: "AKIA...secret",
        GITHUB_TOKEN: "ghp_...secret",
        SSH_AUTH_SOCK: "/tmp/ssh-xxx",
        DATABASE_URL: "postgres://...",
        OPENAI_API_KEY: "sk-other",
        UNRELATED: "x",
      },
      {},
    );
    // Whitelisted keys present.
    expect(env.ANTHROPIC_API_KEY).toBe("sk-x");
    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/home/u");
    expect(env.USER).toBe("u");
    // Non-whitelisted keys absent.
    expect(env).not.toHaveProperty("AWS_SECRET_ACCESS_KEY");
    expect(env).not.toHaveProperty("GITHUB_TOKEN");
    expect(env).not.toHaveProperty("SSH_AUTH_SOCK");
    expect(env).not.toHaveProperty("DATABASE_URL");
    expect(env).not.toHaveProperty("OPENAI_API_KEY");
    expect(env).not.toHaveProperty("UNRELATED");
  });

  it("F15: overrides win even for non-whitelisted keys (caller responsibility)", () => {
    // If the caller explicitly chooses to set MY_FLAG via overrides, that's
    // their explicit choice and we honour it. The allowlist only filters
    // baseEnv (i.e. process.env).
    const env = buildEnv({ MY_FLAG: "ignored-from-base" }, { MY_FLAG: "set-by-caller" });
    expect(env.MY_FLAG).toBe("set-by-caller");
  });
});

describe("CliSubprocessDriver: AC 5.8 — signal chain SIGINT→SIGTERM→SIGKILL", () => {
  it("schedules SIGINT immediately, SIGTERM at 10s, SIGKILL at 15s", () => {
    const sent: Array<{ signal: string; t: number }> = [];
    const now = { v: 0 };
    const stillAlive = () => true;

    const chain = scheduleSignalChain({
      send: (sig) => sent.push({ signal: sig, t: now.v }),
      stillAlive,
      now: () => now.v,
      // Synchronous "scheduler" — we drive it manually below.
      schedule: (cb, delayMs) => {
        // Fake immediately advances time and runs cb.
        now.v += delayMs;
        cb();
      },
    });

    chain.start();

    expect(sent.map((s) => s.signal)).toEqual(["SIGINT", "SIGTERM", "SIGKILL"]);
    expect(sent[0]?.t).toBe(0);
    expect(sent[1]?.t).toBe(10_000);
    expect(sent[2]?.t).toBe(15_000);
  });

  it("aborts later signals once child exits", () => {
    const sent: string[] = [];
    let alive = true;
    const chain = scheduleSignalChain({
      send: (sig) => {
        sent.push(sig);
        if (sig === "SIGTERM") alive = false;
      },
      stillAlive: () => alive,
      now: () => 0,
      schedule: (cb) => cb(),
    });
    chain.start();
    // After SIGTERM the child died, so SIGKILL must NOT fire.
    expect(sent).toEqual(["SIGINT", "SIGTERM"]);
  });

  it("writes signal chain records to .forge/runs/<runId>/signal_chain.jsonl", () => {
    const sent: string[] = [];
    let alive = true;
    const chain = scheduleSignalChain({
      send: (sig) => sent.push(sig),
      stillAlive: () => alive,
      now: () => 0,
      schedule: (cb) => cb(),
      runDir: tmpRunDir,
    });
    chain.start();
    alive = false;
    const path = join(tmpRunDir, "signal_chain.jsonl");
    expect(existsSync(path)).toBe(true);
    const lines = readFileSync(path, "utf-8").trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(3);
    const first = JSON.parse(lines[0]!);
    expect(first.signal).toBe("SIGINT");
    expect(first.run_id).toBe("");
  });
});

describe("CliSubprocessDriver: spawn request shape", () => {
  it("composes a CliSpawnRequest combining buildArgs + buildEnv", () => {
    // This test isolates the data-shape responsibility — actual spawn happens in T8 integration.
    const args = buildArgs(baseOpts());
    const env = buildEnv({ ANTHROPIC_API_KEY: "k" }, {});
    const req: CliSpawnRequest = {
      cmd: "claude",
      args,
      env,
      cwd: "/tmp",
    };
    expect(req.cmd).toBe("claude");
    expect(req.args.length).toBeGreaterThan(0);
    expect(req.env.ANTHROPIC_API_KEY).toBe("k");
  });
});
