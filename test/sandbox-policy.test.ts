/**
 * Unit tests for sandbox-policy.ts
 *
 * Tests pure functions for file system access control, network access control,
 * policy validation, and default policy generation.
 *
 * **Validates: Requirements 1, 2, 3, 5**
 */

import { describe, expect, it, vi } from "vitest";
import {
  buildDefaultPolicy,
  checkFileAccess,
  checkNetworkAccess,
  type FileSystemPolicy,
  type NetworkPolicy,
  validatePolicy,
} from "../src/sandbox-policy.js";

// ---------------------------------------------------------------------------
// checkFileAccess
// ---------------------------------------------------------------------------

describe("checkFileAccess", () => {
  it("allows a path matching an allow pattern", () => {
    const policy: FileSystemPolicy = {
      allow: ["src/**"],
      deny: [],
    };
    const result = checkFileAccess("src/index.ts", policy);
    expect(result.allowed).toBe(true);
  });

  it("denies a path not matching any allow pattern", () => {
    const policy: FileSystemPolicy = {
      allow: ["src/**"],
      deny: [],
    };
    const result = checkFileAccess("lib/index.ts", policy);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("lib/index.ts");
  });

  it("denies a path matching a deny pattern even if it also matches allow", () => {
    const policy: FileSystemPolicy = {
      allow: ["src/**"],
      deny: ["src/secret.ts"],
    };
    const result = checkFileAccess("src/secret.ts", policy);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("deny");
  });

  it("allows a path matching allow when deny list is empty", () => {
    const policy: FileSystemPolicy = {
      allow: ["**"],
      deny: [],
    };
    expect(checkFileAccess("anything.txt", policy).allowed).toBe(true);
  });

  it("supports glob patterns with double-star", () => {
    const policy: FileSystemPolicy = {
      allow: ["src/**/*.ts"],
      deny: [],
    };
    expect(checkFileAccess("src/foo/bar.ts", policy).allowed).toBe(true);
    expect(checkFileAccess("src/foo/bar.js", policy).allowed).toBe(false);
  });

  it("denies when no allow patterns exist", () => {
    const policy: FileSystemPolicy = {
      allow: [],
      deny: [],
    };
    expect(checkFileAccess("any/path", policy).allowed).toBe(false);
  });

  it("deny pattern takes priority over broader allow pattern", () => {
    const policy: FileSystemPolicy = {
      allow: ["**"],
      deny: ["*.env"],
    };
    expect(checkFileAccess(".env", policy).allowed).toBe(false);
    expect(checkFileAccess("src/index.ts", policy).allowed).toBe(true);
  });

  it("normalizes .. segments to prevent path traversal", () => {
    const policy: FileSystemPolicy = {
      allow: ["/project/**"],
      deny: [],
    };
    expect(checkFileAccess("/project/src/../../../etc/passwd", policy).allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkNetworkAccess
// ---------------------------------------------------------------------------

describe("checkNetworkAccess", () => {
  it("allows all endpoints in open mode", () => {
    const policy: NetworkPolicy = { mode: "open" };
    expect(checkNetworkAccess("any.host.com:443", policy).allowed).toBe(true);
  });

  it("denies all endpoints in none mode", () => {
    const policy: NetworkPolicy = { mode: "none" };
    const result = checkNetworkAccess("api.example.com:443", policy);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("none");
  });

  it("allows whitelisted endpoints in restricted mode", () => {
    const policy: NetworkPolicy = {
      mode: "restricted",
      allow: ["api.anthropic.com:443"],
    };
    expect(checkNetworkAccess("api.anthropic.com:443", policy).allowed).toBe(true);
  });

  it("denies non-whitelisted endpoints in restricted mode", () => {
    const policy: NetworkPolicy = {
      mode: "restricted",
      allow: ["api.anthropic.com:443"],
    };
    const result = checkNetworkAccess("evil.com:443", policy);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("evil.com:443");
  });

  it("matches endpoint without port against domain-only allow entry", () => {
    const policy: NetworkPolicy = {
      mode: "restricted",
      allow: ["api.anthropic.com"],
    };
    expect(checkNetworkAccess("api.anthropic.com:443", policy).allowed).toBe(true);
  });

  it("denies in restricted mode with empty allow list", () => {
    const policy: NetworkPolicy = {
      mode: "restricted",
      allow: [],
    };
    expect(checkNetworkAccess("any.host:443", policy).allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validatePolicy
// ---------------------------------------------------------------------------

describe("validatePolicy", () => {
  it("accepts a valid policy config", () => {
    const config = {
      fileSystem: {
        allow: ["src/**"],
        deny: ["*.env"],
      },
      network: {
        mode: "restricted",
        allow: ["api.example.com:443"],
      },
    };
    const result = validatePolicy(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects config missing fileSystem", () => {
    const config = {
      network: { mode: "open" },
    };
    const result = validatePolicy(config);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects config missing network", () => {
    const config = {
      fileSystem: { allow: ["src/**"], deny: [] },
    };
    const result = validatePolicy(config);
    expect(result.valid).toBe(false);
  });

  it("rejects invalid network mode", () => {
    const config = {
      fileSystem: { allow: [], deny: [] },
      network: { mode: "invalid" },
    };
    const result = validatePolicy(config);
    expect(result.valid).toBe(false);
  });

  it("rejects non-array allow/deny lists", () => {
    const config = {
      fileSystem: { allow: "src/**", deny: [] },
      network: { mode: "open" },
    };
    const result = validatePolicy(config);
    expect(result.valid).toBe(false);
  });

  it("rejects null input", () => {
    const result = validatePolicy(null);
    expect(result.valid).toBe(false);
  });

  it("rejects non-object input", () => {
    const result = validatePolicy("not an object");
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildDefaultPolicy
// ---------------------------------------------------------------------------

describe("buildDefaultPolicy", () => {
  it("allows files under project root", () => {
    const policy = buildDefaultPolicy("/projects/my-app");
    expect(checkFileAccess("/projects/my-app/src/index.ts", policy.fileSystem).allowed).toBe(true);
  });

  it("denies files outside project root", () => {
    const policy = buildDefaultPolicy("/projects/my-app");
    const result = checkFileAccess("/etc/passwd", policy.fileSystem);
    expect(result.allowed).toBe(false);
  });

  it("defaults to open network mode", () => {
    const policy = buildDefaultPolicy("/projects/my-app");
    expect(policy.network.mode).toBe("open");
  });

  it("allows project root itself", () => {
    const policy = buildDefaultPolicy("/projects/my-app");
    expect(checkFileAccess("/projects/my-app", policy.fileSystem).allowed).toBe(true);
  });

  it("denies sandbox.json by default to prevent self-modification", () => {
    const policy = buildDefaultPolicy("/projects/my-app");
    expect(
      checkFileAccess("/projects/my-app/.tinkerman/sandbox.json", policy.fileSystem).allowed,
    ).toBe(false);
  });

  it("denies .sandbox-active.json by default", () => {
    const policy = buildDefaultPolicy("/projects/my-app");
    expect(
      checkFileAccess("/projects/my-app/.tinkerman/.sandbox-active.json", policy.fileSystem)
        .allowed,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// REQ-04 (T4): default-semantics declaration — eliminate dual-track trap
// ---------------------------------------------------------------------------

describe("sandbox default-semantics declaration [REQ-04]", () => {
  it("exports an authoritative default-semantics declaration", async () => {
    const mod = await import("../src/sandbox-policy.js");
    expect(mod.SANDBOX_DEFAULT_SEMANTICS).toBeDefined();
    const decl = mod.SANDBOX_DEFAULT_SEMANTICS;
    // the authoritative (advisory) semantics is Phase 1 default-allow
    expect(decl.authoritative).toBe("default-allow");
    // legacy default-deny is scoped to the runtime enforcement layer only
    expect(decl.legacySemantics).toBe("default-deny");
    expect(decl.legacyScope).toMatch(/runtime enforcement/i);
    // a migration cutoff milestone is declared (non-empty)
    expect(typeof decl.migrationCutoff).toBe("string");
    expect(decl.migrationCutoff.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// REQ-04 (F-01): CI-visible misuse detection — legacy API emits deprecation
// ---------------------------------------------------------------------------

describe("sandbox legacy API misuse detection [REQ-04 / F-01]", () => {
  it("calling a legacy default-deny function emits a CI-visible deprecation warning", async () => {
    // re-import to get a fresh module so the one-shot flag resets cleanly
    vi.resetModules();
    const mod = await import("../src/sandbox-policy.js");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // invoke a legacy default-deny function (the runtime-enforcement API)
      mod.checkFileAccess("/some/path", { allow: [], deny: [] });
      const calls = warnSpy.mock.calls.map((c) => String(c[0]));
      expect(
        calls.some((m) => /legacy|default-deny|deprecat/i.test(m)),
        `expected a legacy/deprecation warning, got: ${JSON.stringify(calls)}`,
      ).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("the deprecation warning points consumers to the Phase 1 API", async () => {
    vi.resetModules();
    const mod = await import("../src/sandbox-policy.js");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      mod.buildDefaultPolicy("/proj");
      const joined = warnSpy.mock.calls.map((c) => String(c[0])).join(" ");
      expect(joined).toMatch(/SandboxConfig|Phase 1|default-allow/i);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
