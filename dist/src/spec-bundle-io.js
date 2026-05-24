/**
 * SpecBundle filesystem I/O — load and write three-file / legacy-single bundles.
 *
 * Provides:
 *   - loadSpecBundle(featureDir): reads .forge/specs/<feature>/ and returns SpecBundle
 *   - writeSpecBundle(bundle, featureDir): writes SpecBundle to disk
 *
 * Validates: Requirements 1, 6
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { specDocumentToBundle } from "./spec-bundle.js";
import { parseDesignMarkdown, parseRequirementsMarkdown, parseTasksMarkdown, } from "./spec-parser.js";
// ---------------------------------------------------------------------------
// Internal: legacy spec.md parser
// ---------------------------------------------------------------------------
function parseLegacySpec(text) {
    const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
    const fm = fmMatch
        ? {
            feature: fmMatch[1].match(/feature:\s*(.+)/)?.[1]?.trim() ?? "unknown",
            status: fmMatch[1].match(/status:\s*(.+)/)?.[1]?.trim() ?? "draft",
            date: fmMatch[1].match(/date:\s*(.+)/)?.[1]?.trim() ?? "",
        }
        : { feature: "unknown", status: "draft", date: "" };
    const body = text.replace(/^---[\s\S]*?---\n*/, "");
    // Extract purpose (目的)
    const purposeMatch = body.match(/#\s*目的\s*\n([\s\S]*?)(?=\n## |$)/);
    const purpose = purposeMatch?.[1]?.trim() ?? "";
    // Extract requirements (需求)
    const requirements = [];
    const reqRegex = /###\s*需求\s*\d+[:：]\s*(.+)/g;
    // Two-pass parsing: first collect heading positions, then slice block bodies.
    const reqHeadings = [];
    for (const m of body.matchAll(reqRegex)) {
        reqHeadings.push({
            title: m[1].trim(),
            restStart: (m.index ?? 0) + m[0].length,
        });
    }
    for (let i = 0; i < reqHeadings.length; i++) {
        const heading = reqHeadings[i];
        const restEnd = reqHeadings[i + 1]?.restStart ?? body.length;
        const blockText = body.slice(heading.restStart, restEnd);
        const scenarios = blockText
            .split("\n")
            .filter((l) => l.trim().startsWith("-") && l.includes("当"))
            .map((l) => l.replace(/^[-*]\s*/, "").trim());
        requirements.push({ title: heading.title, description: "", scenarios });
    }
    // Extract exclusions (不做什么)
    const exclMatch = body.match(/##\s*不做什么\s*\n([\s\S]*?)(?=\n## |$)/);
    const exclusions = (exclMatch?.[1] ?? "")
        .split("\n")
        .map((l) => l.replace(/^[-*]\s*/, "").trim())
        .filter((l) => l.length > 0);
    // Detect brownfield (Delta section)
    const hasDelta = /##\s*Delta/.test(body);
    let delta;
    if (hasDelta) {
        const added = [];
        const modified = [];
        const unchanged = [];
        const deltaMatch = body.match(/##\s*Delta\s*\n([\s\S]*?)(?=\n## |$)/);
        if (deltaMatch) {
            const dt = deltaMatch[1];
            const addMatch = dt.match(/###\s*新增\s*\n([\s\S]*?)(?=###|$)/);
            const modMatch = dt.match(/###\s*修改\s*\n([\s\S]*?)(?=###|$)/);
            const unchMatch = dt.match(/###\s*不变\s*\n([\s\S]*?)(?=###|$)/);
            if (addMatch)
                added.push(...extractListItems(addMatch[1]));
            if (modMatch)
                modified.push(...extractListItems(modMatch[1]));
            if (unchMatch)
                unchanged.push(...extractListItems(unchMatch[1]));
        }
        delta = { added, modified, unchanged };
    }
    return {
        frontmatter: fm,
        purpose,
        requirements,
        exclusions,
        isBrownfield: !!delta,
        delta,
    };
}
function extractListItems(text) {
    return text
        .split("\n")
        .map((l) => l.replace(/^[-*]\s*/, "").trim())
        .filter((l) => l.length > 0);
}
export function loadSpecBundle(featureDir, _options) {
    const reqPath = join(featureDir, "requirements.md");
    const designPath = join(featureDir, "design.md");
    const tasksPath = join(featureDir, "tasks.md");
    const specPath = join(featureDir, "spec.md");
    const hasThreeFile = existsSync(reqPath);
    const hasLegacy = existsSync(specPath);
    // Three-file takes priority
    if (hasThreeFile) {
        const reqResult = parseRequirementsMarkdown(readFileSync(reqPath, "utf-8"));
        if (reqResult.errors) {
            throw new Error(`Parse error in requirements.md: ${reqResult.errors.map((e) => e.message).join(", ")}`);
        }
        let design;
        if (existsSync(designPath)) {
            const designResult = parseDesignMarkdown(readFileSync(designPath, "utf-8"));
            if (designResult.errors) {
                throw new Error(`Parse error in design.md: ${designResult.errors.map((e) => e.message).join(", ")}`);
            }
            design = designResult.doc;
        }
        let tasks;
        if (existsSync(tasksPath)) {
            const tasksResult = parseTasksMarkdown(readFileSync(tasksPath, "utf-8"));
            if (tasksResult.errors) {
                throw new Error(`Parse error in tasks.md: ${tasksResult.errors.map((e) => e.message).join(", ")}`);
            }
            tasks = tasksResult.doc;
        }
        const requirementsDoc = reqResult.doc;
        if (!requirementsDoc) {
            throw new Error("internal: requirements.md parsed without errors but doc is missing");
        }
        const frontmatter = requirementsDoc.frontmatter;
        return {
            feature: frontmatter.feature,
            kind: frontmatter.kind ?? "feature",
            layout: "three-file",
            variant: frontmatter.workflow_variant,
            primary: requirementsDoc,
            ...(design ? { design } : {}),
            ...(tasks ? { tasks } : {}),
            ...(hasLegacy ? { migrationHint: true } : {}),
        };
    }
    // Legacy single-file fallback
    if (hasLegacy) {
        const specText = readFileSync(specPath, "utf-8");
        const spec = parseLegacySpec(specText);
        const bundle = specDocumentToBundle(spec);
        return {
            ...bundle,
            layout: "legacy-single",
        };
    }
    throw new Error(`No spec files found in ${featureDir}`);
}
// ---------------------------------------------------------------------------
// writeSpecBundle
// ---------------------------------------------------------------------------
function renderFrontmatter(fm) {
    const lines = ["---"];
    lines.push(`feature: ${fm.feature}`);
    lines.push(`status: ${fm.status}`);
    lines.push(`date: ${fm.date}`);
    lines.push(`workflow_variant: ${fm.workflow_variant}`);
    if (fm.kind)
        lines.push(`kind: ${fm.kind}`);
    if (fm.brownfield)
        lines.push(`brownfield: true`);
    if (fm.migrated_from)
        lines.push(`migrated_from: ${fm.migrated_from}`);
    if (fm.import_source)
        lines.push(`import_source: ${fm.import_source}`);
    if (fm.contract_legacy)
        lines.push(`contract_legacy: true`);
    lines.push("---");
    return lines.join("\n");
}
function renderRequirementsMarkdown(req) {
    const parts = [];
    parts.push(renderFrontmatter(req.frontmatter));
    parts.push("");
    parts.push("# Requirements Document");
    parts.push("");
    parts.push("## Introduction");
    parts.push("");
    parts.push(req.intro);
    parts.push("");
    if (req.glossary.length > 0) {
        parts.push("## Glossary");
        parts.push("");
        for (const g of req.glossary) {
            parts.push(`- **${g.term}**: ${g.definition}`);
        }
        parts.push("");
    }
    parts.push("## Requirements");
    parts.push("");
    for (let i = 0; i < req.userStories.length; i++) {
        const us = req.userStories[i];
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
                parts.push(`- 当 ${clause.when} 时 系统应当 ${clause.shall}`);
            }
            parts.push("");
        }
    }
    parts.push("## Non-functional Requirements");
    parts.push("");
    for (const nfr of req.nonFunctional) {
        parts.push(`- ${nfr}`);
    }
    parts.push("");
    parts.push("## Out of Scope");
    parts.push("");
    for (const item of req.outOfScope) {
        parts.push(`- ${item}`);
    }
    parts.push("");
    if (req.delta) {
        parts.push("## Delta");
        parts.push("");
        parts.push("### 新增");
        parts.push("");
        for (const item of req.delta.added)
            parts.push(`- ${item}`);
        parts.push("");
        parts.push("### 修改");
        parts.push("");
        for (const item of req.delta.modified)
            parts.push(`- ${item}`);
        parts.push("");
        parts.push("### 不变");
        parts.push("");
        for (const item of req.delta.unchanged)
            parts.push(`- ${item}`);
        parts.push("");
    }
    return parts.join("\n");
}
function renderDesignMarkdown(doc) {
    const parts = [];
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
        for (const ci of doc.componentInterfaces)
            parts.push(`- ${ci}`);
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
        for (const q of doc.openQuestions)
            parts.push(`1. ${q}`);
        parts.push("");
    }
    return parts.join("\n");
}
function renderTasksMarkdown(doc) {
    const parts = [];
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
        parts.push("");
    }
    return parts.join("\n");
}
export function writeSpecBundle(bundle, featureDir) {
    mkdirSync(featureDir, { recursive: true });
    if (bundle.layout === "three-file") {
        writeFileSync(join(featureDir, "requirements.md"), renderRequirementsMarkdown(bundle.primary));
        if (bundle.design) {
            writeFileSync(join(featureDir, "design.md"), renderDesignMarkdown(bundle.design));
        }
        if (bundle.tasks) {
            writeFileSync(join(featureDir, "tasks.md"), renderTasksMarkdown(bundle.tasks));
        }
    }
    // legacy-single layout does not write individual files
    // (kept for backward compatibility; writing is only for three-file)
}
//# sourceMappingURL=spec-bundle-io.js.map