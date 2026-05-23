/**
 * T-02: Three-file parser tests — parseRequirementsMarkdown, parseDesignMarkdown,
 * parseTasksMarkdown pure functions.
 *
 * Validates: Requirement 1 (三文件目录结构)
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  parseDesignMarkdown,
  parseRequirementsMarkdown,
  parseTasksMarkdown,
} from "../src/spec-parser.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validRequirementsMd = `---
feature: test-feature
status: draft
date: 2026-05-23
workflow_variant: requirements-first
---

# Requirements Document

## Introduction

Test intro.

## Glossary

- **SpecBundle**: 三文件聚合视图
- **EARS**: 当 X 时 系统应当 Y

## Requirements

### Requirement 1: Core feature

**User Story:** 作为用户我希望有功能。

#### Acceptance Criteria

- 当 用户提交表单 时 系统应当 返回成功提示
- 当 表单验证失败 时 系统应当 显示错误信息

## Non-functional Requirements

- 性能要求

## Out of Scope

- 不做什么

## Delta

### 新增

- new-file.ts

### 修改

- existing-file.ts

### 不变

- untouched-file.ts
`;

const validDesignMd = `---
feature: test-feature
status: draft
date: 2026-05-23
workflow_variant: requirements-first
---

# Design Document

## Overview

Design overview text.

## Architecture

Architecture description.

## Components and Interfaces

- Component A: does X

## Data Models

Data model description.

## Error Handling

Error handling description.

## Testing Strategy

Testing strategy description.

## Rollout

Rollout plan.

## Open Questions

1. Q1?
`;

const validTasksMd = `---
feature: test-feature
status: draft
date: 2026-05-23
workflow_variant: requirements-first
---

# Implementation Plan

## Overview

Task overview.

## Task Dependency Graph

\`\`\`json
{
  "waves": [
    { "wave": 1, "tasks": ["T-01"] }
  ]
}
\`\`\`

## Tasks

### T-01 First task

- 目标：实现 X
- 关联需求：Requirement 1
- TDD Steps：
  1. RED：写测试
  2. GREEN：实现
- 验收：测试通过
`;

// ---------------------------------------------------------------------------
// parseRequirementsMarkdown
// ---------------------------------------------------------------------------

describe("parseRequirementsMarkdown", () => {
  it("parses a complete requirements.md", () => {
    const result = parseRequirementsMarkdown(validRequirementsMd);
    expect(result.errors).toBeUndefined();
    expect(result.doc).toBeDefined();

    const doc = result.doc!;
    expect(doc.frontmatter.feature).toBe("test-feature");
    expect(doc.frontmatter.status).toBe("draft");
    expect(doc.frontmatter.workflow_variant).toBe("requirements-first");
    expect(doc.intro).toContain("Test intro");
    expect(doc.glossary).toHaveLength(2);
    expect(doc.glossary[0].term).toBe("SpecBundle");
    expect(doc.earsCriteria).toHaveLength(2);
    expect(doc.earsCriteria[0].when).toBe("用户提交表单");
    expect(doc.earsCriteria[0].shall).toBe("返回成功提示");
    expect(doc.nonFunctional).toHaveLength(1);
    expect(doc.outOfScope).toHaveLength(1);
    expect(doc.delta).toBeDefined();
    expect(doc.delta!.added).toContain("new-file.ts");
    expect(doc.delta!.modified).toContain("existing-file.ts");
    expect(doc.delta!.unchanged).toContain("untouched-file.ts");
  });

  it("parses without optional Delta section", () => {
    const md = `---
feature: no-delta
status: draft
date: 2026-05-23
workflow_variant: quick-plan
---

# Requirements

## Introduction

No delta.

## Requirements

### Requirement 1: Test

#### Acceptance Criteria

- 当 X 时 系统应当 Y

## Non-functional Requirements

## Out of Scope

- nothing
`;
    const result = parseRequirementsMarkdown(md);
    expect(result.errors).toBeUndefined();
    expect(result.doc!.delta).toBeUndefined();
  });

  it("returns errors for missing frontmatter", () => {
    const md = "# No frontmatter\n\n## Introduction\n\nSome text.";
    const result = parseRequirementsMarkdown(md);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it("returns errors for empty input", () => {
    const result = parseRequirementsMarkdown("");
    expect(result.errors).toBeDefined();
  });

  it("extracts EARS clauses from Acceptance Criteria sections", () => {
    const result = parseRequirementsMarkdown(validRequirementsMd);
    const clauses = result.doc!.earsCriteria;
    expect(clauses.every((c) => c.raw.includes("当"))).toBe(true);
    expect(clauses.every((c) => c.line > 0)).toBe(true);
  });

  it("handles multiple requirements with separate Acceptance Criteria", () => {
    const md = `---
feature: multi-req
status: draft
date: 2026-05-23
workflow_variant: requirements-first
---

# Requirements

## Introduction

Multi.

## Requirements

### Requirement 1: A

#### Acceptance Criteria

- 当 A 时 系统应当 B

### Requirement 2: C

#### Acceptance Criteria

- 当 C 时 系统应当 D
- 当 E 时 系统应当 F

## Non-functional Requirements

## Out of Scope
`;
    const result = parseRequirementsMarkdown(md);
    expect(result.errors).toBeUndefined();
    expect(result.doc!.earsCriteria).toHaveLength(3);
    expect(result.doc!.userStories).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// parseDesignMarkdown
// ---------------------------------------------------------------------------

describe("parseDesignMarkdown", () => {
  it("parses a complete design.md", () => {
    const result = parseDesignMarkdown(validDesignMd);
    expect(result.errors).toBeUndefined();
    expect(result.doc).toBeDefined();

    const doc = result.doc!;
    expect(doc.frontmatter.feature).toBe("test-feature");
    expect(doc.overview).toContain("Design overview");
    expect(doc.architecture).toContain("Architecture description");
    expect(doc.componentInterfaces).toHaveLength(1);
    expect(doc.dataModel).toBeTruthy();
    expect(doc.errorHandling).toBeTruthy();
    expect(doc.testingStrategy).toBeTruthy();
    expect(doc.rollout).toBeTruthy();
    expect(doc.openQuestions).toHaveLength(1);
  });

  it("parses brownfield design with Current State / Proposed Change / Reversibility", () => {
    const md = `---
feature: bf
status: draft
date: 2026-05-23
workflow_variant: requirements-first
---

# Design

## Overview

Brownfield design.

## Architecture

Arch.

## Current State

src/spec.ts:1-50 has existing types.

## Proposed Change

- 变更点：Add new types
- 不变点：Keep existing API

## Reversibility

- 回滚清单：Delete new file
- 挂载点：spec.ts exports

## Error Handling

Error handling.

## Testing Strategy

Testing.

## Rollout

Rollout.

## Open Questions

`;
    const result = parseDesignMarkdown(md);
    expect(result.errors).toBeUndefined();
    expect(result.doc!.currentState).toContain("src/spec.ts:1-50");
    expect(result.doc!.proposedChange).toContain("Add new types");
    expect(result.doc!.reversibility).toContain("Delete new file");
  });

  it("returns errors for missing frontmatter", () => {
    const result = parseDesignMarkdown("# No frontmatter");
    expect(result.errors).toBeDefined();
  });

  it("returns errors for empty input", () => {
    const result = parseDesignMarkdown("");
    expect(result.errors).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// parseTasksMarkdown
// ---------------------------------------------------------------------------

describe("parseTasksMarkdown", () => {
  it("parses a complete tasks.md", () => {
    const result = parseTasksMarkdown(validTasksMd);
    expect(result.errors).toBeUndefined();
    expect(result.doc).toBeDefined();

    const doc = result.doc!;
    expect(doc.frontmatter.feature).toBe("test-feature");
    expect(doc.tasks).toHaveLength(1);
    expect(doc.tasks[0].id).toBe("T-01");
    expect(doc.tasks[0].title).toBe("First task");
    expect(doc.tasks[0].status).toBe("pending");
  });

  it("parses wave block from JSON code fence", () => {
    const result = parseTasksMarkdown(validTasksMd);
    expect(result.doc!.waves).toBeDefined();
    expect(result.doc!.waves!).toHaveLength(1);
    expect(result.doc!.waves![0].wave).toBe(1);
    expect(result.doc!.waves![0].tasks).toContain("T-01");
  });

  it("parses multiple tasks with depends_on", () => {
    const md = `---
feature: multi
status: draft
date: 2026-05-23
workflow_variant: requirements-first
---

# Tasks

## Tasks

### T-01 First

- 目标：Do A

### T-02 Second

- 目标：Do B
- depends_on: T-01
`;
    const result = parseTasksMarkdown(md);
    expect(result.errors).toBeUndefined();
    expect(result.doc!.tasks).toHaveLength(2);
    expect(result.doc!.tasks[1].depends_on).toContain("T-01");
  });

  it("returns errors for missing frontmatter", () => {
    const result = parseTasksMarkdown("# No frontmatter");
    expect(result.errors).toBeDefined();
  });

  it("returns errors for empty input", () => {
    const result = parseTasksMarkdown("");
    expect(result.errors).toBeDefined();
  });

  it("tolerates tasks without wave block", () => {
    const md = `---
feature: no-wave
status: draft
date: 2026-05-23
workflow_variant: quick-plan
---

# Tasks

## Tasks

### T-01 First

- 目标：Do something
`;
    const result = parseTasksMarkdown(md);
    expect(result.errors).toBeUndefined();
    expect(result.doc!.waves).toBeUndefined();
    expect(result.doc!.tasks).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// PBT: random section ordering robustness
// ---------------------------------------------------------------------------

describe("PBT: parser robustness", () => {
  it("parseRequirementsMarkdown handles shuffled section order", () => {
    fc.assert(
      fc.property(
        fc.record({
          hasGlossary: fc.boolean(),
          hasNonFunctional: fc.boolean(),
          hasDelta: fc.boolean(),
        }),
        (flags) => {
          const sections: string[] = [];
          sections.push("## Introduction\n\nIntro.");
          if (flags.hasGlossary) sections.push("## Glossary\n\n- **Term**: Def");
          sections.push(
            `## Requirements\n\n### Requirement 1: Test\n\n#### Acceptance Criteria\n\n- 当 X 时 系统应当 Y`,
          );
          if (flags.hasNonFunctional) sections.push("## Non-functional Requirements\n\n- NFR");
          sections.push("## Out of Scope\n\n- nothing");
          if (flags.hasDelta)
            sections.push("## Delta\n\n### 新增\n\n- a\n\n### 修改\n\n- b\n\n### 不变\n\n- c");

          const md = `---
feature: pbt
status: draft
date: 2026-05-23
workflow_variant: requirements-first
---

# Requirements

${sections.join("\n\n")}`;

          const result = parseRequirementsMarkdown(md);
          expect(result.errors).toBeUndefined();
          expect(result.doc).toBeDefined();
          expect(result.doc!.earsCriteria).toHaveLength(1);
        },
      ),
    );
  });
});
