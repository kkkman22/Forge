import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "cmux-skills", "install.sh");
const SKILLS_DIR = join(process.cwd(), "cmux-skills");
const TMP_DIR = join(process.cwd(), "test", ".cmux-skills-tmp");

const SKILL_DIRS = [
  "forge-sidebar-sync",
  "forge-browser-qa",
  "forge-loop-signals",
];

describe("cmux-skills/ install.sh (R10.1–R10.10)", () => {
  afterEach(() => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true });
  });

  function run(args: string[] = []) {
    return execSync(`bash "${SCRIPT}" ${args.join(" ")}`, {
      cwd: process.cwd(),
      encoding: "utf-8",
      stdio: "pipe",
    });
  }

  it("each SKILL.md exists and is ≤3072 bytes (R10.1)", () => {
    for (const dir of SKILL_DIRS) {
      const skillFile = join(SKILLS_DIR, dir, "SKILL.md");
      expect(existsSync(skillFile)).toBe(true);
      const size = readFileSync(skillFile, "utf-8").length;
      expect(size).toBeLessThanOrEqual(3072);
    }
  });

  it("each SKILL.md has required frontmatter fields (R10.2)", () => {
    for (const dir of SKILL_DIRS) {
      const content = readFileSync(join(SKILLS_DIR, dir, "SKILL.md"), "utf-8");
      expect(content).toMatch(/^---\n/);
      expect(content).toContain("name:");
      expect(content).toContain("trigger:");
    }
  });

  it("install.sh exists and is executable (R10.3)", () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it("dry-run mode lists skills without copying (R10.4)", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    const output = run(["--dry-run", TMP_DIR]);
    for (const dir of SKILL_DIRS) {
      expect(output).toContain(dir);
    }
    // No files copied
    expect(existsSync(join(TMP_DIR, "forge-sidebar-sync"))).toBe(false);
  });

  it("--apply copies skill directories to target (R10.5)", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    run(["--apply", TMP_DIR]);
    for (const dir of SKILL_DIRS) {
      expect(existsSync(join(TMP_DIR, dir, "SKILL.md"))).toBe(true);
    }
  });

  it("--apply is idempotent — no error on re-run (R10.6)", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    run(["--apply", TMP_DIR]);
    run(["--apply", TMP_DIR]);
    for (const dir of SKILL_DIRS) {
      expect(existsSync(join(TMP_DIR, dir, "SKILL.md"))).toBe(true);
    }
  });

  it("--uninstall removes skill directories (R10.7)", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    run(["--apply", TMP_DIR]);
    run(["--uninstall", TMP_DIR]);
    for (const dir of SKILL_DIRS) {
      expect(existsSync(join(TMP_DIR, dir))).toBe(false);
    }
  });

  it("install.sh --help shows usage (R10.8)", () => {
    const output = run(["--help"]);
    expect(output).toContain("Usage");
    expect(output).toContain("--dry-run");
    expect(output).toContain("--apply");
    expect(output).toContain("--uninstall");
  });

  it("SKILL.md content mentions cmux integration (R10.9)", () => {
    for (const dir of SKILL_DIRS) {
      const content = readFileSync(join(SKILLS_DIR, dir, "SKILL.md"), "utf-8").toLowerCase();
      expect(content).toContain("cmux");
    }
  });

  it("install.sh defaults to dry-run when no flag given (R10.10)", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    run([TMP_DIR]);
    expect(existsSync(join(TMP_DIR, "forge-sidebar-sync"))).toBe(false);
  });
});
