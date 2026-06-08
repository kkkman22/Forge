import {
  clearPackageFields,
  extractPackageFields,
  type PackageStatusFields,
  updateIterationStatus,
  writePackageFields,
} from "../status-file-ext.js";
import {
  getNextPackageTransition,
  getNextPhase,
  type Phase,
  type ReviewResult,
  type Tier,
} from "./phase-transitions.js";

export interface LoopRuntimeState {
  id: string;
  phase: Phase;
  tier: Tier;
  totalIterations: number;
  consecutiveFailures: number;
  lastReviewResult: ReviewResult;
  haltReason?: string;
  phaseHistory?: Array<{
    phase: Phase;
    enteredAt: string;
    exitedAt?: string;
    result?: string;
  }>;
  packageState?: PackageStatusFields;
}

export interface RuntimeExecutionPackage {
  id: string;
  depends_on_packages?: string[];
}

export interface AdvanceLoopInput {
  loopState: LoopRuntimeState;
  statusContent: string;
  executionPackages?: RuntimeExecutionPackage[];
  reviewResult?: ReviewResult;
  now?: string;
}

export interface AdvanceLoopResult {
  loopState: LoopRuntimeState;
  statusContent: string;
  nextForgeArgs: string | null;
}

/**
 * Advance native Forge loop state after a phase completes successfully.
 *
 * This is the runtime adapter used by `/forge loop`: it bridges the pure
 * package transition table with persisted `.forge/status.md` fields and the
 * next `/forge <phase>` invocation.
 */
export function advanceLoopAfterPhaseSuccess(input: AdvanceLoopInput): AdvanceLoopResult {
  const packages = input.executionPackages ?? [];
  const hasPackages = packages.length > 0;
  const packageFields = extractPackageFields(input.statusContent);
  const reviewResult = input.reviewResult ?? input.loopState.lastReviewResult;

  const packageState = ensurePackageState(input.loopState.packageState ?? packageFields, packages);
  const packageDependencies = Object.fromEntries(
    packages.map((pkg) => [pkg.id, pkg.depends_on_packages ?? []]),
  );

  const transition = hasPackages
    ? getNextPackageTransition({
        tier: input.loopState.tier,
        currentPhase: input.loopState.phase,
        reviewResult,
        currentPackage: packageState.currentPackage ?? null,
        completedPackages: packageState.completedPackages ?? [],
        packageIds: packages.map((pkg) => pkg.id),
        packageDependencies,
      })
    : {
        phase: getNextPhase(input.loopState.phase, input.loopState.tier, reviewResult),
        currentPackage: null,
        completedPackages: [],
        nextPackage: null,
        completed: false,
      };

  const nextIteration = input.loopState.totalIterations + 1;
  const nextLoopState: LoopRuntimeState = {
    ...input.loopState,
    phase: transition.phase,
    totalIterations: nextIteration,
    lastReviewResult:
      input.loopState.phase === "review" ? reviewResult : input.loopState.lastReviewResult,
    haltReason: transition.phase === "halted" ? transition.reason : input.loopState.haltReason,
    phaseHistory: appendPhaseHistory(input.loopState, transition.phase, input.now),
  };

  const nextPackageState = buildPackageState(transition, packages.length);
  if (hasPackages) {
    nextLoopState.packageState = nextPackageState;
  }

  let statusContent = updateIterationStatus(input.statusContent, transition.phase, nextIteration);
  if (hasPackages) {
    statusContent = writeRuntimePackageFields(statusContent, nextPackageState);
  }

  return {
    loopState: nextLoopState,
    statusContent,
    nextForgeArgs:
      transition.phase === "halted" ? null : buildNextForgeArgs(transition.phase, nextPackageState),
  };
}

function ensurePackageState(
  fields: PackageStatusFields,
  packages: RuntimeExecutionPackage[],
): PackageStatusFields {
  if (packages.length === 0) return fields;
  const firstIncomplete = packages.find(
    (pkg) => !(fields.completedPackages ?? []).includes(pkg.id),
  );
  return {
    currentPackage: fields.currentPackage ?? firstIncomplete?.id,
    completedPackages: fields.completedPackages ?? [],
    nextPackage:
      fields.nextPackage ??
      findNextPackage(packages, fields.completedPackages ?? [], firstIncomplete?.id),
    packageCount: fields.packageCount ?? packages.length,
  };
}

function buildPackageState(
  transition: {
    currentPackage: string | null;
    completedPackages: string[];
    nextPackage: string | null;
  },
  packageCount: number,
): PackageStatusFields {
  return {
    currentPackage: transition.currentPackage ?? undefined,
    completedPackages: transition.completedPackages,
    nextPackage: transition.nextPackage ?? undefined,
    packageCount,
  };
}

function writeRuntimePackageFields(statusContent: string, fields: PackageStatusFields): string {
  let nextContent = statusContent;
  if (fields.currentPackage === undefined && fields.nextPackage === undefined) {
    nextContent = clearPackageFields(nextContent);
  }
  return writePackageFields(nextContent, fields);
}

function buildNextForgeArgs(phase: Phase, fields: PackageStatusFields): string | null {
  if (phase === "completed") return null;
  if (phase === "build" && fields.currentPackage) return `build --package ${fields.currentPackage}`;
  if (phase === "review" && fields.currentPackage)
    return `review --package ${fields.currentPackage}`;
  if (phase === "test" && fields.currentPackage) return `test --package ${fields.currentPackage}`;
  return phase;
}

function findNextPackage(
  packages: RuntimeExecutionPackage[],
  completedPackages: string[],
  currentPackage?: string,
): string | undefined {
  const completed = new Set(completedPackages);
  return packages.find((pkg) => pkg.id !== currentPackage && !completed.has(pkg.id))?.id;
}

function appendPhaseHistory(
  state: LoopRuntimeState,
  nextPhase: Phase,
  now?: string,
): LoopRuntimeState["phaseHistory"] {
  const timestamp = now ?? new Date().toISOString();
  return [
    ...(state.phaseHistory ?? []),
    {
      phase: state.phase,
      exitedAt: timestamp,
      enteredAt: timestamp,
      result: nextPhase,
    },
  ];
}
