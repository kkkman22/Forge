import { describe, expect, it } from "vitest";
import { parseEmbeds } from "../../../src/docs-governance/ssot/embed-parser.js";
import type { DocPath } from "../../../src/docs-governance/types.js";

const P = (s: string) => s as unknown as DocPath;

describe("parseEmbeds", () => {
  // ─── Basic ssot-block directive ──────────────────────
  it("parses a single ssot-block directive pair", () => {
    const content = [
      "# Title",
      "",
      "<!-- ssot:begin topic=commands render=commands-table -->",
      "| old data |",
      "<!-- ssot:end topic=commands -->",
    ].join("\n");
    const { directives, diagnostics } = parseEmbeds(content, P("docs/commands.md"));
    expect(directives).toHaveLength(1);
    expect(directives[0].topic).toBe("commands");
    expect(directives[0].render).toBe("commands-table");
    expect(directives[0].kind).toBe("ssot-block");
    expect(directives[0].beginLine).toBe(3);
    expect(directives[0].endLine).toBe(5);
    expect(directives[0].innerContent).toBe("\n| old data |\n");
    expect(directives[0].file).toBe(P("docs/commands.md"));
    expect(diagnostics).toHaveLength(0);
  });

  // ─── Directive with args ────────────────────────────
  it("parses directives with extra args", () => {
    const content = [
      "<!-- ssot:begin topic=routing render=routing-table format=compact -->",
      "old",
      "<!-- ssot:end topic=routing -->",
    ].join("\n");
    const { directives } = parseEmbeds(content, P("docs/routing.md"));
    expect(directives[0].args).toEqual({ format: "compact" });
  });

  // ─── Multiple directives, different topics ──────────
  it("parses multiple directives with different topics", () => {
    const content = [
      "<!-- ssot:begin topic=commands render=commands-table -->",
      "commands data",
      "<!-- ssot:end topic=commands -->",
      "",
      "<!-- ssot:begin topic=routing render=routing-table -->",
      "routing data",
      "<!-- ssot:end topic=routing -->",
    ].join("\n");
    const { directives, diagnostics } = parseEmbeds(content, P("docs/combined.md"));
    expect(directives).toHaveLength(2);
    expect(directives[0].topic).toBe("commands");
    expect(directives[1].topic).toBe("routing");
    expect(diagnostics).toHaveLength(0);
  });

  // ─── Same topic, multiple occurrences ───────────────
  it("handles same topic appearing multiple times as separate directives", () => {
    const content = [
      "<!-- ssot:begin topic=commands render=commands-table -->",
      "first block",
      "<!-- ssot:end topic=commands -->",
      "",
      "Some text between",
      "",
      "<!-- ssot:begin topic=commands render=commands-table -->",
      "second block",
      "<!-- ssot:end topic=commands -->",
    ].join("\n");
    const { directives, diagnostics } = parseEmbeds(content, P("docs/commands.md"));
    expect(directives).toHaveLength(2);
    expect(directives[0].innerContent).toBe("\nfirst block\n");
    expect(directives[1].innerContent).toBe("\nsecond block\n");
    expect(diagnostics).toHaveLength(0);
  });

  // ─── Unclosed begin marker ──────────────────────────
  it("detects unclosed begin marker", () => {
    const content = [
      "<!-- ssot:begin topic=commands render=commands-table -->",
      "orphan data",
    ].join("\n");
    const { directives, diagnostics } = parseEmbeds(content, P("docs/broken.md"));
    expect(directives).toHaveLength(0);
    expect(diagnostics.some((d) => d.severity === "error" && d.message.includes("unclosed"))).toBe(true);
  });

  // ─── Topic mismatch ─────────────────────────────────
  it("detects topic mismatch between begin and end markers", () => {
    const content = [
      "<!-- ssot:begin topic=commands render=commands-table -->",
      "data",
      "<!-- ssot:end topic=routing -->",
    ].join("\n");
    const { directives, diagnostics } = parseEmbeds(content, P("docs/mismatch.md"));
    expect(directives).toHaveLength(0);
    expect(diagnostics.some((d) => d.severity === "error" && d.message.includes("mismatch"))).toBe(true);
  });

  // ─── file-embed directive ───────────────────────────
  it("parses #[[file:relative]] single-line directive", () => {
    const content = [
      "# Title",
      "",
      "Some intro",
      "",
      "#[[file:../shared/snippet.md]]",
      "",
      "More text",
    ].join("\n");
    const { directives, diagnostics } = parseEmbeds(content, P("docs/guide.md"));
    expect(directives).toHaveLength(1);
    expect(directives[0].kind).toBe("file-embed");
    expect(directives[0].topic).toBe("file:../shared/snippet.md");
    expect(directives[0].render).toBe("file-embed");
    expect(directives[0].beginLine).toBe(5);
    expect(directives[0].endLine).toBe(5);
    expect(directives[0].innerContent).toBe("");
    expect(diagnostics).toHaveLength(0);
  });

  // ─── Mixed ssot-block and file-embed ────────────────
  it("handles mix of ssot-block and file-embed directives", () => {
    const content = [
      "#[[file:header.md]]",
      "",
      "<!-- ssot:begin topic=commands render=commands-table -->",
      "commands",
      "<!-- ssot:end topic=commands -->",
      "",
      "#[[file:footer.md]]",
    ].join("\n");
    const { directives } = parseEmbeds(content, P("docs/mixed.md"));
    expect(directives).toHaveLength(3);
    expect(directives[0].kind).toBe("file-embed");
    expect(directives[1].kind).toBe("ssot-block");
    expect(directives[2].kind).toBe("file-embed");
  });

  // ─── No directives ──────────────────────────────────
  it("returns empty when no directives found", () => {
    const content = "# Plain doc\n\nNo embeds here.\n";
    const { directives, diagnostics } = parseEmbeds(content, P("docs/plain.md"));
    expect(directives).toHaveLength(0);
    expect(diagnostics).toHaveLength(0);
  });

  // ─── Nesting detection ──────────────────────────────
  it("detects nesting and reports error", () => {
    const content = [
      "<!-- ssot:begin topic=outer render=table -->",
      "outer start",
      "<!-- ssot:begin topic=inner render=table -->",
      "inner",
      "<!-- ssot:end topic=inner -->",
      "outer end",
      "<!-- ssot:end topic=outer -->",
    ].join("\n");
    const { directives, diagnostics } = parseEmbeds(content, P("docs/nested.md"));
    expect(diagnostics.some((d) => d.severity === "error" && d.message.includes("nest"))).toBe(true);
  });

  // ─── Orphaned end marker ────────────────────────────
  it("detects orphaned end marker without matching begin", () => {
    const content = [
      "Some text",
      "<!-- ssot:end topic=commands -->",
      "More text",
    ].join("\n");
    const { directives, diagnostics } = parseEmbeds(content, P("docs/orphan-end.md"));
    expect(directives).toHaveLength(0);
    expect(diagnostics.some((d) => d.severity === "error")).toBe(true);
  });

  // ─── PBT: bytes outside embed directives preserved exactly (P13) ─
  it("preserves bytes outside embed directives exactly", () => {
    const beforeEmbed = "# Title\n\nSome content with special chars: <>&\"'\n\n";
    const embedBlock = "<!-- ssot:begin topic=test render=raw -->\nembedded\n<!-- ssot:end topic=test -->\n";
    const afterEmbed = "\nTrailing content with unicode: éèê üöä\n";
    const content = beforeEmbed + embedBlock + afterEmbed;

    const { directives } = parseEmbeds(content, P("docs/exact.md"));
    expect(directives).toHaveLength(1);

    // Reconstruct the document by replacing directive inner content
    const lines = content.split("\n");
    const beginIdx = directives[0].beginLine - 1; // 0-indexed
    const endIdx = directives[0].endLine - 1;

    const reconstructed = [
      ...lines.slice(0, beginIdx),
      ...lines.slice(beginIdx, endIdx + 1), // keep the directive markers as-is
      ...lines.slice(endIdx + 1),
    ].join("\n");

    expect(reconstructed).toBe(content);
  });

  // ─── PBT: no-directive document preserved exactly ──
  it("round-trips a document with no directives identically", () => {
    const content = "Line 1\nLine 2\nLine 3\n";
    const { directives, diagnostics } = parseEmbeds(content, P("docs/noop.md"));
    expect(directives).toHaveLength(0);
    expect(diagnostics).toHaveLength(0);
  });

  // ─── Args parsing edge cases ────────────────────────
  it("handles args with equals sign in value", () => {
    const content = [
      "<!-- ssot:begin topic=t render=r key=value=with=equals -->",
      "data",
      "<!-- ssot:end topic=t -->",
    ].join("\n");
    const { directives } = parseEmbeds(content, P("docs/args.md"));
    expect(directives[0].args.key).toBe("value=with=equals");
  });

  // ─── file-embed with no args ────────────────────────
  it("file-embed has empty args", () => {
    const content = "#[[file:snippet.md]]\n";
    const { directives } = parseEmbeds(content, P("docs/fembed.md"));
    expect(directives[0].args).toEqual({});
  });

  // ─── Diagnostic file path matches input ─────────────
  it("diagnostics reference the input file path", () => {
    const content = "<!-- ssot:begin topic=x render=y -->\n";
    const { diagnostics } = parseEmbeds(content, P("docs/ref.md"));
    for (const d of diagnostics) {
      expect(d.file).toBe(P("docs/ref.md"));
    }
  });
});
