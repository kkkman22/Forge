/**
 * Tests for phased sandbox implementation (Phase 1: declarative config).
 *
 * Covers: SandboxConfig types, checkFilesystemPolicy, checkCommandPolicy,
 * checkNetworkPolicy, loadSandboxConfig, resolveProfile.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkCommandPolicy,
  checkFilesystemPolicy,
  checkNetworkPolicy,
  DEFAULT_SANDBOX_CONFIG,
  loadSandboxConfig,
  resolveProfile,
  type SandboxCheckResult,
  type SandboxConfig,
} from "../src/sandbox-phased.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `sandbox-phased-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeTestConfig(overrides?: Partial<SandboxConfig>): SandboxConfig {
  return {
    ...DEFAULT_SANDBOX_CONFIG,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Task 1: Type definitions and function signatures (RED)
// ---------------------------------------------------------------------------

describe("SandboxConfig type", () => {
  it("has version 1, profile string, filesystem, network, commands", () => {
    const config: SandboxConfig = makeTestConfig();
    expect(config.version).toBe(1);
    expect(typeof config.profile).toBe("string");
    expect(config.filesystem).toBeDefined();
    expect(config.network).toBeDefined();
    expect(config.commands).toBeDefined();
  });

  it("filesystem has read, write, deny string arrays", () => {
    const config: SandboxConfig = makeTestConfig();
    expect(Array.isArray(config.filesystem.read)).toBe(true);
    expect(Array.isArray(config.filesystem.write)).toBe(true);
    expect(Array.isArray(config.filesystem.deny)).toBe(true);
  });

  it("network has allow and deny string arrays", () => {
    const config: SandboxConfig = makeTestConfig();
    expect(Array.isArray(config.network.allow)).toBe(true);
    expect(Array.isArray(config.network.deny)).toBe(true);
  });

  it("commands has allow and deny string arrays", () => {
    const config: SandboxConfig = makeTestConfig();
    expect(Array.isArray(config.commands.allow)).toBe(true);
    expect(Array.isArray(config.commands.deny)).toBe(true);
  });
});

describe("SandboxCheckResult type", () => {
  it("has allowed boolean and reason string", () => {
    const result: SandboxCheckResult = { allowed: true, reason: "" };
    expect(typeof result.allowed).toBe("boolean");
    expect(typeof result.reason).toBe("string");
  });

  it("has optional matchedRule string", () => {
    const result: SandboxCheckResult = { allowed: false, reason: "test", matchedRule: "*.env" };
    expect(result.matchedRule).toBe("*.env");
  });
});

// ---------------------------------------------------------------------------
// Task 2: checkFilesystemPolicy
// ---------------------------------------------------------------------------

describe("checkFilesystemPolicy", () => {
  it("allows a read path matching filesystem.read pattern", () => {
    const config = makeTestConfig({
      filesystem: { read: ["src/**"], write: [], deny: [] },
    });
    const result = checkFilesystemPolicy("src/index.ts", "read", config);
    expect(result.allowed).toBe(true);
  });

  it("allows a write path matching filesystem.write pattern", () => {
    const config = makeTestConfig({
      filesystem: { read: [], write: ["src/**"], deny: [] },
    });
    const result = checkFilesystemPolicy("src/index.ts", "write", config);
    expect(result.allowed).toBe(true);
  });

  it("denies a path matching filesystem.deny even if in allow", () => {
    const config = makeTestConfig({
      filesystem: { read: ["**"], write: ["**"], deny: [".env"] },
    });
    const result = checkFilesystemPolicy(".env", "read", config);
    expect(result.allowed).toBe(false);
    expect(result.matchedRule).toBe(".env");
  });

  it("deny takes priority over allow for write operations", () => {
    const config = makeTestConfig({
      filesystem: { read: ["**"], write: ["**"], deny: ["**/*.key"] },
    });
    const result = checkFilesystemPolicy("config/server.key", "write", config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("deny");
  });

  it("defaults to allowed when no rules match", () => {
    const config = makeTestConfig({
      filesystem: { read: ["src/**"], write: ["src/**"], deny: [] },
    });
    // path not in any allow list, but also not in deny -> default allow
    const result = checkFilesystemPolicy("other/file.txt", "read", config);
    expect(result.allowed).toBe(true);
  });

  it("returns matchedRule for deny matches", () => {
    const config = makeTestConfig({
      filesystem: { read: ["**"], write: ["**"], deny: ["*.pem"] },
    });
    const result = checkFilesystemPolicy("cert.pem", "read", config);
    expect(result.allowed).toBe(false);
    expect(result.matchedRule).toBe("*.pem");
  });

  it("supports glob ** patterns for allow", () => {
    const config = makeTestConfig({
      filesystem: { read: ["src/**/*.ts"], write: [], deny: [] },
    });
    expect(checkFilesystemPolicy("src/foo/bar.ts", "read", config).allowed).toBe(true);
    // Default allow when path doesn't match any explicit rule
    expect(checkFilesystemPolicy("src/foo/bar.js", "read", config).allowed).toBe(true);
  });

  it("glob deny blocks paths that would match allow", () => {
    const config = makeTestConfig({
      filesystem: { read: ["src/**/*.ts"], write: [], deny: ["src/**/secret.ts"] },
    });
    expect(checkFilesystemPolicy("src/foo/bar.ts", "read", config).allowed).toBe(true);
    expect(checkFilesystemPolicy("src/foo/secret.ts", "read", config).allowed).toBe(false);
    expect(checkFilesystemPolicy("src/foo/secret.ts", "read", config).matchedRule).toBe(
      "src/**/secret.ts",
    );
  });

  it("denies path in deny list even with empty allow lists", () => {
    const config = makeTestConfig({
      filesystem: { read: [], write: [], deny: ["secret.key"] },
    });
    const result = checkFilesystemPolicy("secret.key", "read", config);
    expect(result.allowed).toBe(false);
  });

  it("denies node_modules via glob", () => {
    const config = makeTestConfig({
      filesystem: { read: ["**"], write: ["**"], deny: ["node_modules/**"] },
    });
    const result = checkFilesystemPolicy("node_modules/lodash/index.js", "read", config);
    expect(result.allowed).toBe(false);
    expect(result.matchedRule).toBe("node_modules/**");
  });
});

// ---------------------------------------------------------------------------
// Task 3: checkCommandPolicy
// ---------------------------------------------------------------------------

describe("checkCommandPolicy", () => {
  it("allows a command matching commands.allow prefix", () => {
    const config = makeTestConfig({
      commands: { allow: ["git", "node"], deny: [] },
    });
    expect(checkCommandPolicy("git commit", config).allowed).toBe(true);
    expect(checkCommandPolicy("node index.js", config).allowed).toBe(true);
  });

  it("denies a command matching commands.deny prefix", () => {
    const config = makeTestConfig({
      commands: { allow: ["*"], deny: ["rm -rf /", "sudo"] },
    });
    expect(checkCommandPolicy("rm -rf /", config).allowed).toBe(false);
    expect(checkCommandPolicy("sudo apt install", config).allowed).toBe(false);
  });

  it("deny takes priority over allow", () => {
    const config = makeTestConfig({
      commands: { allow: ["*"], deny: ["sudo"] },
    });
    expect(checkCommandPolicy("sudo npm install", config).allowed).toBe(false);
    expect(checkCommandPolicy("npm install", config).allowed).toBe(true);
  });

  it("returns matchedRule for deny", () => {
    const config = makeTestConfig({
      commands: { allow: ["*"], deny: ["curl"] },
    });
    const result = checkCommandPolicy("curl https://evil.com", config);
    expect(result.allowed).toBe(false);
    expect(result.matchedRule).toBe("curl");
  });

  it("allows by default when no rules match", () => {
    const config = makeTestConfig({
      commands: { allow: [], deny: [] },
    });
    expect(checkCommandPolicy("any command", config).allowed).toBe(true);
  });

  it("matches deny prefix for partial command", () => {
    const config = makeTestConfig({
      commands: { allow: ["*"], deny: ["rm -rf /"] },
    });
    const result = checkCommandPolicy("rm -rf /home/user", config);
    expect(result.allowed).toBe(false);
    expect(result.matchedRule).toBe("rm -rf /");
  });
});

// ---------------------------------------------------------------------------
// Task 3: checkNetworkPolicy
// ---------------------------------------------------------------------------

describe("checkNetworkPolicy", () => {
  it("allows a URL matching network.allow pattern", () => {
    const config = makeTestConfig({
      network: { allow: ["api.anthropic.com", "registry.npmjs.org"], deny: [] },
    });
    expect(checkNetworkPolicy("https://api.anthropic.com/v1/messages", config).allowed).toBe(true);
  });

  it("denies a URL matching network.deny pattern", () => {
    const config = makeTestConfig({
      network: { allow: ["*"], deny: ["evil.com"] },
    });
    expect(checkNetworkPolicy("https://evil.com/api", config).allowed).toBe(false);
  });

  it("network.deny ['*'] denies all", () => {
    const config = makeTestConfig({
      network: { allow: ["api.anthropic.com"], deny: ["*"] },
    });
    expect(checkNetworkPolicy("https://api.anthropic.com/v1", config).allowed).toBe(false);
  });

  it("deny takes priority over allow for network", () => {
    const config = makeTestConfig({
      network: { allow: ["*"], deny: ["malware.example.com"] },
    });
    expect(checkNetworkPolicy("https://malware.example.com/payload", config).allowed).toBe(false);
    expect(checkNetworkPolicy("https://github.com/repo", config).allowed).toBe(true);
  });

  it("allows by default when no rules match", () => {
    const config = makeTestConfig({
      network: { allow: [], deny: [] },
    });
    expect(checkNetworkPolicy("https://any.host.com/path", config).allowed).toBe(true);
  });

  it("returns matchedRule for deny", () => {
    const config = makeTestConfig({
      network: { allow: ["*"], deny: ["*.evil.com"] },
    });
    const result = checkNetworkPolicy("https://api.evil.com/steal", config);
    expect(result.allowed).toBe(false);
    expect(result.matchedRule).toBe("*.evil.com");
  });

  it("allows wildcard allow pattern", () => {
    const config = makeTestConfig({
      network: { allow: ["*"], deny: [] },
    });
    expect(checkNetworkPolicy("https://any.host.com/path", config).allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Task 4: loadSandboxConfig
// ---------------------------------------------------------------------------

describe("loadSandboxConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns default config (all allowed) when no config file exists", () => {
    const config = loadSandboxConfig(join(tmpDir, ".tinkerman", "sandbox.json"));
    expect(config.version).toBe(1);
    expect(config.filesystem.read).toEqual(["**"]);
    expect(config.filesystem.write).toEqual(["**"]);
    expect(config.filesystem.deny).toEqual([]);
    expect(config.network.allow).toEqual(["*"]);
    expect(config.network.deny).toEqual([]);
    expect(config.commands.allow).toEqual(["*"]);
    expect(config.commands.deny).toEqual([]);
  });

  it("loads config from existing file", () => {
    mkdirSync(join(tmpDir, ".tinkerman"), { recursive: true });
    const configData = {
      version: 1,
      profile: "strict",
      filesystem: {
        read: ["src/**", ".tinkerman/**"],
        write: ["src/**"],
        deny: [".env", "**/*.key"],
      },
      network: {
        allow: [],
        deny: ["*"],
      },
      commands: {
        allow: ["git", "node"],
        deny: ["sudo"],
      },
    };
    writeFileSync(join(tmpDir, ".tinkerman", "sandbox.json"), JSON.stringify(configData));

    const config = loadSandboxConfig(join(tmpDir, ".tinkerman", "sandbox.json"));
    expect(config.version).toBe(1);
    expect(config.profile).toBe("strict");
    expect(config.filesystem.read).toEqual(["src/**", ".tinkerman/**"]);
    expect(config.filesystem.write).toEqual(["src/**"]);
    expect(config.filesystem.deny).toEqual([".env", "**/*.key"]);
    expect(config.network.allow).toEqual([]);
    expect(config.network.deny).toEqual(["*"]);
    expect(config.commands.allow).toEqual(["git", "node"]);
    expect(config.commands.deny).toEqual(["sudo"]);
  });

  it("returns default config when JSON is malformed", () => {
    mkdirSync(join(tmpDir, ".tinkerman"), { recursive: true });
    writeFileSync(join(tmpDir, ".tinkerman", "sandbox.json"), "{ invalid json }");

    const config = loadSandboxConfig(join(tmpDir, ".tinkerman", "sandbox.json"));
    expect(config.version).toBe(1);
    expect(config.filesystem.read).toEqual(["**"]);
  });

  it("returns default config when called with no path", () => {
    const config = loadSandboxConfig();
    expect(config.version).toBe(1);
    expect(config.filesystem.read).toEqual(["**"]);
  });
});

// ---------------------------------------------------------------------------
// Task 4: resolveProfile
// ---------------------------------------------------------------------------

describe("resolveProfile", () => {
  it("returns the config with active profile name when no profileName specified", () => {
    const config = makeTestConfig({ profile: "default" });
    const resolved = resolveProfile(config);
    expect(resolved.profile).toBe("default");
  });

  it("returns same config when profileName matches config.profile", () => {
    const config = makeTestConfig({ profile: "strict" });
    const resolved = resolveProfile(config, "strict");
    expect(resolved.profile).toBe("strict");
  });

  it("throws when profileName does not match any profile", () => {
    const config = makeTestConfig({ profile: "default" });
    expect(() => resolveProfile(config, "nonexistent")).toThrow(/profile.*not found/i);
  });

  it("throws descriptive error with available profiles", () => {
    const config = makeTestConfig({ profile: "default" });
    expect(() => resolveProfile(config, "strict")).toThrow(/default/);
  });
});

// ---------------------------------------------------------------------------
// Task 9: Integration tests
// ---------------------------------------------------------------------------

describe("Integration: full flow", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("load config -> check filesystem -> deny wins", () => {
    mkdirSync(join(tmpDir, ".tinkerman"), { recursive: true });
    const configData = {
      version: 1,
      profile: "default",
      filesystem: {
        read: ["src/**"],
        write: ["src/**"],
        deny: [".env", "**/*.key"],
      },
      network: { allow: ["*"], deny: [] },
      commands: { allow: ["*"], deny: [] },
    };
    writeFileSync(join(tmpDir, ".tinkerman", "sandbox.json"), JSON.stringify(configData));

    const config = loadSandboxConfig(join(tmpDir, ".tinkerman", "sandbox.json"));

    // Allowed path
    expect(checkFilesystemPolicy("src/app.ts", "write", config).allowed).toBe(true);
    // Denied by deny list
    expect(checkFilesystemPolicy(".env", "read", config).allowed).toBe(false);
    // Denied by deny list (glob)
    expect(checkFilesystemPolicy("config/private.key", "write", config).allowed).toBe(false);
    // Default allow for non-matching path
    expect(checkFilesystemPolicy("docs/readme.md", "read", config).allowed).toBe(true);
  });

  it("load config -> check commands -> deny wins", () => {
    mkdirSync(join(tmpDir, ".tinkerman"), { recursive: true });
    const configData = {
      version: 1,
      profile: "default",
      filesystem: { read: ["**"], write: ["**"], deny: [] },
      network: { allow: ["*"], deny: [] },
      commands: { allow: ["git", "npm", "node"], deny: ["sudo", "rm -rf /"] },
    };
    writeFileSync(join(tmpDir, ".tinkerman", "sandbox.json"), JSON.stringify(configData));

    const config = loadSandboxConfig(join(tmpDir, ".tinkerman", "sandbox.json"));

    expect(checkCommandPolicy("git status", config).allowed).toBe(true);
    expect(checkCommandPolicy("npm test", config).allowed).toBe(true);
    expect(checkCommandPolicy("sudo rm -rf /", config).allowed).toBe(false);
    expect(checkCommandPolicy("rm -rf /etc/passwd", config).allowed).toBe(false);
  });

  it("load config -> check network -> deny wins", () => {
    mkdirSync(join(tmpDir, ".tinkerman"), { recursive: true });
    const configData = {
      version: 1,
      profile: "default",
      filesystem: { read: ["**"], write: ["**"], deny: [] },
      network: { allow: ["api.anthropic.com"], deny: ["evil.com"] },
      commands: { allow: ["*"], deny: [] },
    };
    writeFileSync(join(tmpDir, ".tinkerman", "sandbox.json"), JSON.stringify(configData));

    const config = loadSandboxConfig(join(tmpDir, ".tinkerman", "sandbox.json"));

    expect(checkNetworkPolicy("https://api.anthropic.com/v1/messages", config).allowed).toBe(true);
    expect(checkNetworkPolicy("https://evil.com/steal", config).allowed).toBe(false);
    // Default allow for non-matching host
    expect(checkNetworkPolicy("https://github.com/repo", config).allowed).toBe(true);
  });

  it("missing config file -> full default allow", () => {
    const config = loadSandboxConfig(join(tmpDir, "nonexistent", "sandbox.json"));

    // Everything allowed with default config
    expect(checkFilesystemPolicy("any/path", "write", config).allowed).toBe(true);
    expect(checkCommandPolicy("any command", config).allowed).toBe(true);
    expect(checkNetworkPolicy("https://any.host.com", config).allowed).toBe(true);
  });

  it("resolveProfile + filesystem check combined", () => {
    const config = makeTestConfig({
      profile: "strict",
      filesystem: { read: ["src/**"], write: [], deny: [".env"] },
      network: { allow: [], deny: [] },
      commands: { allow: [], deny: [] },
    });

    const resolved = resolveProfile(config, "strict");
    expect(checkFilesystemPolicy("src/index.ts", "read", resolved).allowed).toBe(true);
    expect(checkFilesystemPolicy(".env", "read", resolved).allowed).toBe(false);
  });

  it("invalid config structure falls back to default", () => {
    mkdirSync(join(tmpDir, ".tinkerman"), { recursive: true });
    // Valid JSON but wrong structure (missing commands section)
    writeFileSync(
      join(tmpDir, ".tinkerman", "sandbox.json"),
      JSON.stringify({
        version: 1,
        profile: "default",
        filesystem: { read: ["src/**"], write: ["src/**"], deny: [] },
        network: { allow: ["*"], deny: [] },
        // missing commands section
      }),
    );

    const config = loadSandboxConfig(join(tmpDir, ".tinkerman", "sandbox.json"));
    // Should fall back to default
    expect(config.version).toBe(1);
    expect(config.filesystem.read).toEqual(["**"]);
  });

  it("config with empty arrays behaves correctly", () => {
    const config = makeTestConfig({
      filesystem: { read: [], write: [], deny: [] },
      network: { allow: [], deny: [] },
      commands: { allow: [], deny: [] },
    });

    // Empty lists -> default allow for everything
    expect(checkFilesystemPolicy("any/file.txt", "write", config).allowed).toBe(true);
    expect(checkCommandPolicy("any command", config).allowed).toBe(true);
    expect(checkNetworkPolicy("https://any.host.com", config).allowed).toBe(true);
  });

  it("strict profile denies all network", () => {
    const config = makeTestConfig({
      network: { allow: [], deny: ["*"] },
    });

    expect(checkNetworkPolicy("https://api.anthropic.com/v1", config).allowed).toBe(false);
    expect(checkNetworkPolicy("https://registry.npmjs.org/pkg", config).allowed).toBe(false);
  });

  it("DEFAULT_SANDBOX_CONFIG allows everything", () => {
    expect(checkFilesystemPolicy(".env", "write", DEFAULT_SANDBOX_CONFIG).allowed).toBe(true);
    expect(checkFilesystemPolicy("/etc/passwd", "read", DEFAULT_SANDBOX_CONFIG).allowed).toBe(true);
    expect(checkCommandPolicy("rm -rf /", DEFAULT_SANDBOX_CONFIG).allowed).toBe(true);
    expect(checkNetworkPolicy("https://evil.com", DEFAULT_SANDBOX_CONFIG).allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Path equivalence integration (Req 5.3, 5.4, 5.7)
// ---------------------------------------------------------------------------

describe("path equivalence integration in sandbox policy", () => {
  const frozenConfig = makeTestConfig({
    filesystem: {
      read: ["**"],
      write: ["**"],
      deny: ["**/.tinkerman/config.md", "**/.tinkerman/specs/**", "**/.tinkerman/plans/**"],
    },
  });

  const commandDenyConfig = makeTestConfig({
    filesystem: {
      read: ["**"],
      write: ["**"],
      deny: ["**/.tinkerman/config.md"],
    },
    commands: {
      allow: ["*"],
      deny: [],
    },
  });

  it("blocks ~/.tinkerman/config.md write via tilde expansion", () => {
    const result = checkFilesystemPolicy("~/.tinkerman/config.md", "write", frozenConfig, {
      cwd: "/project",
      homeDir: "/Users/x",
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks $HOME/.tinkerman/config.md write via variable expansion", () => {
    const result = checkFilesystemPolicy("$HOME/.tinkerman/config.md", "write", frozenConfig, {
      cwd: "/project",
      homeDir: "/Users/x",
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks ${" + "HOME}/.tinkerman/config.md write via braced variable", () => {
    const result = checkFilesystemPolicy(
      "${" + "HOME}/.tinkerman/config.md",
      "write",
      frozenConfig,
      {
        cwd: "/project",
        homeDir: "/Users/x",
      },
    );
    expect(result.allowed).toBe(false);
  });

  it("blocks command accessing .tinkerman/config.md via $HOME path", () => {
    const result = checkCommandPolicy("cat ${" + "HOME}/.tinkerman/config.md", commandDenyConfig, {
      cwd: "/project",
      homeDir: "/Users/x",
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks command accessing .tinkerman/config.md via tilde path", () => {
    const result = checkCommandPolicy("cat ~/.tinkerman/config.md", commandDenyConfig, {
      cwd: "/project",
      homeDir: "/Users/x",
    });
    expect(result.allowed).toBe(false);
  });
});
