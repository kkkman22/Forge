/**
 * check-spec-close-coverage.mjs — behavior + integration tests.
 *
 * Spec-close-coverage gate: prevents a spec from being marked `status: completed`
 * when its requirements.md is a hollow shell (no SHALL / no REQ heading).
 * Also emits a soft warning when tasks.md shows 0 done with open tasks remaining
 * (the work may legitimately live elsewhere, e.g. inside a skill — not blocked).
 *
 * Root cause this closes: pms-pack-v1 was closed `completed` with Requirement 4.5
 * (a SHALL) never delivered. The close paths keyed off branch/commit metadata,
 * never on requirement coverage. This gate fires only on the transition TO
 * completed (never retroactively — mark-specs-completed.mjs:169's
 * COMPLETABLE_STATUSES guard excludes already-completed specs).
 *
 * 对应 spec: spec-close-coverage-gate（治理：只防增量）。
 */

import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "scripts", "check-spec-close-coverage.mjs");
const MARK_SCRIPT = join(process.cwd(), "scripts", "mark-specs-completed.mjs");

/** Run the coverage script against a slug + specs root. */
function runCoverage(
  args: string[],
  env: Record<string, string> = {},
): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync("node", [SCRIPT, ...args], {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, ...env },
    });
    return { stdout, stderr: "", status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", status: e.status ?? 1 };
  }
}

/** Run mark-specs-completed.mjs against a project root (which must contain
 *  .forge/specs/<slug>/ fixtures and be a git repo whose HEAD log carries
 *  the slug via a [spec:<slug>] annotation or forge/<slug> branch).
 *  MARK_SPECS_RANGE is pinned to HEAD and cwd to projectRoot so a
 *  single-commit throwaway repo works AND the coverage gate's `git log`
 *  (which reads the HEAD commit message for a skip tag) reads the hermetic
 *  repo, not the host repo. */
function runMark(
  projectRoot: string,
  env: Record<string, string> = {},
): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync("node", [MARK_SCRIPT, "--root", projectRoot], {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      cwd: projectRoot,
      env: { ...process.env, MARK_SPECS_RANGE: "HEAD", ...env },
    });
    return { stdout, stderr: "", status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", status: e.status ?? 1 };
  }
}

/** Create a hermetic throwaway git repo with one commit whose message carries
 *  [spec:<slug>], so mark-specs-completed.mjs detects <slug>. */
function makeRepoWithSlug(repoRoot: string, slug: string) {
  execSync(`git init -q && git config user.email t@t.t && git config user.name t`, {
    cwd: repoRoot,
  });
  writeFileSync(join(repoRoot, "README"), "x");
  execSync('git add -A && git commit -q -m "feat: work [spec:' + slug + ']"', {
    cwd: repoRoot,
  });
}

/** Minimal requirements.md frontmatter. */
function reqFrontmatter(status: string, feature: string): string {
  return `---\nstatus: ${status}\nfeature: ${feature}\n---\n`;
}

// ---------------------------------------------------------------------------
// Helpers: fixture authoring
// ---------------------------------------------------------------------------

function writeSpec(
  root: string,
  slug: string,
  opts: {
    status?: string;
    body?: string;
    tasks?: string;
  } = {},
) {
  mkdirSync(join(root, slug), { recursive: true });
  const status = opts.status ?? "approved";
  writeFileSync(
    join(root, slug, "requirements.md"),
    `${reqFrontmatter(status, slug)}\n# ${slug}\n\n${opts.body ?? ""}\n`,
  );
  if (opts.tasks !== undefined) {
    writeFileSync(join(root, slug, "tasks.md"), `${reqFrontmatter(status, slug)}\n${opts.tasks}\n`);
  }
}

// ---------------------------------------------------------------------------
// CLI surface
// ---------------------------------------------------------------------------

describe("check-spec-close-coverage.mjs — --help", () => {
  it("--help exits 0 and documents the gate", () => {
    const { stdout, status } = runCoverage(["--help"]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/Usage:/);
    expect(stdout.toLowerCase()).toContain("completed");
  });

  it("missing slug arg exits non-zero with usage hint", () => {
    const { stderr, status } = runCoverage([]);
    expect(status).not.toBe(0);
    expect(stderr.toLowerCase()).toContain("slug");
  });
});

// ---------------------------------------------------------------------------
// Core coverage rules
// ---------------------------------------------------------------------------

describe("check-spec-close-coverage.mjs — hard block on hollow requirements", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "forge-close-cov-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("BLOCKS (exit 1) a spec with no SHALL and no REQ heading", () => {
    writeSpec(root, "hollow", {
      body: "# Hollow\n\nThis is just a stub pointing at design.md. No requirements written.",
    });
    const { stdout, stderr, status } = runCoverage(["hollow", "--specs-dir", root]);
    expect(status).toBe(1);
    expect(stderr.toLowerCase() + stdout.toLowerCase()).toMatch(/shall|requirement|hollow|reject/);
  });

  it("PASSES (exit 0) a spec containing a SHALL clause", () => {
    writeSpec(root, "real", {
      body: "## Requirement 1: thing\n\nTHE system SHALL do the thing.",
    });
    const { stdout, status } = runCoverage(["real", "--specs-dir", root]);
    expect(status).toBe(0);
    expect(stdout.toLowerCase()).not.toMatch(/reject/);
  });

  it.each([
    ["### Requirement 1: foo", "Requirement-N heading"],
    ["## REQ-01: foo", "REQ-NN heading"],
    ["### R1: foo", "RN heading"],
    ["### 1. foo", "numbered heading"],
  ])("PASSES a spec with heading '%s' even without the word SHALL", (heading) => {
    writeSpec(root, "varied", { body: `${heading}\n\nSome prose.` });
    const { status } = runCoverage(["varied", "--specs-dir", root]);
    expect(status).toBe(0);
  });
});

describe("check-spec-close-coverage.mjs — soft warning on tasks not done", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "forge-close-cov-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("PASSES (exit 0) but WARNS when tasks show 0 done / N open", () => {
    writeSpec(root, "undone", {
      body: "## Requirement 1: x\n\nTHE system SHALL x.",
      tasks: "- [ ] task a\n- [ ] task b\n",
    });
    const { stdout, status } = runCoverage(["undone", "--specs-dir", root]);
    expect(status).toBe(0); // soft — not blocked
    expect(stdout.toLowerCase()).toMatch(/warn/);
  });

  it("PASSES cleanly when tasks are all done", () => {
    writeSpec(root, "done", {
      body: "## Requirement 1: x\n\nTHE system SHALL x.",
      tasks: "- [x] task a\n",
    });
    const { stdout, status } = runCoverage(["done", "--specs-dir", root]);
    expect(status).toBe(0);
    expect(stdout.toLowerCase()).not.toMatch(/warn/);
  });

  it("does not warn when there is no tasks.md at all", () => {
    writeSpec(root, "notasks", {
      body: "## Requirement 1: x\n\nTHE system SHALL x.",
    });
    const { stdout, status } = runCoverage(["notasks", "--specs-dir", root]);
    expect(status).toBe(0);
    expect(stdout.toLowerCase()).not.toMatch(/warn/);
  });
});

describe("check-spec-close-coverage.mjs — missing spec handling", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "forge-close-cov-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("non-existent slug exits non-zero (cannot vet a missing spec)", () => {
    const { status, stderr } = runCoverage(["no-such-spec", "--specs-dir", root]);
    expect(status).not.toBe(0);
    expect((stderr + "").toLowerCase()).toContain("no-such-spec");
  });
});

// ---------------------------------------------------------------------------
// Integration: mark-specs-completed.mjs (Path A) honors the gate
// ---------------------------------------------------------------------------

describe("mark-specs-completed.mjs — blocked by coverage gate on hollow spec", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "forge-close-cov-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /**
   * End-to-end: mark-specs-completed.mjs reads slugs from `git log` in the
   * project root. We build a hermetic throwaway git repo whose HEAD commit
   * carries `[spec:<slug>]`, point mark-specs at it via --root, and assert the
   * coverage gate blocks hollow specs (exit non-zero, file unchanged) while
   * letting real specs through.
   */

  it("BLOCKS a hollow spec: exit non-zero, status NOT flipped, file unchanged", () => {
    const slug = "hollow-integration-fixture";
    const repo = mkdtempSync(join(tmpdir(), "forge-markrepo-"));
    const specsDir = join(repo, ".forge", "specs");
    try {
      writeSpec(specsDir, slug, {
        status: "approved",
        body: "# Hollow\n\nStub only — a pointer at design.md with no obligation clauses.",
      });
      makeRepoWithSlug(repo, slug);

      const reqPath = join(specsDir, slug, "requirements.md");
      const before = readFileSync(reqPath, "utf-8");

      const result = runMark(repo);
      expect(result.status).not.toBe(0); // gate aborted the flip
      expect((result.stderr + result.stdout).toLowerCase()).toMatch(/block|hollow|coverage/);
      // File must be untouched — the gate prevented writeFile
      expect(readFileSync(reqPath, "utf-8")).toBe(before);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("LET a real spec through: status flipped to completed", () => {
    const slug = "real-integration-fixture";
    const repo = mkdtempSync(join(tmpdir(), "forge-markrepo-"));
    const specsDir = join(repo, ".forge", "specs");
    try {
      writeSpec(specsDir, slug, {
        status: "approved",
        body: "## Requirement 1: thing\n\nTHE system SHALL do the thing.",
        tasks: "- [x] done task\n",
      });
      makeRepoWithSlug(repo, slug);

      const result = runMark(repo);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("real-integration-fixture");

      const after = readFileSync(join(specsDir, slug, "requirements.md"), "utf-8");
      expect(after).toMatch(/^status: completed/m);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("FORGE_SKIP_SPEC_COMPLETION_COVERAGE=1 lets even a hollow spec through mark-specs", () => {
    const slug = "hollow-skip-integration";
    const repo = mkdtempSync(join(tmpdir(), "forge-markrepo-"));
    const specsDir = join(repo, ".forge", "specs");
    try {
      writeSpec(specsDir, slug, {
        status: "approved",
        body: "# Hollow\n\nStub only.",
      });
      makeRepoWithSlug(repo, slug);

      const result = runMark(repo, { FORGE_SKIP_SPEC_COMPLETION_COVERAGE: "1" });
      expect(result.status).toBe(0);
      expect(result.stdout.toLowerCase()).toMatch(/skip/);
      const after = readFileSync(join(specsDir, slug, "requirements.md"), "utf-8");
      expect(after).toMatch(/^status: completed/m);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
