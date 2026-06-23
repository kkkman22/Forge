import { describe, expect, it } from "vitest";
import {
  type AgentLinkIssue,
  isSymlink,
  listClaudeAgents,
  resolveSymlinkTarget,
  validateAgentLinks,
} from "../src/agent-links.js";

describe("listClaudeAgents", () => {
  it("lists .claude/agents/*.md files (excluding README)", () => {
    const files = listClaudeAgents(".claude/agents");
    // README.md should be excluded
    expect(files.every((f) => !f.endsWith("README.md"))).toBe(true);
    // Should find agent files
    expect(files.length).toBeGreaterThan(0);
  });
});

describe("isSymlink", () => {
  it("returns true for existing symlink agent (quality-check)", () => {
    expect(isSymlink(".claude/agents/quality-check.md")).toBe(true);
  });

  it("returns true for symlinked forge-build", () => {
    expect(isSymlink(".claude/agents/forge-build.md")).toBe(true);
  });

  it("returns false for non-existent path", () => {
    expect(isSymlink(".claude/agents/__nonexistent__.md")).toBe(false);
  });

  it("returns false for a regular directory", () => {
    expect(isSymlink(".claude/agents")).toBe(false);
  });
});

describe("resolveSymlinkTarget", () => {
  it("resolves symlink to ../../agents/<name>.md", () => {
    const target = resolveSymlinkTarget(".claude/agents/quality-check.md");
    expect(target).toBe("../../agents/quality-check.md");
  });

  it("resolves forge-build symlink target", () => {
    const target = resolveSymlinkTarget(".claude/agents/forge-build.md");
    expect(target).toBe("../../agents/forge-build.md");
  });

  it("returns null for non-symlink", () => {
    expect(resolveSymlinkTarget(".claude/agents")).toBeNull();
  });
});

describe("validateAgentLinks", () => {
  it("returns no issues when all symlinks valid (clean repo state)", () => {
    const issues = validateAgentLinks(".claude/agents", "agents");
    // In the unified state, every .claude/agents/*.md (except README) should
    // be a valid symlink to ../../agents/<name>.md pointing to an existing file.
    expect(issues).toEqual([]);
  });

  it("flags a regular file (not symlink) as error", () => {
    const issues: AgentLinkIssue[] = validateAgentLinks(".claude/agents", "agents", {
      virtualFiles: ["evil-regular.md"],
    });
    const regularFileIssues = issues.filter(
      (i) => i.file === "evil-regular.md" && i.code === "NOT_SYMLINK",
    );
    expect(regularFileIssues).toHaveLength(1);
  });

  it("flags a broken symlink (target missing) as error", () => {
    // target 路径格式正确(../../agents/broken.md)但 agents/broken.md 不存在
    const issues: AgentLinkIssue[] = validateAgentLinks(".claude/agents", "agents", {
      virtualSymlinks: { "broken.md": "../../agents/broken.md" },
    });
    const brokenIssues = issues.filter((i) => i.file === "broken.md" && i.code === "BROKEN_TARGET");
    expect(brokenIssues).toHaveLength(1);
  });

  it("flags a symlink with wrong target path as error", () => {
    const issues: AgentLinkIssue[] = validateAgentLinks(".claude/agents", "agents", {
      virtualSymlinks: { "wrong.md": "../../somewhere-else/wrong.md" },
    });
    const wrongTargetIssues = issues.filter(
      (i) => i.file === "wrong.md" && i.code === "WRONG_TARGET",
    );
    expect(wrongTargetIssues).toHaveLength(1);
  });
});
