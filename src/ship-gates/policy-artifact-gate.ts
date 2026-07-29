/**
 * Ship gate — policy profile artifact gate.
 *
 * Extracted from `ship-gates.ts` (god-file split, following the
 * `context-budget/` + `pua-engine/` precedent). See `ship-gates.ts` for the
 * re-export barrel that preserves the public API.
 */

import {
  type EvidenceArtifact,
  type EvidenceArtifactKind,
  isArtifactFreshForCommit,
  queryEvidenceArtifacts,
} from "../evidence-artifact.js";
import { getPolicyGateRequirements, type PolicyProfile } from "../workflow-graph.js";
import type { GateResult } from "./types.js";

export function checkPolicyProfileArtifactGate(
  projectRoot: string,
  topic: string,
  currentHead: string,
  policyProfile: PolicyProfile,
  options: { changedFiles?: readonly string[]; testInputHash?: string } = {},
): GateResult {
  const requiredKinds = requiredArtifactKinds(policyProfile);
  const failures: string[] = [];
  const forceArtifact = latestForceShipArtifact(projectRoot, topic);

  for (const kind of requiredKinds) {
    const latest = queryEvidenceArtifacts(projectRoot, { topic, kind })[0];
    if (!latest) {
      failures.push(`required ${kind} artifact is missing`);
      continue;
    }
    if (latest.result !== "pass") {
      failures.push(`latest ${kind} artifact result is ${latest.result}`);
    }
    const freshness = isArtifactFreshForCommit(latest, currentHead, {
      changedFiles: kind === "review" ? options.changedFiles : undefined,
      inputHash: kind === "test" ? options.testInputHash : undefined,
    });
    if (!freshness.fresh) {
      if (!forceArtifact) {
        failures.push(freshness.reason);
      }
    }
  }

  if (failures.length > 0) {
    return {
      gate: "policy",
      passed: false,
      reason: failures.join("; "),
      details: { incompleteTasks: failures },
    };
  }

  return {
    gate: "policy",
    passed: true,
    reason: `${policyProfile} policy artifact requirements satisfied.`,
  };
}

function latestForceShipArtifact(projectRoot: string, topic: string): EvidenceArtifact | null {
  return (
    queryEvidenceArtifacts(projectRoot, { topic, kind: "ship_gate" }).find(
      (artifact) =>
        artifact.result === "pass" &&
        /\b--force\b|\bforce\b|forced|force-skip/i.test(artifact.command),
    ) ?? null
  );
}

function requiredArtifactKinds(policyProfile: PolicyProfile): EvidenceArtifactKind[] {
  const gates = getPolicyGateRequirements(policyProfile, "ship");
  const requiredKinds: EvidenceArtifactKind[] = [];
  if (gates.review === "basic" || gates.review === "required" || gates.review === "full") {
    requiredKinds.push("review");
  }
  if (gates.test === "required" || gates.test === "full") {
    requiredKinds.push("test");
  }
  if (gates.mutation === "required" || gates.mutation === "full") {
    requiredKinds.push("mutation");
  }
  return requiredKinds;
}
