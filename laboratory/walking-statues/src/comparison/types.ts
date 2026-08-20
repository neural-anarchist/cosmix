import type { Vec3 } from "../core/vec3";
import type { RoadParams } from "../road/types";
import type { RopeParams } from "../control/ropeModel";
import type { StatueParams } from "../statue/types";

/**
 * The two modes the application distinguishes.
 *
 * Raw geometry is the physically-constructed statue: every family carries the
 * mass, COM and inertia its own shape and densities imply. It is the right mode
 * for inspecting a candidate, and the wrong one for claiming a candidate is
 * mechanically better — a shape that happens to be heavier, wider, or
 * lower-slung would look better for reasons that have nothing to do with the
 * mechanism under test.
 *
 * Matched comparison holds chosen quantities equal across shapes so that the
 * shape is the only thing that varies.
 */
export type ComparisonMode = "raw" | "matched";

export type ComparisonStatus = "RAW" | "MATCHED_OK" | "MATCHED_INVALID";

/**
 * Every quantity that can be held fixed across a family switch.
 *
 * `baseHeight` is not in the original specification's config type but is
 * required by the Matched Envelope preset, which locks it explicitly; it is
 * included here rather than silently omitted from that preset.
 */
export type LockId =
  | "totalHeight"
  | "totalMass"
  | "totalCOM"
  | "principalInertia"
  | "maximumLateralWidth"
  | "foreAftLength"
  | "baseHeight"
  | "baseMass"
  | "baseVolume"
  | "initialPose"
  | "road"
  | "ropeAnchors"
  | "ropeAttachments"
  | "maxTension"
  | "protocol"
  | "solver";

export interface MatchedComparisonConfig {
  enabled: boolean;

  // Global body constraints
  lockTotalHeight: boolean;
  targetTotalHeight: number;

  lockTotalMass: boolean;
  targetTotalMass: number;

  lockTotalCOM: boolean;
  targetCOM: Vec3;

  lockPrincipalInertia: boolean;
  targetPrincipalInertia?: Vec3;

  // Base-specific geometric constraints
  lockMaximumLateralWidth: boolean;
  targetMaximumLateralWidth: number;

  lockForeAftLength: boolean;
  targetForeAftLength: number;

  lockBaseHeight: boolean;
  targetBaseHeight: number;

  lockBaseMass: boolean;
  targetBaseMass?: number;

  lockBaseVolume: boolean;
  targetBaseVolume?: number;

  // Initial state and environment
  lockInitialPose: boolean;
  lockRoad: boolean;
  lockRopeAnchors: boolean;
  lockRopeAttachments: boolean;
  lockMaxTension: boolean;
  lockProtocol: boolean;
  lockSolver: boolean;
}

/** Everything outside the statue that a comparison has to hold still. */
export interface ComparisonEnvironment {
  roadParams: RoadParams;
  ropeParams: RopeParams;
  maxTensionN: number;
  fixedTimestepS: number;
  solverIterations: number;
  initialPose: { translation: Vec3; rotation: { x: number; y: number; z: number; w: number } };
}

/**
 * Tolerances a lock must be met within. Stated explicitly rather than left to
 * a shared epsilon, because they mean different things: a tenth of a millimetre
 * on a 3.5 m statue is a different demand from 0.01% on 4000 kg.
 */
export const LOCK_TOLERANCES = {
  /** Any length: height, width, fore-aft length, base height. */
  lengthM: 1e-4,
  /** Relative, on total and base mass. */
  massRelative: 1e-4,
  comM: 1e-4,
  /** Relative, on base volume. */
  volumeRelative: 1e-3,
  /** Relative, on principal inertia when locked as an abstract probe. */
  inertiaRelative: 1e-3
} as const;

export type LockStatus = "MET" | "VIOLATED" | "NOT_APPLICABLE" | "UNLOCKED";

/**
 * What one lock asked for, what it got, and how. Every field is reported —
 * including the method — because "matched" is a claim, and a claim that cannot
 * be inspected is not worth much.
 */
export interface LockReport {
  id: LockId;
  label: string;
  unit: string;
  target: number | null;
  achieved: number | null;
  absoluteError: number | null;
  relativeError: number | null;
  tolerance: number | null;
  status: LockStatus;
  method: string;
  warning?: string;
}

export interface MatchedResolution {
  status: ComparisonStatus;
  presetId: string;
  /**
   * Identifies a baseline and every candidate matched against it, so a result
   * recorded later can be tied back to the exact constraints it was produced
   * under rather than to a remembered intention.
   */
  comparisonGroupId: string;
  /** The statue parameters to actually build, after normalization. */
  statueParams: StatueParams;
  reports: LockReport[];
  /** Why the configuration is invalid, if it is. Empty when it is not. */
  problems: string[];
  /**
   * True when the result relies on the abstract mass-property override rather
   * than on a physically-represented ballast — i.e. when the mass distribution
   * corresponds to no real arrangement of the statue's own material.
   */
  abstract: boolean;
  abstractNote: string | null;
}
