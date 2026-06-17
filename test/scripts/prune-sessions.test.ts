import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(ROOT, "scripts", "prune-sessions.sh");

/**
 * Spec: session-journal-retention
 *
 * Behavioural tests for prune-sessions.sh. Each test constructs a synthetic
 * `.forge/` tree in a temp dir, runs the script via bash, and asserts on the
 * resulting filesystem state. mtimes are set with `touch -t` (macOS + GNU
 * compatible absolute-timestamp form).
 */
describe("prune-sessions.sh (spec: session-journal-retention)", () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), "forge-prune-sessions-"));
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  /** Run the script inside `workdir`, returning trimmed stdout. */
  const run = (args: string[] = []): string =>
    execFileSync("bash", [SCRIPT, ...args], {
      cwd: workdir,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    }).trim();

  /** Set a file's mtime to ~30 days ago via touch -t (CCYYMMDDhhmm). */
  const ageFile = (path: string): void => {
    execFileSync("touch", ["-t", "202605180000", path], { stdio: "ignore" });
  };

  /** Create the sessions dir + config with given retention/keep settings. */
  const scaffold = (opts: { retention?: number; keep?: number } = {}): string => {
    const sessionsDir = join(workdir, ".forge", "knowledge", "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    const retention = opts.retention ?? 10;
    const keep = opts.keep ?? 2;
    writeFileSync(
      join(workdir, ".forge", "config.md"),
      `---\nsession_retention_days: ${retention}\nsession_keep_recent: ${keep}\n---\n`,
    );
    return sessionsDir;
  };

  const sessionPath = (name: string): string =>
    join(workdir, ".forge", "knowledge", "sessions", name);

  // -------------------------------------------------------------------------
  // Req1 + Req2: expired journals are pruned; recent ones kept
  // -------------------------------------------------------------------------

  it("prunes expired journals and keeps recent ones", () => {
    const dir = scaffold({ retention: 10, keep: 1 });
    // All three files expired. keep_recent=1 protects the single newest;
    // the other two are pruned. `newer` is made strictly newer via touch.
    const oldA = join(dir, "2026-01-01-oldA.md");
    const oldB = join(dir, "2026-01-01-oldB.md");
    const newer = join(dir, "2026-01-02-newer.md");
    writeFileSync(oldA, "# old\n");
    ageFile(oldA);
    writeFileSync(oldB, "# old\n");
    ageFile(oldB);
    writeFileSync(newer, "# old\n");
    ageFile(newer);
    execFileSync("touch", ["-t", "202605200000", newer], { stdio: "ignore" });

    const out = run();

    // newest (2026-01-02) survives keep_recent=1; oldA/oldB pruned.
    expect(existsSync(sessionPath("2026-01-02-newer.md"))).toBe(true);
    expect(existsSync(sessionPath("2026-01-01-oldA.md"))).toBe(false);
    expect(existsSync(sessionPath("2026-01-01-oldB.md"))).toBe(false);
    expect(out).toContain("pruned=2");
  });

  // -------------------------------------------------------------------------
  // Req3 AC1: keep_recent protects newest N even when all are expired
  // -------------------------------------------------------------------------

  it("protects the newest N journals even when all are expired", () => {
    const dir = scaffold({ retention: 10, keep: 2 });
    // Five files, ALL expired. keep_recent=2 must save the two newest by mtime.
    const files = ["a", "b", "c", "d", "e"];
    for (const n of files) {
      const p = join(dir, `2026-01-01-${n}.md`);
      writeFileSync(p, "# expired\n");
      ageFile(p);
    }
    // Make `a` and `b` slightly newer (1 day ago) so they are the kept set.
    execFileSync("touch", ["-t", "202606160000", sessionPath("2026-01-01-a.md")], {
      stdio: "ignore",
    });
    execFileSync("touch", ["-t", "202606160000", sessionPath("2026-01-01-b.md")], {
      stdio: "ignore",
    });

    run();

    expect(existsSync(sessionPath("2026-01-01-a.md"))).toBe(true);
    expect(existsSync(sessionPath("2026-01-01-b.md"))).toBe(true);
    expect(existsSync(sessionPath("2026-01-01-c.md"))).toBe(false);
    expect(existsSync(sessionPath("2026-01-01-d.md"))).toBe(false);
    expect(existsSync(sessionPath("2026-01-01-e.md"))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Req1 AC4: dry-run reports but does not delete
  // -------------------------------------------------------------------------

  it("dry-run does not delete anything and reports candidates", () => {
    const dir = scaffold({ retention: 10, keep: 1 });
    // Two expired files: keep_recent=1 protects the newer one, so the older
    // one is the prune candidate that "would prune" must report.
    const stale = join(dir, "2026-01-01-stale.md");
    writeFileSync(stale, "# stale\n");
    ageFile(stale); // ~30 days ago
    const newer = join(dir, "2026-01-02-newer.md");
    writeFileSync(newer, "# newer-but-also-expired\n");
    ageFile(newer); // also ~30 days ago, but newer by filename/mtime tiebreak
    // Force `newer` to be strictly newer so it wins the single keep_recent slot.
    execFileSync("touch", ["-t", "202605200000", newer], { stdio: "ignore" });

    const out = run(["--dry-run"]);

    expect(existsSync(stale)).toBe(true); // still present
    expect(existsSync(newer)).toBe(true); // still present
    expect(out).toContain("would prune");
    expect(out).toContain("2026-01-01-stale.md");
  });

  // -------------------------------------------------------------------------
  // Req2 AC2: config field missing/invalid → default fallback + warning
  // -------------------------------------------------------------------------

  it("falls back to defaults when config fields are absent", () => {
    const dir = join(workdir, ".forge", "knowledge", "sessions");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(workdir, ".forge", "config.md"), "---\n---\n");
    // A file 1 day old: well within default retention (90), must survive.
    writeFileSync(join(dir, "2026-06-16-recent.md"), "# recent\n");

    const out = run();

    expect(existsSync(join(dir, "2026-06-16-recent.md"))).toBe(true);
    expect(out).toContain("retention=90");
    expect(out).toContain("keep_recent=5");
  });

  it("warns and falls back when session_retention_days is non-positive", () => {
    const dir = join(workdir, ".forge", "knowledge", "sessions");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(workdir, ".forge", "config.md"),
      "---\nsession_retention_days: 0\nsession_keep_recent: 5\n---\n",
    );
    writeFileSync(join(dir, "2026-06-16-x.md"), "# x\n");

    // Warning is written to stderr; capture both streams by merging.
    const result = execFileSync("bash", ["-c", `"${SCRIPT}" 2>&1`], {
      cwd: workdir,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    });

    expect(result).toContain("invalid session_retention_days='0'");
    expect(result).toContain("using default 90");
  });

  // -------------------------------------------------------------------------
  // Req3 AC2: journals referenced by solutions/ are protected
  // -------------------------------------------------------------------------

  it("protects journals referenced by solutions/ source_session", () => {
    const dir = scaffold({ retention: 10, keep: 1 });
    const solutionsDir = join(workdir, ".forge", "knowledge", "solutions");
    mkdirSync(solutionsDir, { recursive: true });

    // An expired journal that is referenced — must be protected.
    const referenced = join(dir, "2026-01-01-referenced.md");
    writeFileSync(referenced, "# referenced\n");
    ageFile(referenced);
    // An expired journal NOT referenced — must be pruned.
    const orphan = join(dir, "2026-01-01-orphan.md");
    writeFileSync(orphan, "# orphan\n");
    ageFile(orphan);

    // keep_recent=1 protects only the single newest; both expired files are
    // older than a fresh touch, so the ONLY thing saving `referenced` is the
    // solutions link. Make `orphan` newer than `referenced` so keep_recent=1
    // saves `orphan` (proving protection of `referenced` comes from the link,
    // not from the mtime rule).
    execFileSync("touch", ["-t", "202605200000", sessionPath("2026-01-01-orphan.md")], {
      stdio: "ignore",
    });

    writeFileSync(
      join(solutionsDir, "some-solution.md"),
      "---\nsource_session: 2026-01-01-referenced.md\n---\n# body\n",
    );

    run();

    expect(existsSync(sessionPath("2026-01-01-referenced.md"))).toBe(true);
    // orphan was the newest single expired file → protected by keep_recent=1.
    expect(existsSync(sessionPath("2026-01-01-orphan.md"))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Req1 AC: sessions/ missing → silent exit 0
  // -------------------------------------------------------------------------

  it("exits cleanly when sessions/ directory does not exist", () => {
    mkdirSync(join(workdir, ".forge"), { recursive: true });
    writeFileSync(join(workdir, ".forge", "config.md"), "---\n---\n");

    const out = run();

    expect(out).toContain("nothing to prune");
  });

  it("exits cleanly when sessions/ exists but is empty", () => {
    scaffold({ retention: 10, keep: 2 });
    const out = run();
    expect(out).toContain("No session journals");
  });

  // -------------------------------------------------------------------------
  // --help contract (§2.8 Scripts as Black Box)
  // -------------------------------------------------------------------------

  it("--help prints usage with 'Usage:' (validate-scripts-help contract)", () => {
    const out = run(["--help"]);
    expect(out).toContain("Usage:");
    expect(out).toContain("--dry-run");
  });

  // -------------------------------------------------------------------------
  // tool-health.md audit summary is written on real run (Req4 AC2)
  // -------------------------------------------------------------------------

  it("appends a summary line to tool-health.md on a real run", () => {
    const dir = scaffold({ retention: 10, keep: 1 });
    // Two expired files so one is pruned (keep_recent=1 saves the newer).
    const stale = join(dir, "2026-01-01-stale.md");
    writeFileSync(stale, "# stale\n");
    ageFile(stale);
    const newer = join(dir, "2026-01-02-newer.md");
    writeFileSync(newer, "# newer\n");
    ageFile(newer);
    execFileSync("touch", ["-t", "202605200000", newer], { stdio: "ignore" });

    run();

    const health = join(workdir, ".forge", "knowledge", "tool-health.md");
    expect(existsSync(health)).toBe(true);
    const lines = execFileSync("cat", [health], { encoding: "utf-8" }).trim().split("\n");
    expect(lines[lines.length - 1]).toMatch(/prune-sessions:.*pruned=1.*dry_run=no/);
  });

  it("does NOT write tool-health.md on dry-run", () => {
    const dir = scaffold({ retention: 10, keep: 5 });
    const p = join(dir, "2026-01-01-stale.md");
    writeFileSync(p, "# stale\n");
    ageFile(p);

    run(["--dry-run"]);

    const health = join(workdir, ".forge", "knowledge", "tool-health.md");
    expect(existsSync(health)).toBe(false);
  });
});
