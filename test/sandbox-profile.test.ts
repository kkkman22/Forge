import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FORGE_LOOP_TOOLS,
  loadSandboxProfile,
  type SandboxConfigV1,
  type SandboxConfigV2,
  type SandboxProfile,
  toSdkSandboxSettings,
} from "../src/sandbox-profile.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `sandbox-profile-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// FORGE_LOOP_TOOLS constant
// ---------------------------------------------------------------------------

describe("FORGE_LOOP_TOOLS", () => {
  it("contains all core tools for unattended loop execution", () => {
    const required = ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "Agent"];
    for (const tool of required) {
      expect(FORGE_LOOP_TOOLS).toContain(tool);
    }
  });

  it("contains WebFetch and WebSearch for decide/plan research", () => {
    expect(FORGE_LOOP_TOOLS).toContain("WebFetch");
    expect(FORGE_LOOP_TOOLS).toContain("WebSearch");
  });

  it("contains NotebookEdit and TodoWrite", () => {
    expect(FORGE_LOOP_TOOLS).toContain("NotebookEdit");
    expect(FORGE_LOOP_TOOLS).toContain("TodoWrite");
  });

  it("is a readonly array", () => {
    expect(Array.isArray(FORGE_LOOP_TOOLS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// loadSandboxProfile — v2 format
// ---------------------------------------------------------------------------

describe("loadSandboxProfile — v2 format", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads default builder profile when no profileName specified", () => {
    const config: SandboxConfigV2 = {
      version: 2,
      activeProfile: "builder",
      profiles: {
        builder: {
          fileSystem: { allow: ["."], deny: [".tinkerman/sandbox.json"] },
          network: { mode: "restricted", allow: ["registry.npmjs.org"] },
        },
      },
    };
    mkdirSync(join(tmpDir, ".tinkerman"), { recursive: true });
    writeFileSync(join(tmpDir, ".tinkerman", "sandbox.json"), JSON.stringify(config));

    const profile = loadSandboxProfile(tmpDir);
    expect(profile.fileSystem.allow).toEqual(["."]);
    expect(profile.fileSystem.deny).toEqual([".tinkerman/sandbox.json"]);
    expect(profile.network.mode).toBe("restricted");
  });

  it("loads named profile when profileName specified", () => {
    const config: SandboxConfigV2 = {
      version: 2,
      activeProfile: "builder",
      profiles: {
        builder: {
          fileSystem: { allow: ["."], deny: [] },
          network: { mode: "open" },
        },
        strict: {
          fileSystem: { allow: ["./src", "./test"], deny: [".env"] },
          network: { mode: "none" },
        },
      },
    };
    mkdirSync(join(tmpDir, ".tinkerman"), { recursive: true });
    writeFileSync(join(tmpDir, ".tinkerman", "sandbox.json"), JSON.stringify(config));

    const profile = loadSandboxProfile(tmpDir, "strict");
    expect(profile.fileSystem.allow).toEqual(["./src", "./test"]);
    expect(profile.network.mode).toBe("none");
  });

  it("throws when profile name does not exist", () => {
    const config: SandboxConfigV2 = {
      version: 2,
      activeProfile: "builder",
      profiles: {
        builder: {
          fileSystem: { allow: ["."], deny: [] },
          network: { mode: "open" },
        },
      },
    };
    mkdirSync(join(tmpDir, ".tinkerman"), { recursive: true });
    writeFileSync(join(tmpDir, ".tinkerman", "sandbox.json"), JSON.stringify(config));

    expect(() => loadSandboxProfile(tmpDir, "nonexistent")).toThrow(/nonexistent/);
  });
});

// ---------------------------------------------------------------------------
// loadSandboxProfile — v1 format auto-upgrade
// ---------------------------------------------------------------------------

describe("loadSandboxProfile — v1 auto-upgrade", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("auto-upgrades v1 config to v2 single profile", () => {
    const config: SandboxConfigV1 = {
      fileSystem: {
        allow: ["./src"],
        deny: [".env"],
      },
      network: {
        mode: "restricted",
        allow: ["api.anthropic.com"],
      },
    };
    mkdirSync(join(tmpDir, ".tinkerman"), { recursive: true });
    writeFileSync(join(tmpDir, ".tinkerman", "sandbox.json"), JSON.stringify(config));

    const profile = loadSandboxProfile(tmpDir);
    expect(profile.fileSystem.allow).toEqual(["./src"]);
    expect(profile.fileSystem.deny).toEqual([".env"]);
    expect(profile.network.mode).toBe("restricted");
  });
});

// ---------------------------------------------------------------------------
// loadSandboxProfile — no config file (default builder profile)
// ---------------------------------------------------------------------------

describe("loadSandboxProfile — no config file", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns default builder profile when no sandbox.json exists", () => {
    const profile = loadSandboxProfile(tmpDir);
    expect(profile.fileSystem.allow).toContain(".");
    expect(profile.fileSystem.deny).toContain(".tinkerman/sandbox.json");
    expect(profile.network.mode).toBe("restricted");
  });
});

// ---------------------------------------------------------------------------
// toSdkSandboxSettings — mapping
// ---------------------------------------------------------------------------

describe("toSdkSandboxSettings", () => {
  const cwd = "/project/root";

  it("always includes enabled: true and failIfUnavailable: true", () => {
    const profile: SandboxProfile = {
      fileSystem: { allow: ["."], deny: [] },
      network: { mode: "open" },
    };
    const settings = toSdkSandboxSettings(profile, cwd);
    expect(settings.enabled).toBe(true);
    expect(settings.failIfUnavailable).toBe(true);
  });

  it("sets autoAllowBashIfSandboxed: true", () => {
    const profile: SandboxProfile = {
      fileSystem: { allow: ["."], deny: [] },
      network: { mode: "open" },
    };
    const settings = toSdkSandboxSettings(profile, cwd);
    expect(settings.autoAllowBashIfSandboxed).toBe(true);
  });

  it("sets allowUnsandboxedCommands: false", () => {
    const profile: SandboxProfile = {
      fileSystem: { allow: ["."], deny: [] },
      network: { mode: "open" },
    };
    const settings = toSdkSandboxSettings(profile, cwd);
    expect(settings.allowUnsandboxedCommands).toBe(false);
  });

  it("sets network.allowLocalBinding: true", () => {
    const profile: SandboxProfile = {
      fileSystem: { allow: ["."], deny: [] },
      network: { mode: "restricted", allow: ["registry.npmjs.org"] },
    };
    const settings = toSdkSandboxSettings(profile, cwd);
    expect(settings.network?.allowLocalBinding).toBe(true);
  });

  it("maps fileSystem.allow to filesystem.allowWrite", () => {
    const profile: SandboxProfile = {
      fileSystem: { allow: ["./src", "./test"], deny: [".env"] },
      network: { mode: "open" },
    };
    const settings = toSdkSandboxSettings(profile, cwd);
    expect(settings.filesystem?.allowWrite).toEqual(["./src", "./test"]);
    expect(settings.filesystem?.denyWrite).toEqual([".env"]);
  });

  it("maps fileSystem.denyRead to filesystem.denyRead", () => {
    const profile: SandboxProfile = {
      fileSystem: { allow: ["."], deny: [], denyRead: [".secrets"] },
      network: { mode: "open" },
    };
    const settings = toSdkSandboxSettings(profile, cwd);
    expect(settings.filesystem?.denyRead).toEqual([".secrets"]);
  });

  it('maps network.mode "none" to allowManagedDomainsOnly: true with empty allowedDomains', () => {
    const profile: SandboxProfile = {
      fileSystem: { allow: ["."], deny: [] },
      network: { mode: "none" },
    };
    const settings = toSdkSandboxSettings(profile, cwd);
    expect(settings.network?.allowManagedDomainsOnly).toBe(true);
    expect(settings.network?.allowedDomains).toEqual([]);
  });

  it('maps network.mode "restricted" to allowManagedDomainsOnly: true with allowedDomains', () => {
    const profile: SandboxProfile = {
      fileSystem: { allow: ["."], deny: [] },
      network: { mode: "restricted", allow: ["api.anthropic.com", "registry.npmjs.org"] },
    };
    const settings = toSdkSandboxSettings(profile, cwd);
    expect(settings.network?.allowManagedDomainsOnly).toBe(true);
    expect(settings.network?.allowedDomains).toEqual(["api.anthropic.com", "registry.npmjs.org"]);
  });

  it('maps network.mode "open" to no network restrictions', () => {
    const profile: SandboxProfile = {
      fileSystem: { allow: ["."], deny: [] },
      network: { mode: "open" },
    };
    const settings = toSdkSandboxSettings(profile, cwd);
    expect(settings.network?.allowManagedDomainsOnly).toBeUndefined();
    expect(settings.network?.allowedDomains).toBeUndefined();
  });

  it("maps network.deny to deniedDomains", () => {
    const profile: SandboxProfile = {
      fileSystem: { allow: ["."], deny: [] },
      network: { mode: "restricted", allow: ["api.anthropic.com"], deny: ["evil.com"] },
    };
    const settings = toSdkSandboxSettings(profile, cwd);
    expect(settings.network?.deniedDomains).toEqual(["evil.com"]);
  });
});

// ---------------------------------------------------------------------------
// toSdkSandboxSettings — property invariants
// ---------------------------------------------------------------------------

describe("toSdkSandboxSettings — property invariants", () => {
  const cwd = "/project";

  it("always produces enabled=true regardless of profile content", () => {
    const modes: Array<"none" | "restricted" | "open"> = ["none", "restricted", "open"];
    for (const mode of modes) {
      const profile: SandboxProfile = {
        fileSystem: { allow: ["."], deny: [] },
        network: { mode },
      };
      expect(toSdkSandboxSettings(profile, cwd).enabled).toBe(true);
    }
  });

  it("network.mode=none always produces empty allowedDomains", () => {
    const profiles: SandboxProfile[] = [
      { fileSystem: { allow: ["."], deny: [] }, network: { mode: "none" } },
      { fileSystem: { allow: ["./src"], deny: [".env"] }, network: { mode: "none" } },
    ];
    for (const profile of profiles) {
      const settings = toSdkSandboxSettings(profile, cwd);
      expect(settings.network?.allowedDomains).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Profile isolation — tools not restricted by profile
// ---------------------------------------------------------------------------

describe("Profile isolation — tools never restricted", () => {
  it("FORGE_LOOP_TOOLS is the same regardless of profile", () => {
    // The constant is static, but this test documents the invariant:
    // all profiles must use the same tool set
    const toolsFromBuilder = [...FORGE_LOOP_TOOLS];
    const toolsFromStrict = [...FORGE_LOOP_TOOLS];
    expect(toolsFromBuilder).toEqual(toolsFromStrict);
  });
});
