/**
 * Three-file markdown renderers — pure functions.
 *
 * renderRequirementsMarkdown / renderDesignMarkdown / renderTasksMarkdown.
 * Each takes a typed document and returns markdown text.
 *
 * Validates: Requirement 1
 */

import type {
  DesignDocument,
  RequirementsDocument,
  SpecFileFrontmatter,
  TasksSeedDocument,
} from "./spec-bundle.js";
import { enforceEarsSyntax } from "./spec-validation.js";

// ---------------------------------------------------------------------------
// Internal: frontmatter renderer
// ---------------------------------------------------------------------------

function renderFrontmatter(fm: SpecFileFrontmatter): string {
  const lines = ["---"];
  lines.push(`feature: ${fm.feature}`);
  lines.push(`status: ${fm.status}`);
  lines.push(`date: ${fm.date}`);
  lines.push(`workflow_variant: ${fm.workflow_variant}`);
  if (fm.kind) lines.push(`kind: ${fm.kind}`);
  if (fm.brownfield) lines.push(`brownfield: true`);
  if (fm.migrated_from) lines.push(`migrated_from: ${fm.migrated_from}`);
  if (fm.import_source) lines.push(`import_source: ${fm.import_source}`);
  if (fm.contract_legacy) lines.push(`contract_legacy: true`);
  lines.push("---");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// renderRequirementsMarkdown
// ---------------------------------------------------------------------------

export function renderRequirementsMarkdown(doc: RequirementsDocument): string {
  const parts: string[] = [];
  parts.push(renderFrontmatter(doc.frontmatter));
  parts.push("");
  parts.push("# Requirements Document");
  parts.push("");
  parts.push("## Introduction");
  parts.push("");
  parts.push(doc.intro);
  parts.push("");

  if (doc.glossary.length > 0) {
    parts.push("## Glossary");
    parts.push("");
    for (const g of doc.glossary) {
      parts.push(`- **${g.term}**: ${g.definition}`);
    }
    parts.push("");
  }

  parts.push("## Requirements");
  parts.push("");

  for (let i = 0; i < doc.userStories.length; i++) {
    const us = doc.userStories[i];
    parts.push(`### Requirement ${i + 1}: ${us.title}`);
    parts.push("");
    if (us.description) {
      parts.push(`**User Story:** ${us.description}`);
      parts.push("");
    }
    if (us.earsCriteria.length > 0) {
      parts.push("#### Acceptance Criteria");
      parts.push("");
      for (const clause of us.earsCriteria) {
        const enforced = enforceEarsSyntax(`当 ${clause.when} 时 系统应当 ${clause.shall}`);
        parts.push(`- ${enforced.output}`);
      }
      parts.push("");
    }
  }

  parts.push("## Non-functional Requirements");
  parts.push("");
  for (const nfr of doc.nonFunctional) {
    parts.push(`- ${nfr}`);
  }
  parts.push("");

  parts.push("## Out of Scope");
  parts.push("");
  for (const item of doc.outOfScope) {
    parts.push(`- ${item}`);
  }
  parts.push("");

  if (doc.delta) {
    parts.push("## Delta");
    parts.push("");
    parts.push("### 新增");
    parts.push("");
    for (const item of doc.delta.added) parts.push(`- ${item}`);
    parts.push("");
    parts.push("### 修改");
    parts.push("");
    for (const item of doc.delta.modified) parts.push(`- ${item}`);
    parts.push("");
    parts.push("### 不变");
    parts.push("");
    for (const item of doc.delta.unchanged) parts.push(`- ${item}`);
    parts.push("");
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// renderDesignMarkdown
// ---------------------------------------------------------------------------

export function renderDesignMarkdown(doc: DesignDocument): string {
  const parts: string[] = [];
  parts.push(renderFrontmatter(doc.frontmatter));
  parts.push("");
  parts.push("# Design Document");
  parts.push("");
  parts.push("## Overview");
  parts.push("");
  parts.push(doc.overview);
  parts.push("");
  parts.push("## Architecture");
  parts.push("");
  parts.push(doc.architecture);
  parts.push("");

  if (doc.componentInterfaces.length > 0) {
    parts.push("## Components and Interfaces");
    parts.push("");
    for (const ci of doc.componentInterfaces) parts.push(`- ${ci}`);
    parts.push("");
  }

  if (doc.dataModel) {
    parts.push("## Data Models");
    parts.push("");
    parts.push(doc.dataModel);
    parts.push("");
  }

  if (doc.currentState) {
    parts.push("## Current State");
    parts.push("");
    parts.push(doc.currentState);
    parts.push("");
  }

  if (doc.proposedChange) {
    parts.push("## Proposed Change");
    parts.push("");
    parts.push(doc.proposedChange);
    parts.push("");
  }

  if (doc.reversibility) {
    parts.push("## Reversibility");
    parts.push("");
    parts.push(doc.reversibility);
    parts.push("");
  }

  parts.push("## Error Handling");
  parts.push("");
  parts.push(doc.errorHandling);
  parts.push("");
  parts.push("## Testing Strategy");
  parts.push("");
  parts.push(doc.testingStrategy);
  parts.push("");
  parts.push("## Rollout");
  parts.push("");
  parts.push(doc.rollout);
  parts.push("");

  if (doc.openQuestions.length > 0) {
    parts.push("## Open Questions");
    parts.push("");
    for (let i = 0; i < doc.openQuestions.length; i++) {
      parts.push(`${i + 1}. ${doc.openQuestions[i]}`);
    }
    parts.push("");
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// renderTasksMarkdown
// ---------------------------------------------------------------------------

export function renderTasksMarkdown(doc: TasksSeedDocument): string {
  const parts: string[] = [];
  parts.push(renderFrontmatter(doc.frontmatter));
  parts.push("");
  parts.push("# Implementation Plan");
  parts.push("");

  if (doc.waves && doc.waves.length > 0) {
    parts.push("## Task Dependency Graph");
    parts.push("");
    parts.push("```json");
    parts.push(JSON.stringify({ waves: doc.waves }, null, 2));
    parts.push("```");
    parts.push("");
  }

  if (doc.execution_packages && doc.execution_packages.length > 0) {
    parts.push("## Execution Packages");
    parts.push("");
    parts.push("```json");
    parts.push(JSON.stringify({ execution_packages: doc.execution_packages }, null, 2));
    parts.push("```");
    parts.push("");
  }

  parts.push("## Tasks");
  parts.push("");

  for (const task of doc.tasks) {
    parts.push(`### ${task.id} ${task.title}`);
    parts.push("");
    parts.push(`- 目标：${task.goal}`);
    if (task.related_requirements.length > 0) {
      parts.push(`- 关联需求：${task.related_requirements.join(", ")}`);
    }
    if (task.depends_on && task.depends_on.length > 0) {
      parts.push(`- depends_on: ${task.depends_on.join(", ")}`);
    }
    if (task.category) {
      parts.push(`- category: ${task.category}`);
    }
    if (task.verification) {
      parts.push(`- verification: ${task.verification}`);
    }
    parts.push("");
  }

  return parts.join("\n");
}
