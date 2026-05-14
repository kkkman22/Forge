/**
 * Decide engine — designer conditional trigger logic extracted from decide/SKILL.md.
 *
 * Implements the Agent Team member selection for `/forge decide`:
 *   - Default members: product, architect, security (always present)
 *   - Designer is dynamically added ONLY when the task involves UI changes
 *
 * UI change signals (from SKILL.md §3.4):
 *   1. Task description mentions frontend/UI keywords
 *   2. Involved files include UI-related extensions
 *   3. Task involves user interaction flow changes
 *
 * NOT triggered for: pure backend API, database changes, CI/CD config,
 * pure logic refactoring.
 *
 * In addition to team selection, this module hosts pure helpers for
 * finalizing an ADR at the end of `/forge decide` (see `finalizeAdr` and
 * `renderAdrFileContent`). These functions orchestrate ADR id allocation,
 * file content rendering and index regeneration without performing any IO —
 * the caller injects a `readExistingFile` callback and is responsible for
 * writing the returned artifacts to disk.
 *
 * **Validates: Requirements 1.1, 1.5, 1.6, 1.7, 2.9**
 */
import { evaluateAdrCriteria, } from "./adr-criteria.js";
import { applySupersession, nextAdrId, renderAdrIndex, } from "./adr-registry.js";
import { parseFrontmatter } from "./frontmatter.js";
import { runGlossaryCheck } from "./glossary-hook.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Default team members that are always present in the decide Agent Team. */
const DEFAULT_MEMBERS = [
    { name: "product", role: "产品视角", agent: "product" },
    { name: "architect", role: "架构视角", agent: "architect" },
    { name: "security", role: "安全视角", agent: "security" },
];
/** The designer member added conditionally. */
const DESIGNER_MEMBER = {
    name: "designer",
    role: "设计视角",
    agent: "designer",
};
/**
 * Keywords in task descriptions that signal UI changes.
 * Covers both Chinese and English terms from SKILL.md §3.4.
 */
const UI_DESCRIPTION_KEYWORDS = [
    // Chinese keywords
    "前端",
    "页面",
    "组件",
    "样式",
    "界面",
    "导航栏",
    "导航",
    "表单",
    "布局",
    "按钮",
    "弹窗",
    "对话框",
    "模态框",
    "下拉",
    "菜单",
    "侧边栏",
    "头部",
    "底部",
    "响应式",
    "移动端适配",
    "主题",
    "暗色模式",
    "亮色模式",
    // English keywords
    "ui",
    "frontend",
    "front-end",
    "component",
    "page",
    "style",
    "css",
    "layout",
    "navigation",
    "navbar",
    "sidebar",
    "modal",
    "dialog",
    "button",
    "form",
    "dropdown",
    "menu",
    "responsive",
    "theme",
    "dark mode",
    "light mode",
];
/**
 * Patterns in task descriptions that signal user interaction flow changes.
 * These indicate UI work even without explicit UI keywords.
 */
const INTERACTION_FLOW_PATTERNS = [
    // Chinese patterns
    "注册流程",
    "登录流程",
    "搜索功能",
    "用户交互",
    "交互流程",
    "操作流程",
    "用户设置",
    "设置页面",
    "个人中心",
    "购物车",
    "结账流程",
    "支付流程",
    "上传功能",
    "拖拽",
    "筛选功能",
    "排序功能",
    "分页",
    // English patterns
    "registration flow",
    "login flow",
    "search feature",
    "user interaction",
    "checkout flow",
    "payment flow",
    "upload feature",
    "drag and drop",
    "filter feature",
    "sort feature",
    "pagination",
    "onboarding",
    "wizard",
    "user settings",
];
/** File extensions that indicate UI-related files. */
const UI_FILE_EXTENSIONS = [
    ".tsx",
    ".jsx",
    ".vue",
    ".svelte",
    ".css",
    ".scss",
    ".sass",
    ".less",
    ".html",
    ".styl",
];
// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------
/**
 * Check whether the task description contains any UI-related keywords.
 * Case-insensitive matching.
 */
export function descriptionHasUIKeywords(description) {
    const lower = description.toLowerCase();
    return UI_DESCRIPTION_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}
/**
 * Check whether the task description mentions user interaction flow changes.
 * Case-insensitive matching.
 */
export function descriptionHasInteractionFlows(description) {
    const lower = description.toLowerCase();
    return INTERACTION_FLOW_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}
/**
 * Check whether any of the involved files have UI-related extensions.
 */
export function filesHaveUIExtensions(files) {
    return files.some((file) => {
        const lower = file.toLowerCase();
        return UI_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
    });
}
/**
 * Determine whether the task involves UI changes based on all three signal
 * categories from SKILL.md §3.4.
 */
export function involvesUIChanges(context) {
    return (descriptionHasUIKeywords(context.taskDescription) ||
        descriptionHasInteractionFlows(context.taskDescription) ||
        filesHaveUIExtensions(context.involvedFiles));
}
// ---------------------------------------------------------------------------
// Decision document path helpers
// ---------------------------------------------------------------------------
/**
 * Convert a topic string to kebab-case.
 *
 * Rules:
 *  - Lowercase the entire string
 *  - Replace whitespace and non-alphanumeric/non-hyphen characters with hyphens
 *  - Collapse consecutive hyphens into one
 *  - Trim leading/trailing hyphens
 *  - If result is empty (e.g. pure non-ASCII input like Chinese), fallback to
 *    "untitled-<4-char-hash>" for readability while preserving uniqueness
 */
export function toKebabCase(topic) {
    const result = topic
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-") // replace non-alphanumeric (except hyphen) with hyphen
        .replace(/-{2,}/g, "-") // collapse consecutive hyphens
        .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
    if (result.length > 0) {
        return result;
    }
    // Fallback for non-ASCII input: generate a readable prefix + short hash
    let hash = 0;
    for (let i = 0; i < topic.length; i++) {
        const char = topic.charCodeAt(i);
        hash = ((hash << 5) - hash + char) | 0; // simple djb2-like hash
    }
    const hex = Math.abs(hash).toString(16).padStart(4, "0").slice(0, 4);
    return `untitled-${hex}`;
}
/**
 * Generate the decision document output path.
 *
 * @param date  - Date string in YYYY-MM-DD format
 * @param topic - Human-readable topic string (will be converted to kebab-case)
 * @returns Path in the format `.forge/decisions/<YYYY-MM-DD>-<topic>.md`
 */
export function generateDecisionPath(date, topic) {
    const kebabTopic = toKebabCase(topic);
    return `.forge/decisions/${date}-${kebabTopic}.md`;
}
// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------
/**
 * Return the Agent Team members for the decide phase.
 *
 * - product, architect, security are always included.
 * - designer is included if and only if the task involves UI changes.
 */
export function getDecideTeamMembers(context) {
    return getDecideSubagents(context);
}
/** Alias for the Subagent migration — returns the same members. */
export function getDecideSubagents(context) {
    const members = [...DEFAULT_MEMBERS];
    if (involvesUIChanges(context)) {
        members.push(DESIGNER_MEMBER);
    }
    return members;
}
const MAX_PERSPECTIVE_TOKENS = 500;
/**
 * Build Round 1 SubagentInvocations for the decide phase.
 *
 * Maps SubagentConfig[] to SubagentInvocation[] with perspective-specific prompts.
 * Always includes product, architect, security. Includes designer iff involvesUIChanges.
 */
export function buildDecideRound1Subagents(context) {
    const members = getDecideSubagents(context);
    return members.map((member) => ({
        agentType: member.agent,
        prompt: `[${member.role}] 分析任务：${context.taskDescription}。涉及文件：${context.involvedFiles.join(", ")}。请控制在 ${MAX_PERSPECTIVE_TOKENS} tokens 以内。`,
        permissionMode: "default",
        maxTurns: 10,
    }));
}
/**
 * Build the Round 2 Critic SubagentInvocation.
 *
 * The Critic receives all Round 1 perspective outputs for cross-review.
 */
export function buildDecideCriticInvocation(round1Outputs, _context) {
    const allOutputs = round1Outputs.join("\n\n---\n\n");
    return {
        agentType: "critic",
        prompt: `交叉审查以下视角输出，找出盲点和不一致：\n\n${allOutputs}`,
        permissionMode: "default",
        maxTurns: 10,
    };
}
/**
 * Resolve the decide document status based on Critic output.
 *
 * Returns "needs_revision" when blocking issues are present, "confirmed" otherwise.
 */
export function resolveDecideStatus(output) {
    return output.hasBlockingIssues ? "needs_revision" : "confirmed";
}
/**
 * Run the ADR three-question screen over a batch of decision candidates.
 *
 * Evaluates each (decision, signals) pair with `evaluateAdrCriteria`
 * from `./adr-criteria.js`. The two input arrays are parallel: the
 * signals at index `i` are applied to the decision at index `i`. Items
 * are returned in input order so callers can splice the verdicts back
 * into their own data structures positionally.
 *
 * This function is pure — it performs no IO and does not mutate its
 * inputs. The decide skill invokes it inside the Round 2 Critic stage,
 * right before the Critic returns, so the "ADR Criteria Check" block
 * can be rendered alongside the perspective-level cross-review output.
 *
 * Throws a `RangeError` when the two arrays have different lengths.
 * Parallel-array mismatches are almost always a programmer error (e.g.
 * a missed `push` in the signal-collection loop) and silently
 * truncating or defaulting one side would produce verdicts that look
 * authoritative but were computed from the wrong signal set. Failing
 * loudly keeps the mapping explicit and forces the caller to reconcile
 * the two lists.
 *
 * **Validates: Requirements 2.1, 2.3, 2.4, 2.10**
 */
export function runCriteriaScreen(decisions, signalsList) {
    if (decisions.length !== signalsList.length) {
        throw new RangeError(`runCriteriaScreen: decisions and signals must have the same length (got ${decisions.length} decisions, ${signalsList.length} signals).`);
    }
    const items = [];
    for (let i = 0; i < decisions.length; i++) {
        const decision = decisions[i];
        const signals = signalsList[i];
        items.push({
            decision,
            signals,
            result: evaluateAdrCriteria(decision, signals),
        });
    }
    return items;
}
/** Canonical path of the ADR index file. */
const ADR_INDEX_PATH = ".forge/knowledge/adr-index.md";
/**
 * Escape a string for emission inside a double-quoted YAML scalar. The ADR
 * frontmatter layer keeps values simple, so we only need to protect the two
 * characters that can break a double-quoted YAML scalar: the backslash and
 * the double quote.
 */
function escapeYamlString(value) {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
/**
 * Render the indented-list form of a string array as YAML lines. Each item
 * is quoted for safety. Returns an empty array (no lines) when `items` is
 * empty — the caller decides whether to emit the header.
 */
function renderYamlList(items) {
    return items.map((item) => `  - "${escapeYamlString(item)}"`);
}
/**
 * Render the full ADR markdown document for an `AdrEntry` and its body.
 *
 * The frontmatter is emitted in a fixed, stable order:
 *   1. `id`
 *   2. `title`
 *   3. `status`
 *   4. `date`
 *   5. `deciders`
 *   6. `reversibility`          (only when set — Requirement 2.3, 2.7)
 *   7. `surprising`             (only when set — Requirement 2.3, 2.7)
 *   8. `trade_off_alternatives` (only when set and non-empty — Req. 2.3, 2.7)
 *   9. `related_adrs` (only when present and non-empty)
 *  10. `supersedes`   (only when present)
 *  11. `superseded_by` (only when present)
 *
 * String scalars are emitted as double-quoted YAML; list fields use the
 * indented-list form (`- "value"`). Optional fields that are undefined or
 * empty are omitted entirely so the output stays minimal.
 *
 * The ADR three-question gate fields (`reversibility`, `surprising`,
 * `trade_off_alternatives`) are additive: they are emitted only when
 * set on the entry, so ADRs authored before the gate landed remain
 * byte-identical after a round-trip. The field names and value shapes
 * are chosen to be non-conflicting with the
 * `engineering-governance-hardening` spec's ADR frontmatter, so both
 * specs can coexist in a single registry.
 *
 * The body markdown is appended verbatim after the closing `---` with one
 * blank line in between, producing the standard
 * `frontmatter + blank line + body` shape that `parseAdrFrontmatter`
 * recovers losslessly.
 *
 * This function is pure and has no IO.
 */
export function renderAdrFileContent(entry, bodyMarkdown) {
    const lines = [];
    lines.push("---");
    lines.push(`id: "${escapeYamlString(entry.id)}"`);
    lines.push(`title: "${escapeYamlString(entry.title)}"`);
    lines.push(`status: ${entry.status}`);
    lines.push(`date: "${escapeYamlString(entry.date)}"`);
    lines.push("deciders:");
    lines.push(...renderYamlList(entry.deciders));
    // ADR three-question gate fields (Requirements 2.3, 2.7). Each is
    // emitted only when explicitly set so unset entries round-trip
    // byte-identically through parse → render.
    if (entry.reversibility !== undefined) {
        lines.push(`reversibility: ${entry.reversibility}`);
    }
    if (entry.surprising !== undefined) {
        lines.push(`surprising: ${entry.surprising ? "true" : "false"}`);
    }
    if (entry.trade_off_alternatives !== undefined && entry.trade_off_alternatives.length > 0) {
        lines.push("trade_off_alternatives:");
        lines.push(...renderYamlList(entry.trade_off_alternatives));
    }
    if (entry.related_adrs !== undefined && entry.related_adrs.length > 0) {
        lines.push("related_adrs:");
        lines.push(...renderYamlList(entry.related_adrs));
    }
    if (entry.supersedes !== undefined && entry.supersedes !== "") {
        lines.push(`supersedes: "${escapeYamlString(entry.supersedes)}"`);
    }
    if (entry.superseded_by !== undefined && entry.superseded_by !== "") {
        lines.push(`superseded_by: "${escapeYamlString(entry.superseded_by)}"`);
    }
    lines.push("---");
    lines.push("");
    // `bodyMarkdown` is emitted verbatim. Callers are expected to pass the
    // body content without leading/trailing delimiters.
    return `${lines.join("\n")}\n${bodyMarkdown}`;
}
/**
 * Extract the body (everything after the closing `---`) from an existing
 * ADR file. When the file has no frontmatter, the whole content is returned
 * as the body so callers can still re-render the file without losing user
 * prose. This keeps supersession resilient to slightly malformed files.
 */
function extractBody(existingContent) {
    const parsed = parseFrontmatter(existingContent);
    if (parsed === null) {
        return existingContent;
    }
    return parsed.body;
}
/**
 * Merge the new ADR entry and any supersession updates into the existing
 * list, producing a list in which every id appears exactly once. The new
 * entry always wins against any existing entry with the same id; the
 * superseded updates replace their respective originals.
 */
function mergeEntriesForIndex(existingAdrs, newEntry, updates) {
    const updatedById = new Map();
    for (const update of updates) {
        updatedById.set(update.id, update);
    }
    const merged = [];
    const seen = new Set();
    for (const entry of existingAdrs) {
        if (entry.id === newEntry.id) {
            // Replaced by the new entry below.
            continue;
        }
        const effective = updatedById.get(entry.id) ?? entry;
        if (seen.has(effective.id)) {
            continue;
        }
        merged.push(effective);
        seen.add(effective.id);
    }
    if (!seen.has(newEntry.id)) {
        merged.push(newEntry);
    }
    return merged;
}
/**
 * Finalize an ADR at the end of `/forge decide`.
 *
 * Pipeline:
 *   1. Allocate the next canonical id via `nextAdrId`.
 *   2. Build the new `AdrEntry` (with `filePath` of the form
 *      `.forge/decisions/<id>-<kebab-topic>.md`).
 *   3. Compute supersession updates via `applySupersession`.
 *   4. For each superseded entry, re-read the original file via
 *      `readExistingFile`, extract its body, and re-render the file with
 *      the updated frontmatter.
 *   5. Merge the new entry + supersession updates with the existing ADRs
 *      so that every id appears exactly once, then render the index.
 *
 * The function is pure: all IO is injected through the `readExistingFile`
 * callback. The caller writes the returned artifacts to disk.
 *
 * Optional input fields are normalized:
 *   - `relatedAdrs` defaults to an empty array and is omitted from the new
 *     entry when empty so the rendered frontmatter stays minimal.
 *   - `supersedes` is copied onto `newEntry` only when non-empty.
 */
export function finalizeAdr(input, readExistingFile) {
    const id = nextAdrId(input.existingAdrs);
    const slug = toKebabCase(input.topic);
    const adrFilePath = `.forge/decisions/${id}-${slug}.md`;
    const newEntry = {
        id,
        title: input.title,
        status: input.status,
        date: input.date,
        deciders: [...input.deciders],
        filePath: adrFilePath,
    };
    if (input.relatedAdrs !== undefined && input.relatedAdrs.length > 0) {
        newEntry.related_adrs = [...input.relatedAdrs];
    }
    if (input.supersedes !== undefined && input.supersedes !== "") {
        newEntry.supersedes = input.supersedes;
    }
    // ADR three-question gate fields (Requirements 2.3, 2.7). Each is
    // propagated only when the caller supplied it so legacy call sites
    // that do not know about the gate still produce unchanged ADRs.
    if (input.reversibility !== undefined) {
        newEntry.reversibility = input.reversibility;
    }
    if (input.surprising !== undefined) {
        newEntry.surprising = input.surprising;
    }
    if (input.tradeOffAlternatives !== undefined && input.tradeOffAlternatives.length > 0) {
        newEntry.trade_off_alternatives = [...input.tradeOffAlternatives];
    }
    // Compute supersession updates.
    const supersededEntries = applySupersession(newEntry, input.existingAdrs);
    // Rewrite each superseded ADR file with the updated frontmatter while
    // preserving its original body.
    const supersessionUpdates = [];
    for (const updated of supersededEntries) {
        const originalContent = readExistingFile(updated.filePath);
        const body = originalContent === undefined ? "" : extractBody(originalContent);
        supersessionUpdates.push({
            filePath: updated.filePath,
            updatedContent: renderAdrFileContent(updated, body),
        });
    }
    const adrFileContent = renderAdrFileContent(newEntry, input.bodyMarkdown);
    // Merge for the index: new entry + superseded updates override originals.
    const mergedForIndex = mergeEntriesForIndex(input.existingAdrs, newEntry, supersededEntries);
    const indexContent = renderAdrIndex(mergedForIndex);
    return {
        newEntry,
        adrFilePath,
        adrFileContent,
        indexFilePath: ADR_INDEX_PATH,
        indexContent,
        supersessionUpdates,
    };
}
// ---------------------------------------------------------------------------
// Inline decision note (Requirement 2.9)
// ---------------------------------------------------------------------------
/**
 * Render a one-line HTML-comment "inline decision note" that the decide
 * skill appends to an upstream file (spec / plan / progress) when the
 * ADR three-question gate verdict is `INLINE_NOTE`.
 *
 * The output shape is fixed by Requirement 2.9:
 *
 *   <!-- decision: ${title} | reason: ${reasoning} -->
 *
 * Because the note is an HTML comment, the content must never contain
 * the literal `-->` sequence — that would terminate the comment early
 * and leak subsequent text into the rendered document. We defend
 * against this by replacing every `-->` occurrence in the decision
 * title and the criteria reasoning with `--&gt;`, an unambiguous
 * inline-safe form that keeps the original intent readable when a
 * human opens the raw file. The substitution is applied before the
 * values are interpolated, so the returned string is guaranteed to
 * contain exactly one opening `<!--` and one closing `-->` at the
 * ends.
 *
 * This function is pure and has no IO.
 */
export function renderInlineDecisionNote(decision, result) {
    const safeTitle = escapeCommentTerminator(decision.title);
    const safeReason = escapeCommentTerminator(result.reasoning);
    return `<!-- decision: ${safeTitle} | reason: ${safeReason} -->`;
}
/**
 * Replace every literal `-->` occurrence in `text` with `--&gt;` so the
 * value can be safely embedded inside an HTML comment without ending
 * it prematurely.
 */
function escapeCommentTerminator(text) {
    return text.replace(/-->/g, "--&gt;");
}
/**
 * Append an inline decision note to an upstream file.
 *
 * Behaviour:
 *   - When `upstreamFile` does not exist, a new file is created whose
 *     content is `${note}\n`.
 *   - When the file exists and already ends with a blank line (i.e. a
 *     trailing `\n\n`), the note is appended directly with a single
 *     trailing newline.
 *   - When the file exists and ends with a single `\n`, one extra blank
 *     line is inserted before the note so it is visually separated
 *     from the preceding content.
 *   - When the file exists and does not end in a newline at all, two
 *     newlines are inserted before the note to leave one blank line
 *     above it.
 *
 * The function always writes back through `fs.writeFile`. It performs
 * exactly one read and one write, never mutates `note`, and is safe to
 * call repeatedly (each call appends one more note).
 */
export function appendInlineNote(fs, upstreamFile, note) {
    const existing = fs.exists(upstreamFile) ? fs.readFile(upstreamFile) : "";
    let next;
    if (existing.length === 0) {
        next = `${note}\n`;
    }
    else if (existing.endsWith("\n\n")) {
        next = `${existing}${note}\n`;
    }
    else if (existing.endsWith("\n")) {
        next = `${existing}\n${note}\n`;
    }
    else {
        next = `${existing}\n\n${note}\n`;
    }
    fs.writeFile(upstreamFile, next);
}
/**
 * Select the upstream file to which an inline decision note should be
 * appended.
 *
 * Priority (per Requirement 2.9):
 *
 *   1. `progressPath` — the progress log is the most ephemeral and
 *                       captures the decision closest to where it
 *                       arose
 *   2. `planPath`     — the plan document is the next-most specific
 *   3. `specPath`     — the spec is the long-term home when no plan
 *                       or progress exists yet
 *   4. `null`         — nothing to anchor the note to; the caller
 *                       must decide whether to skip the inline write
 *                       or surface a warning
 *
 * Empty strings are treated as "missing" so callers that parse the
 * status frontmatter into default-empty fields get sensible behaviour
 * without having to pre-filter.
 *
 * This function is pure and has no IO.
 */
export function resolveUpstreamFile(status) {
    if (status.progressPath !== undefined && status.progressPath !== "") {
        return status.progressPath;
    }
    if (status.planPath !== undefined && status.planPath !== "") {
        return status.planPath;
    }
    if (status.specPath !== undefined && status.specPath !== "") {
        return status.specPath;
    }
    return null;
}
/**
 * Check every candidate term introduced in the decide phase against the
 * current glossary and return the full list of conflicts found.
 *
 * For each candidate we call `detectConflict(glossary, candidate)`. When a
 * conflict is reported, we record the pair (candidate, existing) together
 * with the conflict reason so callers can present clarification prompts.
 *
 * The function is pure: it never mutates its inputs and performs no IO.
 * Ordering follows the input order of `candidateTerms`.
 */
export function checkDecideGlossaryConflicts(candidateTerms, glossary) {
    const result = runGlossaryCheck({
        phase: "decide",
        mode: "interactive",
        rawInput: { kind: "candidates", terms: candidateTerms },
        glossary,
        now: new Date(),
        alreadyChecked: new Set(),
    });
    const byName = new Map();
    for (const t of candidateTerms)
        byName.set(t.term.trim().toLowerCase(), t);
    return result.conflicts
        .filter((c) => c.reason !== undefined)
        .map((c) => {
        const original = byName.get(c.candidate.trim().toLowerCase());
        return {
            term: c.candidate,
            existing: c.existing,
            candidate: original ?? {
                term: c.candidate,
                definition: c.existing.definition,
                last_updated: c.existing.last_updated,
            },
            reason: c.reason,
        };
    });
}
/**
 * Render a user-facing clarification prompt for the given conflicts.
 *
 * Returns an empty string when `conflicts` is empty, so callers can compose
 * the output unconditionally without first checking the length.
 *
 * Format:
 *
 *   ⚠️ Glossary conflict detected ({N}):
 *     - "<term>": existing = "<existing def>", proposed = "<candidate def>"
 *     ...
 *   请澄清：保留现有 / 替换现有 / 新增别名
 */
export function renderDecideGlossaryConflictPrompt(conflicts) {
    if (conflicts.length === 0)
        return "";
    const lines = [];
    lines.push(`⚠️ Glossary conflict detected (${conflicts.length}):`);
    for (const conflict of conflicts) {
        lines.push(`  - "${conflict.term}": existing = "${conflict.existing.definition}", proposed = "${conflict.candidate.definition}"`);
    }
    lines.push("请澄清：保留现有 / 替换现有 / 新增别名");
    return lines.join("\n");
}
/**
 * Inspect a user prompt for the two supported ADR-verdict override
 * keywords:
 *
 *   - `--force-adr` → promotes the verdict to `WRITE_ADR`
 *   - `--no-adr`    → demotes the verdict to `DISCARD`
 *
 * Matching is a plain substring check (no whitespace or word-boundary
 * requirement) so the keywords are recognised whether the user types
 * them inline (`fix this bug --force-adr`) or on their own line. When
 * neither keyword is present, both flags are returned as `false` and
 * {@link applyAdrOverride} becomes a no-op.
 *
 * When both keywords appear in the same prompt, `--no-adr` wins —
 * the conservative choice when the user's intent is ambiguous — and
 * the returned override carries `noAdr=true, forceAdr=false`. The
 * function is pure and performs no IO.
 *
 * **Validates: Requirements 2.6**
 */
export function parseAdrOverride(userPrompt) {
    const hasNoAdr = userPrompt.includes("--no-adr");
    const hasForceAdr = userPrompt.includes("--force-adr");
    // `--no-adr` wins if both are present (conservative).
    if (hasNoAdr) {
        return { forceAdr: false, noAdr: true };
    }
    if (hasForceAdr) {
        return { forceAdr: true, noAdr: false };
    }
    return { forceAdr: false, noAdr: false };
}
/**
 * Apply a user override to an {@link AdrCriteriaResult} produced by
 * the three-question gate.
 *
 *   - `noAdr=true`    → verdict becomes `DISCARD`, `shouldBecomeAdr`
 *                       becomes `false`, reasoning is replaced with
 *                       `"User override: --no-adr"`
 *   - `forceAdr=true` → verdict becomes `WRITE_ADR`, `shouldBecomeAdr`
 *                       becomes `true`, reasoning is replaced with
 *                       `"User override: --force-adr"`
 *   - neither flag    → the original `result` is returned unchanged
 *                       (same reference), so callers can cheaply
 *                       detect a no-op with `===`
 *
 * When both flags are set on the override (which {@link
 * parseAdrOverride} does not produce, but a hand-constructed override
 * might), the conservative `--no-adr` path wins — aligned with the
 * priority rule in {@link parseAdrOverride}. The other criteria
 * fields (`reversibility`, `surprising`, `tradeOff`, `alternatives`)
 * are preserved verbatim so the user can still audit why the
 * automatic verdict was what it was before the override.
 *
 * The function is pure: it never mutates its inputs and performs no
 * IO.
 *
 * **Validates: Requirements 2.6**
 */
export function applyAdrOverride(result, override) {
    // Conservative precedence: noAdr wins when both are set.
    if (override.noAdr) {
        return {
            ...result,
            shouldBecomeAdr: false,
            verdict: "DISCARD",
            reasoning: "User override: --no-adr",
        };
    }
    if (override.forceAdr) {
        return {
            ...result,
            shouldBecomeAdr: true,
            verdict: "WRITE_ADR",
            reasoning: "User override: --force-adr",
        };
    }
    return result;
}
//# sourceMappingURL=decide.js.map