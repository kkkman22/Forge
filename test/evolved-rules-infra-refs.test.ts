import { describe, expect, it } from "vitest";
import {
  extractBacktickPathsWithSections,
  parseInfraRefs,
  validateInfraRefs,
} from "../src/evolved-rules-infra-refs.js";

describe("extractBacktickPathsWithSections", () => {
  it("extracts path without section", () => {
    expect(extractBacktickPathsWithSections("`CONTRIBUTING.md` only")).toEqual([
      { path: "CONTRIBUTING.md", section: null },
    ]);
  });

  it("extracts path with §section", () => {
    expect(
      extractBacktickPathsWithSections("`skills/tinkerman-pack/SKILL.md` §Subcommands"),
    ).toEqual([{ path: "skills/tinkerman-pack/SKILL.md", section: "Subcommands" }]);
  });

  it("extracts multiple refs joined by +", () => {
    const line = "`a.md` §Foo + `b.ts` + `c.json`";
    const refs = extractBacktickPathsWithSections(line);
    expect(refs).toHaveLength(3);
    expect(refs[0]).toEqual({ path: "a.md", section: "Foo" });
    expect(refs[1]).toEqual({ path: "b.ts", section: null });
    expect(refs[2]).toEqual({ path: "c.json", section: null });
  });

  it("ignores backticked non-path content (prose terms)", () => {
    const refs = extractBacktickPathsWithSections("uses `Map` for `lookup.ts`");
    expect(refs).toHaveLength(1);
    expect(refs[0].path).toBe("lookup.ts");
  });

  it("handles Chinese section text", () => {
    const refs = extractBacktickPathsWithSections("`skills/foo/SKILL.md` §执行流程");
    expect(refs[0].section).toBe("执行流程");
  });
});

describe("parseInfraRefs", () => {
  const sampleBody = `# Rules

### R1: Implicit Idle

**Content**: ...
**Infra_Ref**: \`skills/shared/next-step-protocol.md\` §规则 3 + "三种违规形态"表

### R2: Review Existence

**Content**: ...
**Infra_Ref**: \`.claude/agents/spec-check.md\` Check Item 5 + Severity Judgment 表

### R3: No Infra Ref Here

**Content**: ...
`;

  it("parses Infra_Ref lines across rules", () => {
    const refs = parseInfraRefs(sampleBody);
    expect(refs).toHaveLength(2);
    expect(refs[0].ruleId).toBe("R1");
    expect(refs[0].path).toBe("skills/shared/next-step-protocol.md");
    expect(refs[1].ruleId).toBe("R2");
    expect(refs[1].path).toBe(".claude/agents/spec-check.md");
  });

  it("returns empty array when no rules have Infra_Ref", () => {
    const body = `### R1: Rule Without Ref\n\n**Content**: ...\n`;
    expect(parseInfraRefs(body)).toEqual([]);
  });

  it("ignores malformed rule blocks (no heading)", () => {
    const body = `Some text without any heading.\n**Infra_Ref**: \`foo.md\``;
    expect(parseInfraRefs(body)).toEqual([]);
  });
});

describe("validateInfraRefs", () => {
  const refs = [
    {
      ruleId: "R1",
      path: "skills/foo/SKILL.md",
      section: "Subcommands",
      rawLine: "",
    },
    {
      ruleId: "R2",
      path: "nonexistent.md",
      section: null,
      rawLine: "",
    },
    {
      ruleId: "R3",
      path: "config.json",
      section: null,
      rawLine: "",
    },
  ];

  it("flags non-existent files", () => {
    const mockFs = {
      fileExists: (p: string) => p === "skills/foo/SKILL.md" || p === "config.json",
      readFile: () => "## Subcommands\n\nBody here.",
    };
    const verdicts = validateInfraRefs(refs, mockFs);
    expect(verdicts[0].valid).toBe(true);
    expect(verdicts[1].valid).toBe(false);
    expect(verdicts[1].reason).toContain("does not exist");
    expect(verdicts[2].valid).toBe(true);
  });

  it("flags missing sections in markdown refs", () => {
    const mockFs = {
      fileExists: () => true,
      readFile: (p: string) =>
        p === "skills/foo/SKILL.md" ? "## Other Section\n\nNo Subcommands here." : "",
    };
    const verdicts = validateInfraRefs(refs, mockFs);
    expect(verdicts[0].valid).toBe(false);
    expect(verdicts[0].reason).toContain("section");
  });

  it("accepts bolded paragraph as section match", () => {
    const mockFs = {
      fileExists: () => true,
      readFile: () => "Some text with **Subcommands** reference.",
    };
    const verdicts = validateInfraRefs(refs, mockFs);
    expect(verdicts[0].valid).toBe(true);
  });

  it("accepts plain text match for non-header section names", () => {
    const mockFs = {
      fileExists: () => true,
      readFile: () => "Step 4a is used in the Plan approval flow.",
    };
    const refs2 = [
      {
        ruleId: "R1",
        path: "foo.md",
        section: "Step 4a",
        rawLine: "",
      },
    ];
    const verdicts = validateInfraRefs(refs2, mockFs);
    expect(verdicts[0].valid).toBe(true);
  });

  it("skips section check for non-markdown refs", () => {
    const mockFs = {
      fileExists: () => true,
      readFile: () => "",
    };
    const refs3 = [
      {
        ruleId: "R1",
        path: "biome.json",
        section: "Some Hint",
        rawLine: "",
      },
    ];
    const verdicts = validateInfraRefs(refs3, mockFs);
    expect(verdicts[0].valid).toBe(true);
  });
});
