import type { Vec3 } from "../core/vec3";
import type { MatchedComparisonConfig } from "./types";

export type ComparisonPresetId =
  | "rawGeometry"
  | "matchedEnvelope"
  | "matchedMassCom"
  | "matchedMassComWidth"
  | "matchedVolumeWidth"
  | "matchedMoaiTrial";

export interface ComparisonPreset {
  id: ComparisonPresetId;
  label: string;
  /** What this preset is for, in one sentence, shown beside the selector. */
  summary: string;
  /** What it deliberately leaves free, so the reader knows what may still differ. */
  leavesFree: string;
}

export const COMPARISON_PRESETS: readonly ComparisonPreset[] = [
  {
    id: "rawGeometry",
    label: "Raw Geometry",
    summary:
      "No normalization. Each family carries the mass, COM and inertia its own shape and densities imply.",
    leavesFree: "Everything. This is not a controlled performance comparison."
  },
  {
    id: "matchedEnvelope",
    label: "Matched Envelope",
    summary: "Holds the bounding dimensions and the whole environment fixed; lets mass and COM follow the shape.",
    leavesFree: "Total mass, base mass, COM, inertia."
  },
  {
    id: "matchedMassCom",
    label: "Matched Mass + COM",
    summary: "Holds total mass and centre of mass fixed; lets each family keep its own footprint dimensions.",
    leavesFree: "Maximum width, fore-aft length, base height, base volume, inertia."
  },
  {
    id: "matchedMassComWidth",
    label: "Matched Mass + COM + Width",
    summary: "Adds maximum lateral width to the mass and COM locks, so no family gains lateral stability by being wider.",
    leavesFree: "Fore-aft length, base height, base volume, inertia."
  },
  {
    id: "matchedVolumeWidth",
    label: "Matched Volume + Width",
    summary: "Holds the base's material volume and its lateral width fixed, letting fore-aft length absorb the difference.",
    leavesFree: "Total mass, COM, fore-aft length, inertia."
  },
  {
    id: "matchedMoaiTrial",
    label: "Matched Moai Candidate Trial",
    summary:
      "The strictest preset and the one candidate comparisons should use: mass, COM, both plan dimensions, the full environment and the initial pose are all held fixed, leaving shape as the only variable.",
    leavesFree: "Base height, base volume, inertia — all consequences of the shape being compared."
  }
];

const ENVIRONMENT_LOCKS = {
  lockInitialPose: false,
  lockRoad: true,
  lockRopeAnchors: true,
  lockRopeAttachments: true,
  lockMaxTension: true,
  lockProtocol: true,
  lockSolver: true
};

const NO_LOCKS = {
  lockTotalHeight: false,
  lockTotalMass: false,
  lockTotalCOM: false,
  lockPrincipalInertia: false,
  lockMaximumLateralWidth: false,
  lockForeAftLength: false,
  lockBaseHeight: false,
  lockBaseMass: false,
  lockBaseVolume: false,
  lockInitialPose: false,
  lockRoad: false,
  lockRopeAnchors: false,
  lockRopeAttachments: false,
  lockMaxTension: false,
  lockProtocol: false,
  lockSolver: false
};

/**
 * Which locks each preset turns on. Targets are supplied separately, by
 * capturing them from a baseline family — a preset says *what* is held equal,
 * never *to what value*, so the baseline is always an explicit choice rather
 * than a hidden default.
 *
 * No preset enables every lock. Several combinations are mutually incompatible
 * — a rocker's base height is fixed by its own width and curvature, so locking
 * width and base height together over-constrains it — and a preset that was
 * invalid for half the families by construction would be worse than useless.
 */
export function presetLocks(id: ComparisonPresetId): Omit<MatchedComparisonConfig, "enabled" | "targetTotalHeight" | "targetTotalMass" | "targetCOM" | "targetPrincipalInertia" | "targetMaximumLateralWidth" | "targetForeAftLength" | "targetBaseHeight" | "targetBaseMass" | "targetBaseVolume"> {
  switch (id) {
    case "rawGeometry":
      return { ...NO_LOCKS };

    case "matchedEnvelope":
      return {
        ...NO_LOCKS,
        ...ENVIRONMENT_LOCKS,
        lockTotalHeight: true,
        lockMaximumLateralWidth: true,
        lockForeAftLength: true,
        lockBaseHeight: true
      };

    case "matchedMassCom":
      return {
        ...NO_LOCKS,
        ...ENVIRONMENT_LOCKS,
        lockTotalHeight: true,
        lockTotalMass: true,
        lockTotalCOM: true
      };

    case "matchedMassComWidth":
      return {
        ...NO_LOCKS,
        ...ENVIRONMENT_LOCKS,
        lockTotalHeight: true,
        lockTotalMass: true,
        lockTotalCOM: true,
        lockMaximumLateralWidth: true
      };

    case "matchedVolumeWidth":
      return {
        ...NO_LOCKS,
        ...ENVIRONMENT_LOCKS,
        lockTotalHeight: true,
        lockBaseVolume: true,
        lockMaximumLateralWidth: true
      };

    case "matchedMoaiTrial":
      return {
        ...NO_LOCKS,
        ...ENVIRONMENT_LOCKS,
        lockInitialPose: true,
        lockTotalHeight: true,
        lockTotalMass: true,
        lockTotalCOM: true,
        lockMaximumLateralWidth: true,
        lockForeAftLength: true
      };
  }
}

/** Targets captured from a baseline statue, which is what makes a preset concrete. */
export interface ComparisonTargets {
  totalHeight: number;
  totalMass: number;
  com: Vec3;
  principalInertia: Vec3;
  maximumLateralWidth: number;
  foreAftLength: number;
  baseHeight: number;
  baseMass: number;
  baseVolume: number;
}

export function buildConfig(
  id: ComparisonPresetId,
  targets: ComparisonTargets
): MatchedComparisonConfig {
  return {
    enabled: id !== "rawGeometry",
    ...presetLocks(id),
    targetTotalHeight: targets.totalHeight,
    targetTotalMass: targets.totalMass,
    targetCOM: targets.com,
    targetPrincipalInertia: targets.principalInertia,
    targetMaximumLateralWidth: targets.maximumLateralWidth,
    targetForeAftLength: targets.foreAftLength,
    targetBaseHeight: targets.baseHeight,
    targetBaseMass: targets.baseMass,
    targetBaseVolume: targets.baseVolume
  };
}
