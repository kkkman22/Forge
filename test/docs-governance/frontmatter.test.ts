import { describe, expect, it } from "vitest";
import {
  frontmatterSchema,
  CATEGORY_VALUES,
  AUDIENCE_VALUES,
  CATEGORY_ORDER,
} from "../../src/docs-governance/frontmatter/schema.js";
import type { Frontmatter, Category, Audience } from "../../src/docs-governance/types.js";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const validInput = {
  title: "Getting Started Guide",
  category: "getting-started" as Category,
  audience: ["new-user"] as Audience[],
  updated: "2026-05-01",
  owner: "Forge Team",
};

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
describe("exported constants", () => {
  it("CATEGORY_VALUES has exactly 7 values", () => {
    expect(CATEGORY_VALUES).toHaveLength(7);
    expect(CATEGORY_VALUES).toEqual([
      "getting-started",
      "daily-use",
      "advanced",
      "troubleshooting",
      "contributing",
      "reference",
      "audits",
    ]);
  });

  it("AUDIENCE_VALUES has exactly 6 values", () => {
    expect(AUDIENCE_VALUES).toHaveLength(6);
    expect(AUDIENCE_VALUES).toEqual([
      "new-user",
      "daily-developer",
      "advanced-user",
      "contributor",
      "maintainer",
      "auditor",
    ]);
  });

  it("CATEGORY_ORDER is a non-empty array", () => {
    expect(CATEGORY_ORDER.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Valid frontmatter
// ─────────────────────────────────────────────────────────────
describe("frontmatterSchema — valid input", () => {
  it("accepts valid frontmatter", () => {
    const result = frontmatterSchema.parse(validInput);
    expect(result.title).toBe("Getting Started Guide");
    expect(result.category).toBe("getting-started");
    expect(result.audience).toEqual(["new-user"]);
    expect(result.updated).toBe("2026-05-01");
    expect(result.owner).toBe("Forge Team");
  });

  it("accepts frontmatter with mirror_of", () => {
    const result = frontmatterSchema.parse({
      ...validInput,
      mirror_of: "docs/en/guide.md",
    });
    expect(result.mirror_of).toBe("docs/en/guide.md");
  });
});

// ─────────────────────────────────────────────────────────────
// title constraints
// ─────────────────────────────────────────────────────────────
describe("frontmatterSchema — title", () => {
  it("rejects empty title", () => {
    expect(() => frontmatterSchema.parse({ ...validInput, title: "" })).toThrow();
  });

  it("rejects title exceeding 200 chars", () => {
    expect(() =>
      frontmatterSchema.parse({ ...validInput, title: "A".repeat(201) }),
    ).toThrow();
  });

  it("accepts title of exactly 200 chars", () => {
    expect(() =>
      frontmatterSchema.parse({ ...validInput, title: "A".repeat(200) }),
    ).not.toThrow();
  });

  it("accepts CJK characters in title", () => {
    const cjkTitle = "入门指南：快速上手 Forge 工具链";
    const result = frontmatterSchema.parse({ ...validInput, title: cjkTitle });
    expect(result.title).toBe(cjkTitle);
  });
});

// ─────────────────────────────────────────────────────────────
// category constraints
// ─────────────────────────────────────────────────────────────
describe("frontmatterSchema — category", () => {
  it("rejects invalid category", () => {
    expect(() =>
      frontmatterSchema.parse({ ...validInput, category: "invalid" }),
    ).toThrow();
  });

  it("accepts all 7 category values", () => {
    for (const cat of CATEGORY_VALUES) {
      expect(() =>
        frontmatterSchema.parse({ ...validInput, category: cat }),
      ).not.toThrow();
    }
  });
});

// ─────────────────────────────────────────────────────────────
// audience constraints
// ─────────────────────────────────────────────────────────────
describe("frontmatterSchema — audience", () => {
  it("rejects empty audience array", () => {
    expect(() =>
      frontmatterSchema.parse({ ...validInput, audience: [] }),
    ).toThrow();
  });

  it("rejects audience with more than 6 items", () => {
    expect(() =>
      frontmatterSchema.parse({
        ...validInput,
        audience: [
          "new-user",
          "daily-developer",
          "advanced-user",
          "contributor",
          "maintainer",
          "auditor",
          "new-user", // 7th even if duplicate
        ],
      }),
    ).toThrow();
  });

  it("deduplicates audience values", () => {
    const result = frontmatterSchema.parse({
      ...validInput,
      audience: ["new-user", "new-user", "daily-developer"],
    });
    expect(result.audience).toEqual(["new-user", "daily-developer"]);
  });

  it("accepts all 6 audience values at once", () => {
    const allAudiences: Audience[] = [
      "new-user",
      "daily-developer",
      "advanced-user",
      "contributor",
      "maintainer",
      "auditor",
    ];
    const result = frontmatterSchema.parse({
      ...validInput,
      audience: allAudiences,
    });
    expect(result.audience).toHaveLength(6);
  });

  it("rejects invalid audience value", () => {
    expect(() =>
      frontmatterSchema.parse({
        ...validInput,
        audience: ["new-user", "invalid-role" as Audience],
      }),
    ).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// updated date constraints
// ─────────────────────────────────────────────────────────────
describe("frontmatterSchema — updated", () => {
  it("rejects date before 2026-04-28", () => {
    expect(() =>
      frontmatterSchema.parse({ ...validInput, updated: "2026-04-27" }),
    ).toThrow();
  });

  it("accepts date 2026-04-28 (boundary)", () => {
    expect(() =>
      frontmatterSchema.parse({ ...validInput, updated: "2026-04-28" }),
    ).not.toThrow();
  });

  it("accepts today's date", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(() =>
      frontmatterSchema.parse({ ...validInput, updated: today }),
    ).not.toThrow();
  });

  it("rejects future date beyond today", () => {
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 1);
    const futureStr = future.toISOString().slice(0, 10);
    expect(() =>
      frontmatterSchema.parse({ ...validInput, updated: futureStr }),
    ).toThrow();
  });

  it("rejects non-YYYY-MM-DD format", () => {
    expect(() =>
      frontmatterSchema.parse({ ...validInput, updated: "2026/05/01" }),
    ).toThrow();
  });

  it("rejects malformed date string", () => {
    expect(() =>
      frontmatterSchema.parse({ ...validInput, updated: "not-a-date" }),
    ).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// owner constraints
// ─────────────────────────────────────────────────────────────
describe("frontmatterSchema — owner", () => {
  it("rejects empty owner", () => {
    expect(() =>
      frontmatterSchema.parse({ ...validInput, owner: "" }),
    ).toThrow();
  });

  it("rejects owner exceeding 100 chars", () => {
    expect(() =>
      frontmatterSchema.parse({ ...validInput, owner: "X".repeat(101) }),
    ).toThrow();
  });

  it("accepts owner of exactly 100 chars", () => {
    expect(() =>
      frontmatterSchema.parse({ ...validInput, owner: "X".repeat(100) }),
    ).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// mirror_of constraints
// ─────────────────────────────────────────────────────────────
describe("frontmatterSchema — mirror_of", () => {
  it("accepts valid relative path", () => {
    const result = frontmatterSchema.parse({
      ...validInput,
      mirror_of: "docs/en/guide.md",
    });
    expect(result.mirror_of).toBe("docs/en/guide.md");
  });

  it("rejects path starting with /", () => {
    expect(() =>
      frontmatterSchema.parse({
        ...validInput,
        mirror_of: "/docs/en/guide.md",
      }),
    ).toThrow();
  });

  it("rejects path with .. segments", () => {
    expect(() =>
      frontmatterSchema.parse({
        ...validInput,
        mirror_of: "../docs/en/guide.md",
      }),
    ).toThrow();
  });

  it("rejects path with .. in middle segments", () => {
    expect(() =>
      frontmatterSchema.parse({
        ...validInput,
        mirror_of: "docs/../secret.md",
      }),
    ).toThrow();
  });

  it("rejects mirror_of exceeding 500 chars", () => {
    expect(() =>
      frontmatterSchema.parse({
        ...validInput,
        mirror_of: "a".repeat(501),
      }),
    ).toThrow();
  });

  it("accepts mirror_of of exactly 500 chars", () => {
    expect(() =>
      frontmatterSchema.parse({
        ...validInput,
        mirror_of: "a".repeat(500),
      }),
    ).not.toThrow();
  });

  it("allows mirror_of to be undefined", () => {
    const { mirror_of: _, ...withoutMirror } = validInput as any;
    expect(() => frontmatterSchema.parse(withoutMirror)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// Unknown fields & missing required fields
// ─────────────────────────────────────────────────────────────
describe("frontmatterSchema — strictness", () => {
  it("rejects unknown fields", () => {
    expect(() =>
      frontmatterSchema.parse({ ...validInput, extra_field: "oops" }),
    ).toThrow();
  });

  it("rejects missing title", () => {
    const { title: _, ...noTitle } = validInput;
    expect(() => frontmatterSchema.parse(noTitle)).toThrow();
  });

  it("rejects missing category", () => {
    const { category: _, ...noCategory } = validInput;
    expect(() => frontmatterSchema.parse(noCategory)).toThrow();
  });

  it("rejects missing audience", () => {
    const { audience: _, ...noAudience } = validInput;
    expect(() => frontmatterSchema.parse(noAudience)).toThrow();
  });

  it("rejects missing updated", () => {
    const { updated: _, ...noUpdated } = validInput;
    expect(() => frontmatterSchema.parse(noUpdated)).toThrow();
  });

  it("rejects missing owner", () => {
    const { owner: _, ...noOwner } = validInput;
    expect(() => frontmatterSchema.parse(noOwner)).toThrow();
  });
});
