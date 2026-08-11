/**
 * Unit tests for check-sandbox.ts
 *
 * Tests the PreToolUse hook script that enforces sandbox policy
 * by reading .tinkerman/.sandbox-active.json and checking file/network access.
 *
 * **Validates: Requirements 1.3, 1.4, 2.3, 2.4, 4.4**
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkSandboxAccess,
  detectNetworkCommand,
  extractTargetFromBash,
  type SandboxRuntimeConfig,
} from "../src/check-sandbox.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const PROJECT_ROOT = "/tmp/test-project";
const ACTIVE_CONFIG_PATH = resolve(PROJECT_ROOT, ".tinkerman/.sandbox-active.json");

const defaultRuntimeConfig: SandboxRuntimeConfig = {
  projectRoot: PROJECT_ROOT,
  policy: {
    fileSystem: {
      allow: [`${PROJECT_ROOT}/**`],
      deny: [`${PROJECT_ROOT}/.env`],
    },
    network: {
      mode: "restricted",
      allow: ["api.anthropic.com:443"],
    },
  },
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mkdirSync(resolve(PROJECT_ROOT, ".tinkerman"), { recursive: true });
  writeFileSync(ACTIVE_CONFIG_PATH, JSON.stringify(defaultRuntimeConfig));
});

afterEach(() => {
  rmSync(PROJECT_ROOT, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// detectNetworkCommand
// ---------------------------------------------------------------------------

describe("detectNetworkCommand", () => {
  it("detects curl", () => {
    const result = detectNetworkCommand("curl https://example.com/api");
    expect(result).toEqual({ isNetwork: true, endpoint: "example.com:443" });
  });

  it("detects wget", () => {
    const result = detectNetworkCommand("wget http://files.example.com/data.tar.gz");
    expect(result).toEqual({ isNetwork: true, endpoint: "files.example.com:80" });
  });

  it("detects npm publish", () => {
    const result = detectNetworkCommand("npm publish");
    expect(result).toEqual({ isNetwork: true, endpoint: "registry.npmjs.org:443" });
  });

  it("detects git push", () => {
    const result = detectNetworkCommand("git push origin main");
    expect(result).toEqual({ isNetwork: true, endpoint: null });
  });

  it("detects ssh", () => {
    const result = detectNetworkCommand("ssh user@host.example.com");
    expect(result).toEqual({ isNetwork: true, endpoint: "host.example.com" });
  });

  it("detects scp", () => {
    const result = detectNetworkCommand("scp file.txt user@host.example.com:/tmp/");
    expect(result).toEqual({ isNetwork: true, endpoint: "host.example.com" });
  });

  it("returns false for non-network commands", () => {
    expect(detectNetworkCommand("ls -la").isNetwork).toBe(false);
    expect(detectNetworkCommand("git commit -m 'test'").isNetwork).toBe(false);
    expect(detectNetworkCommand("echo hello").isNetwork).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractTargetFromBash
// ---------------------------------------------------------------------------

describe("extractTargetFromBash", () => {
  it("extracts redirect target from > operator", () => {
    expect(extractTargetFromBash("echo hello > /tmp/out.txt")).toBe("/tmp/out.txt");
  });

  it("returns null for commands without file redirects", () => {
    expect(extractTargetFromBash("npm test")).toBeNull();
  });

  it("extracts target from >> append redirect", () => {
    expect(extractTargetFromBash("echo secret >> .env")).toBe(".env");
  });
});

// ---------------------------------------------------------------------------
// checkSandboxAccess
// ---------------------------------------------------------------------------

describe("checkSandboxAccess", () => {
  it("allows Write to permitted path", () => {
    const result = checkSandboxAccess(
      "Write",
      JSON.stringify({ file_path: `${PROJECT_ROOT}/src/index.ts`, content: "" }),
      ACTIVE_CONFIG_PATH,
    );
    expect(result.allowed).toBe(true);
  });

  it("denies Write to denied path", () => {
    const result = checkSandboxAccess(
      "Write",
      JSON.stringify({ file_path: `${PROJECT_ROOT}/.env`, content: "" }),
      ACTIVE_CONFIG_PATH,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("deny");
  });

  it("denies Write to path outside project root", () => {
    const result = checkSandboxAccess(
      "Write",
      JSON.stringify({ file_path: "/etc/passwd", content: "" }),
      ACTIVE_CONFIG_PATH,
    );
    expect(result.allowed).toBe(false);
  });

  it("allows Edit to permitted path", () => {
    const result = checkSandboxAccess(
      "Edit",
      JSON.stringify({ file_path: `${PROJECT_ROOT}/src/test.ts` }),
      ACTIVE_CONFIG_PATH,
    );
    expect(result.allowed).toBe(true);
  });

  it("allows non-network Bash commands", () => {
    const result = checkSandboxAccess(
      "Bash",
      JSON.stringify({ command: "npm test" }),
      ACTIVE_CONFIG_PATH,
    );
    expect(result.allowed).toBe(true);
  });

  it("denies network Bash command not in allow list", () => {
    const result = checkSandboxAccess(
      "Bash",
      JSON.stringify({ command: "curl https://evil.com/api" }),
      ACTIVE_CONFIG_PATH,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("evil.com");
  });

  it("allows network Bash command in allow list", () => {
    const result = checkSandboxAccess(
      "Bash",
      JSON.stringify({ command: "curl https://api.anthropic.com:443/v1/messages" }),
      ACTIVE_CONFIG_PATH,
    );
    expect(result.allowed).toBe(true);
  });

  it("allows all when no sandbox config file exists", () => {
    rmSync(ACTIVE_CONFIG_PATH);
    const result = checkSandboxAccess(
      "Write",
      JSON.stringify({ file_path: "/anything", content: "" }),
      ACTIVE_CONFIG_PATH,
    );
    expect(result.allowed).toBe(true);
  });

  it("handles non-Write/Edit/Bash tools by allowing", () => {
    const result = checkSandboxAccess("Read", "{}", ACTIVE_CONFIG_PATH);
    expect(result.allowed).toBe(true);
  });

  it("denies when sandbox config is malformed JSON", () => {
    writeFileSync(ACTIVE_CONFIG_PATH, "not json");
    const result = checkSandboxAccess(
      "Write",
      JSON.stringify({ file_path: `${PROJECT_ROOT}/src/test.ts` }),
      ACTIVE_CONFIG_PATH,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("policy config");
  });

  it("denies when tool input is malformed JSON", () => {
    const result = checkSandboxAccess("Write", "not json", ACTIVE_CONFIG_PATH);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("tool input");
  });
});

// ---------------------------------------------------------------------------
// Destructive-command guard integration (v2+ R1)
// ---------------------------------------------------------------------------

describe("checkSandboxAccess — destructive guard", () => {
  beforeEach(() => {
    mkdirSync(resolve(PROJECT_ROOT, ".tinkerman"), { recursive: true });
    writeFileSync(ACTIVE_CONFIG_PATH, JSON.stringify(defaultRuntimeConfig));
  });

  afterEach(() => {
    rmSync(PROJECT_ROOT, { recursive: true, force: true });
  });

  it("denies a destructive git reset --hard via Bash tool", () => {
    const result = checkSandboxAccess(
      "Bash",
      JSON.stringify({ command: "git reset --hard" }),
      ACTIVE_CONFIG_PATH,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Destructive guard");
  });

  it("denies git clean -fd via Bash tool", () => {
    const result = checkSandboxAccess(
      "Bash",
      JSON.stringify({ command: "git clean -fd" }),
      ACTIVE_CONFIG_PATH,
    );
    expect(result.allowed).toBe(false);
  });

  it("allows a non-destructive git command via Bash tool", () => {
    const result = checkSandboxAccess(
      "Bash",
      JSON.stringify({ command: "git status" }),
      ACTIVE_CONFIG_PATH,
    );
    expect(result.allowed).toBe(true);
  });

  it("R1-AC5: config.md destructive_guard:off propagates to hook (allows destructive)", () => {
    writeFileSync(
      resolve(PROJECT_ROOT, ".tinkerman/config.md"),
      "---\ndestructive_guard: off\n---\n",
    );
    const result = checkSandboxAccess(
      "Bash",
      JSON.stringify({ command: "git reset --hard" }),
      ACTIVE_CONFIG_PATH,
    );
    expect(result.allowed).toBe(true);
  });

  it("combined: sandbox allow + destructive deny → overall deny (short-circuit)", () => {
    // git reset --hard is allowed by sandbox profile (no fs/network hit) but
    // denied by destructive guard → overall deny.
    const result = checkSandboxAccess(
      "Bash",
      JSON.stringify({ command: "git reset --hard" }),
      ACTIVE_CONFIG_PATH,
    );
    expect(result.allowed).toBe(false);
  });
});
