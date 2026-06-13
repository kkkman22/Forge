/**
 * browser-q-actions.mjs — argv builders for the cmux browser QA surface.
 *
 * Grounded on the live `cmux browser --help` (cmux 0.64.x). Only CLI-exposed
 * surfaces are modeled; the changelog's "react-grab / devtools / zoom /
 * history" view-actions (0.64.15) are UI-only and intentionally NOT exposed
 * here — guessing their CLI form would repeat the templates/cmux.json drift.
 *
 * Confirmed CLI surfaces:
 *   - screenshot [--out <path>]   (0.64.8) — file output; there is NO --clipboard flag
 *   - console list                (0.64.15 view-action)
 *   - errors list                 (0.64.15 view-action)
 *   - focus-webview               (0.64.13 browser focus primitive)
 *
 * Builders return FULL argv including the leading "browser" token (matching the
 * existing browser-qa.mjs QA_STEPS convention). `injectSurface` optionally adds
 * a `--surface <handle>` (required by most browser subcommands per --help).
 */

const SAFE_PATH = /^[^\n\r]*$/; // no newline injection into argv

/**
 * `cmux browser screenshot --out <path>` — cmux writes the PNG to <path> itself.
 * @param {{ outPath: string }} opts
 * @returns {string[]}
 */
export function buildScreenshotArgs({ outPath }) {
  if (typeof outPath !== "string" || outPath.length === 0) {
    throw new Error("buildScreenshotArgs: outPath required");
  }
  // Reject traversal: the screenshot must land inside the findings dir we own.
  if (outPath.includes("..")) {
    throw new Error(`buildScreenshotArgs: outPath must not traverse: ${outPath}`);
  }
  if (!SAFE_PATH.test(outPath)) {
    throw new Error("buildScreenshotArgs: outPath contains invalid characters");
  }
  return ["browser", "screenshot", "--out", outPath];
}

/** `cmux browser console list` — 0.64.15 view-action. */
export function buildConsoleArgs() {
  return ["browser", "console", "list"];
}

/** `cmux browser errors list` — 0.64.15 view-action. */
export function buildErrorsArgs() {
  return ["browser", "errors", "list"];
}

const SAFE_SURFACE = /^[A-Za-z0-9._:-]{1,64}$/;

/**
 * Insert `--surface <handle>` right after the leading `browser` token.
 * Returns the input array unchanged when no surface is given or the args are
 * not a browser command. Throws on an invalid surface (S2: a caller-supplied
 * surface must not pollute the argv with extra flags / shell-meta).
 * @param {string[]} args
 * @param {string} [surface]
 * @returns {string[]}
 */
export function injectSurface(args, surface) {
  if (!surface) return args;
  if (args[0] !== "browser") return args;
  if (typeof surface !== "string" || !SAFE_SURFACE.test(surface)) {
    throw new Error(`injectSurface: invalid surface handle: ${String(surface)}`);
  }
  return ["browser", "--surface", surface, ...args.slice(1)];
}
