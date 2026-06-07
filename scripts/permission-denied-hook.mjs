#!/usr/bin/env node

/**
 * PermissionDenied lifecycle hook.
 *
 * When auto mode denies a tool operation, decides whether to retry.
 * Read operations (Read, Grep, Glob, WebSearch, etc.) are retried
 * to avoid transient permission failures blocking read-only workflows.
 * Write operations (Write, Edit, Bash) are NOT retried for safety.
 *
 * Output: JSON with { retry: true } or empty (no retry).
 *
 * Fail-open: exits 0 on any condition.
 *
 * Environment variables (provided by Claude Code):
 *   PERMISSION_DENIED_TOOL — name of the denied tool
 *
 * Usage: node scripts/permission-denied-hook.mjs
 *
 * Exit codes: 0 (always — fail-open)
 */

/** Tools that are safe to retry (read-only operations). */
const READ_TOOLS = new Set([
  "Read",
  "Grep",
  "Glob",
  "WebSearch",
  "WebFetch",
  "ListMcpResourcesTool",
  "ReadMcpResourceTool",
  "Agent",          // Agent tool is read-only in this context (spawns sub-agents for research/explore)
  "TaskList",        // Read-only task queries
  "TaskGet",         // Read-only task queries
]);

// Write operations (Write, Edit, Bash, NotebookEdit, TaskCreate, TaskUpdate)
// are NOT in READ_TOOLS and will fall through to default-deny (no retry).

try {
  const tool = process.env.PERMISSION_DENIED_TOOL;

  if (!tool) {
    process.exit(0);
  }

  // Retry read-only tools
  if (READ_TOOLS.has(tool)) {
    console.log(JSON.stringify({ retry: true }));
  }

  // Do NOT retry write tools or unknown tools (default deny)
  // Write/unknown tools produce no output → no retry
} catch {
  // fail-open: exit 0 on any error
}

process.exit(0);
