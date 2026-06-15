/**
 * Render_Model — abstract mapping from Forge state to native sidebar UI regions
 * (cmux-extension-sidebar R2).
 *
 * This is the stable RENDER CONTRACT for the cmux custom sidebar. The Swift
 * authoring syntax (which SwiftUI primitives to use) is an Implementation_Gate
 * — cmux 0.64.15's sidebar interpreter API is Beta and undocumented. This
 * module locks the data model so that when the API stabilizes, only a thin
 * Swift translation layer is needed.
 *
 * Design (per cmux-extension-sidebar R2):
 *   - Pure functions: Forge_State_Snapshot → Render_Model (5 regions).
 *   - Totality (R2.2): every legal phase → a legal icon; out-of-domain → circle.
 *   - Data-source totality (R2.4): a missing region data source folds/hides
 *     the region rather than throwing.
 *   - Reuses cmux-integration's payload.mjs mappings (phaseToIcon/tierToColor).
 */

import { phaseToIcon, tierToColor } from "./payload.mjs";

// ---------------------------------------------------------------------------
// Types (JSDoc)
// ---------------------------------------------------------------------------

/**
 * @typedef {"decide"|"spec"|"plan"|"build"|"review"|"test"|"ship"|"learn"|"debug"|"idle"} Phase
 * @typedef {"lightweight"|"light"|"standard"|"full"} Tier
 * @typedef {"P0"|"P1"|"P2"|"P3"} Severity
 *
 * @typedef {Object} ForgeStateSnapshot
 * @property {Phase} phase
 * @property {Tier} [tier]
 * @property {string} [current_topic]
 * @property {{done:number, failed:number, blocked:number, in_progress:number, total:number}|null} [dag]
 * @property {{spec:string, quality:string, security:string, p0:number, p1:number, p2:number, p3:number}|null} [review]
 * @property {{iterations:Array<{subject:string, outcome:"success"|"rollback"}>, ratio:number}|null} [loop]
 * @property {Array<{kind:string, topic:string, severity:Severity}>} [attention]
 *
 * @typedef {Object} RenderModel
 * @property {{icon:string, phase:Phase, tier_color:string|null, current_topic:string}} phase_region
 * @property {{visible:boolean, ratio:number, done:number, failed:number, blocked:number, in_progress:number, total:number}} dag_region
 * @property {{visible:boolean, spec:string, quality:string, security:string, p0:number, p1:number, p2:number, p3:number}} review_region
 * @property {{visible:boolean, iterations:Array<{subject:string, outcome:string}>, ratio:number}} loop_region
 * @property {Array<{kind:string, topic:string, severity:Severity}>} attention_queue
 */

/** @returns {"lightweight"|"standard"|"full"} — normalize the "light" alias. */
function normalizeTier(tier) {
  if (tier === "lightweight" || tier === "light") return "lightweight";
  if (tier === "standard") return "standard";
  if (tier === "full") return "full";
  return "standard";
}

/**
 * Map a Forge_State_Snapshot to the 5-region Render_Model (R2.1).
 * Missing data sources fold their region (visible:false) rather than throw (R2.4).
 * @param {ForgeStateSnapshot} snapshot
 * @returns {RenderModel}
 */
export function buildRenderModel(snapshot) {
  const phase = snapshot.phase ?? "idle";
  const tier = normalizeTier(snapshot.tier);

  // Phase_Region — always visible (R2.1).
  const phase_region = {
    icon: phaseToIcon(phase), // totality: out-of-domain → circle (R2.2)
    phase,
    tier_color: tierToColor(tier === "lightweight" ? "light" : tier),
    current_topic: snapshot.current_topic ?? "",
  };

  // DAG_Region — visible only when dag data present (R2.4).
  const dag = snapshot.dag;
  const dag_region = dag
    ? {
        visible: true,
        ratio: dag.total > 0 ? (dag.done + dag.failed) / dag.total : 0,
        done: dag.done,
        failed: dag.failed,
        blocked: dag.blocked,
        in_progress: dag.in_progress,
        total: dag.total,
      }
    : { visible: false, ratio: 0, done: 0, failed: 0, blocked: 0, in_progress: 0, total: 0 };

  // Review_Region — visible only when review data present (R2.4).
  const review = snapshot.review;
  const review_region = review
    ? {
        visible: true,
        spec: review.spec,
        quality: review.quality,
        security: review.security,
        p0: review.p0,
        p1: review.p1,
        p2: review.p2,
        p3: review.p3,
      }
    : { visible: false, spec: "", quality: "", security: "", p0: 0, p1: 0, p2: 0, p3: 0 };

  // Loop_Region — visible only when loop data present (R2.4).
  const loop = snapshot.loop;
  const loop_region = loop
    ? {
        visible: true,
        iterations: Array.isArray(loop.iterations) ? loop.iterations : [],
        ratio: typeof loop.ratio === "number" ? loop.ratio : 0,
      }
    : { visible: false, iterations: [], ratio: 0 };

  // Attention_Queue — always present (possibly empty).
  const attention_queue = Array.isArray(snapshot.attention) ? snapshot.attention : [];

  return {
    phase_region,
    dag_region,
    review_region,
    loop_region,
    attention_queue,
  };
}

/**
 * Review verdict chip color (R2.1 Review_Region).
 *   green  = 0 P1 (and 0 P0)
 *   yellow = only P2/P3
 *   red    = ≥1 P1 (P0 implies red too)
 * @param {{p0:number, p1:number}} counts
 * @returns {"green"|"yellow"|"red"}
 */
export function reviewVerdictColor(counts) {
  const p0 = counts?.p0 ?? 0;
  const p1 = counts?.p1 ?? 0;
  if (p0 > 0 || p1 > 0) return "red";
  return "yellow"; // P2/P3-only or empty → yellow (green reserved for explicitly-verified)
}
