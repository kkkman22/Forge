export type DriftResult =
  | { kind: "has_ci_command"; command: string }
  | { kind: "drift_with_npm_check"; suggestedCommand: "npm run check"; warning: string }
  | { kind: "no_check_no_field" }
  | { kind: "malformed_package_json"; reason: string };

export interface FrontmatterInput {
  ci_check_command?: string;
}

const DRIFT_WARNING = `⚠️ CI 命令漂移检测
  .tinkerman/config.md frontmatter 未声明 ci_check_command，
  但检测到 package.json 中存在 "scripts.check": "npm run check"。
  本次自动使用 \`npm run check\` 执行 Layer 3，建议补齐 frontmatter：

      ci_check_command: "npm run check"

  补齐后，未来 /tinkerman test、/tinkerman ship Post-Push Verify、本地 pre-push hook
  将使用统一命令，避免再次出现"本地绿、CI 红"。`;

export function detectCiCommandDrift(
  frontmatter: FrontmatterInput,
  packageJsonRaw: string | null,
): DriftResult {
  const cmd = frontmatter.ci_check_command;
  if (cmd !== undefined && cmd !== null && cmd.trim().length > 0) {
    return { kind: "has_ci_command", command: cmd };
  }

  if (packageJsonRaw === null) {
    return { kind: "no_check_no_field" };
  }

  let pkg: unknown;
  try {
    pkg = JSON.parse(packageJsonRaw);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid JSON";
    return { kind: "malformed_package_json", reason: message };
  }

  if (
    pkg !== null &&
    typeof pkg === "object" &&
    "scripts" in pkg &&
    typeof (pkg as Record<string, unknown>).scripts === "object" &&
    (pkg as Record<string, unknown>).scripts !== null &&
    typeof ((pkg as Record<string, Record<string, unknown>>).scripts as Record<string, unknown>)
      ?.check === "string" &&
    (
      ((pkg as Record<string, Record<string, unknown>>).scripts as Record<string, unknown>)
        .check as string
    ).length > 0
  ) {
    return {
      kind: "drift_with_npm_check",
      suggestedCommand: "npm run check",
      warning: DRIFT_WARNING,
    };
  }

  return { kind: "no_check_no_field" };
}
