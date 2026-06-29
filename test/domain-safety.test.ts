/**
 * T8 — CI domain-safety check + no-engine→domain-import lint (REQ-08, INV-2/4).
 *
 * Verifies scripts/check-domain-safety.mjs:
 *   - clean src/domain/ → exit 0
 *   - a planted eval in src/domain/ → exit 1 (INV-4)
 *   - engine code (src/ excluding src/domain/) importing ./domain → exit 1 (INV-2)
 *   - all src/domain/ files carry a @non-production header
 *
 * category: contract
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const CHECK = resolve(ROOT, "scripts/check-domain-safety.mjs");

function runCheck(env: NodeJS.ProcessEnv = {}): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CHECK], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf-8",
  });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

describe("T8: check-domain-safety.mjs (REQ-08, INV-2/4)", () => {
  it("the check script exists", () => {
    expect(existsSync(CHECK)).toBe(true);
  });

  it("clean repo → exit 0", () => {
    const r = runCheck();
    expect(r.status, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
  });

  it("a planted unsafe pattern in src/domain/ → exit 1 (INV-4)", () => {
    // Plant a temporary unsafe file in src/domain/.
    const unsafe = resolve(ROOT, "src/domain/__t8_probe.ts");
    writeFileSync(unsafe, "export const x = eval('1');\n");
    const r = runCheck();
    rmSync(unsafe, { force: true });
    expect(r.status, `stdout: ${r.stdout}`).toBe(1);
    expect(r.stdout.toLowerCase()).toMatch(/eval|unsafe|forbidden/);
  });

  it("engine importing domain → exit 1 (INV-2: no engine→domain import)", () => {
    // Plant a temporary file in src/ (engine side) importing ../domain.
    const unsafe = resolve(ROOT, "src/__t8_engine_probe.ts");
    writeFileSync(unsafe, 'import "../../src/domain/index.js";\nexport {};\n');
    const r = runCheck();
    rmSync(unsafe, { force: true });
    expect(r.status, `stdout: ${r.stdout}`).toBe(1);
    expect(r.stdout.toLowerCase()).toMatch(/domain|engine|import/);
  });

  it("FORGE_SKIP_DOMAIN_SAFETY=1 → skipped (exit 0)", () => {
    const r = runCheck({ FORGE_SKIP_DOMAIN_SAFETY: "1" });
    expect(r.status).toBe(0);
    expect(r.stdout.toLowerCase()).toContain("skip");
  });

  it("all src/domain/*.ts files carry a @non-production header", () => {
    // Walk src/domain/ for .ts files and assert the header.
    const { readdirSync, readFileSync: read } = require("node:fs");
    const domainDir = resolve(ROOT, "src/domain");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(p));
        else if (e.name.endsWith(".ts")) out.push(p);
      }
      return out;
    };
    const files = walk(domainDir);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const head = read(f, "utf-8").slice(0, 400);
      expect(head, `${f} missing @non-production header`).toMatch(
        /@non-production|NOT FOR PRODUCTION/,
      );
    }
  });
});

// Keep imports referenced (mkdirSync/os used in future fixture variants).
void mkdirSync;
void mkdtempSync;
void rmSync;
void os;
