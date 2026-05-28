import { existsSync, lstatSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
const DEFAULT_EXTENSIONS = [".md"];
export function walkMdFiles(dir, opts = {}) {
    const { skipHidden = true, skipSsot = false, extensions = DEFAULT_EXTENSIONS, relativeTo, excludeFn, symlinkSafe = false, allowDotDirs = [], excludedPrefixes = [], } = opts;
    const results = [];
    if (!existsSync(dir))
        return results;
    const resolvedRoot = symlinkSafe ? resolve(dir) : undefined;
    function walk(current) {
        let entries;
        try {
            entries = readdirSync(current, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const fullPath = join(current, entry.name);
            if (symlinkSafe) {
                const stat = lstatSync(fullPath);
                if (stat.isSymbolicLink())
                    continue;
                if (resolvedRoot && !resolve(fullPath).startsWith(resolvedRoot))
                    continue;
            }
            if (skipHidden && entry.name.startsWith(".") && !allowDotDirs.includes(entry.name))
                continue;
            if (skipSsot && entry.name === "_ssot" && entry.isDirectory())
                continue;
            if (relativeTo) {
                const rel = relative(relativeTo, fullPath);
                if (excludedPrefixes.some((p) => rel.startsWith(p)))
                    continue;
            }
            let isDir;
            let isFile;
            if (symlinkSafe) {
                const stat = lstatSync(fullPath);
                isDir = stat.isDirectory();
                isFile = stat.isFile();
            }
            else {
                try {
                    const stat = statSync(fullPath);
                    isDir = stat.isDirectory();
                    isFile = stat.isFile();
                }
                catch {
                    continue;
                }
            }
            if (isDir) {
                walk(fullPath);
            }
            else if (isFile && extensions.some((ext) => entry.name.endsWith(ext))) {
                if (excludeFn?.(entry.name))
                    continue;
                results.push(relativeTo ? relative(relativeTo, fullPath) : fullPath);
            }
        }
    }
    walk(dir);
    return results;
}
export function shouldExcludeIndex(filename) {
    if (filename.match(/^INDEX/i))
        return true;
    if (filename === "README.md")
        return true;
    return false;
}
//# sourceMappingURL=scan-files.js.map