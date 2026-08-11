import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

export type IntegrityResult =
  | { ok: true }
  | { ok: false; code: "E_MANIFEST_MISSING" | "E_INTEGRITY_MISMATCH" };

export interface IntegrityOpts {
  manifestPath?: string;
}

export function checkIntegrity(libPath: string, opts?: IntegrityOpts): IntegrityResult {
  // libPath: .../skills/tinkerman/lib/<sub>/instructions.md
  // libDir:  .../skills/tinkerman/lib/
  const libDir = dirname(dirname(libPath));
  const manifestPath = opts?.manifestPath ?? resolve(libDir, "manifest.json");

  let manifestText: string;
  try {
    manifestText = readFileSync(manifestPath, "utf-8");
  } catch (_err: unknown) {
    return { ok: false, code: "E_MANIFEST_MISSING" };
  }

  let manifest: { subs?: Record<string, { instructions?: { sha256?: string } }> };
  try {
    manifest = JSON.parse(manifestText);
  } catch (_err: unknown) {
    return { ok: false, code: "E_MANIFEST_MISSING" };
  }

  const subRel = relative(libDir, libPath);
  const sub = subRel.split("/")[0];

  const expectedSha = manifest.subs?.[sub]?.instructions?.sha256;
  if (!expectedSha) return { ok: false, code: "E_INTEGRITY_MISMATCH" };

  const fileContent = readFileSync(libPath, "utf-8");
  const actualSha = createHash("sha256").update(fileContent).digest("hex");

  if (actualSha !== expectedSha) {
    return { ok: false, code: "E_INTEGRITY_MISMATCH" };
  }

  return { ok: true };
}
