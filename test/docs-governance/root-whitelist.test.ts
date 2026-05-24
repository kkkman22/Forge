import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkRootWhitelist } from "../../src/docs-governance/root-whitelist.js";

const DEFAULT_WHITELIST = [
  "README.md",
  "CHANGELOG.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "ROADMAP.md",
  "AGENTS.md",
  "CLAUDE.md",
  "LICENSE.md",
] as const;

function makeTmpDir(prefix: string): string {
  const dir = join(tmpdir(), `root-whitelist-test-${prefix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function touch(dir: string, name: string): void {
  writeFileSync(join(dir, name), "");
}

const dirsToClean: string[] = [];

describe("checkRootWhitelist", () => {
  afterEach(() => {
    for (const d of dirsToClean) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        // best effort
      }
    }
    dirsToClean.length = 0;
  });

  function tmpDir(prefix: string): string {
    const d = makeTmpDir(prefix);
    dirsToClean.push(d);
    return d;
  }

  // ── Exact filename matching, case sensitivity ──

  it("passes when all root .md files are whitelisted", () => {
    const dir = tmpDir("clean");
    touch(dir, "README.md");
    touch(dir, "CHANGELOG.md");

    const diags = checkRootWhitelist(dir, DEFAULT_WHITELIST);
    expect(diags).toHaveLength(0);
  });

  it("reports error for non-whitelisted file", () => {
    const dir = tmpDir("extra");
    touch(dir, "README.md");
    touch(dir, "EXTRA.md");

    const diags = checkRootWhitelist(dir, DEFAULT_WHITELIST);
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
    expect(diags[0].file).toBe("EXTRA.md");
    expect(diags[0].code).toBe("ROOT_FILE_NOT_WHITELISTED");
  });

  it("is case-sensitive: readme.md != README.md", () => {
    const dir = tmpDir("case");
    touch(dir, "readme.md"); // lowercase, not in whitelist

    const diags = checkRootWhitelist(dir, DEFAULT_WHITELIST);
    expect(diags).toHaveLength(1);
    expect(diags[0].file).toBe("readme.md");
    expect(diags[0].code).toBe("ROOT_FILE_NOT_WHITELISTED");
  });

  it("matches exact filename only, not substrings", () => {
    const dir = tmpDir("exact");
    touch(dir, "README-extra.md");

    const diags = checkRootWhitelist(dir, DEFAULT_WHITELIST);
    expect(diags).toHaveLength(1);
    expect(diags[0].file).toBe("README-extra.md");
  });

  // ── No symlink following ──

  it("ignores symlinks to .md files", () => {
    const dir = tmpDir("symlink");
    touch(dir, "README.md");
    touch(dir, "target.txt");
    symlinkSync(join(dir, "target.txt"), join(dir, "LINKED.md"));

    const diags = checkRootWhitelist(dir, DEFAULT_WHITELIST);
    expect(diags).toHaveLength(0);
  });

  // ── No hidden files ──

  it("ignores hidden .md files (dot-prefix)", () => {
    const dir = tmpDir("hidden");
    touch(dir, "README.md");
    touch(dir, ".hidden.md");

    const diags = checkRootWhitelist(dir, DEFAULT_WHITELIST);
    expect(diags).toHaveLength(0);
  });

  // ── Non-recursive ──

  it("does not scan subdirectories", () => {
    const dir = tmpDir("subdir");
    touch(dir, "README.md");
    const sub = join(dir, "docs");
    mkdirSync(sub, { recursive: true });
    touch(sub, "EXTRA.md");

    const diags = checkRootWhitelist(dir, DEFAULT_WHITELIST);
    expect(diags).toHaveLength(0);
  });

  // ── LICENSE/LICENSE.md mutual exclusion ──

  it("reports critical when both LICENSE and LICENSE.md exist", () => {
    const dir = tmpDir("both-license");
    touch(dir, "LICENSE");
    touch(dir, "LICENSE.md");

    const diags = checkRootWhitelist(dir, DEFAULT_WHITELIST);
    const crits = diags.filter((d) => d.code === "LICENSE_MUTUAL_EXCLUSION");
    expect(crits).toHaveLength(2);
    expect(crits.every((d) => d.severity === "critical")).toBe(true);
    const files = crits.map((d) => d.file).sort();
    expect(files).toEqual(["LICENSE", "LICENSE.md"]);
  });

  it("accepts LICENSE alone as whitelist hit for LICENSE.md", () => {
    const dir = tmpDir("license-only");
    touch(dir, "LICENSE");

    const diags = checkRootWhitelist(dir, DEFAULT_WHITELIST);
    // LICENSE is not a .md file so it won't appear in mdFiles — no whitelist check needed
    // But more importantly: no diagnostics should be emitted
    expect(diags).toHaveLength(0);
  });

  it("accepts LICENSE.md alone without error", () => {
    const dir = tmpDir("license-md-only");
    touch(dir, "LICENSE.md");

    const diags = checkRootWhitelist(dir, DEFAULT_WHITELIST);
    expect(diags).toHaveLength(0);
  });

  it("reports critical for LICENSE/LICENSE.md even when other files are clean", () => {
    const dir = tmpDir("license-clean-others");
    touch(dir, "README.md");
    touch(dir, "LICENSE");
    touch(dir, "LICENSE.md");

    const diags = checkRootWhitelist(dir, DEFAULT_WHITELIST);
    const crits = diags.filter((d) => d.code === "LICENSE_MUTUAL_EXCLUSION");
    expect(crits).toHaveLength(2);
    // README.md should NOT generate an error
    const others = diags.filter((d) => d.code === "ROOT_FILE_NOT_WHITELISTED");
    expect(others).toHaveLength(0);
  });

  // ── Clean whitelist passes ──

  it("returns empty diagnostics for empty directory", () => {
    const dir = tmpDir("empty");
    const diags = checkRootWhitelist(dir, DEFAULT_WHITELIST);
    expect(diags).toHaveLength(0);
  });

  it("returns empty diagnostics when all files are whitelisted", () => {
    const dir = tmpDir("all-whitelisted");
    for (const name of DEFAULT_WHITELIST) {
      touch(dir, name);
    }

    const diags = checkRootWhitelist(dir, DEFAULT_WHITELIST);
    expect(diags).toHaveLength(0);
  });

  // ── Config default fallback ──

  it("uses the 8-item default whitelist from config", () => {
    const dir = tmpDir("defaults");
    touch(dir, "README.md");
    touch(dir, "CHANGELOG.md");
    touch(dir, "SECURITY.md");
    touch(dir, "CONTRIBUTING.md");
    touch(dir, "ROADMAP.md");
    touch(dir, "AGENTS.md");
    touch(dir, "CLAUDE.md");
    touch(dir, "LICENSE.md");

    const diags = checkRootWhitelist(dir, DEFAULT_WHITELIST);
    expect(diags).toHaveLength(0);
    expect(DEFAULT_WHITELIST).toHaveLength(8);
  });

  it("detects extra files alongside full default whitelist", () => {
    const dir = tmpDir("defaults-extra");
    for (const name of DEFAULT_WHITELIST) {
      touch(dir, name);
    }
    touch(dir, "NOT_IN_WHITELIST.md");

    const diags = checkRootWhitelist(dir, DEFAULT_WHITELIST);
    expect(diags).toHaveLength(1);
    expect(diags[0].file).toBe("NOT_IN_WHITELIST.md");
    expect(diags[0].severity).toBe("error");
  });

  // ── Non-.md files ignored ──

  it("ignores non-.md files in root", () => {
    const dir = tmpDir("non-md");
    touch(dir, "README.md");
    touch(dir, "package.json");
    touch(dir, "Makefile");

    const diags = checkRootWhitelist(dir, DEFAULT_WHITELIST);
    expect(diags).toHaveLength(0);
  });

  // ── Unreadable directory ──

  it("reports critical when root directory cannot be read", () => {
    const diags = checkRootWhitelist("/nonexistent/path/that/does/not/exist", DEFAULT_WHITELIST);
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("critical");
    expect(diags[0].code).toBe("ROOT_DIR_UNREADABLE");
  });
});
