import { detectConflict } from "./glossary.js";
import { DEFAULT_EXTRACTION_RULES, extractCandidates, filterCandidates, } from "./glossary-extractor.js";
// ---------------------------------------------------------------------------
// Block policy: phase × mode → shouldBlock
// ---------------------------------------------------------------------------
export const GLOSSARY_BLOCK_POLICY = {
    spec: { interactive: true, autonomous: false },
    decide: { interactive: true, autonomous: false },
    grill: { interactive: true, autonomous: false },
    plan: { interactive: false, autonomous: false },
    review: { interactive: false, autonomous: false },
    learn: { interactive: true, autonomous: false },
    build: { interactive: false, autonomous: false },
};
// ---------------------------------------------------------------------------
// Hash (frequency control key)
// ---------------------------------------------------------------------------
export function hashCandidates(candidates) {
    if (candidates.length === 0)
        return "";
    const sorted = candidates
        .map((c) => c.term.trim().toLowerCase())
        .filter((t) => t.length > 0)
        .sort();
    return sorted.join("|");
}
// ---------------------------------------------------------------------------
// Normalizer: rawInput → TermCandidate[]
// ---------------------------------------------------------------------------
function collectGlossaryNames(glossary) {
    const out = [];
    for (const term of glossary.terms) {
        out.push(term.term);
        if (term.aliases !== undefined) {
            for (const alias of term.aliases)
                out.push(alias);
        }
    }
    return out;
}
function textToCandidates(text, existingTerms) {
    const raw = extractCandidates(text, existingTerms);
    return filterCandidates(raw, DEFAULT_EXTRACTION_RULES);
}
function collectTreeText(tree) {
    const parts = [];
    if (tree.rootDescription.length > 0)
        parts.push(tree.rootDescription);
    const visit = (node) => {
        if (node.question.length > 0)
            parts.push(node.question);
        if (node.userAnswer !== undefined && node.userAnswer.length > 0) {
            parts.push(node.userAnswer);
        }
        for (const child of node.children)
            visit(child);
    };
    for (const root of tree.nodes)
        visit(root);
    return parts.join("\n");
}
function collectSessionText(data) {
    const chunks = [];
    const pushAll = (values) => {
        if (values === undefined)
            return;
        for (const v of values) {
            if (v.length > 0)
                chunks.push(v);
        }
    };
    pushAll(data.decisions);
    pushAll(data.findings);
    pushAll(data.reviews);
    pushAll(data.progress);
    pushAll(data.sessions);
    return chunks.join(". ");
}
export function normalizeInput(input) {
    const existing = collectGlossaryNames(input.glossary);
    switch (input.rawInput.kind) {
        case "candidates":
            return input.rawInput.terms.map((t) => ({
                term: t.term,
                context: t.definition,
                frequency: 1,
            }));
        case "decision_tree":
            return textToCandidates(collectTreeText(input.rawInput.tree), []);
        case "spec_content":
            return textToCandidates(input.rawInput.markdown, existing);
        case "plan_content": {
            const text = input.rawInput.tasks.map((t) => `${t.title}. ${t.description}`).join(". ");
            return textToCandidates(text, existing);
        }
        case "review_findings": {
            const text = input.rawInput.findings.map((f) => f.description).join(". ");
            return textToCandidates(text, existing);
        }
        case "session":
            return textToCandidates(collectSessionText(input.rawInput.data), existing);
        case "commit_message":
            return textToCandidates(input.rawInput.message, existing);
    }
}
// ---------------------------------------------------------------------------
// Dispatch: unified glossary check entry point
// ---------------------------------------------------------------------------
export function runGlossaryCheck(input) {
    // Fast path for candidates: pass full GlossaryTerm (with aliases) directly
    if (input.rawInput.kind === "candidates") {
        return runCandidatesCheck(input, input.rawInput.terms);
    }
    const candidates = normalizeInput(input);
    const cacheKey = `${input.phase}:${hashCandidates(candidates)}`;
    if (input.alreadyChecked.has(cacheKey)) {
        return {
            phase: input.phase,
            hasConflict: false,
            conflicts: [],
            newCandidates: [],
            shouldBlock: false,
        };
    }
    const conflicts = [];
    const newCandidates = [];
    const timestamp = input.now.toISOString().slice(0, 10);
    for (const c of candidates) {
        const provisional = {
            term: c.term,
            definition: c.context,
            last_updated: timestamp,
        };
        const result = detectConflict(input.glossary, provisional);
        if (result.hasConflict && result.conflictingTerm !== undefined && result.reason !== undefined) {
            conflicts.push({
                candidate: c.term,
                existing: result.conflictingTerm,
                reason: result.reason,
            });
        }
        else {
            newCandidates.push(c);
        }
    }
    const shouldBlock = conflicts.length > 0 && GLOSSARY_BLOCK_POLICY[input.phase][input.mode];
    return {
        phase: input.phase,
        hasConflict: conflicts.length > 0,
        conflicts,
        newCandidates,
        shouldBlock,
    };
}
function runCandidatesCheck(input, terms) {
    const cacheKey = `${input.phase}:${hashCandidates(terms.map((t) => ({ term: t.term, context: t.definition, frequency: 1 })))}`;
    if (input.alreadyChecked.has(cacheKey)) {
        return {
            phase: input.phase,
            hasConflict: false,
            conflicts: [],
            newCandidates: [],
            shouldBlock: false,
        };
    }
    const conflicts = [];
    const newCandidates = [];
    for (const candidate of terms) {
        const result = detectConflict(input.glossary, candidate);
        if (result.hasConflict && result.conflictingTerm !== undefined && result.reason !== undefined) {
            conflicts.push({
                candidate: candidate.term,
                existing: result.conflictingTerm,
                reason: result.reason,
            });
        }
        else {
            newCandidates.push({ term: candidate.term, context: candidate.definition, frequency: 1 });
        }
    }
    const shouldBlock = conflicts.length > 0 && GLOSSARY_BLOCK_POLICY[input.phase][input.mode];
    return {
        phase: input.phase,
        hasConflict: conflicts.length > 0,
        conflicts,
        newCandidates,
        shouldBlock,
    };
}
// ---------------------------------------------------------------------------
// Render: unified prompt template
// ---------------------------------------------------------------------------
export function renderGlossaryConflictPrompt(result, _mode) {
    if (!result.hasConflict || result.conflicts.length === 0)
        return "";
    const lines = [];
    lines.push(`⚠️ 检测到术语冲突 (${result.conflicts.length}):`);
    for (const conflict of result.conflicts) {
        lines.push(`  - "${conflict.candidate}"`, `    现有定义: ${conflict.existing.definition}`, `    冲突原因: ${conflict.reason}`);
    }
    lines.push("请选择处理：");
    lines.push("  1. 保留现有");
    lines.push("  2. 替换为新定义");
    lines.push("  3. 新增为别名");
    lines.push("  4. 跳过（保留歧义）");
    return lines.join("\n");
}
// ---------------------------------------------------------------------------
// Render: autonomous advisory
// ---------------------------------------------------------------------------
export function getAdvisoryPath(phase, topic) {
    return `.forge/findings/glossary-advisory-${phase}-${topic}.md`;
}
export function renderPendingAdvisoryNotice(paths) {
    if (paths.length === 0)
        return "";
    const lines = [];
    lines.push(`[glossary] pending glossary advisories (${paths.length}):`);
    for (const p of paths) {
        lines.push(`  - ${p}`);
    }
    return lines.join("\n");
}
export function renderGlossaryAdvisory(result) {
    if (!result.hasConflict || result.conflicts.length === 0)
        return "";
    const lines = [];
    lines.push(`# Glossary Advisory: ${result.phase}`);
    lines.push("");
    lines.push(`本次 autonomous 执行检测到术语冲突 ${result.conflicts.length} 处。`);
    lines.push("建议在交互模式下运行 `/forge learn --review-glossary` 进行人工裁定。");
    lines.push("");
    lines.push("## 冲突清单");
    for (const conflict of result.conflicts) {
        lines.push(`- "${conflict.candidate}": existing = "${conflict.existing.definition}", reason = ${conflict.reason}`);
    }
    if (result.newCandidates.length > 0) {
        lines.push("");
        lines.push("## 候选新术语");
        for (const c of result.newCandidates) {
            lines.push(`- ${c.term} (frequency: ${c.frequency})`);
        }
    }
    return lines.join("\n");
}
//# sourceMappingURL=glossary-hook.js.map