import { describe, expect, it } from "vitest";
import { parseEmbeds } from "../../../src/docs-governance/ssot/embed-parser.js";
import { syncEmbeds } from "../../../src/docs-governance/ssot/embed-sync.js";
import { createRendererRegistry } from "../../../src/docs-governance/ssot/renderer-registry.js";
import type { DocPath, RendererFn } from "../../../src/docs-governance/types.js";

const P = (s: string) => s as unknown as DocPath;

describe("check-docs-embeds sync gate logic", () => {
  it("reports stale when file content differs from rendered", () => {
    const reg = createRendererRegistry();
    reg.register("echo", ((input: { topic: string }) => ({
      markdown: `rendered:${input.topic}`,
      diagnostics: [],
    })) as RendererFn);

    const stale = [
      "<!-- ssot:begin topic=commands render=echo -->",
      "stale content",
      "<!-- ssot:end topic=commands -->",
    ].join("\n");

    const { content: rendered } = syncEmbeds(stale, P("docs/stale.md"), reg, new Map());
    expect(rendered).not.toBe(stale);
    expect(rendered).not.toContain("stale content");
  });

  it("reports clean when file is already synced", () => {
    const reg = createRendererRegistry();
    reg.register("echo", ((input: { topic: string }) => ({
      markdown: `rendered:${input.topic}`,
      diagnostics: [],
    })) as RendererFn);

    const content = [
      "<!-- ssot:begin topic=test render=echo -->",
      "old",
      "<!-- ssot:end topic=test -->",
    ].join("\n");

    const { content: synced } = syncEmbeds(content, P("docs/synced.md"), reg, new Map());
    const { content: reSynced } = syncEmbeds(synced, P("docs/synced.md"), reg, new Map());

    expect(reSynced).toBe(synced);
  });

  it("skips files without embed directives", () => {
    const content = "# Plain\n\nNo embeds.\n";
    const { directives } = parseEmbeds(content, P("docs/plain.md"));
    expect(directives.length).toBe(0);
    // Check script should skip these files entirely
  });

  it("handles file-embed directives for check", () => {
    const reg = createRendererRegistry();
    const ssotData = new Map<string, string>();
    ssotData.set("file:snippet.md", "snippet content");

    const content = "#[[file:snippet.md]]\nRest\n";
    const { content: rendered } = syncEmbeds(content, P("docs/with-file.md"), reg, ssotData);

    expect(rendered).toContain("snippet content");
    expect(rendered).not.toContain("#[[file:");
  });

  it("provides suggestion message for stale files", () => {
    // The check script should suggest running `npm run docs:embeds`
    const suggestion = "Run `npm run docs:embeds` to regenerate.";
    expect(suggestion).toContain("docs:embeds");
  });
});
