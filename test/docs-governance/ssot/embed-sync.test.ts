import { describe, expect, it } from "vitest";
import { syncEmbeds } from "../../../src/docs-governance/ssot/embed-sync.js";
import { createRendererRegistry } from "../../../src/docs-governance/ssot/renderer-registry.js";
import type { DocPath, RendererFn, RendererRegistry } from "../../../src/docs-governance/types.js";

const P = (s: string) => s as unknown as DocPath;

/** Helper: create a registry with a simple echo renderer that wraps content in a marker. */
function registryWithEcho(): RendererRegistry {
  const reg = createRendererRegistry();
  const echoRenderer: RendererFn = (input) => ({
    markdown: `<!-- rendered:${input.topic} -->\n| ${input.topic} data |`,
    diagnostics: [],
  });
  reg.register("echo", echoRenderer);
  reg.register("commands-table", echoRenderer);
  reg.register("routing-table", echoRenderer);
  reg.register("security-tiers", echoRenderer);
  reg.register("json-list", echoRenderer);
  return reg;
}

function emptySsotData(): Map<string, string> {
  return new Map();
}

describe("syncEmbeds", () => {
  // ─── Simple begin/end block replacement ────────────────
  it("replaces a single ssot-block with rendered content", () => {
    const content = [
      "# Title",
      "",
      "<!-- ssot:begin topic=commands render=echo -->",
      "| old data |",
      "<!-- ssot:end topic=commands -->",
      "",
      "Footer",
    ].join("\n");

    const { content: result, diagnostics } = syncEmbeds(
      content,
      P("docs/guide.md"),
      registryWithEcho(),
      emptySsotData(),
    );

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(result).toContain("<!-- rendered:commands -->");
    expect(result).toContain("| commands data |");
    expect(result).not.toContain("| old data |");
    // External bytes preserved
    expect(result).toContain("# Title");
    expect(result).toContain("Footer");
  });

  // ─── Multiple blocks in one file ───────────────────────
  it("replaces multiple ssot-blocks independently", () => {
    const content = [
      "# Doc",
      "<!-- ssot:begin topic=commands render=echo -->",
      "commands old",
      "<!-- ssot:end topic=commands -->",
      "Middle text",
      "<!-- ssot:begin topic=routing render=echo -->",
      "routing old",
      "<!-- ssot:end topic=routing -->",
      "End",
    ].join("\n");

    const { content: result, diagnostics } = syncEmbeds(
      content,
      P("docs/multi.md"),
      registryWithEcho(),
      emptySsotData(),
    );

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(result).toContain("<!-- rendered:commands -->");
    expect(result).toContain("<!-- rendered:routing -->");
    expect(result).toContain("Middle text");
    expect(result).toContain("End");
    expect(result).not.toContain("commands old");
    expect(result).not.toContain("routing old");
  });

  // ─── #[[file:...]] replacement ─────────────────────────
  it("replaces #[[file:relative]] with file content from ssotData", () => {
    const content = [
      "# Title",
      "",
      "#[[file:shared/snippet.md]]",
      "",
      "After embed",
    ].join("\n");

    const ssotData = new Map<string, string>();
    ssotData.set("file:shared/snippet.md", "This is the **embedded** snippet.");

    const { content: result, diagnostics } = syncEmbeds(
      content,
      P("docs/guide.md"),
      registryWithEcho(),
      ssotData,
    );

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(result).toContain("This is the **embedded** snippet.");
    expect(result).not.toContain("#[[file:");
    expect(result).toContain("# Title");
    expect(result).toContain("After embed");
  });

  // ─── #[[file:...]] missing from ssotData → error ──────
  it("reports error when #[[file:...]] content not found in ssotData", () => {
    const content = "#[[file:missing.md]]\n";

    const { diagnostics } = syncEmbeds(
      content,
      P("docs/guide.md"),
      registryWithEcho(),
      emptySsotData(),
    );

    expect(diagnostics.some((d) => d.severity === "error" && d.message.includes("missing.md"))).toBe(
      true,
    );
  });

  // ─── Unclosed marker detection ─────────────────────────
  it("reports diagnostic for unclosed ssot:begin and preserves content", () => {
    const content = [
      "# Title",
      "<!-- ssot:begin topic=commands render=echo -->",
      "stale content",
    ].join("\n");

    const { content: result, diagnostics } = syncEmbeds(
      content,
      P("docs/broken.md"),
      registryWithEcho(),
      emptySsotData(),
    );

    expect(diagnostics.some((d) => d.severity === "error" && d.code === "EMBED_UNCLOSED")).toBe(true);
    // Content should be preserved unchanged since block is invalid
    expect(result).toBe(content);
  });

  // ─── Unknown renderer error ────────────────────────────
  it("reports error for unknown renderer", () => {
    const content = [
      "<!-- ssot:begin topic=commands render=nonexistent -->",
      "data",
      "<!-- ssot:end topic=commands -->",
    ].join("\n");

    const { diagnostics } = syncEmbeds(
      content,
      P("docs/guide.md"),
      registryWithEcho(),
      emptySsotData(),
    );

    expect(
      diagnostics.some(
        (d) =>
          d.severity === "error" && d.message.includes("nonexistent") && d.code === "EMBED_UNKNOWN_RENDERER",
      ),
    ).toBe(true);
  });

  // ─── Idempotency: sync(sync(content)) === sync(content) ─
  it("is idempotent: double sync produces identical content", () => {
    const content = [
      "# Title",
      "",
      "<!-- ssot:begin topic=commands render=echo -->",
      "old",
      "<!-- ssot:end topic=commands -->",
      "",
      "Footer",
    ].join("\n");

    const reg = registryWithEcho();
    const first = syncEmbeds(content, P("docs/idem.md"), reg, emptySsotData());
    const second = syncEmbeds(first.content, P("docs/idem.md"), reg, emptySsotData());

    expect(second.content).toBe(first.content);
    // Second run should produce no new diagnostics (the content is already synced)
    expect(second.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  // ─── External bytes preserved (P13) ────────────────────
  it("preserves bytes outside embed blocks exactly (P13)", () => {
    const before = "# Title with <special> & \"chars\"\n\nParagraph.\n\n";
    const block = "<!-- ssot:begin topic=test render=echo -->\ninner\n<!-- ssot:end topic=test -->";
    const after = "\n\nTrailing with unicode: éèê üöä 🎉\n";
    const content = before + block + after;

    const { content: result } = syncEmbeds(content, P("docs/p13.md"), registryWithEcho(), emptySsotData());

    // Before and after must be byte-identical
    expect(result.startsWith(before)).toBe(true);
    expect(result.endsWith(after)).toBe(true);
  });

  // ─── No directives: returns content unchanged ──────────
  it("returns content unchanged when no directives present", () => {
    const content = "# Plain\n\nNo embeds.\n";
    const { content: result, diagnostics } = syncEmbeds(
      content,
      P("docs/plain.md"),
      registryWithEcho(),
      emptySsotData(),
    );

    expect(result).toBe(content);
    expect(diagnostics).toHaveLength(0);
  });

  // ─── Renderer diagnostics propagated ───────────────────
  it("propagates diagnostics from renderer", () => {
    const reg = createRendererRegistry();
    const failingRenderer: RendererFn = () => ({
      markdown: "",
      diagnostics: [
        {
          script: "test-renderer",
          severity: "warning",
          file: "" as DocPath,
          message: "renderer warning",
        },
      ],
    });
    reg.register("failing", failingRenderer);

    const content = [
      "<!-- ssot:begin topic=test render=failing -->",
      "data",
      "<!-- ssot:end topic=test -->",
    ].join("\n");

    const { diagnostics } = syncEmbeds(content, P("docs/warn.md"), reg, emptySsotData());
    expect(diagnostics.some((d) => d.message === "renderer warning")).toBe(true);
  });

  // ─── Mixed ssot-block and file-embed ───────────────────
  it("handles mix of ssot-block and file-embed directives", () => {
    const content = [
      "#[[file:header.md]]",
      "",
      "<!-- ssot:begin topic=commands render=echo -->",
      "old commands",
      "<!-- ssot:end topic=commands -->",
      "",
      "#[[file:footer.md]]",
    ].join("\n");

    const ssotData = new Map<string, string>();
    ssotData.set("file:header.md", "# Header from file");
    ssotData.set("file:footer.md", "---\nFooter from file");

    const { content: result, diagnostics } = syncEmbeds(
      content,
      P("docs/mixed.md"),
      registryWithEcho(),
      ssotData,
    );

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(result).toContain("# Header from file");
    expect(result).toContain("Footer from file");
    expect(result).toContain("<!-- rendered:commands -->");
    expect(result).not.toContain("#[[file:");
    expect(result).not.toContain("old commands");
  });

  // ─── Topic mismatch: preserves original content ────────
  it("preserves original content on topic mismatch error", () => {
    const content = [
      "<!-- ssot:begin topic=a render=echo -->",
      "data",
      "<!-- ssot:end topic=b -->",
    ].join("\n");

    const { content: result, diagnostics } = syncEmbeds(
      content,
      P("docs/mismatch.md"),
      registryWithEcho(),
      emptySsotData(),
    );

    expect(diagnostics.some((d) => d.code === "EMBED_TOPIC_MISMATCH")).toBe(true);
    expect(result).toBe(content);
  });

  // ─── Nesting detection: preserves original content ─────
  it("preserves original content when nesting detected", () => {
    const content = [
      "<!-- ssot:begin topic=outer render=echo -->",
      "outer",
      "<!-- ssot:begin topic=inner render=echo -->",
      "inner",
      "<!-- ssot:end topic=inner -->",
      "<!-- ssot:end topic=outer -->",
    ].join("\n");

    const { content: result, diagnostics } = syncEmbeds(
      content,
      P("docs/nested.md"),
      registryWithEcho(),
      emptySsotData(),
    );

    expect(diagnostics.some((d) => d.code === "EMBED_NESTING")).toBe(true);
    // Content is preserved since invalid blocks are not replaced
    expect(result).toBe(content);
  });

  // ─── begin/end markers preserved in output ─────────────
  it("preserves begin and end marker lines in output", () => {
    const content = [
      "<!-- ssot:begin topic=commands render=echo -->",
      "old",
      "<!-- ssot:end topic=commands -->",
    ].join("\n");

    const { content: result } = syncEmbeds(
      content,
      P("docs/markers.md"),
      registryWithEcho(),
      emptySsotData(),
    );

    expect(result).toContain("<!-- ssot:begin topic=commands render=echo -->");
    expect(result).toContain("<!-- ssot:end topic=commands -->");
  });

  // ─── Same topic multiple times: all replaced ───────────
  it("replaces all occurrences of same topic", () => {
    const content = [
      "<!-- ssot:begin topic=commands render=echo -->",
      "first old",
      "<!-- ssot:end topic=commands -->",
      "---",
      "<!-- ssot:begin topic=commands render=echo -->",
      "second old",
      "<!-- ssot:end topic=commands -->",
    ].join("\n");

    const { content: result, diagnostics } = syncEmbeds(
      content,
      P("docs/dup.md"),
      registryWithEcho(),
      emptySsotData(),
    );

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    // Both blocks should be replaced — count occurrences of rendered marker
    const matches = result.match(/<!-- rendered:commands -->/g);
    expect(matches).toHaveLength(2);
    expect(result).not.toContain("first old");
    expect(result).not.toContain("second old");
  });

  // ─── Empty file content ────────────────────────────────
  it("handles empty file content", () => {
    const { content: result, diagnostics } = syncEmbeds(
      "",
      P("docs/empty.md"),
      registryWithEcho(),
      emptySsotData(),
    );

    expect(result).toBe("");
    expect(diagnostics).toHaveLength(0);
  });

  // ─── File embed at exact start of file ─────────────────
  it("replaces #[[file:...]] at start of file", () => {
    const content = "#[[file:top.md]]\nRest of doc\n";

    const ssotData = new Map<string, string>();
    ssotData.set("file:top.md", "Top content");

    const { content: result, diagnostics } = syncEmbeds(
      content,
      P("docs/top.md"),
      registryWithEcho(),
      ssotData,
    );

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(result).toBe("Top content\nRest of doc\n");
  });

  // ─── Renderer receives correct ssotData ────────────────
  it("passes ssot source data to renderer for ssot-blocks", () => {
    const reg = createRendererRegistry();
    let receivedSource: unknown = null;
    const captureRenderer: RendererFn = (input) => {
      receivedSource = input.source;
      return { markdown: `source:${JSON.stringify(input.source)}`, diagnostics: [] };
    };
    reg.register("capture", captureRenderer);

    const ssotData = new Map<string, string>();
    ssotData.set("commands", '[{"name":"test"}]');

    const content = [
      "<!-- ssot:begin topic=commands render=capture -->",
      "old",
      "<!-- ssot:end topic=commands -->",
    ].join("\n");

    const { content: result } = syncEmbeds(content, P("docs/capture.md"), reg, ssotData);

    expect(receivedSource).toBe('[{"name":"test"}]');
    expect(result).toContain('source:');
  });
});
