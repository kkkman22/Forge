/**
 * Tests for triage MCP adapter — stub contract + graceful degradation shape.
 *
 * NOTE: The adapter is currently a stub (returns null, awaiting real MCP
 * wiring). These tests pin the *stub contract* — that the public surface
 * (option shapes, tool-name mapping, return-null-on-unavailable) is stable
 * for the triage skill to code against. The multi-source degradation chain
 * (parallel fetch, per-source skip, full git fallback) is orchestrated by
 * the triage skill instructions, not by this adapter, and is exercised
 * end-to-end via `/forge triage`, not here.
 *
 * **Pins: loop-engineering-adoption R2 adapter contract.**
 */
import { describe, expect, it } from "vitest";
import { tryFetchBitbucketPRs, tryFetchJiraSprint, } from "../src/triage-mcp-adapter.js";
describe("triage MCP adapter — stub contract (returns null until MCP wired)", () => {
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
        await expect(tryFetchJiraSprint({
            assignee: "",
            staleDays: 0,
            toolNames: {},
        })).resolves.toBeNull();
    });
    it("bitbucket fetch never throws even with empty toolName mapping", async () => {
        await expect(tryFetchBitbucketPRs({ toolNames: {} })).resolves.toBeNull();
    });
});
describe("triage finding type shapes (compile-time shape pin)", () => {
    it("JiraFinding type is assignable with required fields", () => {
        const finding = {
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
        const finding = {
            source: "bitbucket-pr",
            externalRef: "https://bitbucket.example.com/repo/pull-requests/42",
            severity: "medium",
            summary: "PR #42 has merge conflicts",
            suggestedAction: "investigate | skip",
        };
        expect(finding.source).toBe("bitbucket-pr");
    });
});
//# sourceMappingURL=triage-mcp-adapter.test.js.map