export function countRenderer(input) {
    const source = input.source;
    if (Array.isArray(source)) {
        return { markdown: String(source.length), diagnostics: [] };
    }
    return {
        markdown: "0",
        diagnostics: [
            {
                script: "count",
                severity: "warning",
                file: "",
                message: "Source is not an array; count defaults to 0",
                code: "COUNT_NOT_ARRAY",
            },
        ],
    };
}
//# sourceMappingURL=count.js.map