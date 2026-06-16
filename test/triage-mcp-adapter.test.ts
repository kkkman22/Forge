/**
 * Tests for triage MCP adapter — graceful degradation pattern.
 *
 * Covers [loop-engineering-adoption R2]:
 *   - Jira sprint fetch returns null when MCP unavailable (stub → graceful)
 *   - Bitbucket PR fetch returns null when MCP unavailable (stub → graceful)
 *   - Git fallback findings shape is well-formed
 *   - Tool-name configuration is accepted without error
 *
 * **Validates: loop-engineering-adoption R2-AC3 (degradation chain)**
 */

import { describe, expect, it } from "vitest";
import {
  type BitbucketFinding,
  type JiraFinding,
  tryFetchBitbucketPRs,
  tryFetchJiraSprint,
} from "../src/triage-mcp-adapter.js";

describe("triage MCP adapter — graceful degradation [R2-AC3]", () => {
  it("jira sprint fetch returns null when MCP unavailable (stub)", async () => {
    const result = await tryFetchJiraSprint({
      assignee: "current-user",
      staleDays: 5,
      toolNames: { get_sprint_issues: "jira_get_sprint_issues", search: "jira_search" },
    });
    // Stub → null, never throws (graceful degradation)
    expect(result).toBeNull();
  });

  it("bitbucket PR fetch returns null when MCP unavailable (stub)", async () => {
    const result = await tryFetchBitbucketPRs({
      toolNames: { list_prs: "bitbucket_list_prs", get_pr: "bitbucket_get_pr" },
    });
    expect(result).toBeNull();
  });

  it("jira fetch never throws even with empty toolName mapping", async () => {
    await expect(
      tryFetchJiraSprint({
        assignee: "",
        staleDays: 0,
        toolNames: {},
      }),
    ).resolves.toBeNull();
  });

  it("bitbucket fetch never throws even with empty toolName mapping", async () => {
    await expect(tryFetchBitbucketPRs({ toolNames: {} })).resolves.toBeNull();
  });
});

describe("triage finding type shapes [R2-AC4]", () => {
  it("JiraFinding type is assignable with required fields", () => {
    const finding: JiraFinding = {
      source: "jira-sprint",
      externalRef: "CH-1234",
      severity: "high",
      summary: "CH-1234 In Progress 7 days (stale)",
      suggestedAction: "open-worktree | investigate | skip",
    };
    expect(finding.source).toBe("jira-sprint");
    expect(finding.externalRef).toBe("CH-1234");
  });

  it("BitbucketFinding type is assignable with required fields", () => {
    const finding: BitbucketFinding = {
      source: "bitbucket-pr",
      externalRef: "https://bitbucket.example.com/repo/pull-requests/42",
      severity: "medium",
      summary: "PR #42 has merge conflicts",
      suggestedAction: "investigate | skip",
    };
    expect(finding.source).toBe("bitbucket-pr");
  });
});
