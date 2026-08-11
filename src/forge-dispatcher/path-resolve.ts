import { realpathSync } from "node:fs";
import { isAbsolute, normalize, resolve } from "node:path";

export interface PathOk {
  ok: true;
  path: string;
}

export interface PathErr {
  ok: false;
  code: "E_PATH_INVALID";
  reason: string;
}

export type PathResolveResult = PathOk | PathErr;

export interface PathResolveOpts {
  pluginRoot?: string;
  cwd?: string;
}

function hasTraversal(segment: string): boolean {
  return segment.includes("..") || segment.includes("/") || segment.includes("\\");
}

export function resolveLibPath(sub: string, opts?: PathResolveOpts): PathResolveResult {
  if (hasTraversal(sub) || isAbsolute(sub)) {
    return { ok: false, code: "E_PATH_INVALID", reason: "traversal or absolute" };
  }

  const pluginRoot =
    opts && "pluginRoot" in opts ? opts.pluginRoot : process.env.CLAUDE_PLUGIN_ROOT;
  const cwd = opts?.cwd ?? process.cwd();
  const root = pluginRoot ?? cwd;
  const normalizedRoot = normalize(root);

  const resolved = resolve(normalizedRoot, "skills/tinkerman/lib", sub, "instructions.md");
  const normalized = normalize(resolved);

  if (!normalized.startsWith(`${normalizedRoot}/`) && normalized !== normalizedRoot) {
    return { ok: false, code: "E_PATH_INVALID", reason: "escapes root" };
  }

  try {
    const real = realpathSync(normalized);
    const realRoot = realpathSync(normalizedRoot);
    if (!real.startsWith(`${realRoot}/`) && real !== realRoot) {
      return { ok: false, code: "E_PATH_INVALID", reason: "symlink escapes root" };
    }
  } catch (_err: unknown) {
    // File doesn't exist yet (pre-migration) — accept the path, integrity check later
  }

  return { ok: true, path: normalized };
}
