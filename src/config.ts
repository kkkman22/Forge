/** Review-specific configuration parsed from .forge/config.md and env. @public */
export interface ReviewConfig {
  subagent_concurrency: number;
}

export type PolicyProfile = "solo" | "team" | "enterprise";

export interface PolicyProfileConfig {
  policy_profile: PolicyProfile;
  diagnostics: Array<{
    code: "INVALID_POLICY_PROFILE";
    message: string;
  }>;
}

/** Parse review concurrency config. Priority: env > config.md > default(3). @public */
export function parseReviewConfig(configContent: string | undefined): ReviewConfig {
  const DEFAULT_CONCURRENCY = 3;
  const MIN = 1;
  const MAX = 10;

  const envValue = process.env.FORGE_REVIEW_CONCURRENCY;
  if (envValue !== undefined) {
    const parsed = parseInt(envValue, 10);
    if (Number.isInteger(parsed) && parsed >= MIN && parsed <= MAX) {
      return { subagent_concurrency: parsed };
    }
    // biome-ignore lint/suspicious/noConsole: config parser warning is intentional (no logger access)
    console.warn(
      `FORGE_REVIEW_CONCURRENCY invalid (${envValue}); falling back to config.md or default=${DEFAULT_CONCURRENCY}`,
    );
  }

  if (configContent) {
    const match = configContent.match(/^\s*review\.subagent_concurrency:\s*(-?\d+)\s*$/m);
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (Number.isInteger(parsed) && parsed >= MIN && parsed <= MAX) {
        return { subagent_concurrency: parsed };
      }
      // biome-ignore lint/suspicious/noConsole: config parser warning is intentional (no logger access)
      console.warn(
        `subagent_concurrency invalid in config.md (${match[1]}); falling back to default=${DEFAULT_CONCURRENCY}`,
      );
    }
  }

  return { subagent_concurrency: DEFAULT_CONCURRENCY };
}

export function parsePolicyProfileConfig(configContent: string | undefined): PolicyProfileConfig {
  const diagnostics: PolicyProfileConfig["diagnostics"] = [];
  const fallback: PolicyProfileConfig = { policy_profile: "team", diagnostics };
  if (!configContent) return fallback;

  const match = configContent.match(/^\s*policy_profile:\s*"?([a-zA-Z_-]+)"?\s*$/m);
  if (!match) return fallback;

  const value = match[1];
  if (value === "solo" || value === "team" || value === "enterprise") {
    return { policy_profile: value, diagnostics };
  }

  const message = `policy_profile invalid in config.md (${value}); falling back to team`;
  diagnostics.push({ code: "INVALID_POLICY_PROFILE", message });
  // biome-ignore lint/suspicious/noConsole: config parser warning is intentional (no logger access)
  console.warn(message);
  return fallback;
}
