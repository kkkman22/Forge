export function routingTableRenderer(input) {
    const source = input.source;
    if (!Array.isArray(source)) {
        return {
            markdown: "",
            diagnostics: [
                {
                    script: "routing-table",
                    severity: "error",
                    file: "",
                    message: "Source must be an array",
                },
            ],
        };
    }
    const unique = dedupAndSort(source, (e) => e.tier);
    if (unique.length === 0) {
        return { markdown: "_No routing entries._", diagnostics: [] };
    }
    const lines = [
        "| Tier | Condition | Command Sequence |",
        "|---|---|---|",
        ...unique.map((e) => `| ${e.tier} | ${e.condition} | ${e.sequence.join(" → ")} |`),
    ];
    return { markdown: lines.join("\n"), diagnostics: [] };
}
function dedupAndSort(items, keyFn) {
    const seen = new Set();
    const unique = [];
    for (const item of items) {
        const key = keyFn(item);
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(item);
        }
    }
    return unique.sort((a, b) => {
        const ka = keyFn(a);
        const kb = keyFn(b);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
}
//# sourceMappingURL=routing-table.js.map