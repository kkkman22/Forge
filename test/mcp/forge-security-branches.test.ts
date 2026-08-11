import { describe, expect, it } from "vitest";
import type { GitDiffSummary, GitStatusSummary } from "../../src/context-budget.js";
import {
  containsShellMetachars,
  isCommandAllowed,
  isCommandDenied,
  isSimpleCommand,
  legacyTypedReplacementWarning,
} from "../../src/mcp/tools/forge-exec.js";
import {
  formatDiffSummary,
  formatStatusSummary,
  truncateDiffContent,
} from "../../src/mcp/tools/forge-git.js";

describe("forge-exec: isCommandDenied (branch coverage)", () => {
  it("returns null when no deny patterns match", () => {
    expect(isCommandDenied("npm test", ["Bash(rm *)"])).toBeNull();
  });
  it("denies a command matching a Bash(glob) pattern", () => {
    expect(isCommandDenied("rm -rf /", ["Bash(rm *)"])?.toString()).toContain("denied");
  });
  it("denies a command with a wildcard glob", () => {
    expect(isCommandDenied("git push origin main", ["Bash(git push*)"])?.toString()).toContain(
      "denied",
    );
  });
  it("skips non-Bash() patterns silently", () => {
    expect(isCommandDenied("rm -rf /", ["rm *", "not-a-bash-pattern"])).toBeNull();
  });
  it("caches glob → regex (same glob second time still denies)", () => {
    isCommandDenied("rm file", ["Bash(rm *)"]); // populate cache
    expect(isCommandDenied("rm other", ["Bash(rm *)"])?.toString()).toContain("denied");
  });
  it("empty denyPatterns → null", () => {
    expect(isCommandDenied("anything", [])).toBeNull();
  });
});

describe("forge-exec: isCommandAllowed (branch coverage)", () => {
  it("allows a command in the allowlist", () => {
    expect(isCommandAllowed("git status")).toBe(true);
  });
  it("allows npm/npx commands", () => {
    expect(isCommandAllowed("npm test")).toBe(true);
  });
  it("denies a command not in the allowlist", () => {
    expect(isCommandAllowed("curl http://evil.com")).toBe(false);
  });
});

describe("forge-exec: containsShellMetachars (branch coverage)", () => {
  it("returns null for a simple command", () => {
    expect(containsShellMetachars("git status")).toBeNull();
  });
  it("detects shell metacharacters (subshell/pipe/redirect)", () => {
    expect(containsShellMetachars("echo $(whoami)")).not.toBeNull();
    expect(containsShellMetachars("ls | grep x")).not.toBeNull();
    expect(containsShellMetachars("cat > file")).not.toBeNull();
  });
});

describe("forge-exec: isSimpleCommand (branch coverage)", () => {
  it("returns true for a simple command", () => {
    expect(isSimpleCommand("git status")).toBe(true);
  });
  it("returns false for empty/whitespace", () => {
    expect(isSimpleCommand("")).toBe(false);
    expect(isSimpleCommand("   ")).toBe(false);
  });
  it("returns false for a command with shell operators", () => {
    expect(isSimpleCommand("a && b")).toBe(false);
    expect(isSimpleCommand("a || b")).toBe(false);
    expect(isSimpleCommand("a ; b")).toBe(false);
  });
});

describe("forge-exec: legacyTypedReplacementWarning (branch coverage)", () => {
  it("returns a warning object for a command with a typed replacement", () => {
    const w = legacyTypedReplacementWarning("npm run docs:check");
    expect(w).not.toBeNull();
    expect(w?.code).toBe("LEGACY_TYPED_REPLACEMENT_AVAILABLE");
    expect(w?.replacement).toBe("forge_docs_drift");
  });
  it("returns a warning for dist-sync command", () => {
    const w = legacyTypedReplacementWarning("node scripts/check-dist-sync.mjs");
    expect(w).not.toBeNull();
    expect(w?.replacement).toBe("forge_dist_sync");
  });
  it("returns null for a command without a typed replacement", () => {
    expect(legacyTypedReplacementWarning("echo hello")).toBeNull();
  });
});

describe("forge-git: formatDiffSummary (branch coverage)", () => {
  it("formats a diff summary with files", () => {
    const summary: GitDiffSummary = {
      fileCount: 2,
      files: [
        { filePath: "a.ts", added: 5, removed: 1 },
        { filePath: "b.ts", added: 0, removed: 3 },
      ],
      totalAdded: 5,
      totalRemoved: 4,
      fullDiffPath: ".tinkerman/runs/diff.txt",
    };
    const out = formatDiffSummary(summary);
    expect(out).toContain("2");
    expect(out).toContain("a.ts");
    expect(out).toContain("b.ts");
    expect(out).toContain("diff.txt");
  });
  it("shows N/A when fullDiffPath is null", () => {
    const summary: GitDiffSummary = {
      fileCount: 0,
      files: [],
      totalAdded: 0,
      totalRemoved: 0,
      fullDiffPath: null,
    };
    const out = formatDiffSummary(summary);
    expect(out).toContain("N/A");
  });
});

describe("forge-git: formatStatusSummary (branch coverage)", () => {
  it("formats a status summary", () => {
    const summary = {
      staged: { count: 2, files: ["a.ts", "b.ts"] },
      modified: { count: 1, files: ["c.ts"] },
      untracked: { count: 3, files: ["d.ts", "e.ts", "f.ts"] },
    } as GitStatusSummary;
    const out = formatStatusSummary(summary);
    expect(out).toContain("a.ts");
    expect(out).toContain("d.ts");
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("forge-git: truncateDiffContent (branch coverage)", () => {
  it("returns placeholder for empty diff", () => {
    expect(truncateDiffContent("")).toContain("无");
    expect(truncateDiffContent("   ")).toContain("无");
  });
  it("returns short diffs unchanged", () => {
    const short = "diff --git a/x b/x\n+line\n";
    expect(truncateDiffContent(short)).toBe(short);
  });
  it("truncates long diffs (returns shorter output containing file headers)", () => {
    const lines: string[] = [];
    for (let i = 0; i < 5; i++) {
      lines.push(`diff --git a/file${i} b/file${i}`);
      for (let j = 0; j < 200; j++) lines.push(`+line ${j}`);
    }
    const long = lines.join("\n");
    const truncated = truncateDiffContent(long);
    // Must still be a string and contain at least one file header.
    expect(typeof truncated).toBe("string");
    expect(truncated).toContain("diff --git");
  });
});
