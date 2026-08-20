import { create } from "zustand";
import { defaultRopeParams } from "../control/ropeDefaults";
import type { RopeGeometry, RopeParams, RopeSide } from "../control/ropeModel";
import { DEFAULT_STATUE_PARAMS } from "../statue/defaults";
import { computeStatueGeometry } from "../statue/geometry";
import type { StatueParams } from "../statue/types";
import type { RoadParams } from "../road/types";
import type { EngineSnapshot } from "../core/SimulationEngine";
import { FIXED_TIMESTEP_S } from "../core/constants";
import { buildConfig, type ComparisonPresetId } from "../comparison/presets";
import { captureTargets, resolveMatchedComparison } from "../comparison/resolve";
import {
  captureScenario,
  environmentDifferences,
  newComparisonGroupId,
  type ComparisonExport,
  type ComparisonScenario
} from "../comparison/scenario";
import type { ComparisonEnvironment, MatchedComparisonConfig, MatchedResolution } from "../comparison/types";

export const DEFAULT_ROAD_PARAMS: RoadParams = {
  type: "flat",
  lengthM: 40,
  widthM: 6,
  frictionCoefficient: 0.65,
  restitution: 0.05,
  longitudinalSlopeRad: 0,
  crossSlopeRad: 0
};

export const DEFAULT_ROPE_TENSION_N = 3000;

export const DEFAULT_ROPE_PARAMS: RopeParams = defaultRopeParams(
  computeStatueGeometry(DEFAULT_STATUE_PARAMS),
  DEFAULT_ROPE_TENSION_N
);

export type Axis = "x" | "y" | "z";

/** Rapier's default velocity-solver iteration count, recorded so a comparison
 * can assert the solver was not changed between baseline and candidate. */
export const SOLVER_ITERATIONS = 4;

interface SimStore {
  statueParams: StatueParams;
  roadParams: RoadParams;
  ropeParams: RopeParams;
  /**
   * Set once the user edits any rope coordinate by hand. Until then, changing
   * the statue's size re-derives the attachment points from the new geometry,
   * so a taller statue doesn't leave its ropes tied to thin air. After a manual
   * edit that auto-tracking stops — silently overwriting a deliberate value
   * would be worse — and the "Re-snap to statue" button restores it.
   */
  ropeGeometryCustomized: boolean;
  /** Locks and targets shared by the baseline and every candidate. */
  comparisonConfig: MatchedComparisonConfig;
  comparisonPresetId: ComparisonPresetId;
  comparisonGroupId: string;
  baselineScenario: ComparisonScenario | null;
  candidateScenario: ComparisonScenario | null;
  /** Differences in quantities that were supposed to be held still. */
  environmentDrift: { id: string; label: string; detail: string }[];
  showBallast: boolean;

  showColliders: boolean;
  showComMarker: boolean;
  readout: EngineSnapshot | null;

  setStatueParams: (patch: Partial<StatueParams>) => void;
  resetStatueParams: () => void;
  setRoadParams: (patch: Partial<RoadParams>) => void;
  resetRoadParams: () => void;
  setRopeTensionN: (n: number) => void;
  setRopeExternalAnchor: (side: RopeSide, axis: Axis, value: number) => void;
  setRopeAttachment: (side: RopeSide, axis: Axis, value: number) => void;
  resnapRopeAttachments: () => void;
  resetRopeParams: () => void;
  setShowColliders: (v: boolean) => void;
  setShowComMarker: (v: boolean) => void;
  setShowBallast: (v: boolean) => void;
  setReadout: (s: EngineSnapshot) => void;

  setComparisonPreset: (id: ComparisonPresetId) => void;
  setComparisonLock: (patch: Partial<MatchedComparisonConfig>) => void;
  captureBaseline: () => void;
  captureCandidate: () => void;
  loadScenario: (role: "baseline" | "candidate") => void;
  clearComparison: () => void;
  exportComparison: () => ComparisonExport;
}

/** The environment as it currently stands, for capture and for drift checks. */
function currentEnvironment(state: {
  roadParams: RoadParams;
  ropeParams: RopeParams;
}): ComparisonEnvironment {
  return {
    roadParams: { ...state.roadParams },
    ropeParams: cloneRopeParams(state.ropeParams),
    maxTensionN: state.ropeParams.tensionN,
    fixedTimestepS: FIXED_TIMESTEP_S,
    solverIterations: SOLVER_ITERATIONS,
    // The engine always spawns the statue at the origin, upright. Locking the
    // initial pose is therefore a check that this has not changed rather than a
    // value to impose.
    initialPose: { translation: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }
  };
}

/** Re-derives attachment points from a statue's geometry, keeping the external
 * anchors (world positions where the haulers stand) exactly where they are. */
function resnap(statueParams: StatueParams, ropeParams: RopeParams): RopeParams {
  const geometry = computeStatueGeometry(statueParams);
  return {
    tensionN: ropeParams.tensionN,
    left: { ...ropeParams.left, attachmentLocal: { ...geometry.defaultAttachment.left } },
    right: { ...ropeParams.right, attachmentLocal: { ...geometry.defaultAttachment.right } }
  };
}

const cloneRopeParams = (p: RopeParams): RopeParams => ({
  tensionN: p.tensionN,
  left: { externalAnchor: { ...p.left.externalAnchor }, attachmentLocal: { ...p.left.attachmentLocal } },
  right: { externalAnchor: { ...p.right.externalAnchor }, attachmentLocal: { ...p.right.attachmentLocal } }
});

const editRope = (
  ropeParams: RopeParams,
  side: RopeSide,
  field: keyof RopeGeometry,
  axis: Axis,
  value: number
): RopeParams => {
  const next = cloneRopeParams(ropeParams);
  next[side][field][axis] = value;
  return next;
};

/**
 * Recomputes what has drifted away from the captured baseline.
 *
 * Called from *every* setter that can touch a lockable quantity, not just from
 * the statue one. A comparison invalidated by a road friction slider nudged
 * after the baseline was captured is exactly the failure this exists to catch,
 * and it would be invisible if drift were only checked when the family changed.
 */
function driftFrom(
  state: { baselineScenario: ComparisonScenario | null; comparisonConfig: MatchedComparisonConfig },
  roadParams: RoadParams,
  ropeParams: RopeParams
): { id: string; label: string; detail: string }[] {
  if (!state.baselineScenario) return [];
  return environmentDifferences(
    state.baselineScenario.environment,
    currentEnvironment({ roadParams, ropeParams }),
    state.comparisonConfig
  );
}

export const useSimStore = create<SimStore>((set, get) => ({
  statueParams: { ...DEFAULT_STATUE_PARAMS },
  roadParams: { ...DEFAULT_ROAD_PARAMS },
  ropeParams: cloneRopeParams(DEFAULT_ROPE_PARAMS),
  ropeGeometryCustomized: false,
  showColliders: false,
  showComMarker: true,
  showBallast: true,
  readout: null,

  comparisonConfig: buildConfig("rawGeometry", captureTargets(DEFAULT_STATUE_PARAMS)),
  comparisonPresetId: "rawGeometry",
  comparisonGroupId: newComparisonGroupId(),
  baselineScenario: null,
  candidateScenario: null,
  environmentDrift: [],

  setStatueParams: (patch) =>
    set((s) => {
      const statueParams = { ...s.statueParams, ...patch };
      // Rope attachments normally follow the statue's geometry. Under a matched
      // comparison that auto-tracking is exactly the wrong behaviour: switching
      // family would silently move the tie-points and hand the candidate a
      // different haul geometry than the baseline, which is one of the ways a
      // shape can look better for reasons that have nothing to do with its shape.
      const attachmentsLocked = s.comparisonConfig.enabled && s.comparisonConfig.lockRopeAttachments;
      const ropeParams =
        s.ropeGeometryCustomized || attachmentsLocked
          ? s.ropeParams
          : resnap(statueParams, s.ropeParams);
      return {
        statueParams,
        ropeParams,
        environmentDrift: driftFrom(s, s.roadParams, ropeParams)
      };
    }),
  resetStatueParams: () =>
    set((s) => ({
      statueParams: { ...DEFAULT_STATUE_PARAMS },
      ropeParams: s.ropeGeometryCustomized ? s.ropeParams : resnap(DEFAULT_STATUE_PARAMS, s.ropeParams)
    })),

  setRoadParams: (patch) =>
    set((s) => {
      const roadParams = { ...s.roadParams, ...patch };
      return { roadParams, environmentDrift: driftFrom(s, roadParams, s.ropeParams) };
    }),
  resetRoadParams: () =>
    set((s) => {
      const roadParams = { ...DEFAULT_ROAD_PARAMS };
      return { roadParams, environmentDrift: driftFrom(s, roadParams, s.ropeParams) };
    }),

  setRopeTensionN: (n) =>
    set((s) => {
      const ropeParams = { ...s.ropeParams, tensionN: n };
      return { ropeParams, environmentDrift: driftFrom(s, s.roadParams, ropeParams) };
    }),
  setRopeExternalAnchor: (side, axis, value) =>
    set((s) => {
      const ropeParams = editRope(s.ropeParams, side, "externalAnchor", axis, value);
      return { ropeParams, ropeGeometryCustomized: true, environmentDrift: driftFrom(s, s.roadParams, ropeParams) };
    }),
  setRopeAttachment: (side, axis, value) =>
    set((s) => {
      const ropeParams = editRope(s.ropeParams, side, "attachmentLocal", axis, value);
      return { ropeParams, ropeGeometryCustomized: true, environmentDrift: driftFrom(s, s.roadParams, ropeParams) };
    }),
  resnapRopeAttachments: () =>
    set((s) => {
      const ropeParams = resnap(s.statueParams, s.ropeParams);
      return { ropeParams, ropeGeometryCustomized: false, environmentDrift: driftFrom(s, s.roadParams, ropeParams) };
    }),
  resetRopeParams: () =>
    set((s) => {
      const ropeParams = defaultRopeParams(computeStatueGeometry(s.statueParams), s.ropeParams.tensionN);
      return { ropeParams, ropeGeometryCustomized: false, environmentDrift: driftFrom(s, s.roadParams, ropeParams) };
    }),

  setShowColliders: (v) => set({ showColliders: v }),
  setShowComMarker: (v) => set({ showComMarker: v }),
  setShowBallast: (v) => set({ showBallast: v }),
  setReadout: (readout) => set({ readout }),

  setComparisonPreset: (id) =>
    set((s) => {
      // Targets come from the captured baseline when there is one, and from the
      // statue on screen otherwise. A preset says what is held equal; the
      // baseline says equal to what, and it is always an explicit choice.
      const source = s.baselineScenario?.rawStatueParams ?? s.statueParams;
      const comparisonConfig = buildConfig(id, captureTargets(source));
      return {
        comparisonPresetId: id,
        comparisonConfig,
        environmentDrift: driftFrom({ ...s, comparisonConfig }, s.roadParams, s.ropeParams)
      };
    }),

  setComparisonLock: (patch) =>
    set((s) => {
      const comparisonConfig = { ...s.comparisonConfig, ...patch };
      return {
        comparisonConfig,
        environmentDrift: driftFrom({ ...s, comparisonConfig }, s.roadParams, s.ropeParams)
      };
    }),

  captureBaseline: () =>
    set((s) => {
      const environment = currentEnvironment(s);
      const groupId = newComparisonGroupId();
      return {
        comparisonGroupId: groupId,
        baselineScenario: captureScenario({
          role: "baseline",
          label: `${s.statueParams.baseFamily} baseline`,
          rawStatueParams: s.statueParams,
          environment,
          comparisonGroupId: groupId
        }),
        candidateScenario: null,
        environmentDrift: [],
        comparisonConfig: buildConfig(s.comparisonPresetId, captureTargets(s.statueParams))
      };
    }),

  captureCandidate: () =>
    set((s) => ({
      candidateScenario: captureScenario({
        role: "candidate",
        label: `${s.statueParams.baseFamily} candidate`,
        rawStatueParams: s.statueParams,
        environment: currentEnvironment(s),
        comparisonGroupId: s.comparisonGroupId
      })
    })),

  loadScenario: (role) =>
    set((s) => {
      const scenario = role === "baseline" ? s.baselineScenario : s.candidateScenario;
      if (!scenario) return {};
      // Switching between saved scenarios restores the statue and its
      // environment but leaves the shared comparison configuration alone —
      // that is the whole point of the two being separable.
      return {
        statueParams: { ...scenario.rawStatueParams },
        roadParams: { ...scenario.environment.roadParams },
        ropeParams: cloneRopeParams(scenario.environment.ropeParams),
        environmentDrift: driftFrom(s, scenario.environment.roadParams, scenario.environment.ropeParams)
      };
    }),

  clearComparison: () =>
    set(() => ({
      baselineScenario: null,
      candidateScenario: null,
      environmentDrift: [],
      comparisonGroupId: newComparisonGroupId()
    })),

  exportComparison: () => {
    const s = get();
    const resolution = s.baselineScenario
      ? resolveMatchedComparison({
          rawParams: s.statueParams,
          config: s.comparisonConfig,
          presetId: s.comparisonPresetId,
          comparisonGroupId: s.comparisonGroupId
        })
      : null;
    return {
      comparisonGroupId: s.comparisonGroupId,
      presetId: s.comparisonPresetId,
      config: s.comparisonConfig,
      baseline: s.baselineScenario,
      candidate: s.candidateScenario,
      candidateResolution: resolution
        ? {
            status: resolution.status,
            reports: resolution.reports,
            problems: resolution.problems,
            abstract: resolution.abstract
          }
        : null,
      exportedAtIso: new Date().toISOString()
    };
  }
}));

/**
 * The statue actually built, after any matched-comparison normalization, plus
 * the full account of what was and was not achieved.
 *
 * A derived selector rather than stored state, because the resolution is a pure
 * function of the raw parameters and the shared constraints and duplicating it
 * into state would give it a chance to go stale.
 *
 * Memoised on the identity of those inputs, which is not an optimisation but a
 * correctness requirement: a Zustand selector that returns a fresh object every
 * call never compares equal to itself, and React re-renders until it gives up.
 * The store replaces these objects wholesale when they change, so reference
 * equality is exactly the right key.
 */
let resolutionCache: {
  params: StatueParams;
  config: MatchedComparisonConfig;
  presetId: string;
  groupId: string;
  resolution: MatchedResolution;
} | null = null;

export function selectResolution(state: SimStore): MatchedResolution {
  if (
    resolutionCache &&
    resolutionCache.params === state.statueParams &&
    resolutionCache.config === state.comparisonConfig &&
    resolutionCache.presetId === state.comparisonPresetId &&
    resolutionCache.groupId === state.comparisonGroupId
  ) {
    return resolutionCache.resolution;
  }
  const resolution = resolveMatchedComparison({
    rawParams: state.statueParams,
    config: state.comparisonConfig,
    presetId: state.comparisonPresetId,
    comparisonGroupId: state.comparisonGroupId
  });
  resolutionCache = {
    params: state.statueParams,
    config: state.comparisonConfig,
    presetId: state.comparisonPresetId,
    groupId: state.comparisonGroupId,
    resolution
  };
  return resolution;
}
