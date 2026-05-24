export function resolveAllowedTools(libContent) {
    const fmMatch = libContent.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
        return { ok: false, code: "E_TOOLS_UNDECLARED" };
    }
    const frontmatter = fmMatch[1];
    const yamlListMatch = frontmatter.match(/allowed_tools:\s*\n((?:\s+-\s+[^\n]+\n?)+)/);
    if (yamlListMatch) {
        const tools = yamlListMatch[1]
            .split("\n")
            .map((line) => line.match(/-\s+(.+)/)?.[1]?.trim())
            .filter((t) => !!t);
        if (tools.length === 0) {
            return { ok: false, code: "E_TOOLS_UNDECLARED" };
        }
        return { ok: true, tools };
    }
    const inlineMatch = frontmatter.match(/allowed_tools:\s*\[([^\]]*)\]/);
    if (inlineMatch) {
        const tools = inlineMatch[1]
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
        if (tools.length === 0) {
            return { ok: false, code: "E_TOOLS_UNDECLARED" };
        }
        return { ok: true, tools };
    }
    const emptyArrayMatch = frontmatter.match(/allowed_tools:\s*\[\s*\]/);
    if (emptyArrayMatch) {
        return { ok: false, code: "E_TOOLS_UNDECLARED" };
    }
    return { ok: false, code: "E_TOOLS_UNDECLARED" };
}
//# sourceMappingURL=tools-resolve.js.map