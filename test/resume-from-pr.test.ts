/**
 * Unit tests for scripts/resume-from-pr.mjs
 *
 * Tests parseTarget, fetchPRMetadata, resolveSlug, loadContextBundle
 * with mocked child_process.exec and filesystem operations.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Dynamic import needed for .mjs ESM module
const moduleUrl = new URL("../scripts/resume-from-pr.mjs", import.meta.url);

let resumeModule: any;

beforeEach(async () => {
  resumeModule = await import(moduleUrl.href);
});

// ---------------------------------------------------------------------------
// parseTarget
// ---------------------------------------------------------------------------

describe("parseTarget", () => {
  it("parses GitHub PR URL", () => {
    const result = resumeModule.parseTarget("https://github.com/anthropics/claude-code/pull/42");
    expect(result).toEqual({
      host: "github",
      number: 42,
      url: "https://github.com/anthropics/claude-code/pull/42",
      repo: "anthropics/claude-code",
      raw: "https://github.com/anthropics/claude-code/pull/42",
    });
  });

  it("parses GitLab MR URL", () => {
    const result = resumeModule.parseTarget("https://gitlab.com/myorg/myrepo/-/merge_requests/99");
    expect(result).toEqual({
      host: "gitlab",
      number: 99,
      url: "https://gitlab.com/myorg/myrepo/-/merge_requests/99",
      repo: "myorg/myrepo",
      raw: "https://gitlab.com/myorg/myrepo/-/merge_requests/99",
    });
  });

  it("parses Bitbucket PR URL", () => {
    const result = resumeModule.parseTarget("https://bitbucket.org/myteam/proj/pull-requests/7");
    expect(result).toEqual({
      host: "bitbucket",
      number: 7,
      url: "https://bitbucket.org/myteam/proj/pull-requests/7",
      repo: "myteam/proj",
      raw: "https://bitbucket.org/myteam/proj/pull-requests/7",
    });
  });

  it("parses bare integer as PR number (host TBD)", () => {
    const result = resumeModule.parseTarget("123");
    expect(result).toEqual({
      host: null,
      number: 123,
      url: null,
      raw: "123",
    });
  });

  it("parses org/repo#N shorthand", () => {
    const result = resumeModule.parseTarget("anthropics/claude-code#42");
    expect(result).toEqual({
      host: null,
      number: 42,
      url: null,
      repo: "anthropics/claude-code",
      raw: "anthropics/claude-code#42",
    });
  });

  it("rejects empty string", () => {
    const result = resumeModule.parseTarget("");
    expect(result.error).toBeTruthy();
    expect(result.exitCode).toBe(3);
  });

  it("rejects unrecognized format", () => {
    const result = resumeModule.parseTarget("not-a-url-or-number");
    expect(result.error).toBeTruthy();
    expect(result.exitCode).toBe(3);
  });

  it("rejects null/undefined", () => {
    expect(resumeModule.parseTarget(null).error).toBeTruthy();
    expect(resumeModule.parseTarget(undefined).error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// fetchPRMetadata
// ---------------------------------------------------------------------------

describe("fetchPRMetadata", () => {
  let execMock: any;

  beforeEach(() => {
    execMock = vi.fn();
    vi.doMock("node:child_process", () => ({ exec: execMock }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses gh for github host", async () => {
    execMock.mockImplementation(
      (_cmd: string, _opts: any, cb: (e: Error | null, s: string) => void) => {
        cb(
          null,
          JSON.stringify({
            title: "[spec:my-feature] Add widget",
            headRefName: "forge/my-feature",
            baseRefName: "main",
            body: "See .tinkerman/specs/my-feature/",
            url: "https://github.com/org/repo/pull/1",
          }),
        );
      },
    );

    const result = await resumeModule.fetchPRMetadata(
      { host: "github", number: 1, url: "https://github.com/org/repo/pull/1" },
      { exec: execMock },
    );
    expect(result.host).toBe("github");
    expect(result.number).toBe(1);
    expect(result.title).toBe("[spec:my-feature] Add widget");
    expect(result.fetcherUsed).toBe("gh");
  });

  it("returns fetcherUsed='none' on gh not installed", async () => {
    execMock.mockImplementation(
      (_cmd: string, _opts: any, cb: (e: Error | null, s: string) => void) => {
        cb(new Error("command not found: gh"), "");
      },
    );

    const result = await resumeModule.fetchPRMetadata(
      { host: "github", number: 1, url: null },
      { exec: execMock },
    );
    expect(result.fetcherUsed).toBe("none");
    expect(result.warning).toBeTruthy();
  });

  it("returns fetcherUsed='none' on timeout", async () => {
    // exec never calls back = timeout triggered by Promise.race
    execMock.mockImplementation(() => {
      /* never resolves */
    });

    const result = await resumeModule.fetchPRMetadata(
      { host: "github", number: 1, url: null },
      { exec: execMock, timeout: 100 },
    );
    expect(result.fetcherUsed).toBe("none");
    expect(result.warning).toContain("timeout");
  }, 10000);
});

// ---------------------------------------------------------------------------
// resolveSlug
// ---------------------------------------------------------------------------

describe("resolveSlug", () => {
  it("extracts slug from [spec:slug] title prefix", () => {
    const result = resumeModule.resolveSlug({
      title: "[spec:my-feature] Add widget",
      branch: "main",
      description: "",
    });
    expect(result.slug).toBe("my-feature");
    expect(result.resolutionPath).toBe("title");
  });

  it("extracts slug from (slug) title suffix", () => {
    const result = resumeModule.resolveSlug({
      title: "Add widget (my-feature)",
      branch: "main",
      description: "",
    });
    expect(result.slug).toBe("my-feature");
    expect(result.resolutionPath).toBe("title");
  });

  it("extracts slug from forge/ branch prefix", () => {
    const result = resumeModule.resolveSlug({
      title: "Some PR",
      branch: "forge/my-feature",
      description: "",
    });
    expect(result.slug).toBe("my-feature");
    expect(result.resolutionPath).toBe("branch");
  });

  it("extracts slug from feature/ branch prefix", () => {
    const result = resumeModule.resolveSlug({
      title: "Some PR",
      branch: "feature/my-feature",
      description: "",
    });
    expect(result.slug).toBe("my-feature");
    expect(result.resolutionPath).toBe("branch");
  });

  it("extracts slug from .tinkerman/specs/ link in description", () => {
    const result = resumeModule.resolveSlug({
      title: "Some PR",
      branch: "main",
      description: "See .tinkerman/specs/my-feature/ for details",
    });
    expect(result.slug).toBe("my-feature");
    expect(result.resolutionPath).toBe("description");
  });

  it("prefers title over branch over description", () => {
    const result = resumeModule.resolveSlug({
      title: "[spec:title-slug] PR",
      branch: "forge/branch-slug",
      description: ".tinkerman/specs/desc-slug/",
    });
    expect(result.slug).toBe("title-slug");
    expect(result.resolutionPath).toBe("title");
  });

  it("returns null when no source matches", () => {
    const result = resumeModule.resolveSlug({
      title: "Random PR",
      branch: "main",
      description: "No specs here",
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadContextBundle
// ---------------------------------------------------------------------------

describe("loadContextBundle", () => {
  it("returns missing list for nonexistent slug", async () => {
    const result = await resumeModule.loadContextBundle("nonexistent-slug-xyz", {
      forgeRoot: "/tmp/no-forge-root",
    });
    expect(result.slug).toBe("nonexistent-slug-xyz");
    expect(result.missing.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Property test: resolveSlug never crashes on arbitrary input
// ---------------------------------------------------------------------------

describe("resolveSlug property: no crash on arbitrary slug-like strings", () => {
  const slugs = [
    "abc",
    "a-b-c",
    "a0b1c2",
    "a",
    "123",
    "foo-bar-baz-qux",
    "with-hyphens-and-numbers-123",
    "singleword",
    "x-y",
  ];
  for (const slug of slugs) {
    it(`does not crash with branch containing "${slug}"`, () => {
      const result = resumeModule.resolveSlug({
        title: `PR for ${slug}`,
        branch: `forge/${slug}`,
        description: "",
      });
      expect(result).not.toBeNull();
      expect(result.slug).toBe(slug);
    });
  }

  it("handles empty strings gracefully", () => {
    const result = resumeModule.resolveSlug({ title: "", branch: "", description: "" });
    expect(result).toBeNull();
  });
});
