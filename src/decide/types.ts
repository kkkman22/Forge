/**
 * Decide engine types and shared constants.
 *
 * @module decide/types
 */

import type { AdrCriteriaResult, DecisionCandidate, DecisionSignals } from "../adr-criteria.js";
import type { AdrEntry, AdrStatus } from "../adr-registry.js";
import type { GlossaryTerm } from "../glossary.js";

export interface DecideContext {
  taskDescription: string;
  involvedFiles: string[];
  /**
   * Merged context file list (plan frontmatter `context_files` +
   * `.tinkerman/runs/<runId>/context.jsonl`, deduplicated). When present and
   * non-empty, Round 1 decide agents receive a "Relevant artifacts" section
   * so their analysis is grounded in actual spec/research files rather than
   * only the task description. Spec: context-injection-activation.
   */
  contextFiles?: string[];
}

export interface TeamMember {
  name: string;
  role: string;
  agent: string;
}

/** Renamed alias for the Subagent migration — semantically equivalent to TeamMember. */
export type SubagentConfig = TeamMember;

/** Output from the Critic agent for status resolution. */
export interface CriticOutput {
  hasBlockingIssues: boolean;
  issues: string[];
}

/**
 * One (decision, signals) pair together with the three-question gate
 * result produced by evaluateAdrCriteria.
 */
export interface CriteriaScreenItem {
  decision: DecisionCandidate;
  signals: DecisionSignals;
  result: AdrCriteriaResult;
}

/**
 * Inputs for finalizeAdr.
 */
export interface FinalizeAdrInput {
  title: string;
  topic: string;
  status: AdrStatus;
  date: string;
  deciders: string[];
  relatedAdrs?: string[];
  supersedes?: string;
  reversibility?: "hard" | "soft";
  surprising?: boolean;
  tradeOffAlternatives?: string[];
  existingAdrs: AdrEntry[];
  bodyMarkdown: string;
}

/** A single ADR file update produced as a side-effect of supersession. */
export interface AdrSupersessionUpdate {
  filePath: string;
  updatedContent: string;
}

/**
 * Output of finalizeAdr. The caller performs the actual IO.
 */
export interface FinalizeAdrOutput {
  newEntry: AdrEntry;
  adrFilePath: string;
  adrFileContent: string;
  indexFilePath: string;
  indexContent: string;
  supersessionUpdates: AdrSupersessionUpdate[];
}

/** Minimal filesystem contract for appendInlineNote. */
export interface InlineNoteAppender {
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  exists(path: string): boolean;
}

/** Status-file-derived context for resolveUpstreamFile. */
export interface StatusFileContext {
  currentTask?: string;
  specPath?: string;
  planPath?: string;
  progressPath?: string;
}

/** A single glossary conflict surfaced by the decide phase. */
export interface DecideGlossaryConflict {
  term: string;
  existing: GlossaryTerm;
  candidate: GlossaryTerm;
  reason: "same_term_different_definition" | "same_alias_different_term";
}

/** Result of parsing a user prompt for ADR-verdict override flags. */
export interface AdrOverride {
  forceAdr: boolean;
  noAdr: boolean;
}
