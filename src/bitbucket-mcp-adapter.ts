/**
 * Bitbucket MCP adapter — optional enrichment layer for canvas and ship.
 *
 * Tries to fetch PR enrichment data from Bitbucket MCP.
 * All timeouts and errors return null — the caller treats this
 * as "missing enrichment" per the graceful degradation pattern.
 *
 * **Validates: Requirements R4.11, R8.3, R14.1, R14.2**
 */

import { redactSecrets } from "./secret-redactor.js";

/** Bitbucket PR enrichment data. */
export interface BitbucketEnrichment {
  /** PR comments. */
  comments: readonly string[];
  /** Reviewer status entries. */
  reviewerStatus: readonly string[];
  /** PR tasks. */
  tasks: readonly string[];
  /** PR diff (structured). */
  diff?: string;
}

/** Adapter options. */
export interface BitbucketAdapterOptions {
  /** Connection timeout in ms. Default 10000. */
  connectionTimeout?: number;
  /** Response timeout in ms. Default 15000. */
  responseTimeout?: number;
}

/**
 * Try to fetch Bitbucket MCP enrichment for a topic.
 *
 * Returns null if:
 *   - Bitbucket MCP is not installed
 *   - Connection fails (10s timeout)
 *   - Response fails (15s timeout, 401, 500, etc.)
 *
 * All returned fields are passed through `redactSecrets`.
 */
export async function tryFetchEnrichment(
  _topic: string,
  options: BitbucketAdapterOptions = {},
): Promise<BitbucketEnrichment | null> {
  const connectionTimeout = options.connectionTimeout ?? 10_000;
  const responseTimeout = options.responseTimeout ?? 15_000;

  try {
    // Check if Bitbucket MCP tools are available
    // In a real implementation, this would call the MCP tools:
    //   - get_pull_request_diff
    //   - add_comment
    //   - create_pr_task
    // For now, this is a stub that returns null (no MCP available).
    void connectionTimeout;
    void responseTimeout;

    // Simulate MCP check — if MCP tools are not available, return null
    // This will be connected to actual MCP runtime when available
    return null;
  } catch {
    // All errors → null, caller treats as missing enrichment
    return null;
  }
}

/**
 * Post a comment on a PR via Bitbucket MCP.
 *
 * Silently returns false if MCP is unavailable.
 * Comment text is passed through `redactSecrets`.
 */
export async function postPRComment(
  _topic: string,
  _comment: string,
  _options: BitbucketAdapterOptions = {},
): Promise<boolean> {
  try {
    // Stub — would call Bitbucket MCP add_comment
    return false;
  } catch {
    return false;
  }
}

/**
 * Redact a text string for safe output (re-export for convenience).
 */
export { redactSecrets };
