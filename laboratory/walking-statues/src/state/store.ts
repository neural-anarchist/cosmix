import { create } from "zustand";
import { defaultRopeParams } from "../control/ropeDefaults";
import type { RopeGeometry, RopeParams, RopeSide } from "../control/ropeModel";
import { DEFAULT_STATUE_PARAMS } from "../statue/defaults";
import { computeStatueGeometry } from "../statue/geometry";
import type { StatueParams } from "../statue/types";
import type { RoadParams } from "../road/types";
import type { EngineSnapshot } from "../core/SimulationEngine";

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
  setReadout: (s: EngineSnapshot) => void;
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

export const useSimStore = create<SimStore>((set) => ({
  statueParams: { ...DEFAULT_STATUE_PARAMS },
  roadParams: { ...DEFAULT_ROAD_PARAMS },
  ropeParams: cloneRopeParams(DEFAULT_ROPE_PARAMS),
  ropeGeometryCustomized: false,
  showColliders: false,
  showComMarker: true,
  readout: null,

  setStatueParams: (patch) =>
    set((s) => {
      const statueParams = { ...s.statueParams, ...patch };
      return {
        statueParams,
        ropeParams: s.ropeGeometryCustomized ? s.ropeParams : resnap(statueParams, s.ropeParams)
      };
    }),
  resetStatueParams: () =>
    set((s) => ({
      statueParams: { ...DEFAULT_STATUE_PARAMS },
      ropeParams: s.ropeGeometryCustomized ? s.ropeParams : resnap(DEFAULT_STATUE_PARAMS, s.ropeParams)
    })),

  setRoadParams: (patch) => set((s) => ({ roadParams: { ...s.roadParams, ...patch } })),
  resetRoadParams: () => set({ roadParams: { ...DEFAULT_ROAD_PARAMS } }),

  setRopeTensionN: (n) => set((s) => ({ ropeParams: { ...s.ropeParams, tensionN: n } })),
  setRopeExternalAnchor: (side, axis, value) =>
    set((s) => ({
      ropeParams: editRope(s.ropeParams, side, "externalAnchor", axis, value),
      ropeGeometryCustomized: true
    })),
  setRopeAttachment: (side, axis, value) =>
    set((s) => ({
      ropeParams: editRope(s.ropeParams, side, "attachmentLocal", axis, value),
      ropeGeometryCustomized: true
    })),
  resnapRopeAttachments: () =>
    set((s) => ({ ropeParams: resnap(s.statueParams, s.ropeParams), ropeGeometryCustomized: false })),
  resetRopeParams: () =>
    set((s) => ({
      ropeParams: defaultRopeParams(computeStatueGeometry(s.statueParams), s.ropeParams.tensionN),
      ropeGeometryCustomized: false
    })),

  setShowColliders: (v) => set({ showColliders: v }),
  setShowComMarker: (v) => set({ showComMarker: v }),
  setReadout: (readout) => set({ readout })
}));
