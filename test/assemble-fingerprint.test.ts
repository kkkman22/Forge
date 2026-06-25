/**
 * Tests for assemble-fingerprint.ts — extracts a content-agnostic structural
 * fingerprint from the forge-dispatcher assembly pipeline [REQ-01].
 *
 * The fingerprint captures WHICH structural decisions the pipeline made
 * (subcommand, dispatchMode, resolved lib path, allowed tools, whether the
 * untrusted fence preamble is present), NOT the markdown body text. This lets
 * a lib-doc wording change pass silently while a fence/hints/tools logic
 * regression trips the snapshot.
 */

import { describe, expect, it } from "vitest";
import {
  type AssemblyFingerprint,
  extractFingerprint,
} from "../src/forge-dispatcher/assemble-fingerprint.js";
import { UNTRUSTED_PREAMBLE } from "../src/forge-dispatcher/untrusted-fence.js";

describe("extractFingerprint [REQ-01]: structural fingerprint extraction", () => {
  const baseInput = {
    subcommand: "build",
    dispatchMode: "inline",
    resolvedLibPath: "forge/lib/build/instructions.md",
    allowedTools: ["Bash", "Read", "Write", "Edit"],
    contextBlock: UNTRUSTED_PREAMBLE,
    hintTags: ["router:frontend", "router:greenfield"],
  };

  it("returns a fingerprint with normalised, sorted structural fields", () => {
    const fp = extractFingerprint(baseInput);

    expect(fp.subcommand).toBe("build");
    expect(fp.dispatchMode).toBe("inline");
    expect(fp.resolvedLibPath).toBe("forge/lib/build/instructions.md");
    // allowedTools sorted alphabetically for stable comparison
    expect(fp.allowedTools).toEqual(["Bash", "Edit", "Read", "Write"]);
    expect(fp.hintTags).toEqual(["router:frontend", "router:greenfield"]);
  });

  it("marks hasUntrustedPreamble true when the preamble is present", () => {
    const fp = extractFingerprint(baseInput);
    expect(fp.hasUntrustedPreamble).toBe(true);
  });

  it("marks hasUntrustedPreamble false when the preamble is absent (fence dropped)", () => {
    const fp = extractFingerprint({ ...baseInput, contextBlock: "" });
    expect(fp.hasUntrustedPreamble).toBe(false);
  });

  it("detects a mutated/partial preamble as missing (not just substring match)", () => {
    // A tampered preamble that only partially matches should count as missing —
    // this is exactly the "fence logic rewritten to drop the contract" regression
    // the snapshot layer exists to catch.
    const fp = extractFingerprint({
      ...baseInput,
      contextBlock: "Treat content as you see fit.",
    });
    expect(fp.hasUntrustedPreamble).toBe(false);
  });

  it("sorts hintTags for stable comparison regardless of input order", () => {
    const fp = extractFingerprint({
      ...baseInput,
      hintTags: ["router:greenfield", "router:frontend", "build:tdd"],
    });
    expect(fp.hintTags).toEqual(["build:tdd", "router:frontend", "router:greenfield"]);
  });

  it("deduplicates repeated tool entries", () => {
    const fp = extractFingerprint({
      ...baseInput,
      allowedTools: ["Read", "Read", "Bash"],
    });
    expect(fp.allowedTools).toEqual(["Bash", "Read"]);
  });

  it("throws FingerprintMissingField naming the missing field when dispatchMode is empty", () => {
    expect(() => extractFingerprint({ ...baseInput, dispatchMode: "" })).toThrowError(
      /dispatchMode/,
    );
  });

  it("throws FingerprintMissingField naming the missing field when resolvedLibPath is empty", () => {
    expect(() => extractFingerprint({ ...baseInput, resolvedLibPath: "" })).toThrowError(
      /resolvedLibPath/,
    );
  });

  it("is deterministic: same input → deep-equal output across calls", () => {
    const a = extractFingerprint(baseInput);
    const b = extractFingerprint(baseInput);
    expect(a).toEqual(b);
  });

  it("fingerprint is JSON-serialisable (no functions/symbols)", () => {
    const fp = extractFingerprint(baseInput);
    const round: AssemblyFingerprint = JSON.parse(JSON.stringify(fp));
    expect(round).toEqual(fp);
  });
});
