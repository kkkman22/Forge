import type { DocPath, RenderInput, RenderResult } from "../../types.js";

export function countRenderer(input: RenderInput): RenderResult {
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
        file: "" as DocPath,
        message: "Source is not an array; count defaults to 0",
        code: "COUNT_NOT_ARRAY",
      },
    ],
  };
}
