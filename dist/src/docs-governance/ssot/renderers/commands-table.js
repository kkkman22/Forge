export function commandsTableRenderer(input) {
    const source = input.source;
    if (!Array.isArray(source)) {
        return {
            markdown: "",
            diagnostics: [
                {
                    script: "commands-table",
                    severity: "error",
                    file: "",
                    message: "Source must be an array",
                },
            ],
        };
    }
    // Deduplicate by name, stable sort by name
    const seen = new Set();
    const unique = [];
    for (const item of source) {
        const name = String(item.name ?? "");
        if (!seen.has(name)) {
            seen.add(name);
            unique.push({ name, tier: String(item.tier ?? ""), summary: String(item.summary ?? "") });
        }
    }
    unique.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    if (unique.length === 0) {
        return { markdown: "_No commands registered._", diagnostics: [] };
    }
    const lines = [
        "| Command | Tier | Summary |",
        "|---|---|---|",
        ...unique.map((c) => `| ${c.name} | ${c.tier} | ${c.summary} |`),
    ];
    return { markdown: lines.join("\n"), diagnostics: [] };
}
//# sourceMappingURL=commands-table.js.map