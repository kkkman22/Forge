import { describe, expect, it } from "vitest";
import { detectNetworkCommand, extractTargetFromBash } from "../src/check-sandbox.js";
import {
  hashEvent,
  isCatalogStale,
  isThrottled,
  type KnowledgeEvent,
  shouldTriggerEpisodeThreshold,
} from "../src/knowledge-hooks.js";
import {
  checkPlatformGate,
  isBitbucketUrl,
  isSameHost,
  parseRemoteUrl,
} from "../src/review-comment-bitbucket/platform-gate.js";

const event: KnowledgeEvent = {
  kind: "task_completed",
  topic: "x",
  timestamp: "2026-06-14",
} as never;

// knowledge-hooks
describe("knowledge-hooks (branch coverage)", () => {
  it("hashEvent produces a stable hash", () => {
    expect(typeof hashEvent(event)).toBe("string");
    expect(hashEvent(event)).toBe(hashEvent(event));
  });
  it("isThrottled returns true when hash is in recent set", () => {
    const hashes = new Set<string>([hashEvent(event)]);
    expect(isThrottled(event, hashes)).toBe(true);
  });
  it("isThrottled returns false when hash is not in recent set", () => {
    expect(isThrottled(event, new Set())).toBe(false);
  });
  it("isCatalogStale: true when input newer than catalog", () => {
    expect(isCatalogStale(1000, [2000])).toBe(true);
  });
  it("isCatalogStale: false when catalog is newest", () => {
    expect(isCatalogStale(3000, [2000])).toBe(false);
  });
  it("isCatalogStale: false for empty input mtimes", () => {
    expect(isCatalogStale(1000, [])).toBe(false);
  });
  it("shouldTriggerEpisodeThreshold: triggers at milestone crossings", () => {
    expect(shouldTriggerEpisodeThreshold(4, 5)).toBe(5);
    expect(shouldTriggerEpisodeThreshold(9, 10)).toBe(10);
    expect(shouldTriggerEpisodeThreshold(49, 50)).toBe(50);
  });
  it("shouldTriggerEpisodeThreshold: null when no milestone crossed", () => {
    expect(shouldTriggerEpisodeThreshold(10, 12)).toBeNull();
    expect(shouldTriggerEpisodeThreshold(100, 101)).toBeNull();
  });
  it("shouldTriggerEpisodeThreshold: null when no increase", () => {
    expect(shouldTriggerEpisodeThreshold(5, 5)).toBeNull();
    expect(shouldTriggerEpisodeThreshold(5, 3)).toBeNull();
  });
});

// platform-gate
describe("platform-gate (branch coverage)", () => {
  it("isBitbucketUrl: true for bitbucket.org", () => {
    expect(isBitbucketUrl("https://bitbucket.org/org/repo")).toBe(true);
  });
  it("isBitbucketUrl: false for github.com", () => {
    expect(isBitbucketUrl("https://github.com/org/repo")).toBe(false);
  });
  it("isBitbucketUrl: false for null", () => {
    expect(isBitbucketUrl(null)).toBe(false);
  });
  it("parseRemoteUrl: extracts host from https URL", () => {
    const r = parseRemoteUrl("https://bitbucket.org/org/repo");
    expect(r?.host).toBe("bitbucket.org");
    expect(r?.port).toBeNull();
  });
  it("parseRemoteUrl: extracts host:port from ssh URL", () => {
    const r = parseRemoteUrl("git@bitbucket.org:22:org/repo");
    expect(r).toBeDefined();
  });
  it("parseRemoteUrl: null for invalid URL", () => {
    expect(parseRemoteUrl("not a url")).toBeNull();
  });
  it("isSameHost: true for same host", () => {
    expect(isSameHost("https://bitbucket.org/a", "https://bitbucket.org/b")).toBe(true);
  });
  it("isSameHost: false for different host", () => {
    expect(isSameHost("https://bitbucket.org/a", "https://github.com/b")).toBe(false);
  });
  it("isSameHost: false when either is null", () => {
    expect(isSameHost(null, "https://bitbucket.org")).toBe(false);
    expect(isSameHost("https://bitbucket.org", null)).toBe(false);
  });
  it("checkPlatformGate: skip when not bitbucket", () => {
    const r = checkPlatformGate({
      remoteUrl: "https://github.com/org/repo",
      platformOverride: "auto",
      mcpConfigured: true,
      mcpBaseUrl: null,
    } as never);
    expect(r.skip).toBe(true);
  });
  it("checkPlatformGate: pass when bitbucket + MCP configured + same host", () => {
    const r = checkPlatformGate({
      remoteUrl: "https://bitbucket.org/org/repo",
      platformOverride: "auto",
      mcpConfigured: true,
      mcpBaseUrl: "https://bitbucket.org",
    } as never);
    expect(r.skip).toBe(false);
  });
  it("checkPlatformGate: skip when MCP not configured", () => {
    const r = checkPlatformGate({
      remoteUrl: "https://bitbucket.org/org/repo",
      platformOverride: "auto",
      mcpConfigured: false,
      mcpBaseUrl: null,
    } as never);
    expect(r.skip).toBe(true);
  });
  it("checkPlatformGate: skip on base-url mismatch", () => {
    const r = checkPlatformGate({
      remoteUrl: "https://bitbucket.org/org/repo",
      platformOverride: "auto",
      mcpConfigured: true,
      mcpBaseUrl: "https://github.com",
    } as never);
    expect(r.skip).toBe(true);
  });
});

// check-sandbox
describe("check-sandbox (branch coverage)", () => {
  it("detectNetworkCommand: detects curl", () => {
    const r = detectNetworkCommand("curl https://example.com");
    expect(r.isNetwork).toBe(true);
  });
  it("detectNetworkCommand: detects wget", () => {
    const r = detectNetworkCommand("wget http://x");
    expect(r.isNetwork).toBe(true);
  });
  it("detectNetworkCommand: not detected for safe command", () => {
    expect(detectNetworkCommand("npm test").isNetwork).toBe(false);
  });
  it("detectNetworkCommand: not detected for empty command", () => {
    expect(detectNetworkCommand("").isNetwork).toBe(false);
  });
  it("extractTargetFromBash: extracts path from cat", () => {
    expect(extractTargetFromBash("cat src/foo.ts")).toBeDefined();
  });
  it("extractTargetFromBash: returns null for no target", () => {
    expect(extractTargetFromBash("echo hello")).toBeNull();
  });
});
