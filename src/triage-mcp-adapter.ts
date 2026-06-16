/**
 * Triage MCP adapter — discovery data sources for /forge triage.
 *
 * Connects to user-configured MCP servers (mcp-atlassian for Jira,
 * Bitbucket MCP for repo PRs/branches) to pull "what's worth acting on"
 * from the user's real workflow. This is the "discovery" action of
 * Loop Engineering (论文 §03 动作一 "发现").
 *
 * Follows the same graceful-degradation pattern as bitbucket-mcp-adapter.ts:
 * all timeouts and errors return null — the caller treats this as "source
 * unavailable" and falls back to the git discovery source.
 *
 * MCP tool names are **configuration-driven** (passed in via toolNames) so
 * different mcp-atlassian / Bitbucket MCP versions with different tool names
 * are accommodated without code changes.
 *
 * **Spec: loop-engineering-adoption R2, design.md D2/D6**
 */

import { redactSecrets } from "./secret-redactor.js";

// ─── Finding types ──────────────────────────────────────────────────────────

/** Severity classification shared across all triage sources. */
export type TriageSeverity = "high" | "medium" | "low";

/** A discovery from the Jira active-sprint source. */
export interface JiraFinding {
  source: "jira-sprint";
  /** Jira case key, e.g. `CH-1234`. */
  externalRef: string;
  severity: TriageSeverity;
  /** Human-readable description of why this is worth acting on. */
  summary: string;
  /** Suggested next action: open-worktree | investigate | skip. */
  suggestedAction: string;
}

/** A discovery from the Bitbucket PR/branch source. */
export interface BitbucketFinding {
  source: "bitbucket-pr" | "bitbucket-branch";
  /** PR URL or branch name. */
  externalRef: string;
  severity: TriageSeverity;
  summary: string;
  suggestedAction: string;
}

// ─── Tool-name configuration ────────────────────────────────────────────────

/** Mapping from logical operation → actual MCP tool name (config-driven). */
export interface JiraToolNames {
  /** Tool to list issues in the active sprint. */
  get_sprint_issues?: string;
  /** Tool for JQL search. */
  search?: string;
}

/** Mapping from logical operation → actual Bitbucket MCP tool name. */
export interface BitbucketToolNames {
  /** Tool to list pull requests. */
  list_prs?: string;
  /** Tool to fetch a single PR. */
  get_pr?: string;
}

// ─── Adapter options ────────────────────────────────────────────────────────

export interface JiraAdapterOptions {
  /** Assignee filter (empty = read MCP user context). */
  assignee: string;
  /** Stale threshold in days for "In Progress" cases. */
  staleDays: number;
  /** Config-driven MCP tool name mapping. */
  toolNames: JiraToolNames;
  /** Connection timeout in ms. Default 10000. */
  connectionTimeout?: number;
}

export interface BitbucketAdapterOptions {
  /** Config-driven MCP tool name mapping. */
  toolNames: BitbucketToolNames;
  /** Connection timeout in ms. Default 10000. */
  connectionTimeout?: number;
}

// ─── Jira adapter ───────────────────────────────────────────────────────────

/**
 * Try to fetch Jira active-sprint findings (stale / unstarted / blocked cases).
 *
 * Returns null if:
 *   - mcp-atlassian (Jira MCP) is not configured
 *   - connection fails (timeout)
 *   - the configured tool names don't resolve
 *
 * The caller MUST treat null as "source unavailable → fall back to git",
 * never as "no findings". This is the degradation chain (R2-AC3).
 *
 * **Current state: stub.** Returns null until real MCP tool invocation is
 * wired. The toolNames plumbing is in place so triage skill instructions can
 * declare the call shape; runtime wiring happens when MCP is available.
 */
export async function tryFetchJiraSprint(
  _options: JiraAdapterOptions,
): Promise<JiraFinding[] | null> {
  try {
    // Stub — would invoke the MCP tools named in _options.toolNames:
    //   - get_sprint_issues → list active sprint cases
    //   - search (JQL) → filter stale (>staleDays), unstarted, blocked
    // Real implementation will call the MCP runtime with the configured names.
    void redactSecrets; // reserved for redaction when real data flows
    return null;
  } catch (_err: unknown) {
    // All errors → null, caller treats as source unavailable
    return null;
  }
}

// ─── Bitbucket adapter ──────────────────────────────────────────────────────

/**
 * Try to fetch Bitbucket findings (failing/conflicting PRs, stale branches).
 *
 * Returns null if Bitbucket MCP is unavailable. Same degradation contract
 * as tryFetchJiraSprint.
 *
 * **Current state: stub.** Returns null until real MCP wiring.
 */
export async function tryFetchBitbucketPRs(
  _options: BitbucketAdapterOptions,
): Promise<BitbucketFinding[] | null> {
  try {
    // Stub — would invoke the MCP tools named in _options.toolNames:
    //   - list_prs → failing/conflicting PRs
    //   - get_pr → detail for stale/force-push detection
    return null;
  } catch (_err: unknown) {
    return null;
  }
}

/** Redact a text string for safe output (re-export for convenience). */
export { redactSecrets };
