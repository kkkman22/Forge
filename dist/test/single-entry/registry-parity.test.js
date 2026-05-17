import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { glob } from "glob";
const ROOT = resolve(import.meta.dirname, "..", "..");
const REGISTRY_PATH = resolve(ROOT, "skills/forge/registry.toml");
const SUBS = [
    "abort", "accept", "build", "build-light", "control-cli", "control-ui",
    "debug", "decide", "decide-teams", "fix", "fix-conflicts", "grill",
    "learn", "loop", "mutate", "pack", "plan", "recap", "refactor",
    "resume", "review", "router", "ship", "spec", "status", "storm",
    "test", "verify", "zoom-out",
];
function parseSection(content, sub) {
    const result = {};
    const regex = new RegExp(`^\\[${sub}\\]\\n((?:[^\\n]+\\n)*?)(?=\\[|$)`, "m");
    const match = content.match(regex);
    if (!match)
        return result;
    for (const line of match[1].split("\n")) {
        const eqIdx = line.indexOf(" = ");
        if (eqIdx === -1)
            continue;
        const key = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 3).trim();
        result[key] = val;
    }
    return result;
}
function parseAllowedTools(tomlValue) {
    // tomlValue is like: ["Read", "Bash", "Write"]
    if (!tomlValue.startsWith("[") || !tomlValue.endsWith("]"))
        return [];
    return tomlValue
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
}
function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match)
        return {};
    const fm = {};
    const lines = match[1].split("\n");
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const colonIdx = line.indexOf(":");
        if (colonIdx === -1) {
            i++;
            continue;
        }
        const key = line.slice(0, colonIdx).trim();
        const rest = line.slice(colonIdx + 1).trim();
        if (rest.startsWith("[")) {
            fm[key] = rest.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
            i++;
        }
        else if (rest === "" && i + 1 < lines.length && /^\s+-\s/.test(lines[i + 1])) {
            const items = [];
            i++;
            while (i < lines.length && /^\s+-\s/.test(lines[i])) {
                items.push(lines[i].replace(/^\s+-\s+/, "").trim());
                i++;
            }
            fm[key] = items;
        }
        else {
            fm[key] = rest.replace(/^["']|["']$/g, "");
            i++;
        }
    }
    return fm;
}
describe("R2.5: registry as derived index", () => {
    it("registry.toml exists", () => {
        expect(existsSync(REGISTRY_PATH)).toBe(true);
    });
    it("registry.toml starts with AUTO-GENERATED header", () => {
        const content = readFileSync(REGISTRY_PATH, "utf-8");
        expect(content).toContain("# AUTO-GENERATED");
    });
    it("registry.toml contains all 29 subs", () => {
        const content = readFileSync(REGISTRY_PATH, "utf-8");
        for (const sub of SUBS) {
            expect(content, `registry missing sub: ${sub}`).toMatch(new RegExp(`\\[${sub}\\]`));
        }
    });
    it("registry dispatch_mode values are fork or inline only", () => {
        const content = readFileSync(REGISTRY_PATH, "utf-8");
        const modeMatches = content.match(/dispatch_mode\s*=\s*"([^"]+)"/g) || [];
        for (const match of modeMatches) {
            const value = match.match(/"([^"]+)"/)?.[1];
            expect(value).toMatch(/^(fork|inline)$/);
        }
    });
    it("registry allowed_tools match lib frontmatter exactly", async () => {
        const registryContent = readFileSync(REGISTRY_PATH, "utf-8");
        const libs = await glob("skills/forge/lib/*/instructions.md", { cwd: ROOT });
        const violations = [];
        for (const libPath of libs) {
            const sub = libPath.split("/")[3];
            const fmContent = readFileSync(resolve(ROOT, libPath), "utf-8");
            const fm = parseFrontmatter(fmContent);
            const fmTools = (Array.isArray(fm.allowed_tools) ? fm.allowed_tools : []).sort();
            const section = parseSection(registryContent, sub);
            const regTools = parseAllowedTools(section.allowed_tools || "[]").sort();
            if (JSON.stringify(fmTools) !== JSON.stringify(regTools)) {
                violations.push(`${sub}: frontmatter=${JSON.stringify(fmTools)} registry=${JSON.stringify(regTools)}`);
            }
        }
        expect(violations).toEqual([]);
    });
    it("registry descriptions are non-empty and properly quoted", () => {
        const content = readFileSync(REGISTRY_PATH, "utf-8");
        const descMatches = content.match(/^description = (.+)$/gm) || [];
        for (const match of descMatches) {
            const value = match.replace(/^description = /, "");
            // Must be JSON-quoted string
            expect(value.startsWith('"')).toBe(true);
            expect(value.endsWith('"')).toBe(true);
            // Inner content should not start with literal double-quote
            const inner = value.slice(1, -1);
            expect(inner.length, `empty description: ${match}`).toBeGreaterThan(0);
            expect(inner.startsWith('"'), `double-quoted description: ${match}`).toBe(false);
        }
    });
});
//# sourceMappingURL=registry-parity.test.js.map