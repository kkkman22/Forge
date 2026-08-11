#!/usr/bin/env node

/**
 * Resume Forge state from a Pull Request.
 *
 * Usage: node scripts/resume-from-pr.mjs <url-or-number> [--json]
 * Env:   FORGE_ROOT       (optional, default project root)
 *        FORGE_NO_CACHE=1 (skip slug cache)
 *        FORGE_INTERACTIVE=0 (non-interactive, exit 1 on ambiguity)
 *
 * Exit codes: 0 success, 1 PR not found / slug fail, 2 CC version too low, 3 arg error
 */

import { exec as nodeExec } from "node:child_process";
import { readFile, writeFile, access, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// parseTarget
// ---------------------------------------------------------------------------

/**
 * Parse a PR URL, number, or shorthand into structured target.
 * @param {string|null|undefined} value
 * @returns {{ host: string|null, number: number, url: string|null, repo?: string, raw: string, error?: string, exitCode?: number }}
 */
export function parseTarget(value) {
  if (value == null || typeof value !== "string" || value.trim() === "") {
    return { error: "empty value", exitCode: 3 };
  }
  const raw = value.trim();

  // Pure positive integer
  if (/^\d+$/.test(raw)) {
    return { host: null, number: parseInt(raw, 10), url: null, raw };
  }

  // GitHub: github.com/{owner}/{repo}/pull/{number}
  const gh = raw.match(/github\.com\/([^/\s]+\/[^/\s]+)\/pull\/(\d+)/);
  if (gh) {
    return { host: "github", number: parseInt(gh[2], 10), url: raw, repo: gh[1], raw };
  }

  // GitLab: gitlab.com/{path}/-/merge_requests/{number}
  const gl = raw.match(/gitlab\.com\/([^/\s]+(?:\/[^/\s]+)*)\/-\/merge_requests\/(\d+)/);
  if (gl) {
    return { host: "gitlab", number: parseInt(gl[2], 10), url: raw, repo: gl[1], raw };
  }

  // Bitbucket: bitbucket.org/{owner}/{repo}/pull-requests/{number}
  const bb = raw.match(/bitbucket\.org\/([^/\s]+\/[^/\s]+)\/pull-requests\/(\d+)/);
  if (bb) {
    return { host: "bitbucket", number: parseInt(bb[2], 10), url: raw, repo: bb[1], raw };
  }

  // Shorthand: org/repo#N
  const sh = raw.match(/^([^/\s]+\/[^/\s]+)#(\d+)$/);
  if (sh) {
    return { host: null, number: parseInt(sh[2], 10), url: null, repo: sh[1], raw };
  }

  return { error: "unrecognized format", exitCode: 3 };
}

// ---------------------------------------------------------------------------
// fetchPRMetadata — multi-host adapter
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT = 10_000;

/**
 * @param {{ host: string|null, number: number, url?: string }} target
 * @param {{ exec?: Function, timeout?: number }} [deps]
 * @returns {Promise<PRMetadata>}
 */
export async function fetchPRMetadata(target, deps = {}) {
  const doExec = deps.exec ?? nodeExec;
  const timeout = deps.timeout ?? FETCH_TIMEOUT;

  // Infer host from git remote if not determined
  let host = target.host;
  if (!host) {
    host = await inferHostFromRemote(doExec);
  }

  try {
    switch (host) {
      case "github": return await fetchGitHub(target, doExec, timeout);
      case "gitlab": return await fetchGitLab(target, doExec, timeout);
      case "bitbucket": return await fetchBitbucket(target, doExec, timeout);
      default: return { ...emptyMeta(target, host), fetcherUsed: "none", warning: "unknown host" };
    }
  } catch (err) {
    return { ...emptyMeta(target, host), fetcherUsed: "none", warning: err.message };
  }
}

function emptyMeta(target, host) {
  return {
    host: host ?? "unknown",
    number: target.number,
    title: "",
    branch: "",
    baseBranch: "",
    description: "",
    commit: "",
    url: target.url ?? "",
  };
}

function execAsync(fn, cmd, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout (${timeout}ms)`)), timeout);
    fn(cmd, { timeout }, (err, stdout) => {
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

async function fetchGitHub(target, execFn, timeout) {
  const out = await execAsync(execFn, `gh pr view ${target.number} --json title,headRefName,baseRefName,body,url`, timeout);
  const d = JSON.parse(out);
  return {
    host: "github",
    number: target.number,
    title: d.title ?? "",
    branch: d.headRefName ?? "",
    baseBranch: d.baseRefName ?? "",
    description: d.body ?? "",
    commit: "",
    url: d.url ?? target.url ?? "",
    fetcherUsed: "gh",
  };
}

async function fetchGitLab(target, execFn, timeout) {
  const out = await execAsync(execFn, `glab mr view ${target.number} --output json`, timeout);
  const d = JSON.parse(out);
  return {
    host: "gitlab",
    number: target.number,
    title: d.title ?? "",
    branch: d.source_branch ?? "",
    baseBranch: d.target_branch ?? "",
    description: d.description ?? "",
    commit: "",
    url: d.web_url ?? target.url ?? "",
    fetcherUsed: "glab",
  };
}

async function fetchBitbucket(target, _execFn, timeout) {
  if (!process.env.BITBUCKET_TOKEN) {
    return { ...emptyMeta(target, "bitbucket"), fetcherUsed: "none", warning: "BITBUCKET_TOKEN not set" };
  }
  const repo = target.repo ?? await inferRepoSlug(_execFn);
  if (!repo) {
    return { ...emptyMeta(target, "bitbucket"), fetcherUsed: "none", warning: "cannot determine repo slug" };
  }
  // Validate repo format to prevent injection
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repo)) {
    return { ...emptyMeta(target, "bitbucket"), fetcherUsed: "none", warning: "invalid repo slug format" };
  }
  const safeNum = Math.max(1, Math.min(target.number, 999999));
  const token = process.env.BITBUCKET_TOKEN;
  const url = `https://api.bitbucket.org/2.0/repositories/${repo}/pullrequests/${safeNum}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ...emptyMeta(target, "bitbucket"), fetcherUsed: "none", warning: `Bitbucket API ${res.status}` };
    }
    const d = await res.json();
    return {
      host: "bitbucket",
      number: target.number,
      title: d.title ?? "",
      branch: d.source?.branch?.name ?? "",
      baseBranch: d.destination?.branch?.name ?? "",
      description: d.description ?? "",
      commit: d.source?.commit?.hash ?? "",
      url: d.links?.html?.href ?? target.url ?? "",
      fetcherUsed: "fetch-bitbucket",
    };
  } catch (err) {
    return { ...emptyMeta(target, "bitbucket"), fetcherUsed: "none", warning: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function inferHostFromRemote(execFn) {
  try {
    const out = await execAsync(execFn, "git remote get-url origin", 5000);
    if (out.includes("github")) return "github";
    if (out.includes("gitlab")) return "gitlab";
    if (out.includes("bitbucket")) return "bitbucket";
    return null;
  } catch {
    return null;
  }
}

async function inferRepoSlug(execFn) {
  try {
    const out = await execAsync(execFn, "git remote get-url origin", 5000);
    const m = out.trim().match(/[/:]([^/]+\/[^/\s]+?)(?:\.git)?$/);
    // Validate extracted slug: only allow safe characters
    if (m && /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(m[1])) {
      return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// resolveSlug
// ---------------------------------------------------------------------------

/**
 * Resolve PR metadata to a Forge slug via ordered sources.
 * @param {{ title: string, branch: string, description: string }} meta
 * @returns {{ slug: string, resolutionPath: string }|null}
 */
export function resolveSlug(meta) {
  // 1. PR title prefix: [spec:slug] or trailing (slug)
  const titlePrefix = meta.title.match(/^\[spec:([a-z0-9-]+)\]/);
  if (titlePrefix) return { slug: titlePrefix[1], resolutionPath: "title" };

  const titleSuffix = meta.title.match(/\(([a-z0-9-]+)\)\s*$/);
  if (titleSuffix) return { slug: titleSuffix[1], resolutionPath: "title" };

  // 2. Branch name: forge/slug or feature/slug or spec/slug
  const branchMatch = meta.branch.match(/^(?:forge|feature|spec)\/([a-z0-9-]+)/);
  if (branchMatch) return { slug: branchMatch[1], resolutionPath: "branch" };

  // 3. PR description link: .tinkerman/specs/slug/
  const descMatch = meta.description.match(/\.tinkerman\/specs\/([a-z0-9-]+)\//);
  if (descMatch) return { slug: descMatch[1], resolutionPath: "description" };

  // 4. & 5. (decisions + interactive) require FS access — handled in main flow
  return null;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const CACHE_FILE = ".tinkerman/.pr-slug-cache.json";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function readCache(forgeRoot, key) {
  if (process.env.FORGE_NO_CACHE === "1") return null;
  try {
    const data = await readFile(join(forgeRoot, CACHE_FILE), "utf-8");
    const cache = JSON.parse(data);
    const entry = cache[key];
    if (!entry) return null;
    const age = Date.now() - new Date(entry.resolvedAt).getTime();
    if (age > CACHE_TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

export async function writeCache(forgeRoot, key, entry) {
  if (process.env.FORGE_NO_CACHE === "1") return;
  try {
    let cache = {};
    try {
      const data = await readFile(join(forgeRoot, CACHE_FILE), "utf-8");
      cache = JSON.parse(data);
    } catch { /* empty or missing — start fresh */ }
    cache[key] = entry;
    const dir = join(forgeRoot, ".tinkerman");
    await mkdir(dir, { recursive: true });
    await writeFile(join(forgeRoot, CACHE_FILE), JSON.stringify(cache, null, 2) + "\n");
  } catch { /* silent — cache write failure is non-blocking */ }
}

// ---------------------------------------------------------------------------
// loadContextBundle
// ---------------------------------------------------------------------------

/**
 * @param {string} slug
 * @param {{ forgeRoot: string }} opts
 * @returns {Promise<object>}
 */
export async function loadContextBundle(slug, opts) {
  const root = opts.forgeRoot ?? process.cwd();
  const result = {
    slug,
    phase: "unknown",
    specFiles: [],
    planFile: null,
    progressFile: null,
    reviews: [],
    adrs: [],
    missing: [],
  };

  // Spec directory
  const specDir = join(root, ".tinkerman", "specs", slug);
  try {
    const files = await readdir(specDir);
    result.specFiles = files.filter((f) => f.endsWith(".md")).map((f) => join(specDir, f));
  } catch {
    result.missing.push(`.tinkerman/specs/${slug}/`);
  }

  // Plan file
  const planPath = join(root, ".tinkerman", "plans", `${slug}.md`);
  try {
    await access(planPath);
    result.planFile = planPath;
  } catch {
    result.missing.push(`.tinkerman/plans/${slug}.md`);
  }

  // Progress file
  const progressPath = join(root, ".tinkerman", "progress", `${slug}.md`);
  try {
    await access(progressPath);
    result.progressFile = progressPath;
  } catch {
    result.missing.push(`.tinkerman/progress/${slug}.md`);
  }

  // Infer phase from progress or status
  try {
    const statusContent = await readFile(join(root, ".tinkerman", "status.md"), "utf-8");
    const phaseMatch = statusContent.match(/^phase:\s*"?(.+?)"?\s*$/m);
    if (phaseMatch) result.phase = phaseMatch[1].trim();
  } catch { /* no status file */ }

  return result;
}

// ---------------------------------------------------------------------------
// updateStatus
// ---------------------------------------------------------------------------

/**
 * @param {string} slug
 * @param {PRMetadata} metadata
 * @param {{ forgeRoot: string, interactive?: boolean }} opts
 */
/** Sanitize a string for safe YAML double-quoted value. */
function yamlSafe(str) {
  return String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export async function updateStatus(slug, metadata, opts = {}) {
  const root = opts.forgeRoot ?? process.cwd();
  const statusPath = join(root, ".tinkerman", "status.md");
  const timestamp = new Date().toISOString();
  const safeSlug = yamlSafe(slug);
  const safeBranch = yamlSafe(metadata.branch);
  const safeBase = yamlSafe(metadata.baseBranch);
  const safeUrl = metadata.url ? yamlSafe(metadata.url) : null;

  // Check for conflicting status
  try {
    const existing = await readFile(statusPath, "utf-8");
    const slugMatch = existing.match(/^current_task:\s*"?(.+?)"?\s*$/m);
    if (slugMatch && slugMatch[1].trim() !== slug) {
      if (opts.interactive !== false) {
        process.stderr.write(`⚠ status.md points to "${slugMatch[1].trim()}", overwriting with "${safeSlug}"\n`);
      } else {
        throw new Error(`status.md conflict: current_task="${slugMatch[1].trim()}", refusing to overwrite with "${safeSlug}"`);
      }
    }
  } catch (err) {
    if (err.message.startsWith("status.md conflict")) throw err;
  }

  const content = [
    "---",
    `current_task: "${safeSlug}"`,
    `tier: "standard"`,
    `task_type: "resume-from-pr"`,
    `project_phase: "resume"`,
    `phase: "resume"`,
    `pr_number: ${metadata.number}`,
    safeUrl ? `pr_url: "${safeUrl}"` : null,
    `branch: "${safeBranch}"`,
    `base_branch: "${safeBase}"`,
    `updated: "${timestamp}"`,
    `updated_by: "resume-from-pr"`,
    "---",
    "",
    "# Forge Status",
    "",
    `Last resumed from PR #${metadata.number} at ${timestamp}.`,
    "",
  ].filter(Boolean).join("\n") + "\n";

  await writeFile(statusPath, content);
  return content;
}

// ---------------------------------------------------------------------------
// writeRunReport
// ---------------------------------------------------------------------------

/**
 * @param {object} params
 * @param {string} params.forgeRoot
 * @param {string} params.target
 * @param {string} params.host
 * @param {number} params.number
 * @param {boolean} params.success
 * @param {boolean} params.fallbackUsed
 * @param {string} params.slug
 * @param {string} params.resolutionPath
 * @param {string} params.startedAt
 * @param {object} [params.metadata]
 * @param {object} [params.bundle]
 * @param {string[]} [params.warnings]
 */
export async function writeRunReport(params) {
  const { forgeRoot, target, host, number: prNumber, success, fallbackUsed, slug, resolutionPath, startedAt, metadata, bundle, warnings } = params;
  const finishedAt = new Date().toISOString();
  const ts = startedAt.replace(/[:.]/g, "-");
  const runsDir = join(forgeRoot ?? process.cwd(), ".tinkerman", "runs");
  await mkdir(runsDir, { recursive: true });

  const report = [
    "---",
    `command: "forge resume --from-pr"`,
    `target: "${target}"`,
    `host: ${host}`,
    `number: ${prNumber}`,
    `success: ${success}`,
    `fallback_used: ${fallbackUsed}`,
    `slug: ${slug}`,
    `resolution_path: "${resolutionPath}"`,
    `started_at: "${startedAt}"`,
    `finished_at: "${finishedAt}"`,
    "---",
    "",
    "# Resume Run Report",
    "",
    "## Fetched Metadata",
    metadata ? `- title: ${metadata.title}\n- branch: ${metadata.branch}` : "(none)",
    "",
    "## Context Bundle",
    bundle ? [
      `- spec: ${bundle.specFiles.length} files`,
      `- plan: ${bundle.planFile ? "1 file" : "missing"}`,
      `- progress: ${bundle.progressFile ? "1 file" : "missing"}`,
      `- reviews: ${bundle.reviews.length} files`,
      `- missing: ${bundle.missing.length > 0 ? bundle.missing.join(", ") : "(none)"}`,
    ].join("\n") : "(none)",
    "",
    "## Warnings",
    warnings && warnings.length > 0 ? warnings.map((w) => `- ${w}`).join("\n") : "(none)",
    "",
  ].join("\n") + "\n";

  const reportPath = join(runsDir, `${ts}-resume-from-pr.md`);
  await writeFile(reportPath, report);
  return reportPath;
}

// ---------------------------------------------------------------------------
// OTel
// ---------------------------------------------------------------------------

function emitOTel(attributes) {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT && !process.env.OTEL_EXPORTER_OTLP_HEADERS) return;
  try {
    process.stderr.write(`[OTel] forge.resume.from_pr ${JSON.stringify(attributes)}\n`);
  } catch { /* silent */ }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const positional = args.filter((a) => a !== "--json" && a !== "--help");

  if (args.includes("--help") || positional.length === 0) {
    process.stdout.write([
      "Usage: node scripts/resume-from-pr.mjs <url-or-number> [--json]",
      "",
      "Env:  FORGE_ROOT        (optional, default project root)",
      "      FORGE_NO_CACHE=1  (skip slug cache)",
      "      FORGE_INTERACTIVE=0 (non-interactive, exit 1 on ambiguity)",
      "",
      "Exit: 0 success, 1 PR/slug fail, 2 CC version, 3 arg error",
    ].join("\n") + "\n");
    process.exit(args.includes("--help") ? 0 : 3);
  }

  const startedAt = new Date().toISOString();
  const forgeRoot = process.env.FORGE_ROOT ?? process.cwd();
  const warnings = [];

  // Parse target
  const target = parseTarget(positional[0]);
  if (target.error) {
    process.stderr.write(`Error: ${target.error}\n`);
    process.exit(target.exitCode);
  }

  // Fetch metadata
  const metadata = await fetchPRMetadata(target);
  if (metadata.warning) warnings.push(metadata.warning);

  // Resolve slug (with cache)
  const cacheKey = `${metadata.host}:${metadata.number}`;
  let cached = await readCache(forgeRoot, cacheKey);
  let slugResult;
  if (cached) {
    slugResult = { slug: cached.slug, resolutionPath: `cache:${cached.resolutionPath}` };
    warnings.push("cache hit");
  } else {
    slugResult = resolveSlug(metadata);
  }

  if (!slugResult) {
    // Try decisions directory
    slugResult = await resolveSlugFromDecisions(forgeRoot, metadata.number, metadata.url);
  }

  if (!slugResult) {
    const msg = `Cannot resolve slug for PR #${metadata.number}. Sources exhausted: title, branch, description, decisions.`;
    if (process.env.FORGE_INTERACTIVE === "0") {
      process.stderr.write(`${msg}\n`);
      process.exit(1);
    }
    // Interactive fallback — list available specs
    const specs = await listAvailableSpecs(forgeRoot);
    if (specs.length === 0) {
      process.stderr.write(`${msg}\nNo specs found in .tinkerman/specs/.\n`);
      process.exit(1);
    }
    process.stdout.write(`${msg}\nAvailable specs:\n${specs.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}\n`);
    process.exit(1);
  }

  // Write cache
  if (!cached) {
    await writeCache(forgeRoot, cacheKey, { slug: slugResult.slug, resolutionPath: slugResult.resolutionPath, resolvedAt: startedAt });
  }

  // Load context bundle
  const bundle = await loadContextBundle(slugResult.slug, { forgeRoot });

  // Update status
  try {
    await updateStatus(slugResult.slug, metadata, { forgeRoot, interactive: process.env.FORGE_INTERACTIVE !== "0" });
  } catch (err) {
    warnings.push(err.message);
  }

  // Write run report
  const reportPath = await writeRunReport({
    forgeRoot,
    target: positional[0],
    host: metadata.host,
    number: metadata.number,
    success: true,
    fallbackUsed: metadata.fetcherUsed === "none",
    slug: slugResult.slug,
    resolutionPath: slugResult.resolutionPath,
    startedAt,
    metadata,
    bundle,
    warnings,
  });

  // OTel
  emitOTel({ pr_number: metadata.number, host: metadata.host, slug: slugResult.slug, success: true, fallback_used: metadata.fetcherUsed === "none" });

  // Output
  const output = {
    slug: slugResult.slug,
    phase: bundle.phase,
    pr_number: metadata.number,
    pr_url: metadata.url,
    branch: metadata.branch,
    resolutionPath: slugResult.resolutionPath,
    specFiles: bundle.specFiles,
    planFile: bundle.planFile,
    progressFile: bundle.progressFile,
    missing: bundle.missing,
    warnings,
    reportPath,
  };

  if (jsonMode) {
    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  } else {
    process.stdout.write([
      "Resume from PR ready:",
      `  Spec: ${output.slug} (phase: ${output.phase})`,
      `  PR: #${output.pr_number} (${output.resolutionPath})`,
      `  Spec files: ${output.specFiles.length}`,
      output.planFile ? `  Plan: found` : "  Plan: ⚠ missing",
      output.progressFile ? `  Progress: found` : "  Progress: ⚠ missing",
      output.missing.length > 0 ? `  ⚠ Missing: ${output.missing.join(", ")}` : "",
      warnings.length > 0 ? `  Warnings: ${warnings.join("; ")}` : "",
    ].filter(Boolean).join("\n") + "\n");
  }
}

// Helper: resolve slug from .tinkerman/decisions/
async function resolveSlugFromDecisions(forgeRoot, prNumber, prUrl) {
  const decDir = join(forgeRoot, ".tinkerman", "decisions");
  try {
    const files = await readdir(decDir);
    for (const f of files) {
      if (!f.endsWith(".md")) continue;
      const content = await readFile(join(decDir, f), "utf-8");
      if (content.includes(`pr: ${prNumber}`) || (prUrl && content.includes(prUrl))) {
        const slugMatch = content.match(/^slug:\s*"?(.+?)"?\s*$/m);
        if (slugMatch) return { slug: slugMatch[1].trim(), resolutionPath: "decisions" };
      }
    }
  } catch { /* directory missing */ }
  return null;
}

// Helper: list available specs
async function listAvailableSpecs(forgeRoot) {
  try {
    const entries = await readdir(join(forgeRoot, ".tinkerman", "specs"));
    return entries.filter((e) => !e.startsWith("."));
  } catch {
    return [];
  }
}

// Run if executed directly
const isMain = process.argv[1]?.endsWith("resume-from-pr.mjs");
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`Fatal: ${err.message}\n`);
    process.exit(1);
  });
}
