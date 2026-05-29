import type { ResolvedConfig } from "./types.js";

export function applyCliOverrides(
  config: ResolvedConfig,
  argv: string[],
): ResolvedConfig {
  const hasPostComments = argv.includes("--post-comments");
  const hasNoPostComments = argv.includes("--no-post-comments");

  if (hasPostComments && hasNoPostComments) {
    throw new Error(
      "--post-comments 与 --no-post-comments 互斥",
    );
  }

  if (hasPostComments) {
    return { ...config, enabled: true };
  }

  if (hasNoPostComments) {
    return { ...config, enabled: false };
  }

  return config;
}