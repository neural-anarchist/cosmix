import type { StatueParams } from "../statue/types";
import type { ComparisonPresetId } from "./presets";
import type { ComparisonEnvironment, MatchedComparisonConfig, MatchedResolution } from "./types";

/**
 * A saved point of comparison: a family, the raw parameters it was configured
 * with, and the environment it was run in.
 *
 * Deliberately stores the *raw* parameters rather than the normalized ones. A
 * scenario is "this family, as configured"; the normalization is a function of
 * that plus the shared constraints, so re-resolving it whenever the constraints
 * change is what lets a baseline and a candidate stay genuinely comparable
 * instead of drifting into two independently-frozen snapshots.
 */
export interface ComparisonScenario {
  id: string;
  role: "baseline" | "candidate";
  label: string;
  rawStatueParams: StatueParams;
  environment: ComparisonEnvironment;
  /** Ties this scenario to the baseline and constraint set it belongs to. */
  comparisonGroupId: string;
  capturedAtIso: string;
}

/** What a saved comparison exports: both scenarios plus the shared constraints
 * they were matched under, so a later run can be tied to the exact conditions
 * rather than to a remembered intention. */
export interface ComparisonExport {
  comparisonGroupId: string;
  presetId: ComparisonPresetId | "custom";
  config: MatchedComparisonConfig;
  baseline: ComparisonScenario | null;
  candidate: ComparisonScenario | null;
  candidateResolution: Pick<MatchedResolution, "status" | "reports" | "problems" | "abstract"> | null;
  exportedAtIso: string;
}

let counter = 0;

/** Group ids are readable rather than opaque: they end up in exported records
 * that someone has to match against a run days later. */
export function newComparisonGroupId(): string {
  counter += 1;
  return `cmp-${new Date().toISOString().slice(0, 10)}-${counter.toString().padStart(3, "0")}`;
}

export function captureScenario(options: {
  role: ComparisonScenario["role"];
  label: string;
  rawStatueParams: StatueParams;
  environment: ComparisonEnvironment;
  comparisonGroupId: string;
}): ComparisonScenario {
  return {
    id: `${options.role}-${Date.now().toString(36)}`,
    role: options.role,
    label: options.label,
    rawStatueParams: { ...options.rawStatueParams },
    environment: structuredClone(options.environment),
    comparisonGroupId: options.comparisonGroupId,
    capturedAtIso: new Date().toISOString()
  };
}

/**
 * Compares two environments field by field, for the locks that are about
 * *nothing changing* when the family is switched.
 *
 * Road, rope geometry, tension, solver and initial pose are not derived from the
 * statue, so "locking" them is not a normalization — it is a check that they
 * were not disturbed. Reporting them as verified rather than assuming it is the
 * point: a comparison invalidated by a rope that quietly re-snapped to the new
 * body would otherwise look perfectly matched.
 */
export function environmentDifferences(
  baseline: ComparisonEnvironment,
  candidate: ComparisonEnvironment,
  config: MatchedComparisonConfig
): { id: string; label: string; detail: string }[] {
  const differences: { id: string; label: string; detail: string }[] = [];
  const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

  if (config.lockRoad) {
    const a = baseline.roadParams;
    const b = candidate.roadParams;
    for (const key of ["lengthM", "widthM", "frictionCoefficient", "restitution", "longitudinalSlopeRad", "crossSlopeRad"] as const) {
      if (!near(a[key], b[key])) {
        differences.push({ id: "road", label: `Road ${key}`, detail: `${a[key]} -> ${b[key]}` });
      }
    }
    if (a.type !== b.type) differences.push({ id: "road", label: "Road type", detail: `${a.type} -> ${b.type}` });
  }

  for (const side of ["left", "right"] as const) {
    for (const axis of ["x", "y", "z"] as const) {
      if (config.lockRopeAnchors && !near(baseline.ropeParams[side].externalAnchor[axis], candidate.ropeParams[side].externalAnchor[axis])) {
        differences.push({
          id: "ropeAnchors",
          label: `${side} anchor ${axis}`,
          detail: `${baseline.ropeParams[side].externalAnchor[axis].toFixed(4)} -> ${candidate.ropeParams[side].externalAnchor[axis].toFixed(4)} m`
        });
      }
      if (config.lockRopeAttachments && !near(baseline.ropeParams[side].attachmentLocal[axis], candidate.ropeParams[side].attachmentLocal[axis])) {
        differences.push({
          id: "ropeAttachments",
          label: `${side} attachment ${axis}`,
          detail: `${baseline.ropeParams[side].attachmentLocal[axis].toFixed(4)} -> ${candidate.ropeParams[side].attachmentLocal[axis].toFixed(4)} m`
        });
      }
    }
  }

  if (config.lockMaxTension && !near(baseline.maxTensionN, candidate.maxTensionN)) {
    differences.push({ id: "maxTension", label: "Maximum tension", detail: `${baseline.maxTensionN} -> ${candidate.maxTensionN} N` });
  }

  if (config.lockSolver) {
    if (!near(baseline.fixedTimestepS, candidate.fixedTimestepS)) {
      differences.push({ id: "solver", label: "Fixed timestep", detail: `${baseline.fixedTimestepS} -> ${candidate.fixedTimestepS} s` });
    }
    if (baseline.solverIterations !== candidate.solverIterations) {
      differences.push({ id: "solver", label: "Solver iterations", detail: `${baseline.solverIterations} -> ${candidate.solverIterations}` });
    }
  }

  if (config.lockInitialPose) {
    for (const axis of ["x", "y", "z"] as const) {
      if (!near(baseline.initialPose.translation[axis], candidate.initialPose.translation[axis])) {
        differences.push({ id: "initialPose", label: `Initial position ${axis}`, detail: "changed" });
      }
      if (!near(baseline.initialPose.rotation[axis], candidate.initialPose.rotation[axis])) {
        differences.push({ id: "initialPose", label: `Initial rotation ${axis}`, detail: "changed" });
      }
    }
    if (!near(baseline.initialPose.rotation.w, candidate.initialPose.rotation.w)) {
      differences.push({ id: "initialPose", label: "Initial rotation w", detail: "changed" });
    }
  }

  return differences;
}
