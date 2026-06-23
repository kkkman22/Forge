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
// Shell normalization engine (P0-1 fix)
// ---------------------------------------------------------------------------

/** Wrappers that prefix a real command and should be stripped. */
const WRAPPER_SHELLS = new Set(["env", "bash", "sh", "zsh", "dash"]);

/** git global flags that may precede the subcommand. */
function isGitGlobalFlag(token: string): boolean {
  return (
    token === "--no-pager" ||
    token === "--no-color" ||
    token.startsWith("-c") ||
    token.startsWith("--git-dir") ||
    token.startsWith("--work-tree") ||
    token.startsWith("-C") ||
    token.startsWith("-G") ||
    token.startsWith("--namespace")
  );
}

/**
 * Normalize a shell command string into canonical tokens for rule matching.
 *
 * Transforms: strip quotes → expand bash -c/sh -c wrappers → strip env/
 * absolute-path prefixes → strip git global flags before the subcommand.
 *
 * Conservative: when in doubt returns fewer tokens (no rule matches → allow,
 * never a false deny).
 */
export function normalizeCommand(command: string): string[] {
  if (!command || command.trim() === "") return [];

  // 1. Split + strip surrounding quotes.
  let tokens = command
    .trim()
    .split(/\s+/)
    .map(stripQuotes)
    .filter((t) => t.length > 0);

  // 2. Expand `bash -c '...'` / `sh -c '...'` wrappers.
  tokens = expandShellWrapper(tokens);

  // 3. Strip leading `env` / absolute-path prefixes.
  tokens = stripLeadingPrefixes(tokens);

  // 4. Strip git global flags that precede the subcommand.
  tokens = stripGitGlobalFlags(tokens);

  return tokens;
}

function stripQuotes(token: string): string {
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return token.slice(1, -1);
  }
  return token;
}

function expandShellWrapper(tokens: string[]): string[] {
  if (tokens.length >= 3 && WRAPPER_SHELLS.has(tokens[0]) && tokens[1] === "-c") {
    // Join the wrapper args back into a string, strip outer quotes, then
    // re-normalize the inner command. The inner command was likely a single
    // quoted arg that whitespace-split broke into token fragments each
    // carrying stray quote chars — re-joining + stripQuotes on the whole
    // restores it before the recursive normalize re-splits cleanly.
    let inner = tokens.slice(2).join(" ").trim();
    if (
      (inner.startsWith('"') && inner.endsWith('"')) ||
      (inner.startsWith("'") && inner.endsWith("'"))
    ) {
      inner = inner.slice(1, -1);
    }
    return normalizeCommand(inner);
  }
  return tokens;
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

function stripGitGlobalFlags(tokens: string[]): string[] {
  if (tokens[0] !== "git" || tokens.length < 2) return tokens;
  const subcmd: string[] = [];
  let i = 1;
  while (i < tokens.length) {
    const t = tokens[i];
    if (isGitGlobalFlag(t)) {
      // -c without inline `=` consumes the next token as its value.
      if ((t === "-c" || t.startsWith("-c")) && !t.includes("=") && i + 1 < tokens.length) {
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

  const normalized = normalizeCommand(command);
  if (normalized.length === 0) {
    return ALLOW;
  }

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
