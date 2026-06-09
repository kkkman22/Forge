import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  checkPlatformGate,
  isBitbucketUrl,
  isSameHost,
  parseRemoteUrl,
  selectRemoteUrl,
} from "../../src/review-comment-bitbucket/platform-gate.js";
import type { GateInput } from "../../src/review-comment-bitbucket/types.js";

describe("platform-gate: property tests", () => {
  // Row 1: URL has bitbucket., override=auto, MCP configured, same-host → pass
  it("Row 1: Bitbucket URL, auto, MCP configured, same-host → pass", { timeout: 30000 }, () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z0-9-]+$/),
        fc.stringMatching(/^[a-z0-9-]+$/),
        (org, repo) => {
          const bitbucketUrl = `https://bitbucket.example.com/${org}/${repo}.git`;
          const mcpUrl = `https://bitbucket.example.com/api`;

          const input: GateInput = {
            remoteUrl: bitbucketUrl,
            platformOverride: "auto",
            mcpConfigured: true,
            mcpBaseUrl: mcpUrl,
          };

          const result = checkPlatformGate(input);
          expect(result).toEqual({ skip: false });
        },
      ),
    );
  });

  // Row 2: URL has bitbucket., override=auto, MCP configured, NOT same-host → mcp-base-url-mismatch
  it("Row 2: Bitbucket URL, auto, MCP configured, NOT same-host → mcp-base-url-mismatch", {
    timeout: 30000,
  }, () => {
    fc.assert(
      fc.property(fc.webUrl(), fc.webUrl(), (bitbucketUrl, mcpUrl) => {
        // Ensure different hosts
        const normalizedBitbucket = bitbucketUrl.replace(
          /^[a-z]+:\/\//i,
          "https://bitbucket.example.",
        );
        const normalizedMcp = mcpUrl.replace(/^[a-z]+:\/\//i, "https://other.example.");

        const input: GateInput = {
          remoteUrl: normalizedBitbucket,
          platformOverride: "auto",
          mcpConfigured: true,
          mcpBaseUrl: normalizedMcp,
        };

        const result = checkPlatformGate(input);
        expect(result).toEqual({ skip: true, reason: "mcp-base-url-mismatch" });
      }),
    );
  });

  // Row 3: URL has bitbucket., override=auto, MCP NOT configured → mcp-not-configured
  it("Row 3: Bitbucket URL, auto, MCP NOT configured → mcp-not-configured", {
    timeout: 30000,
  }, () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        const bitbucketUrl = url.replace(/^[a-z]+:\/\//i, "https://bitbucket.");

        const input: GateInput = {
          remoteUrl: bitbucketUrl,
          platformOverride: "auto",
          mcpConfigured: false,
          mcpBaseUrl: null,
        };

        const result = checkPlatformGate(input);
        expect(result).toEqual({ skip: true, reason: "mcp-not-configured" });
      }),
    );
  });

  // Row 4: URL does NOT have bitbucket. (or null), override=auto → platform-not-bitbucket
  it("Row 4: Non-Bitbucket URL or null, auto → platform-not-bitbucket", { timeout: 30000 }, () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.webUrl().filter((url) => !url.includes("bitbucket.")),
        ),
        (remoteUrl) => {
          const input: GateInput = {
            remoteUrl,
            platformOverride: "auto",
            mcpConfigured: false,
            mcpBaseUrl: null,
          };

          const result = checkPlatformGate(input);
          expect(result).toEqual({ skip: true, reason: "platform-not-bitbucket" });
        },
      ),
    );
  });

  // Row 5: override=bitbucket, MCP configured, same-host → pass (forced)
  it("Row 5: override=bitbucket, MCP configured, same-host → pass (forced)", {
    timeout: 30000,
  }, () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z0-9-]+$/),
        fc.stringMatching(/^[a-z0-9-]+$/),
        (org, repo) => {
          const remoteUrl = `https://bitbucket.example.com/${org}/${repo}.git`;
          const mcpUrl = `https://bitbucket.example.com/api`;

          const input: GateInput = {
            remoteUrl,
            platformOverride: "bitbucket",
            mcpConfigured: true,
            mcpBaseUrl: mcpUrl,
          };

          const result = checkPlatformGate(input);
          expect(result).toEqual({ skip: false });
        },
      ),
    );
  });

  // Row 6: override=bitbucket, MCP configured, NOT same-host → mcp-base-url-mismatch
  it("Row 6: override=bitbucket, MCP configured, NOT same-host → mcp-base-url-mismatch", {
    timeout: 30000,
  }, () => {
    fc.assert(
      fc.property(fc.webUrl(), fc.webUrl(), (remoteUrl, mcpUrl) => {
        const normalizedRemote = remoteUrl.replace(/^[a-z]+:\/\//i, "https://github.example.");
        const normalizedMcp = mcpUrl.replace(/^[a-z]+:\/\//i, "https://other.example.");

        const input: GateInput = {
          remoteUrl: normalizedRemote,
          platformOverride: "bitbucket",
          mcpConfigured: true,
          mcpBaseUrl: normalizedMcp,
        };

        const result = checkPlatformGate(input);
        expect(result).toEqual({ skip: true, reason: "mcp-base-url-mismatch" });
      }),
    );
  });

  // Row 7: override=bitbucket, MCP NOT configured → override-but-mcp-missing
  it("Row 7: override=bitbucket, MCP NOT configured → override-but-mcp-missing", {
    timeout: 30000,
  }, () => {
    fc.assert(
      fc.property(fc.webUrl(), (remoteUrl) => {
        const input: GateInput = {
          remoteUrl,
          platformOverride: "bitbucket",
          mcpConfigured: false,
          mcpBaseUrl: null,
        };

        const result = checkPlatformGate(input);
        expect(result).toEqual({ skip: true, reason: "override-but-mcp-missing" });
      }),
    );
  });

  // Row 8: override=none → platform-disabled-by-config (regardless of other inputs)
  it("Row 8: override=none → platform-disabled-by-config", { timeout: 30000 }, () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), fc.webUrl()),
        fc.boolean(),
        fc.oneof(fc.constant(null), fc.webUrl()),
        (remoteUrl, mcpConfigured, mcpBaseUrl) => {
          const input: GateInput = {
            remoteUrl,
            platformOverride: "none",
            mcpConfigured,
            mcpBaseUrl,
          };

          const result = checkPlatformGate(input);
          expect(result).toEqual({ skip: true, reason: "platform-disabled-by-config" });
        },
      ),
    );
  });

  // Property 9: URL case-insensitivity - Bitbucket.Org equals bitbucket.org
  it("Property 9: URL case-insensitivity", { timeout: 30000 }, () => {
    const validHostLabel = fc
      .stringMatching(/^[a-z0-9-]+$/)
      .filter(
        (label) =>
          label.length > 0 &&
          !label.startsWith("-") &&
          !label.endsWith("-") &&
          !label.startsWith("xn--"),
      );

    fc.assert(
      fc.property(validHostLabel, fc.stringMatching(/^[a-z]+$/), (subdomain, tld) => {
        const url1 = `https://${subdomain.toLowerCase()}.${tld.toLowerCase()}`;
        const url2 = `https://${subdomain.toUpperCase()}.${tld.toUpperCase()}`;

        expect(isSameHost(url1, url2)).toBe(true);
      }),
    );
  });

  // Property 10: Host comparison includes port
  it("Property 10: Host comparison includes port", { timeout: 30000 }, () => {
    fc.assert(
      fc.property(fc.webUrl(), fc.nat({ max: 65535 }), (url, port) => {
        const urlWithPort = url.replace(/^https?:\/\//i, `$&example.com:${port}/`);
        const urlWithoutPort = url.replace(/^https?:\/\//i, "https://example.com/");

        if (port === 80 || port === 443) {
          return true; // Skip default ports - they may be treated specially
        }

        expect(isSameHost(urlWithPort, urlWithoutPort)).toBe(false);
      }),
    );
  });
});

describe("platform-gate: unit tests", () => {
  // Unit 1: null URL + override=auto → platform-not-bitbucket (row 4)
  it("Unit 1: null URL + override=auto → platform-not-bitbucket", () => {
    const input: GateInput = {
      remoteUrl: null,
      platformOverride: "auto",
      mcpConfigured: true,
      mcpBaseUrl: "https://bitbucket.example.com/api",
    };

    const result = checkPlatformGate(input);
    expect(result).toEqual({ skip: true, reason: "platform-not-bitbucket" });
  });

  // Unit 2: SCP-style URL git@bitbucket.example.com:org/repo.git → host=bitbucket.example.com
  it("Unit 2: SCP-style URL parsing", () => {
    const scpUrl = "git@bitbucket.example.com:org/repo.git";
    const parsed = parseRemoteUrl(scpUrl);

    expect(parsed).not.toBeNull();
    expect(parsed?.host).toBe("bitbucket.example.com");
    expect(parsed?.port).toBeNull();

    // Verify it's detected as Bitbucket
    expect(isBitbucketUrl(scpUrl)).toBe(true);
  });

  // Unit 3: IPv6 literal [::1]:7990 vs [::1]:7990 → same host+port
  it("Unit 3: IPv6 literal normalization", () => {
    const url1 = "https://[::1]:7990/repo.git";
    const url2 = "https://[::1]:7990/path.git";

    expect(isSameHost(url1, url2)).toBe(true);

    // Verify parsing works for both
    const parsed1 = parseRemoteUrl(url1);
    const parsed2 = parseRemoteUrl(url2);

    expect(parsed1).not.toBeNull();
    expect(parsed2).not.toBeNull();
    expect(parsed1?.host).toBe(parsed2?.host);
    expect(parsed1?.port).toBe(parsed2?.port);
    expect(parsed1?.host).toBe("::1");
    expect(parsed1?.port).toBe(7990);

    // Test IPv6 without port
    const url3 = "https://[::1]/repo.git";
    const parsed3 = parseRemoteUrl(url3);
    expect(parsed3?.host).toBe("::1");
    expect(parsed3?.port).toBeNull();
  });

  // Unit 4: Multi-remote priority: origin > upstream > first same-host > null
  it("Unit 4: Multi-remote selection priority", () => {
    const remotes = [
      { name: "upstream", url: "https://bitbucket.example.com/upstream/repo.git" },
      { name: "origin", url: "https://bitbucket.example.com/origin/repo.git" },
      { name: "fork", url: "https://bitbucket.example.com/fork/repo.git" },
      { name: "other", url: "https://github.example.com/repo.git" },
    ];

    // Test 1: origin exists
    expect(selectRemoteUrl(remotes, "https://bitbucket.example.com/api")).toBe(
      "https://bitbucket.example.com/origin/repo.git",
    );

    // Test 2: no origin, but upstream exists
    const remotesNoOrigin = remotes.filter((r) => r.name !== "origin");
    expect(selectRemoteUrl(remotesNoOrigin, "https://bitbucket.example.com/api")).toBe(
      "https://bitbucket.example.com/upstream/repo.git",
    );

    // Test 3: neither origin nor upstream, pick first same-host
    const remotesNoOriginUpstream = remotes.filter(
      (r) => r.name !== "origin" && r.name !== "upstream",
    );
    expect(selectRemoteUrl(remotesNoOriginUpstream, "https://bitbucket.example.com/api")).toBe(
      "https://bitbucket.example.com/fork/repo.git",
    );

    // Test 4: no same-host remotes → null
    const remotesNoSameHost = [{ name: "other", url: "https://github.example.com/repo.git" }];
    expect(selectRemoteUrl(remotesNoSameHost, "https://bitbucket.example.com/api")).toBeNull();

    // Test 5: empty remotes → null
    expect(selectRemoteUrl([], "https://bitbucket.example.com/api")).toBeNull();
  });
});
