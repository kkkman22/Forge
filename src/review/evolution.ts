/**
 * Evolution artefact helpers (skills-cross-pollination — Requirement 8.5).
 *
 * @module review/evolution
 */

import type { Episode, EpisodeTier } from "../episode.js";
import {
  buildFailureEpisode,
  buildFailureEvolutionMarker,
  type FailureContext,
} from "../failure-sink.js";

export interface ReviewEvolutionInput {
  topic: string;
  tier: EpisodeTier;
  newPatternSituation?: string;
  matchedFailurePattern?: string;
}

export interface ReviewEvolutionArtifacts {
  episode?: Episode;
  markerText?: string;
  patternUpdate?: string;
}

/**
 * Pure helper that turns a review's evolution signals into write-ready artefacts.
 */
export function buildReviewEvolutionArtifacts(
  input: ReviewEvolutionInput,
  now: Date,
  sequenceInDay: number,
): ReviewEvolutionArtifacts {
  const out: ReviewEvolutionArtifacts = {};

  if (input.newPatternSituation !== undefined && input.newPatternSituation.length > 0) {
    const ctx: FailureContext = {
      skill: "forge-review",
      topic: input.topic,
      tier: input.tier,
      trigger: "new_review_pattern",
      situation: input.newPatternSituation,
    };
    const episode = buildFailureEpisode(ctx, now, sequenceInDay);
    const markerText = buildFailureEvolutionMarker(ctx, episode.id, now);
    out.episode = episode;
    out.markerText = markerText;
  }

  if (input.matchedFailurePattern !== undefined && input.matchedFailurePattern.length > 0) {
    out.patternUpdate = input.matchedFailurePattern;
  }

  return out;
}
