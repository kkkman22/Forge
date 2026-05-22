export function resolveForgeRoot(input, fs) {
    const checked = [];
    if (input.pluginRoot && input.pluginRoot.length > 0) {
        const candidate = `${input.pluginRoot}/agents`;
        checked.push(input.pluginRoot);
        if (fs.isDir(candidate)) {
            return { kind: "plugin", root: input.pluginRoot };
        }
    }
    // scriptDir/../agents — resolve parent
    const scriptParent = `${input.scriptDir.replace(/\/$/, "")}/..`;
    // Normalize: resolve ".." by removing the last path component
    const normalizedParent = scriptParent.replace(/\/[^/]+\/\.\.$/, "");
    checked.push(normalizedParent);
    if (fs.isDir(`${normalizedParent}/agents`)) {
        return { kind: "script-relative", root: normalizedParent };
    }
    const globalRoot = `${input.homeDir}/.claude/skills/forge`;
    checked.push(globalRoot);
    if (fs.isDir(`${globalRoot}/agents`)) {
        return { kind: "global", root: globalRoot };
    }
    return { kind: "not-found", checked };
}
//# sourceMappingURL=forge-root-resolver.js.map