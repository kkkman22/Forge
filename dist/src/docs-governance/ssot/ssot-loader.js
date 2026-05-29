import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfigWithDefaults } from "../config.js";
import { createRendererRegistry } from "./renderer-registry.js";
export function loadSsotData(rootDir) {
    const configPath = resolve(rootDir, ".forge/config.md");
    let raw = "";
    try {
        raw = readFileSync(configPath, "utf-8");
    }
    catch {
        return new Map();
    }
    const config = loadConfigWithDefaults(raw);
    const ssotData = new Map();
    for (const entry of config.docs.ssot_sources) {
        const sourcePath = resolve(rootDir, entry.source);
        try {
            if (existsSync(sourcePath)) {
                const content = readFileSync(sourcePath, "utf-8");
                // Attempt JSON parse for .json files
                if (sourcePath.endsWith(".json")) {
                    try {
                        ssotData.set(entry.topic, JSON.parse(content));
                    }
                    catch {
                        ssotData.set(entry.topic, content);
                    }
                }
                else {
                    ssotData.set(entry.topic, content);
                }
            }
        }
        catch {
            // Source file missing — renderer will handle null source
        }
    }
    return ssotData;
}
export function buildDefaultRegistry(renderers) {
    const reg = createRendererRegistry();
    for (const [name, fn] of renderers) {
        reg.register(name, fn);
    }
    return reg;
}
//# sourceMappingURL=ssot-loader.js.map