/**
 * forge_read — batch file analysis via sandboxed script execution.
 *
 * Executes a user-provided JavaScript script in a child subprocess with file paths
 * injected as a sandbox global `FORGE_FILES` array.
 * Only the script's stdout is returned — file contents never enter the context.
 *
 * Supported languages:
 *   - javascript: sandboxed `node -e` wrapper with FORGE_FILES + readFile(path)
 *
 * **Validates: Requirement 4**
 */
import { execFile } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { validatePaths } from "./path-validator.js";
// Re-export for backward compatibility with existing imports
export { validatePaths, validateSinglePath } from "./path-validator.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Default timeout for script execution (30 seconds). */
const DEFAULT_TIMEOUT_MS = 30_000;
// ---------------------------------------------------------------------------
// Security: script validation
// ---------------------------------------------------------------------------
/** @deprecated since 2026-06. Script mode will be removed in a future version. */
/** Dangerous Node.js API patterns that should not appear in user scripts. */
const DANGEROUS_SCRIPT_PATTERNS = [
    { pattern: /child_process/, label: "child_process" },
    { pattern: /process\.exit/, label: "process.exit" },
    { pattern: /eval\s*\(/, label: "eval()" },
    { pattern: /Function\s*\(/, label: "Function()" },
    { pattern: /writeFileSync/, label: "writeFileSync" },
    { pattern: /writeFile\b/, label: "writeFile" },
    { pattern: /appendFileSync/, label: "appendFileSync" },
    { pattern: /appendFile\b/, label: "appendFile" },
    { pattern: /unlinkSync/, label: "unlinkSync" },
    { pattern: /unlink\b/, label: "unlink" },
    { pattern: /rmSync/, label: "rmSync" },
    { pattern: /rmdir\b/, label: "rmdir" },
    { pattern: /renameSync/, label: "renameSync" },
    { pattern: /rename\b/, label: "rename" },
    { pattern: /chmodSync/, label: "chmodSync" },
    { pattern: /chownSync/, label: "chownSync" },
    { pattern: /execSync/, label: "execSync" },
    { pattern: /spawnSync/, label: "spawnSync" },
    { pattern: /execFileSync/, label: "execFileSync" },
    { pattern: /mkdirSync/, label: "mkdirSync" },
    { pattern: /mkdir\b/, label: "mkdir" },
    // P0-1 fix: block ALL filesystem access, dynamic imports, and runtime reflection
    { pattern: /require\s*\(\s*['"]fs/, label: "require('fs')" },
    { pattern: /require\s*\(\s*['"]node:fs/, label: "require('node:fs')" },
    { pattern: /import\s*\(/, label: "import()" },
    { pattern: /Buffer\b/, label: "Buffer" },
    { pattern: /WebAssembly\b/, label: "WebAssembly" },
    { pattern: /process\.binding/, label: "process.binding" },
    { pattern: /process\.env/, label: "process.env" },
];
/**
 * Validate that a script does not contain dangerous patterns.
 * Returns an error message if dangerous, or null if safe.
 */
export function validateScript(script) {
    for (const { pattern, label } of DANGEROUS_SCRIPT_PATTERNS) {
        if (pattern.test(script)) {
            return `Script contains dangerous pattern: ${label}`;
        }
    }
    return null;
}
// ---------------------------------------------------------------------------
// Sandbox environment: resource limits for script execution
// ---------------------------------------------------------------------------
/** Maximum heap size (MB) for forge_read script execution. */
const SANDBOX_MAX_HEAP_MB = 256;
/**
 * Build the environment variables for sandboxed script execution.
 * For JavaScript, adds `NODE_OPTIONS` with resource limits (max heap, etc.)
 * to prevent resource exhaustion from malicious or buggy scripts.
 */
export function buildSandboxEnv(language, paths) {
    const base = {
        PATH: process.env.PATH,
        NODE_ENV: process.env.NODE_ENV,
        FORGE_FILES: JSON.stringify(paths),
    };
    if (language === "javascript") {
        base.NODE_OPTIONS = [
            `--max-old-space-size=${SANDBOX_MAX_HEAP_MB}`,
            // Disable network access via --dns-result-order and policy
            // Note: --experimental-network-imports is NOT set
        ].join(" ");
    }
    return base;
}
export function buildPermissionArgs(allowedPaths) {
    const flags = process.allowedNodeEnvironmentFlags;
    const permissionFlag = flags.has("--permission")
        ? "--permission"
        : flags.has("--experimental-permission")
            ? "--experimental-permission"
            : null;
    if (!permissionFlag || !flags.has("--allow-fs-read"))
        return [];
    return [permissionFlag, ...allowedPaths.map((p) => `--allow-fs-read=${p}`)];
}
export function resolveAllowedReadFiles(paths, cwd) {
    const root = cwd ? resolve(cwd) : process.cwd();
    return paths.map((p) => {
        const resolved = resolve(root, p);
        let realPath = resolved;
        try {
            realPath = realpathSync(resolved);
        }
        catch {
            // Nonexistent paths will fail visibly when readFile() is called.
        }
        return { inputPath: p, resolvedPath: resolved, realPath };
    });
}
function buildJavascriptSandboxScript(script, allowedFiles) {
    const fileAliases = allowedFiles.flatMap((file) => [
        { alias: file.inputPath, realPath: file.realPath },
        { alias: file.resolvedPath, realPath: file.realPath },
        { alias: file.realPath, realPath: file.realPath },
    ]);
    return `
const { readFileSync } = require("node:fs");
const { Script, createContext } = require("node:vm");

const userScript = ${JSON.stringify(script)};
const fileAliases = ${JSON.stringify(fileAliases)};
const fileContentsByRealPath = Object.create(null);
for (const entry of fileAliases) {
  if (!Object.prototype.hasOwnProperty.call(fileContentsByRealPath, entry.realPath)) {
    fileContentsByRealPath[entry.realPath] = readFileSync(entry.realPath, "utf-8");
  }
}
const fileMap = Object.create(null);
for (const entry of fileAliases) {
  fileMap[entry.alias] = fileContentsByRealPath[entry.realPath];
}

const setupScript = \`
const __forge_file_map = Object.freeze(${JSON.stringify("__FORGE_FILE_MAP__")});
const __forge_files = Object.freeze(${JSON.stringify(allowedFiles.map((file) => file.inputPath))});
globalThis.__forge_stdout = [];
globalThis.__forge_stderr = [];
function __forge_format(value) {
  if (typeof value === "string") return value;
  if (typeof value === "undefined") return "undefined";
  try { return JSON.stringify(value); } catch { return String(value); }
}
function __forge_readFile(inputPath, encoding = "utf-8") {
  if (encoding !== "utf-8" && encoding !== "utf8") {
    throw new Error("Unsupported encoding for forge_read readFile(): " + String(encoding));
  }
  const key = String(inputPath);
  if (!Object.prototype.hasOwnProperty.call(__forge_file_map, key)) {
    throw new Error("Path not listed in FORGE_FILES: " + key);
  }
  return __forge_file_map[key];
}
globalThis.FORGE_FILES = __forge_files;
globalThis.readFile = __forge_readFile;
globalThis.console = Object.freeze({
  log(...args) { globalThis.__forge_stdout.push(args.map(__forge_format).join(" ") + "\\\\n"); },
  error(...args) { globalThis.__forge_stderr.push(args.map(__forge_format).join(" ") + "\\\\n"); },
  warn(...args) { globalThis.__forge_stderr.push(args.map(__forge_format).join(" ") + "\\\\n"); }
});
Object.freeze(globalThis.FORGE_FILES);
Object.freeze(globalThis.readFile);
Object.freeze(globalThis.console);
\`;

const context = createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
new Script(setupScript.replace(${JSON.stringify(JSON.stringify("__FORGE_FILE_MAP__"))}, JSON.stringify(fileMap)), {
  filename: "forge-read-setup.js",
}).runInContext(context, { timeout: 1000 });

let thrown = null;
try {
  new Script(userScript, { filename: "forge-read-user-script.js" }).runInContext(context, { timeout: 1000 });
} catch (err) {
  thrown = err;
}

const serialized = new Script(
  "JSON.stringify({ stdout: globalThis.__forge_stdout.join(''), stderr: globalThis.__forge_stderr.join('') })",
).runInContext(context, { timeout: 1000 });
const output = JSON.parse(serialized);
if (output.stdout) process.stdout.write(output.stdout);
if (output.stderr) process.stderr.write(output.stderr);
if (thrown) {
  console.error(thrown && thrown.stack ? thrown.stack : String(thrown));
  process.exitCode = 1;
}
`;
}
/**
 * Execute a script in a child subprocess with FORGE_FILES/readFile sandbox globals.
 *
 * @param script - The script code to execute
 * @param language - "javascript" or "shell"
 * @param paths - File paths to inject via FORGE_FILES env var
 * @param timeoutMs - Timeout in milliseconds
 */
export function execReadScript(script, language, paths, timeoutMs, options) {
    return new Promise((finish) => {
        if (language === "shell") {
            finish({
                stdout: "",
                stderr: "forge_read shell mode is disabled; use javascript mode only",
                exitCode: 1,
                timedOut: false,
            });
            return;
        }
        const rootPath = options?.cwd ? resolve(options.cwd) : process.cwd();
        const pathError = validatePaths(paths, rootPath);
        if (pathError) {
            finish({
                stdout: "",
                stderr: pathError,
                exitCode: 1,
                timedOut: false,
            });
            return;
        }
        const env = buildSandboxEnv(language, paths);
        const allowedFiles = resolveAllowedReadFiles(paths, rootPath);
        const allowedPaths = allowedFiles.map((file) => file.realPath);
        const sandboxScript = buildJavascriptSandboxScript(script, allowedFiles);
        const cmd = process.execPath;
        const args = [
            ...buildPermissionArgs(allowedPaths),
            "--no-addons",
            "--disable-proto=throw",
            "-e",
            sandboxScript,
        ];
        const child = execFile(cmd, args, {
            timeout: timeoutMs,
            maxBuffer: 10 * 1024 * 1024,
            env,
            ...(options?.cwd ? { cwd: options.cwd } : {}),
        }, (error, stdout, stderr) => {
            if (error && "killed" in error && error.killed) {
                finish({
                    stdout: String(stdout),
                    stderr: String(stderr),
                    exitCode: 1,
                    timedOut: true,
                });
                return;
            }
            const exitCode = error ? Number(error.code) || 1 : 0;
            finish({
                stdout: String(stdout),
                stderr: String(stderr),
                exitCode,
                timedOut: false,
            });
        });
        // Safety: if the child is somehow null, resolve immediately
        if (!child) {
            finish({
                stdout: "",
                stderr: "Failed to spawn subprocess",
                exitCode: 1,
                timedOut: false,
            });
        }
    });
}
function readStructuredFiles(paths, rootPath) {
    return paths.map((path) => ({
        path,
        content: readFileSync(resolve(rootPath, path), "utf-8"),
    }));
}
function extractImports(content) {
    const imports = new Set();
    const patterns = [
        /\bimport\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?["']([^"']+)["']/g,
        /\bexport\s+(?:type\s+)?[^'";]+?\s+from\s+["']([^"']+)["']/g,
        /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    ];
    for (const pattern of patterns) {
        for (const match of content.matchAll(pattern))
            imports.add(match[1]);
    }
    return [...imports].sort();
}
export async function runStructuredReadOperation(input, options) {
    const rootPath = options?.cwd ? resolve(options.cwd) : process.cwd();
    const pathError = validatePaths(input.paths, rootPath);
    if (pathError)
        return { ok: false, output: pathError };
    try {
        const files = readStructuredFiles(input.paths, rootPath);
        switch (input.operation) {
            case "imports": {
                const result = files.map((file) => ({
                    path: file.path,
                    imports: extractImports(file.content),
                }));
                return { ok: true, output: JSON.stringify(result, null, 2) };
            }
            case "contains": {
                if (typeof input.query !== "string") {
                    return { ok: false, output: "contains operation requires query" };
                }
                const query = input.query;
                const result = files.map((file) => ({
                    path: file.path,
                    contains: file.content.includes(query),
                }));
                return { ok: true, output: JSON.stringify(result, null, 2) };
            }
            case "line_count": {
                const result = files.map((file) => ({
                    path: file.path,
                    lines: file.content.length === 0
                        ? 0
                        : file.content.endsWith("\n")
                            ? file.content.slice(0, -1).split("\n").length
                            : file.content.split("\n").length,
                }));
                return { ok: true, output: JSON.stringify(result, null, 2) };
            }
            case "json_keys": {
                const result = files.map((file) => {
                    const parsed = JSON.parse(file.content);
                    const keys = parsed && typeof parsed === "object" && !Array.isArray(parsed)
                        ? Object.keys(parsed).sort()
                        : [];
                    return { path: file.path, keys };
                });
                return { ok: true, output: JSON.stringify(result, null, 2) };
            }
            default:
                return {
                    ok: false,
                    output: `Unsupported structured operation: ${String(input.operation)}`,
                };
        }
    }
    catch (err) {
        return { ok: false, output: err instanceof Error ? err.message : String(err) };
    }
}
// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------
const TOOL_DESCRIPTION = [
    "Analyze multiple files through structured, safe read operations.",
    "",
    "Primary operations:",
    "- imports: extract import/export/require module specifiers",
    "- contains: return whether each file contains query without echoing file contents",
    "- line_count: count lines per file",
    "- json_keys: list top-level keys in JSON object files",
    "",
    "Legacy compatibility: javascript script mode still runs in a restricted VM with FORGE_FILES/readFile(path).",
    "",
    "Use for: batch structural analysis, dependency graphs, code metrics.",
    "NOT for: file mutations or interactive commands.",
].join("\n");
/**
 * Register the `forge_read` tool on the given MCP server.
 */
export function registerForgeRead(server, root) {
    server.registerTool("forge_read", {
        description: TOOL_DESCRIPTION,
        inputSchema: {
            paths: z.array(z.string()).describe("File paths to analyze"),
            operation: z
                .enum(["imports", "contains", "line_count", "json_keys"])
                .optional()
                .describe("Structured safe read operation; preferred over script mode"),
            query: z.string().optional().describe("Query string for contains operation"),
            script: z.string().optional().describe("Legacy analysis script code"),
            language: z
                .enum(["javascript"])
                .default("javascript")
                .describe("Legacy script language (javascript only; shell mode is disabled)"),
        },
        _meta: {
            "anthropic/maxResultSizeChars": 200_000,
        },
    }, async ({ paths, operation, query, script, language }) => {
        if (operation) {
            const result = await runStructuredReadOperation({ operation, paths, query }, root ? { cwd: root.path } : undefined);
            return {
                content: [{ type: "text", text: result.output }],
                isError: result.ok ? undefined : true,
            };
        }
        if (typeof script !== "string") {
            return {
                content: [
                    { type: "text", text: "forge_read requires operation or legacy script" },
                ],
                isError: true,
            };
        }
        // Security: validate paths stay within project root
        if (root) {
            const pathError = validatePaths(paths, root.path);
            if (pathError) {
                return {
                    content: [{ type: "text", text: pathError }],
                    isError: true,
                };
            }
        }
        // Security: validate script for dangerous patterns (javascript only)
        if (language === "javascript") {
            const scriptError = validateScript(script);
            if (scriptError) {
                return {
                    content: [{ type: "text", text: scriptError }],
                    isError: true,
                };
            }
        }
        // Execute script with FORGE_FILES env var
        const readOpts = root ? { cwd: root.path } : undefined;
        const result = await execReadScript(script, language, paths, DEFAULT_TIMEOUT_MS, readOpts);
        // Handle timeout
        if (result.timedOut) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Script timed out after ${DEFAULT_TIMEOUT_MS}ms`,
                    },
                ],
                isError: true,
            };
        }
        // Handle non-zero exit
        if (result.exitCode !== 0) {
            const errOutput = result.stderr
                ? `${result.stdout}\n\nSTDERR:\n${result.stderr}`
                : result.stdout || "Script failed with no output";
            return {
                content: [{ type: "text", text: errOutput }],
                isError: true,
            };
        }
        // Return only stdout — output isolation
        // @deprecated: Script mode is deprecated, include deprecation warning
        return {
            content: [
                { type: "text", text: result.stdout },
                {
                    type: "text",
                    text: "⚠️ Script mode is deprecated. Use structured operations (imports/contains/line_count/json_keys) instead.",
                },
            ],
        };
    });
}
//# sourceMappingURL=forge-read.js.map