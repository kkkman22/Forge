/**
 * Model tier resolution for review subagent dispatch (review-model-tier spec).
 *
 * Problem (obra/superpowers v6.0.0): when dispatching subagents without an
 * explicit model declaration, reviewers inherit the main agent's (most
 * expensive) model, blowing up token cost. Fix: each review agent declares a
 * `model_tier` (cheap|standard|capable|inherit); dispatch reads the tier,
 * resolves it via the configurable tier map, and fails open to `inherit`
 * when the harness does not support the requested model.
 *
 * Design:
 *   - R1: agent frontmatter declares model_tier (added in agent .md files).
 *   - R2: config `review_model_tier_map` maps tier → model name; built-in
 *         default applies when absent.
 *   - R2.AC3: unsupported model → fail-open to inherit (never block review).
 *   - R3: dispatch must read tier, resolve, emit observable line.
 *   - R3.AC3: missing tier field → treat as inherit + warn (not block).
 *   - R3.AC4: compact-safe skips layers, never downgrades model.
 *
 * Cost optimization is best-effort; availability always wins.
 */

/** Model tier declared in a review agent's frontmatter. */
export type ModelTier = "cheap" | "standard" | "capable" | "inherit";

/** Built-in default tier map when config omits `review_model_tier_map`. */
export const DEFAULT_TIER_MAP: Record<ModelTier, string> = {
  cheap: "haiku",
  standard: "sonnet",
  capable: "inherit",
  inherit: "inherit",
};

/** Tier map shape as read from `.forge/config.md#review_model_tier_map`. */
export type TierMap = Partial<Record<ModelTier, string>>;

/** Outcome of resolving a single agent's tier. */
export type ModelResult =
  | { kind: "resolved"; tier: ModelTier; model: string; fell_back: false }
  | {
      kind: "fallback";
      tier: ModelTier;
      requested: string;
      model: "inherit";
      fell_back: true;
      reason: string;
    };

/**
 * Parse the tier map from raw config text, tolerating absent/malformed entries
 * by falling back to DEFAULT_TIER_MAP.
 *
 * Accepts the YAML-ish fragment under `review_model_tier_map:`. Only the
 * four known tiers are honored; unknown keys are ignored.
 */
export function parseModelTierMap(raw: string | undefined | null): Record<ModelTier, string> {
  if (!raw) return { ...DEFAULT_TIER_MAP };
  const out: Record<ModelTier, string> = { ...DEFAULT_TIER_MAP };
  const known: ModelTier[] = ["cheap", "standard", "capable", "inherit"];
  for (const tier of known) {
    // match `tier: "value"` or `tier: value` (value non-empty)
    const re = new RegExp(`${tier}\\s*:\\s*"?([^"\\n\\r]+)"?`);
    const m = raw.match(re);
    if (m && m[1] && m[1].trim()) {
      out[tier] = m[1].trim();
    }
  }
  return out;
}

/**
 * Resolve a single agent's declared tier to a concrete model name.
 *
 * Contract:
 *   - tier undefined → treat as `inherit`.
 *   - resolved model === "inherit" → always resolved (inherit is always supported).
 *   - harnessSupports(requested) === false → fail-open to inherit + reason.
 *   - Pure: no IO; the caller supplies `harnessSupports`.
 */
export function resolveModelTier(args: {
  tier: ModelTier | undefined;
  tierMap: Record<ModelTier, string>;
  harnessSupports: (model: string) => boolean;
}): ModelResult {
  const tier: ModelTier = args.tier ?? "inherit";
  const requested = args.tierMap[tier] ?? "inherit";
  if (requested === "inherit" || args.harnessSupports(requested)) {
    return { kind: "resolved", tier, model: requested, fell_back: false };
  }
  return {
    kind: "fallback",
    tier,
    requested,
    model: "inherit",
    fell_back: true,
    reason: `model ${requested} for tier ${tier} not supported by harness`,
  };
}

/**
 * Render the observable dispatch line for a single agent (R3.AC2).
 *
 * Format: `<agentName>: <tier> → <model>` and, when fell back, an extra
 * `⚠ model_tier <tier> → <requested> 不被支持，回退 inherit` warning.
 */
export function renderDispatchLine(agentName: string, result: ModelResult): string {
  const base = `${agentName}: ${result.tier} → ${result.model}`;
  if (result.kind === "fallback") {
    return `${base}\n⚠ model_tier ${result.tier} → ${result.requested} 不被支持，回退 inherit`;
  }
  return base;
}
