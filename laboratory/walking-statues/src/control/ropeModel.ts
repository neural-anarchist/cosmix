import { cross, length, localToWorld, normalize, scale, sub, type Quat, type Vec3 } from "../core/vec3";

export type RopeSide = "left" | "right";

/**
 * One rope, defined by two points: where the haulers stand (fixed in the
 * world) and where the rope is tied to the statue (fixed in the body).
 * Everything else — direction, force, torque, and the line drawn on screen —
 * is derived from these two points, so the picture and the physics cannot
 * disagree.
 *
 * This replaces the Phase 1 model, which applied a hardcoded world-space
 * `(0, ±F, 0)` force and separately fabricated an unrelated rope line for
 * display (see PHASE1_FORCE_CONTACT_AUDIT.md §7).
 */
export interface RopeGeometry {
  /** Where the haulers stand: WORLD coordinates, meters (x fwd, y lat, z up). */
  externalAnchor: Vec3;
  /** Where the rope is tied on: BODY-LOCAL coordinates, meters. */
  attachmentLocal: Vec3;
}

export interface RopeParams {
  left: RopeGeometry;
  right: RopeGeometry;
  /** Rope tension magnitude while that rope is being hauled, newtons. */
  tensionN: number;
}

export interface RopeSolution {
  side: RopeSide;
  /** True when this rope is being hauled this step. */
  active: boolean;
  /** Tension actually applied (0 when inactive). */
  tensionN: number;
  externalAnchor: Vec3;
  /** Attachment in world coordinates, tracking the body as it rolls. */
  attachmentWorld: Vec3;
  /** Unit vector from the attachment toward the haulers — the direction a
   * taut rope can pull, and nothing else. */
  direction: Vec3;
  /** Force applied to the body at `attachmentWorld`, newtons. */
  force: Vec3;
  /** Torque this force exerts about the body's center of mass, N·m. */
  torqueAboutCom: Vec3;
  /** Straight-line distance from attachment to haulers, meters. */
  ropeLengthM: number;
}

/**
 * Solves one rope's force and torque from its geometry.
 *
 * The force is `T · d̂` with `d̂` pointing from the attachment *toward* the
 * external anchor, which makes the model tension-only by construction: there
 * is no way to express a rope that pushes. Slack-rope handling (a rope that
 * has gone limp because the statue moved toward the haulers) is a protocol
 * concern and lands with P1/P3 in Phase 2; a rope here is either hauled at
 * full tension or fully released.
 */
export function solveRope(
  side: RopeSide,
  geometry: RopeGeometry,
  tensionN: number,
  active: boolean,
  bodyTranslation: Vec3,
  bodyRotation: Quat,
  comWorld: Vec3
): RopeSolution {
  const attachmentWorld = localToWorld(geometry.attachmentLocal, bodyTranslation, bodyRotation);
  const toAnchor = sub(geometry.externalAnchor, attachmentWorld);
  const direction = normalize(toAnchor);
  const appliedTension = active ? tensionN : 0;
  const force = scale(direction, appliedTension);
  // tau = (r_anchor - r_COM) x F
  const torqueAboutCom = cross(sub(attachmentWorld, comWorld), force);

  return {
    side,
    active,
    tensionN: appliedTension,
    externalAnchor: geometry.externalAnchor,
    attachmentWorld,
    direction,
    force,
    torqueAboutCom,
    ropeLengthM: length(toAnchor)
  };
}

export interface RopeHoldState {
  leftHeld: boolean;
  rightHeld: boolean;
}

/** Solves both ropes. Pure — applies nothing to the body itself, so the
 * benchmark harness and the unit tests can inspect forces without stepping. */
export function solveRopes(
  params: RopeParams,
  held: RopeHoldState,
  bodyTranslation: Vec3,
  bodyRotation: Quat,
  comWorld: Vec3
): { left: RopeSolution; right: RopeSolution } {
  return {
    left: solveRope("left", params.left, params.tensionN, held.leftHeld, bodyTranslation, bodyRotation, comWorld),
    right: solveRope("right", params.right, params.tensionN, held.rightHeld, bodyTranslation, bodyRotation, comWorld)
  };
}

/**
 * Mirrors a rope geometry across the road's fore-aft centerline (y -> -y).
 * Used by the mirror-symmetry test so the "same" pull can be applied from
 * the other side without hand-transcribing six coordinates.
 */
export function mirrorRopeGeometry(geometry: RopeGeometry): RopeGeometry {
  return {
    externalAnchor: { ...geometry.externalAnchor, y: -geometry.externalAnchor.y },
    attachmentLocal: { ...geometry.attachmentLocal, y: -geometry.attachmentLocal.y }
  };
}
