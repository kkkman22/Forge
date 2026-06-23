/**
 * Destructive Command Guard — pure functions for content-level interception of
 * irreversible git / infrastructure commands.
 *
 * All functions are side-effect free: accept parsed command tokens + context
 * (assembled by the caller from env + config), return a decision. No file I/O.
 *
 * Used by check-sandbox.ts (PreToolUse hook) as a short-circuit deny layer
 * that runs alongside the existing sandbox profile checks.
 *
 * Design (spec cc-2-1-18x-safety-hardening R1):
 *   judgment order —
 *     1. guardEnabled=false        → allow (bypass: guard-disabled)
 *     2. infra destroy w/o stack   → deny (rollback does NOT exempt infra)
 *     3. git destructive rule hit  → rollbackActive||userSingleAllow ? allow-bypass : deny
 *     4. unmatched command         → allow (handed back to sandbox profile)
 *
 * **Validates: Requirements R1 AC1-AC6**
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of evaluating a command against the destructive guard. */
export interface DestructiveDecision {
  /** Whether the command may proceed. */
  allowed: boolean;
  /** Matched rule id (e.g. "git-reset-hard") when a rule fired. */
  matchedRule?: string;
  /** Human-readable diagnostic; on allow-bypass, carries the bypass reason. */
  reason: string;
  /** Coarse verdict for downstream logging/routing. */
  verdict: "deny" | "allow-bypass" | "allow";
  /** Bypass reason when allowed via a privileged path. */
  bypassReason?: "rollback-active" | "user-single-allow" | "guard-disabled";
}

/**
 * Judgment context — assembled by the caller from process env + config.
 * Kept I/O-free so the pure function stays deterministic and testable.
 *
 *   rollbackActive   ← process.env.FORGE_ROLLBACK_IN_PROGRESS === "1"
 *                      (set by loop/transactional-rollback skill BEFORE running git reset --hard)
 *   userSingleAllow  ← process.env.FORGE_ALLOW_DESTRUCTIVE is non-empty
 *                      (per-command, non-persistent user override)
 *   guardEnabled     ← config.md `destructive_guard` (default on)
 */
export interface DestructiveContext {
  rollbackActive: boolean;
  userSingleAllow: boolean;
  guardEnabled: boolean;
}

/** Category tag for each rule. */
export type DestructiveCategory = "git" | "infra";

/** A single destructive-command rule. */
export interface DestructiveRule {
  id: string;
  /** True when the command tokens match this rule. */
  matches: (cmd: readonly string[]) => boolean;
  category: DestructiveCategory;
}

// ---------------------------------------------------------------------------
// Rule registry
// ---------------------------------------------------------------------------

/** Tokens start at index 0 with the executable; argv follows. */
const isGit = (cmd: readonly string[]): boolean => cmd[0] === "git";

/** `git reset --hard [...]` — must carry the literal `--hard` flag. */
const isGitResetHard = (cmd: readonly string[]): boolean =>
  isGit(cmd) && cmd[1] === "reset" && cmd.slice(2).includes("--hard");

/** `git checkout -- .` — destructive discard of working-tree changes. */
const isGitCheckoutDiscard = (cmd: readonly string[]): boolean =>
  isGit(cmd) &&
  cmd[1] === "checkout" &&
  cmd.includes("--") &&
  (cmd[cmd.length - 1] === "." || cmd[cmd.length - 1] === "*");

/** `git clean -fd` / `-fdx` / `-d -f` — remove untracked files. */
const isGitCleanForce = (cmd: readonly string[]): boolean => {
  if (!isGit(cmd) || cmd[1] !== "clean") return false;
  const flags = cmd.slice(2).join(" ");
  // -fd, -fdx, -df, -dfx, or separate -f and -d
  return (/-f/.test(flags) && /-d/.test(flags)) || /-fd/.test(flags);
};

/** `git stash drop [...]` — discard a stash entry irreversibly. */
const isGitStashDrop = (cmd: readonly string[]): boolean =>
  isGit(cmd) && cmd[1] === "stash" && cmd[2] === "drop";

/** infra destroy without an explicit stack/target argument. */
const INFRA_TOOLS = new Set(["terraform", "pulumi", "cdk"]);
const isInfraDestroy = (cmd: readonly string[]): boolean =>
  INFRA_TOOLS.has(cmd[0]) && cmd[1] === "destroy";

/**
 * A destroy command "names a stack" when any token looks like a target flag
 * (terraform/pulumi/cdk all use `-target`/`--target` or an explicit stack id).
 * Bare `terraform destroy` (no further args) is untargeted → block.
 */
const hasStackTarget = (cmd: readonly string[]): boolean =>
  cmd.slice(2).some((t) => t.startsWith("-target") || t.startsWith("--target"));

/**
 * The destructive-command registry. Exported for property tests and so
 * downstream tooling (forge-doctor) can enumerate coverage.
 */
export const DESTRUCTIVE_RULES: ReadonlyArray<DestructiveRule> = [
  { id: "git-reset-hard", matches: isGitResetHard, category: "git" },
  { id: "git-checkout-discard", matches: isGitCheckoutDiscard, category: "git" },
  { id: "git-clean-force", matches: isGitCleanForce, category: "git" },
  { id: "git-stash-drop", matches: isGitStashDrop, category: "git" },
  { id: "infra-destroy", matches: isInfraDestroy, category: "infra" },
];

// ---------------------------------------------------------------------------
// Core judgment
// ---------------------------------------------------------------------------

/** Allow-all verdict for unmatched / privileged cases. */
const ALLOW: DestructiveDecision = {
  allowed: true,
  reason: "",
  verdict: "allow",
};

/**
 * Conservatively split a shell command string into tokens for rule matching.
 *
 * Deliberately simple (whitespace split): the destructive rules only inspect
 * the leading bare tokens (`git`, `reset`, `--hard`, `terraform`, `destroy` …)
 * which never appear quoted. When in doubt this returns fewer tokens, which
 * simply causes no rule to match → allow (never a false deny).
 */
function tokenize(command: string): string[] {
  return command
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Convenience adapter: tokenize + {@link checkDestructive}.
 * The wiring layer (check-sandbox.ts) calls this with the raw command string.
 */
export function checkDestructiveCommand(
  command: string,
  ctx: DestructiveContext,
): DestructiveDecision {
  return checkDestructive(tokenize(command), ctx);
}

/**
 * Assemble a {@link DestructiveContext} from a process-env-like record.
 *
 * Centralises env-token reading so check-sandbox.ts stays thin and the
 * token names live in one place. Defaults to guard-enabled (fail-secure).
 *
 * Tokens:
 *   FORGE_ROLLBACK_IN_PROGRESS=1   → rollbackActive
 *   FORGE_ALLOW_DESTRUCTIVE=<any>  → userSingleAllow (non-empty = set)
 *   FORGE_DESTRUCTIVE_GUARD=off    → guardEnabled=false (any other value = on)
 *
 * @param env  process.env or an env-like record (testable)
 */
export function contextFromEnv(env: NodeJS.ProcessEnv): DestructiveContext {
  return {
    rollbackActive: env.FORGE_ROLLBACK_IN_PROGRESS === "1",
    userSingleAllow: Boolean(
      env.FORGE_ALLOW_DESTRUCTIVE && env.FORGE_ALLOW_DESTRUCTIVE.trim() !== "",
    ),
    guardEnabled: env.FORGE_DESTRUCTIVE_GUARD?.trim().toLowerCase() !== "off",
  };
}

/**
 * Evaluate a parsed command against the destructive guard.
 *
 * Pure: no I/O. The caller assembles {@link DestructiveContext} from env+config.
 *
 * @param command  parsed command tokens; `command[0]` is the executable
 * @param ctx      judgment context (rollback mark, single-allow, guard toggle)
 */
export function checkDestructive(
  command: readonly string[],
  ctx: DestructiveContext,
): DestructiveDecision {
  // 1. Guard globally disabled → allow everything, tag for doctor warning.
  if (!ctx.guardEnabled) {
    return {
      allowed: true,
      reason: "destructive guard disabled",
      verdict: "allow-bypass",
      bypassReason: "guard-disabled",
    };
  }

  // 4. Empty / unparseable command → defer to sandbox profile (don't over-block).
  if (!command || command.length === 0) {
    return ALLOW;
  }

  // Find first matching rule.
  let matched: DestructiveRule | undefined;
  for (const rule of DESTRUCTIVE_RULES) {
    if (rule.matches(command)) {
      matched = rule;
      break;
    }
  }

  // No destructive rule matched → allow (sandbox profile handles the rest).
  if (!matched) {
    return ALLOW;
  }

  // 2. infra destroy — rollback does NOT exempt infra (out of git-recovery scope).
  //    Deny unless an explicit stack target is present.
  if (matched.category === "infra") {
    if (hasStackTarget(command)) {
      return ALLOW;
    }
    return {
      allowed: false,
      matchedRule: matched.id,
      reason:
        "破坏性命令被阻断:基础设施 destroy 未指明 stack。请显式指明目标 (如 -target=...) 后重试。",
      verdict: "deny",
    };
  }

  // 3. git destructive rule — bypass under rollback-active or user single-allow.
  if (ctx.rollbackActive) {
    return {
      allowed: true,
      matchedRule: matched.id,
      reason: `放行(Forge rollback-active): ${matched.id}`,
      verdict: "allow-bypass",
      bypassReason: "rollback-active",
    };
  }
  if (ctx.userSingleAllow) {
    return {
      allowed: true,
      matchedRule: matched.id,
      reason: `放行(用户单次授权): ${matched.id}`,
      verdict: "allow-bypass",
      bypassReason: "user-single-allow",
    };
  }

  // No bypass → deny.
  return {
    allowed: false,
    matchedRule: matched.id,
    reason: `破坏性命令被阻断:${matched.id}。若是 Forge 回滚,skill 应先设置 rollback-active 标记 (FORGE_ROLLBACK_IN_PROGRESS=1);如需单次放行,设置 FORGE_ALLOW_DESTRUCTIVE=<nonce>。`,
    verdict: "deny",
  };
}
