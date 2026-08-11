#!/usr/bin/env node
/**
 * Staleness checker — classifies docs by freshness based on frontmatter `updated` date.
 * Exit codes: 0 = clean (or warnings only), 1 = error/critical staleness, 2 = critical, 3 = internal error.
 * CI mode: critical/invalid → exit 1; warning → exit 0 + ::warning:: annotation.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative, resolve } from "node:path";
import { parseFrontmatter } from "../src/docs-governance/frontmatter/parser.js";
import {
  classifyStaleness,
  isNonSubstantiveCommit,
} from "../src/docs-governance/staleness.js";
import { computeExitResult } from "../src/docs-governance/cli/_runtime.js";
import {
  formatDiagnostics,
  formatGitHubAnnotations,
  formatNdjson,
} from "../src/docs-governance/reporter/diagnostic.js";
import { formatHelp } from "../src/docs-governance/cli/_help.js";
import { loadConfigWithDefaults } from "../src/docs-governance/config.js";
import { walkMdFiles, shouldExcludeIndex } from "../src/docs-governance/cli/scan-files.js";
import type { DiagnosticRecord, DocPath, Severity } from "../src/docs-governance/types.js";

const SCRIPT_NAME = "check-docs-staleness";

// ── Args ──

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    formatHelp(SCRIPT_NAME, "Classify docs by freshness based on frontmatter updated date.", [
      "--json     Output diagnostics as NDJSON",
      "--ci       GitHub Actions mode (annotations + stricter exit codes)",
      "--help     Show this help message",
    ]),
  );
  process.exit(0);
}

const jsonMode = args.includes("--json");
const ciMode = args.includes("--ci");

// ── Staleness to severity mapping ──

function stalenessToSeverity(
  status: ReturnType<typeof classifyStaleness>,
): Severity | null {
  switch (status) {
    case "critical":
      return "error";
    case "warning":
      return "warning";
    case "invalid":
      return "error";
    case "fresh":
      return null;
  }
}

// ── Git last-modified date lookup ──

const gitMtimeCache = new Map<string, Date | null>();
const GIT_TIMEOUT_MS = 5000;
// How far back to walk commits looking for a body-touching change before
// giving up (and treating the doc as body-stable). 20 covers any realistic
// frontmatter-only churn streak (e.g. bulk frontmatter backfill + metadata
// tweaks) without an unbounded git walk.
const GIT_BACKSCAN_LIMIT = 20;

/**
 * Returns the date (UTC) of the last commit that touched the *body* of
 * `relPath`, or null when git is unavailable / the file is untracked.
 *
 * Drift detection must compare the frontmatter `updated` field against the
 * last *substantive* (body) edit — not just the last commit. A commit that
 * only edits frontmatter (e.g. bulk backfill of metadata blocks, a title
 * tweak) is not a content change and must not force a date bump. We therefore
 * walk the most recent commits, skipping frontmatter-only ones, and return
 * the first body-touching commit's date.
 *
 * A commit is non-substantive when its pre/post revisions differ only in
 * frontmatter metadata and/or whitespace (blank lines, trailing spaces). Such
 * formatting-only edits must not force a date bump, so they are skipped while
 * walking back. The body-equality check (frontmatter stripped, whitespace
 * normalized) is robust to the line-renumbering that inserting/removing a
 * frontmatter block causes — which hunk-based heuristics misclassify.
 *
 * Best-effort: any git failure (missing git, untracked file, non-repo) yields
 * null, which simply skips the drift check rather than erroring.
 */
function getGitMtime(rootDir: string, absPath: string, relPath: string): Date | null {
  // absPath kept on the signature for callers; body comparison reads blobs via git.
  void absPath;
  if (gitMtimeCache.has(relPath)) return gitMtimeCache.get(relPath) ?? null;
  let mtime: Date | null = null;

  try {
    // Recent commits touching this file: "<iso-date>\t<sha>" per line, newest first.
    const logRaw = execFileSync(
      "git",
      ["log", `-${GIT_BACKSCAN_LIMIT}`, "--format=%cI%x09%H", "--", relPath],
      { cwd: rootDir, encoding: "utf-8", timeout: GIT_TIMEOUT_MS },
    ).trim();

    if (logRaw) {
      for (const line of logRaw.split("\n")) {
        const sep = line.indexOf("\t");
        if (sep === -1) continue;
        const iso = line.slice(0, sep);
        const sha = line.slice(sep + 1);
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) continue;

        // Compare the commit's post-revision body to its parent's body. Equal
        // (after stripping frontmatter + normalizing whitespace) ⇒ the commit
        // is non-substantive ⇒ skip it and walk back to an older commit.
        let nonSubstantive = false;
        try {
          const after = execFileSync("git", ["show", `${sha}:${relPath}`], {
            cwd: rootDir,
            encoding: "utf-8",
            timeout: GIT_TIMEOUT_MS,
            // Silence git's stderr: for a file's introducing commit, `sha^:path`
            // fails with a "exists on disk, but not in '<sha>^'" fatal that is
            // expected here (handled by the catch) but noisy on the console.
            stdio: ["ignore", "pipe", "ignore"],
          });
          const before = execFileSync("git", ["show", `${sha}^:${relPath}`], {
            cwd: rootDir,
            encoding: "utf-8",
            timeout: GIT_TIMEOUT_MS,
            stdio: ["ignore", "pipe", "ignore"],
          });
          nonSubstantive = isNonSubstantiveCommit(before, after);
        } catch {
          // File newly added (no parent) or blob unreadable — treat as a real
          // body change so we don't silently skip the originating commit.
          nonSubstantive = false;
        }

        if (!nonSubstantive) {
          mtime = d;
          break;
        }
      }
    }
  } catch {
    // Not a git repo, untracked file, or git missing — drift check skipped.
  }

  gitMtimeCache.set(relPath, mtime);
  return mtime;
}

// ── Main ──

const rootDir = resolve(process.cwd());
const docsDir = join(rootDir, "docs");

// Load config
let config;
try {
  const configPath = join(rootDir, ".tinkerman/config.md");
  const configRaw = readFileSync(configPath, "utf-8");
  config = loadConfigWithDefaults(configRaw);
} catch {
  config = loadConfigWithDefaults("");
}

const today = new Date();

const result = computeExitResult(() => {
  const files = walkMdFiles(docsDir, { excludeFn: shouldExcludeIndex });
  const diagnostics: DiagnosticRecord[] = [];

  for (const filePath of files) {
    const relPath = relative(rootDir, filePath) as DocPath;
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      diagnostics.push({
        script: SCRIPT_NAME,
        severity: "error",
        file: relPath,
        message: `Cannot read file: ${relPath}`,
      });
      continue;
    }

    const parsed = parseFrontmatter(content);
    if (!parsed.frontmatter) {
      // Files without valid frontmatter are not checked for staleness
      continue;
    }

    const gitMtime = getGitMtime(rootDir, filePath, relPath);
    const status = classifyStaleness(
      parsed.frontmatter,
      today,
      config.staleness,
      relPath,
      gitMtime,
    );

    const severity = stalenessToSeverity(status);
    if (severity === null) continue; // fresh — skip

    // Distinguish drift warnings (body changed but `updated` stale) from
    // age-based staleness, so the message tells the maintainer what to do.
    const isDrift =
      status === "warning" &&
      gitMtime !== null &&
      new Date(`${parsed.frontmatter.updated}T00:00:00Z`).getTime() <
        gitMtime.getTime();

    diagnostics.push({
      script: SCRIPT_NAME,
      severity,
      file: relPath,
      message:
        status === "invalid"
          ? `Invalid or future-dated "updated" field: "${parsed.frontmatter.updated}"`
          : isDrift
            ? `Frontmatter "updated" (${parsed.frontmatter.updated}) trails git last-modified — body changed but date not bumped`
            : `Document is ${status === "critical" ? "critically stale" : "stale"} (${parsed.frontmatter.updated})`,
      extra: { staleness: status },
    });
  }

  return diagnostics;
});

if (jsonMode) {
  process.stdout.write(`${formatNdjson(result.diagnostics)}\n`);
} else {
  const output = formatDiagnostics(result.diagnostics);
  process.stdout.write(`${output}\n`);
}

if (ciMode) {
  const annotations = formatGitHubAnnotations(result.diagnostics);
  if (annotations) process.stdout.write(`${annotations}\n`);
}

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
}

process.exit(result.exitCode);
