#!/usr/bin/env node
// category: internal-only
/**
 * message-display-hook.mjs — MessageDisplay hook for output conciseness enforcement (R2).
 *
 * Detects structured Forge markers and preserves those messages unchanged.
 * Folds pure prose over 200 tokens into <details>/<summary> blocks.
 * Fails open: any error → silent exit 0 (pass through).
 * 100ms timeout on stdin → pass through.
 *
 * @see design.md#b1-messagedisplay-hookr2
 * @see https://code.claude.com/docs/en/hooks#messagedisplay
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Constants ──

const TOKEN_THRESHOLD = 200;
const SUMMARY_CHARS = 800;
const STDIN_TIMEOUT_MS = 100;
const STDIN_MAX_BYTES = 262144; // 256KB
const CHARS_PER_TOKEN = 4; // Simple heuristic

// Structured markers that indicate Forge output — must be preserved
const STRUCTURED_MARKERS = [
  "<!-- forge:decision-point -->",
  "### ✅",
  "### ⚠️",
  "### ❌",
  "### 🛑",
  "[forge-review]",
  "[forge-spec]",
  "[forge-plan]",
  "[forge-build]",
  "[forge-ship]",
  "[forge-learn]",
  "[forge-decide]",
];

// Verbosity patterns — logged but content is not modified
const VERBOSITY_PATTERNS = ["我将", "让我先"];

// ── Helpers ──

/**
 * Read stdin with timeout. Returns empty buffer on timeout or error.
 */
function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    let totalLen = 0;
    const stdin = process.stdin;
    let settled = false;

    function finish(buf) {
      if (settled) return;
      settled = true;
      resolve(buf);
    }

    const timer = setTimeout(() => {
      cleanup();
      finish(Buffer.alloc(0));
    }, STDIN_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      try {
        stdin.removeAllListeners("data");
        stdin.removeAllListeners("end");
        stdin.removeAllListeners("error");
        stdin.pause();
      } catch {
        // best effort
      }
    }

    stdin.on("data", (chunk) => {
      totalLen += chunk.length;
      if (totalLen > STDIN_MAX_BYTES) {
        cleanup();
        finish(Buffer.alloc(0));
        return;
      }
      chunks.push(chunk);
    });

    stdin.on("end", () => {
      cleanup();
      finish(Buffer.concat(chunks, totalLen));
    });

    stdin.on("error", () => {
      cleanup();
      finish(Buffer.alloc(0));
    });

    if (stdin.isTTY) {
      cleanup();
      finish(Buffer.alloc(0));
    } else {
      stdin.resume();
    }
  });
}

/**
 * Check if config has this hook disabled.
 */
function isHookDisabled(cwd) {
  try {
    const configPath = resolve(cwd, ".forge/config.md");
    const content = readFileSync(configPath, "utf-8");
    // Check env override first
    if (process.env.FORGE_OUTPUT_CONCISENESS_HOOK === "off") return true;
    // Check config file
    const match = content.match(/^output_conciseness_hook:\s*(\S+)/m);
    if (match && match[1] === "off") return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Simple token estimation: content.length / 4.
 */
function estimateTokens(content) {
  return Math.ceil(content.length / CHARS_PER_TOKEN);
}

/**
 * Detect structured markers in content.
 */
function hasStructuredMarker(content) {
  return STRUCTURED_MARKERS.some((m) => content.includes(m));
}

/**
 * Detect markdown table (3+ lines with | and --- separator).
 */
function isMarkdownTable(content) {
  const lines = content.split("\n");
  let pipeLines = 0;
  let hasSeparator = false;

  for (const line of lines) {
    if (line.includes("|")) {
      pipeLines++;
      if (/^\s*\|?\s*[-:]+[-|\s:]*$/.test(line)) {
        hasSeparator = true;
      }
    }
  }

  return pipeLines >= 3 && hasSeparator;
}

/**
 * Detect fenced code blocks.
 */
function hasCodeFence(content) {
  return content.includes("```");
}

/**
 * Check if content should be preserved (not folded).
 */
function shouldPreserve(content) {
  if (!content || content.trim().length === 0) return true;
  if (hasStructuredMarker(content)) return true;
  if (isMarkdownTable(content)) return true;
  if (hasCodeFence(content)) return true;
  return false;
}

/**
 * Log verbosity patterns to stderr (non-blocking).
 */
function logVerbosityPatterns(content) {
  for (const pattern of VERBOSITY_PATTERNS) {
    if (content.includes(pattern)) {
      process.stderr.write(
        `[message-display-hook] verbosity pattern detected: "${pattern}"\n`,
      );
      break;
    }
  }
}

/**
 * Fold content into <details>/<summary> if over token threshold.
 * Returns folded content or original if under threshold.
 */
function foldContent(content) {
  const tokens = estimateTokens(content);
  if (tokens <= TOKEN_THRESHOLD) return content;

  const summary = content.slice(0, SUMMARY_CHARS);
  return `${summary}\n\n<details><summary>展开（共 ${tokens} tokens）</summary>\n\n${content}\n\n</details>`;
}

/**
 * Output the hook result as JSON to stdout.
 */
function outputResult(content) {
  const result = {
    hookSpecificOutput: {
      updatedDisplay: content,
    },
  };
  process.stdout.write(JSON.stringify(result));
}

// ── Main ──

async function main() {
  try {
    // Read stdin
    const buf = await readStdin();
    if (buf.length === 0) {
      // Timeout or no input — pass through silently
      process.exit(0);
    }

    let input;
    try {
      input = JSON.parse(buf.toString("utf-8"));
    } catch {
      process.exit(0);
    }

    // Extract message content
    const content =
      input?.message?.content ??
      input?.content ??
      "";

    if (typeof content !== "string") {
      process.exit(0);
    }

    // Determine cwd for config lookup
    const cwd = input?.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();

    // Check if hook is disabled in config
    if (isHookDisabled(cwd)) {
      outputResult(content);
      process.exit(0);
    }

    // Check verbosity patterns — log but don't modify
    logVerbosityPatterns(content);

    // Check if content should be preserved
    if (shouldPreserve(content)) {
      outputResult(content);
      process.exit(0);
    }

    // Fold long prose
    const result = foldContent(content);
    outputResult(result);
  } catch {
    // Fail open
    process.exit(0);
  }
}

main();
