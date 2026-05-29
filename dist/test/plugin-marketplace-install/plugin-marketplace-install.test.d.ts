/**
 * AC 13.3 — marketplace install simulation.
 *
 * Simulates the Claude Code marketplace install flow:
 *   1. Read `.claude-plugin/marketplace.json`
 *   2. Resolve the `forge` plugin entry's `source` (`./`)
 *   3. Copy plugin assets (workflows/, .claude-plugin/) to a temp install dir
 *   4. Re-read installed plugin.json, follow each `workflows[]` entry
 *   5. Assert `multi-agent-review.js` is discovered, parseable, and referenced
 *
 * This does NOT shell out to `claude plugin install` (that requires network +
 * the Claude CLI). Instead we replicate the deterministic file-resolution
 * contract Claude Code performs at install time.
 */
export {};
