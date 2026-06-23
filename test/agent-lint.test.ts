import { describe, expect, it } from "vitest";
import {
  extractFrontmatter,
  getFrontmatterField,
  extractBody,
  hasCRLF,
  countWords,
  hasSection,
  lintAgentText,
  REQUIRED_FRONTMATTER,
  MIN_BODY_WORDS,
} from "../src/agent-lint.js";

describe("extractFrontmatter", () => {
  it("extracts frontmatter block", () => {
    expect(extractFrontmatter("---\nname: foo\n---\nbody")).toBe("name: foo");
  });
  it("returns null when no frontmatter", () => {
    expect(extractFrontmatter("# no fm")).toBeNull();
  });
});

describe("getFrontmatterField", () => {
  it("reads field value", () => {
    expect(getFrontmatterField("name: foo\ndescription: bar", "name")).toBe("foo");
  });
  it("strips surrounding quotes", () => {
    expect(getFrontmatterField('description: "hello"', "description")).toBe("hello");
  });
  it("returns null when field absent", () => {
    expect(getFrontmatterField("name: foo", "description")).toBeNull();
  });
});

describe("extractBody", () => {
  it("returns body after frontmatter", () => {
    expect(extractBody("---\nname: foo\n---\n# Title\ncontent")).toBe("# Title\ncontent");
  });
  it("returns full text when no frontmatter", () => {
    expect(extractBody("# just body")).toBe("# just body");
  });
});

describe("hasCRLF", () => {
  it("detects \\r\\n", () => {
    expect(hasCRLF("line1\r\nline2")).toBe(true);
  });
  it("detects lone \\r", () => {
    expect(hasCRLF("line1\rline2")).toBe(true);
  });
  it("returns false for LF-only", () => {
    expect(hasCRLF("line1\nline2")).toBe(false);
  });
});

describe("countWords", () => {
  it("counts english words", () => {
    expect(countWords("hello world foo bar")).toBe(4);
  });
  it("counts chinese chars as ~2 per word", () => {
    // 6 chinese chars → 3 words
    expect(countWords("你好世界测试")).toBe(3);
  });
  it("mixes english and chinese", () => {
    // "hello"=1 english, "世界"=2 chinese→1, "测试"=2 chinese→1, total 3
    expect(countWords("hello 世界 测试")).toBe(3);
  });
});

describe("hasSection", () => {
  it("matches ## section title case-insensitively", () => {
    expect(hasSection("## Identity\ncontent", "identity")).toBe(true);
  });
  it("returns false when section absent", () => {
    expect(hasSection("## Other\ncontent", "identity")).toBe(false);
  });
  it("does not match ### (only ## level)", () => {
    // ^## requires line start with ##, so ### (3 hashes) should NOT match
    expect(hasSection("### Identity", "identity")).toBe(false);
  });
});

describe("lintAgentText", () => {
  const validAgent = `---
name: test-agent
description: "A test agent"
model: inherit
---

## Identity
I am a test agent for validation.

## Mission
Do testing work with clear purpose and intent.

## Critical Rules
- Always verify before claiming done.

This agent has enough words to pass the minimum body length check that we require here.
More content to ensure the body word count is above fifty words total in the file body.`;

  it("passes a valid agent", () => {
    const issues = lintAgentText("test.md", validAgent);
    // 可能只有 section 缺失警告(如果 section 名不完全匹配),但不应有 ERROR
    const errors = issues.filter((i) => i.severity === "ERROR");
    expect(errors).toEqual([]);
  });

  it("errors on missing frontmatter", () => {
    const issues = lintAgentText("nofm.md", "# just a body no frontmatter here");
    const errors = issues.filter((i) => i.code === "NO_FRONTMATTER");
    expect(errors).toHaveLength(1);
  });

  it("errors on CRLF", () => {
    const crlfText = "---\r\nname: foo\r\ndescription: bar\r\n---\r\nbody";
    const issues = lintAgentText("crlf.md", crlfText);
    const crlfIssues = issues.filter((i) => i.code === "CRLF");
    expect(crlfIssues).toHaveLength(1);
  });

  it("errors on missing required field", () => {
    const missingDesc = `---
name: foo
model: inherit
---

## Identity
body content here with enough words to be long enough for the check.`;
    const issues = lintAgentText("nodesc.md", missingDesc);
    const missingDescIssues = issues.filter((i) => i.code === "MISSING_DESCRIPTION");
    expect(missingDescIssues).toHaveLength(1);
  });

  it("warns on short body", () => {
    const shortBody = `---
name: foo
description: bar
---

## Identity
short.`;
    const issues = lintAgentText("short.md", shortBody);
    const shortIssues = issues.filter((i) => i.code === "BODY_TOO_SHORT");
    expect(shortIssues).toHaveLength(1);
  });
});

describe("constants", () => {
  it("requires name and description", () => {
    expect(REQUIRED_FRONTMATTER).toEqual(["name", "description"]);
  });
  it("MIN_BODY_WORDS is 50", () => {
    expect(MIN_BODY_WORDS).toBe(50);
  });
});
