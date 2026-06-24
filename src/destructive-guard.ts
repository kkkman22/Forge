/**
 * Destructive Command Guard (v2) — normalization engine + content-level
 * interception of irreversible git / infrastructure commands.
 *
 * v2 fixes P0-1 (rule bypass via shell syntax): commands are normalized
 * (strip quotes / env prefixes / absolute paths / git global flags / bash -c
 * wrappers) before rule matching, so `env git reset --hard`, `/usr/bin/git
 * reset --hard`, `git --no-pager reset --hard`, `bash -c 'git reset --hard'`
 * etc. all collapse to the same canonical form.
 *
 * Bypass is nonce-based (v2 fixes P0-2/P0-3): see destructive-nonce.ts.
 * This module's checkDestructive is pure — the caller assembles the context
 * (from nonce files + config) and passes it in.
 *
 * **Validates: Requirements R1 AC1-AC8 (v2)**
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DestructiveDecision {
  allowed: boolean;
  matchedRule?: string;
  reason: string;
  verdict: "deny" | "allow-bypass" | "allow";
  bypassReason?: "rollback-active" | "user-single-allow" | "guard-disabled";
}

/** Judgment context — assembled by the caller from nonce files + config (no I/O here). */
export interface DestructiveContext {
  rollbackActive: boolean;
  userSingleAllow: boolean;
  guardEnabled: boolean;
}

export type DestructiveCategory = "git" | "infra";

export interface DestructiveRule {
  id: string;
  matches: (normalized: readonly string[]) => boolean;
  category: DestructiveCategory;
}

// ---------------------------------------------------------------------------
// Shell normalization (v3 — narrow + fail-closed)
// ---------------------------------------------------------------------------

/**
 * Shell metacharacters that make a command "complex". Presence of any → the
 * guard cannot safely reduce it to a bare destructive command → fail-closed
 * (deny). This is the v3 fix for the v2 rule-bypass via `;` `&` `|` `$()`:
 * rather than try to parse every shell variant (unwinnable), we refuse any
 * command form we can't reduce to a bare command.
 */
export const SHELL_METACHARS: ReadonlySet<string> = new Set([
  ";",
  "&",
  "|",
  "`",
  "$",
  "(",
  ")",
  ">",
  "<",
  "\\",
  "&&",
  "||",
  "\n",
]);

/** Wrapper shells that prefix a real command — treated as complex (fail-closed). */
const WRAPPER_SHELLS = new Set(["bash", "sh", "zsh", "dash", "exec"]);

/**
 * v4 strict whitelist: the only command prefixes a destructive command may
 * start with (after env/absolute-path stripping). Any other cmd[0] → the
 * command is not a bare destructive command → fail-closed deny. This is the
 * closed rule that prevents wrapper-prefix bypass (exec/sudo/nice/VAR=...).
 */
export const DESTRUCTIVE_TOOL_NAMES: ReadonlySet<string> = new Set([
  "git",
  "terraform",
  "tofu",
  "pulumi",
  "cdk",
]);

/**
 * Whether a command is "complex" — i.e. cannot be safely reduced to a bare
 * destructive command for whitelist matching. v3 fail-closed gate.
 *
 * Triggers: any shell metacharacter, embedded/embedded quotes, shell wrappers
 * (bash -c / sh -c), or command substitution.
 */
export function isComplexCommand(command: string): boolean {
  if (!command) return false;
  // 1. Raw metacharacters anywhere (covers ; & | ` > < \ and newline).
  for (const ch of command) {
    if (SHELL_METACHARS.has(ch)) return true;
  }
  // 2. Command substitution / arithmetic expansion markers.
  if (command.includes("$(") || command.includes("${")) return true;
  // 3. Embedded quotes inside a token (e.g. --'hard', --h"ar"d) — surrounding
  //    quotes on a whole token are fine (stripped), but mid-token quotes signal
  //    an attempt to break exact matching.
  for (const tok of command.trim().split(/\s+/)) {
    if (tok.length > 1) {
      const inner = tok.slice(1, -1);
      if (inner.includes('"') || inner.includes("'")) return true;
    }
  }
  // 4. Shell wrappers (bash -c, sh -c) — complex by definition.
  const firstTwo = command.trim().split(/\s+/).slice(0, 2);
  if (firstTwo.length >= 2 && WRAPPER_SHELLS.has(firstTwo[0]) && firstTwo[1] === "-c") {
    return true;
  }
  // 5. v4 wrapper-prefix detection (closes exec/sudo/nice/VAR=/bash-without-c
  //    bypass): normalize (strip env/absolute-path), then if cmd[0] is NOT a
  //    destructive tool BUT a destructive tool name appears as a later token,
  //    the command wraps a destructive command behind an unrecognized prefix →
  //    fail-closed. Bare non-destructive commands (ls, npm) have no destructive
  //    tool token anywhere → not complex → allowed.
  const norm = normalizeCommand(command);
  if (norm.length > 0 && !DESTRUCTIVE_TOOL_NAMES.has(norm[0])) {
    if (norm.slice(1).some((t) => DESTRUCTIVE_TOOL_NAMES.has(t))) {
      return true;
    }
  }
  return false;
}

/**
 * Narrow normalization (v3): only strip `env` prefix and absolute-path basename.
 * Does NOT expand bash -c, does NOT strip embedded quotes — those are caught by
 * isComplexCommand (fail-closed) before this runs.
 */
export function normalizeCommand(command: string): string[] {
  if (!command || command.trim() === "") return [];
  let tokens = command
    .trim()
    .split(/\s+/)
    .map(stripSurroundingQuotes)
    .filter((t) => t.length > 0);
  tokens = stripLeadingPrefixes(tokens);
  tokens = stripGitGlobalFlags(tokens);
  // v5 P0-2 fix: lowercase all tokens so rule matching is case-insensitive.
  // macOS APFS is case-insensitive → `GIT reset --hard` resolves to the same
  // binary. git subcommands/flags are themselves case-insensitive. Refs
  // (HEAD~1, origin/main) are not inspected by any rule, so lowercasing them
  // is harmless.
  return tokens.map((t) => t.toLowerCase());
}

/** Strip a matching pair of surrounding quotes from a whole token (safe, unambiguous). */
function stripSurroundingQuotes(token: string): string {
  if (
    token.length >= 2 &&
    ((token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'")))
  ) {
    return token.slice(1, -1);
  }
  return token;
}

function stripLeadingPrefixes(tokens: string[]): string[] {
  let result = [...tokens];
  while (result.length > 0) {
    const first = result[0];
    if (first === "env") {
      result = result.slice(1);
      continue;
    }
    if (first.includes("/")) {
      const base = first.slice(first.lastIndexOf("/") + 1);
      result = [base, ...result.slice(1)];
    }
    break;
  }
  return result;
}

/** git global flags that may precede the subcommand (no shell metachar risk). */
function isGitGlobalFlag(token: string): boolean {
  return (
    token === "--no-pager" ||
    token === "--no-color" ||
    token.startsWith("-c") ||
    token.startsWith("--git-dir") ||
    token.startsWith("--work-tree") ||
    token.startsWith("-C") ||
    token.startsWith("-G") ||
    token.startsWith("--namespace") ||
    token.startsWith("--exec-path") ||
    token.startsWith("--config-env")
  );
}

/**
 * v4.1 fix: git global flags that consume the NEXT token as their value (when
 * not written inline as `flag=value`). stripGitGlobalFlags must skip both the
 * flag and its value, or the value token shifts into cmd[1] and breaks rule
 * matching (v4 P0: `git -C . reset --hard` escaped because `.` became cmd[1]).
 *
 * Covers: -c (config), -C (run-as-path), -G (grep), --git-dir, --work-tree,
 * --namespace. Note case sensitivity: -c (lower) vs -C (upper) are distinct.
 */
const GIT_FLAGS_TAKING_VALUE: ReadonlySet<string> = new Set([
  "-c",
  "-C",
  "-G",
  "--git-dir",
  "--work-tree",
  "--namespace",
]);

/** Whether a flag token consumes the next token as its value (no inline `=`). */
function flagTakesNextToken(token: string): boolean {
  if (token.includes("=")) return false;
  return GIT_FLAGS_TAKING_VALUE.has(token);
}

function stripGitGlobalFlags(tokens: string[]): string[] {
  if (tokens[0] !== "git" || tokens.length < 2) return tokens;
  const subcmd: string[] = [];
  let i = 1;
  while (i < tokens.length) {
    const t = tokens[i];
    if (isGitGlobalFlag(t)) {
      // Flag that takes next token as value (e.g. -C PATH, --git-dir PATH).
      if (flagTakesNextToken(t) && i + 1 < tokens.length) {
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }
    subcmd.push(...tokens.slice(i));
    break;
  }
  return ["git", ...subcmd];
}

// ---------------------------------------------------------------------------
// Rule matchers (operate on normalized tokens)
// ---------------------------------------------------------------------------

const isGit = (cmd: readonly string[]): boolean => cmd[0] === "git";

/** `git reset --hard[...]` — matches `--hard` or `--hard=...` after `reset`. */
const isGitResetHard = (cmd: readonly string[]): boolean => {
  if (!isGit(cmd) || cmd[1] !== "reset") return false;
  return cmd.slice(2).some((t) => t === "--hard" || t.startsWith("--hard="));
};

/** `git checkout -- <path>` — any non-empty path after `--` (not just `.`/`*`). */
const isGitCheckoutDiscard = (cmd: readonly string[]): boolean => {
  if (!isGit(cmd) || cmd[1] !== "checkout") return false;
  const ddIdx = cmd.indexOf("--");
  if (ddIdx === -1) return false;
  return ddIdx < cmd.length - 1;
};

/** `git clean -fd`/`-fdx`/`-df`/`-f -d`/`-d -f` — remove untracked files. */
const isGitCleanForce = (cmd: readonly string[]): boolean => {
  if (!isGit(cmd) || cmd[1] !== "clean") return false;
  // Combine all flag tokens after `clean`; destructive when both `f` (force)
  // and `d` (directories) are present, in any combination/combination order.
  // Covers -fd, -fdx, -df, -dfx, -f -d, -d -f, -fdx --force, etc.
  const flagChars = cmd
    .slice(2)
    .filter((t) => t.startsWith("-"))
    .join("");
  return flagChars.includes("f") && flagChars.includes("d");
};

/** `git stash drop [...]`. */
const isGitStashDrop = (cmd: readonly string[]): boolean =>
  isGit(cmd) && cmd[1] === "stash" && cmd[2] === "drop";

/** infra destroy tools (terraform / tofu / pulumi / cdk). */
const INFRA_TOOLS = new Set(["terraform", "tofu", "pulumi", "cdk"]);

/** `<tool> destroy` OR `terraform apply -destroy`. */
const isInfraDestroy = (cmd: readonly string[]): boolean => {
  if (INFRA_TOOLS.has(cmd[0]) && cmd[1] === "destroy") return true;
  if (cmd[0] === "terraform" && cmd[1] === "apply" && cmd.slice(2).includes("-destroy")) {
    return true;
  }
  return false;
};

/** A stack is named via -target/--target/-stack/--stack or a bare positional stack id. */
const hasStackTarget = (cmd: readonly string[]): boolean => {
  if (
    cmd.some(
      (t) =>
        t.startsWith("-target") ||
        t.startsWith("--target") ||
        t.startsWith("-stack") ||
        t.startsWith("--stack"),
    )
  ) {
    return true;
  }
  // Bare positional stack id: cdk destroy <StackName>
  return cmd.length > 2 && INFRA_TOOLS.has(cmd[0]) && !cmd.slice(2).every((t) => t.startsWith("-"));
};

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

const ALLOW: DestructiveDecision = { allowed: true, reason: "", verdict: "allow" };

/**
 * Evaluate a raw shell command string against the destructive guard.
 * Pure: normalizes internally, no I/O.
 */
export function checkDestructive(command: string, ctx: DestructiveContext): DestructiveDecision {
  if (!ctx.guardEnabled) {
    return {
      allowed: true,
      reason: "destructive guard disabled",
      verdict: "allow-bypass",
      bypassReason: "guard-disabled",
    };
  }

  // v3 fail-closed: complex command forms (shell metacharacters, embedded
  // quotes, bash -c wrappers) cannot be safely reduced to a bare destructive
  // command → deny. This closes the v2 bypass via `;` `&` `|` `$()` etc.
  if (isComplexCommand(command)) {
    return {
      allowed: false,
      reason:
        "破坏性命令护栏不支持该命令形态(含 shell 元字符/嵌入引号/wrapper)。请用裸命令(如 `git reset --hard <ref>`),或签发 rollback/allow nonce 后以 nonce 放行。",
      verdict: "deny",
    };
  }

  const normalized = normalizeCommand(command);
  if (normalized.length === 0) {
    return ALLOW;
  }

  // v4 fail-closed (wrapper-prefix bypass fix): after stripping env/absolute-path
  // prefixes, if cmd[0] is NOT a known destructive tool, the command either (a)
  // is non-destructive (ls, npm — allow, harmless) or (b) wraps a destructive
  // command behind an unrecognized prefix (exec/sudo/nice/VAR=/bash-without-c).
  // We cannot tell (a) from (b) without parsing every possible wrapper, so we
  // apply the destructive-tool whitelist ONLY when the raw command looks like it
  // references a destructive tool. The wrapper check lives in isComplexCommand
  // (which sees the raw command, including prefixes like `exec git`).
  //
  // Concretely: if cmd[0] is a destructive tool, proceed to rule matching.
  // Otherwise, allow (non-destructive) — wrapper bypasses are caught by
  // isComplexCommand's reference-scan below.

  let matched: DestructiveRule | undefined;
  for (const rule of DESTRUCTIVE_RULES) {
    if (rule.matches(normalized)) {
      matched = rule;
      break;
    }
  }
  if (!matched) {
    return ALLOW;
  }

  // infra destroy — rollback does NOT exempt infra.
  if (matched.category === "infra") {
    if (hasStackTarget(normalized)) {
      return ALLOW;
    }
    return {
      allowed: false,
      matchedRule: matched.id,
      reason:
        "破坏性命令被阻断:基础设施 destroy 未指明 stack。请显式指明目标 (如 -target=... / --stack ...) 后重试。",
      verdict: "deny",
    };
  }

  // git destructive rule — bypass under rollback or single-allow (nonce-verified by caller).
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

  return {
    allowed: false,
    matchedRule: matched.id,
    reason: `破坏性命令被阻断:${matched.id}。若是 Forge 回滚,skill 应先签发 rollback nonce;如需单次放行,签发 allow nonce。`,
    verdict: "deny",
  };
}
