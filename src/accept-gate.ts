/**
 * Forced Acceptance gate — determines whether ship should be blocked
 * based on pack-driven context-level acceptance requirements.
 *
 * @public
 */

import type { EnabledPacks } from "./pack/types.js";

/** Input to the acceptance gate check. */
export interface AcceptGateInput {
  /** Current spec being shipped. */
  spec: {
    filePath: string;
    frontmatter: Record<string, unknown>;
    body: string;
  };
  /** Project-level enabled packs. */
  enabledPacks: EnabledPacks;
  /** Path to acceptance artifact, or null if not run. */
  acceptanceArtifactPath: string | null;
  /** Content of the acceptance artifact (when path is non-null). */
  artifactContent?: string;
}

/** Decision from the acceptance gate. */
export interface AcceptGateDecision {
  /** Whether ship should be blocked. */
  block: boolean;
  /** Reason for blocking (when block=true). */
  reason?: string;
  /** Non-blocking warning. */
  warning?: string;
}

/**
 * Determine whether ship should be blocked by forced acceptance requirements.
 *
 * Logic:
 * 1. Read spec context from frontmatter; null → no-block
 * 2. Union forced_acceptance_contexts from all enabled packs
 * 3. If context not in forced list → no-block
 * 4. If spec has no ## Scenarios → no-block + warning
 * 5. No artifact → block ("acceptance 未运行")
 * 6. Artifact with fail > 0 → block
 * 7. Otherwise → no-block
 *
 * @example
 * ```ts
 * const decision = shouldBlockShip({ spec, enabledPacks, acceptanceArtifactPath: null });
 * if (decision.block) {
 *   console.error(decision.reason);
 * }
 * ```
 * @public
 */
export function shouldBlockShip(input: AcceptGateInput): AcceptGateDecision {
  const { spec, enabledPacks, acceptanceArtifactPath, artifactContent } = input;

  // Zero-Pack-Zero-Impact
  if (enabledPacks.entries.length === 0) {
    return { block: false };
  }

  // Read spec context
  const context = spec.frontmatter.context as string | undefined;
  if (!context) {
    return { block: false };
  }

  // Union forced_acceptance_contexts from all packs
  const forcedContexts = new Set<string>();
  for (const entry of enabledPacks.entries) {
    const flags = entry.featureFlags;
    if (flags && Array.isArray(flags.forced_acceptance_contexts)) {
      for (const ctx of flags.forced_acceptance_contexts as string[]) {
        forcedContexts.add(ctx);
      }
    }
  }

  if (!forcedContexts.has(context)) {
    return { block: false };
  }

  // Check if spec has Scenarios section
  const hasScenarios = /##\s+Scenarios\b/.test(spec.body);
  if (!hasScenarios) {
    return {
      block: false,
      warning: `Context "${context}" requires acceptance, but spec has no ## Scenarios section`,
    };
  }

  // Check artifact
  if (!acceptanceArtifactPath) {
    return {
      block: true,
      reason: `Acceptance 未运行 — context "${context}" requires scenario verification`,
    };
  }

  if (!artifactContent) {
    return {
      block: true,
      reason: `Acceptance artifact missing content — ${acceptanceArtifactPath}`,
    };
  }

  // Parse artifact frontmatter for verdicts_summary
  const failMatch = artifactContent.match(/fail:\s*(\d+)/);
  const failCount = failMatch ? Number.parseInt(failMatch[1], 10) : 0;

  if (failCount > 0) {
    return {
      block: true,
      reason: `${failCount} 个 scenarios FAIL — context "${context}" requires all scenarios to pass`,
    };
  }

  return { block: false };
}
