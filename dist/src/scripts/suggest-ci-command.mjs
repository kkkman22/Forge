/**
 * Infer CI command suggestion from package.json content.
 * @param {string|null} packageJsonRaw
 * @returns {string|null}
 */
export function suggestCiCommand(packageJsonRaw) {
    if (packageJsonRaw === null)
        return null;
    try {
        const pkg = JSON.parse(packageJsonRaw);
        if (pkg &&
            typeof pkg === "object" &&
            pkg.scripts &&
            typeof pkg.scripts.check === "string" &&
            pkg.scripts.check.length > 0) {
            return "npm run check";
        }
        return null;
    }
    catch {
        return null;
    }
}
// CLI: read ./package.json, output suggestion or exit 1
if (import.meta.url === `file://${process.argv[1]}`) {
    const { existsSync, readFileSync } = await import("node:fs");
    const path = "./package.json";
    const raw = existsSync(path) ? readFileSync(path, "utf-8") : null;
    const result = suggestCiCommand(raw);
    if (result) {
        process.stdout.write(result);
        process.exit(0);
    }
    process.exit(1);
}
//# sourceMappingURL=suggest-ci-command.mjs.map