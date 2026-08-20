import { rotateByQuat, type Quat, type Vec3 } from "../core/vec3";
import { getBaseModule } from "./bases/registry";
import type { BaseDims } from "./bases/types";
import { HEAD_HEIGHT_RATIO } from "./constants";
import type { StatueParams } from "./types";

/** Rope attachment height as a fraction of torso height, measured from the
 * top of the base. High on the body so the pull has a real tipping moment
 * arm about the base edge. Used only as the *default* attachment; the
 * actual attachment points are user-configurable (see control/ropeModel.ts). */
export const DEFAULT_ATTACHMENT_HEIGHT_FRACTION_OF_TORSO = 0.75;
/** Lateral standoff of the default attachment beyond the torso surface, as
 * a fraction of H, so the rope does not visually intersect the torso. */
export const DEFAULT_ATTACHMENT_LATERAL_MARGIN_RATIO = 0.05;

/**
 * Head width and depth as fractions of the shoulder width / body depth.
 *
 * Visual proportions only: the head *collider* is a sphere of radius
 * H_head/2 (see `statue/body.ts`), unchanged from the validated Phase 1
 * configuration. These are kept close to that sphere's diameter deliberately —
 * a head drawn much wider than the primitive standing in for it makes the
 * collider overlay misleading, which is the opposite of what the overlay is for.
 */
export const HEAD_WIDTH_FRACTION_OF_SHOULDER = 0.58;
export const HEAD_DEPTH_FRACTION_OF_BODY = 0.72;

export interface TorsoGeometry {
  /** Collider cross-section: the torso's mean width, y (meters). */
  widthY: number;
  /** Collider cross-section: the torso's mean depth, x (meters). */
  depthX: number;
  /** Shoulder width at the top of the torso, y. Visual only. */
  widthTopY: number;
  /** Width at the bottom of the torso, y. Visual only. */
  widthBottomY: number;
  /** Body depth at the top of the torso, x. Visual only. */
  depthTopX: number;
  /** Depth at the bottom of the torso, x. Visual only. */
  depthBottomX: number;
  heightZ: number;
  /** Unleaned local z where the torso starts (== base.topZ). */
  bottomZ: number;
  /** Unleaned local z where the torso ends. */
  topZ: number;
  /** Unleaned local z of the torso's centroid. */
  centerZ: number;
  massKg: number;
}

export interface HeadGeometry {
  /** Collider radius (sphere), meters. */
  radius: number;
  /** Unleaned local z of the head centre. */
  centerZ: number;
  /** Visual box extents. */
  widthY: number;
  depthX: number;
  heightZ: number;
  massKg: number;
}

/**
 * A rigid placement in body-local space: where a component's centre sits and
 * how it is oriented, after the intrinsic forward lean has been applied.
 * Colliders and visual meshes both consume these, so they cannot disagree.
 */
export interface Placement {
  position: Vec3;
  rotation: Quat;
}

/**
 * Every scalar the physics, threshold and diagnostic code needs about a
 * statue, computed with no Three.js and no Rapier. Keeping this pure is what
 * lets the static-equilibrium benchmark and the regression tests run
 * headlessly in Node, and lets the analytic COM be cross-checked against the
 * one Rapier computes from collider densities.
 */
export interface StatueGeometry {
  heightM: number;
  totalMassKg: number;
  base: BaseDims;
  torso: TorsoGeometry;
  head: HeadGeometry;
  /**
   * Total intrinsic lean applied to the upper body, radians about +y: the
   * statue's own `forwardLeanDeg` plus whatever tilt the base's mounting plane
   * imparts. Distinct from dynamic pitch, which is simulated rather than built.
   */
  forwardLeanRad: number;
  /** The `forwardLeanDeg` half of the intrinsic lean, radians. */
  bodyLeanRad: number;
  /** The base-mounting-plane half of the intrinsic lean, radians. Non-zero
   * only for a family whose top face is cut at an angle (B6). */
  baseMountLeanRad: number;
  /** Point the upper body leans about: the top-centre of the base. */
  leanPivot: Vec3;
  /** Post-lean placement of the torso collider/mesh, body-local. */
  torsoPlacement: Placement;
  /** Post-lean placement of the head collider/mesh, body-local. */
  headPlacement: Placement;
  /**
   * Analytic COM of the *collider* configuration in body-local coordinates,
   * derived from the three lumped primitives with lean applied. Cross-checked
   * against Rapier's own `localCom()` in the unit tests, so a density, volume
   * or lean-transform error cannot pass silently.
   */
  comLocalAnalytic: Vec3;
  /** Convenience: `comLocalAnalytic.z`. */
  comHeightAnalyticM: number;
  /** Explicit COM to force, body-local, or null when not overriding. */
  comOverrideLocal: Vec3 | null;
  /** Default rope attachment points in body-local coordinates, post-lean. */
  defaultAttachment: { left: Vec3; right: Vec3 };
}

/** Quaternion for a rotation of `rad` about the +y axis. Positive leans the
 * upper body forward (+x), since a point at height h maps to x = h·sin(rad). */
export function leanQuaternion(rad: number): Quat {
  return { x: 0, y: Math.sin(rad / 2), z: 0, w: Math.cos(rad / 2) };
}

/** Applies the lean rotation to a point given in unleaned body-local space. */
function applyLean(point: Vec3, pivot: Vec3, rotation: Quat): Vec3 {
  const rel = { x: point.x - pivot.x, y: point.y - pivot.y, z: point.z - pivot.z };
  const rotated = rotateByQuat(rel, rotation);
  return { x: rotated.x + pivot.x, y: rotated.y + pivot.y, z: rotated.z + pivot.z };
}

export function computeStatueGeometry(params: StatueParams): StatueGeometry {
  const H = params.heightM;
  const M = params.totalMassKg;

  if (params.torsoTaper < 0 || params.torsoTaper >= 1) {
    throw new Error(
      `torsoTaper must be in [0, 1); got ${params.torsoTaper}. At 1 the torso ` +
        "would come to a point and its collider cross-section would vanish."
    );
  }

  const base = getBaseModule(params.baseFamily).dims(params);

  const headMassKg = params.headMassFraction * M;
  const torsoMassKg = M - base.massKg - headMassKg;
  if (torsoMassKg <= 0) {
    throw new Error(
      `baseMassFraction (${params.baseMassFraction}) + headMassFraction (${params.headMassFraction}) ` +
        "must sum to less than 1 so the torso has positive mass."
    );
  }

  const headHeight = HEAD_HEIGHT_RATIO * H;
  const headRadius = headHeight / 2;
  const torsoBottomZ = base.topZ;
  const torsoTopZ = H - headHeight;
  const torsoHeight = torsoTopZ - torsoBottomZ;
  if (torsoHeight <= 0) {
    throw new Error(
      `Base height (${torsoBottomZ.toFixed(2)} m) plus head height (${headHeight.toFixed(2)} m) ` +
        `exceed the total statue height H (${H.toFixed(2)} m). Reduce baseHeightRatio/baseWidthRatio ` +
        "or increase heightM."
    );
  }

  // Taper narrows the torso from the shoulders (top) downward. The collider is
  // a single uniform cuboid at the *mean* cross-section — a documented
  // approximation of a frustum (see PHASE2_GEOMETRY_AND_CONTROL.md). At taper 0
  // the mean equals the top equals the bottom, so the collider is exactly the
  // Phase 1 box.
  const widthTopY = params.torsoWidthRatio * H;
  const depthTopX = params.torsoDepthRatio * H;
  const widthBottomY = widthTopY * (1 - params.torsoTaper);
  const depthBottomX = depthTopX * (1 - params.torsoTaper);
  const torsoWidthY = (widthTopY + widthBottomY) / 2;
  const torsoDepthX = (depthTopX + depthBottomX) / 2;

  const torsoCenterZ = torsoBottomZ + torsoHeight / 2;
  const headCenterZ = torsoTopZ + headRadius;

  const torso: TorsoGeometry = {
    widthY: torsoWidthY,
    depthX: torsoDepthX,
    widthTopY,
    widthBottomY,
    depthTopX,
    depthBottomX,
    heightZ: torsoHeight,
    bottomZ: torsoBottomZ,
    topZ: torsoTopZ,
    centerZ: torsoCenterZ,
    massKg: torsoMassKg
  };

  const head: HeadGeometry = {
    radius: headRadius,
    centerZ: headCenterZ,
    widthY: widthTopY * HEAD_WIDTH_FRACTION_OF_SHOULDER,
    depthX: depthTopX * HEAD_DEPTH_FRACTION_OF_BODY,
    heightZ: headHeight,
    massKg: headMassKg
  };

  // ---- Intrinsic lean, applied to the upper body only. The base keeps its
  // ground contact geometry: leaning the whole body would be indistinguishable
  // from dynamic pitch and would change which part of the base touches down.
  // Two independent sources of intrinsic lean, added: the statue's own lean
  // parameter, and the tilt of the base's mounting plane for a family whose top
  // face is cut at an angle. They are reported separately as well as summed,
  // because they are different modelling claims — one leans the figure on a
  // level plinth, the other cuts the plinth.
  const bodyLeanRad = (params.forwardLeanDeg * Math.PI) / 180;
  const baseMountLeanRad = base.mountLeanRad;
  const forwardLeanRad = bodyLeanRad + baseMountLeanRad;
  const leanPivot: Vec3 = { x: 0, y: 0, z: base.topZ };
  const leanRotation = leanQuaternion(forwardLeanRad);

  const torsoPlacement: Placement = {
    position: applyLean({ x: 0, y: 0, z: torsoCenterZ }, leanPivot, leanRotation),
    rotation: leanRotation
  };
  const headPlacement: Placement = {
    position: applyLean({ x: 0, y: 0, z: headCenterZ }, leanPivot, leanRotation),
    rotation: leanRotation
  };

  // ---- Analytic COM of the collider configuration, cross-checked against
  // Rapier's own in the unit tests. The base contributes its family's reported
  // centroid rather than an assumed half-height: that assumption is exact for
  // A0's prism and A4's lying cylinder, and wrong for every curved or
  // wedge-topped family added since.
  const comLocalAnalytic: Vec3 = {
    x:
      (base.massKg * base.comLocal.x +
        torso.massKg * torsoPlacement.position.x +
        head.massKg * headPlacement.position.x) /
      M,
    y:
      (base.massKg * base.comLocal.y +
        torso.massKg * torsoPlacement.position.y +
        head.massKg * headPlacement.position.y) /
      M,
    z:
      (base.massKg * base.comLocal.z +
        torso.massKg * torsoPlacement.position.z +
        head.massKg * headPlacement.position.z) /
      M
  };

  const comOverrideLocal: Vec3 | null = params.comOverrideEnabled
    ? {
        x: params.comOffsetXRatio * H,
        y: params.comOffsetYRatio * H,
        z: params.comHeightRatio * H
      }
    : null;

  // Attachments ride on the leaned upper body, so a forward lean carries the
  // rope tie-points forward with the shoulders rather than leaving them behind
  // in the unleaned frame.
  const attachUnleanedZ = torsoBottomZ + torsoHeight * DEFAULT_ATTACHMENT_HEIGHT_FRACTION_OF_TORSO;
  const attachHalfWidth = widthTopY / 2 + DEFAULT_ATTACHMENT_LATERAL_MARGIN_RATIO * H;
  const attachLeft = applyLean({ x: 0, y: attachHalfWidth, z: attachUnleanedZ }, leanPivot, leanRotation);
  const attachRight = applyLean({ x: 0, y: -attachHalfWidth, z: attachUnleanedZ }, leanPivot, leanRotation);

  return {
    heightM: H,
    totalMassKg: M,
    base,
    torso,
    head,
    forwardLeanRad,
    bodyLeanRad,
    baseMountLeanRad,
    leanPivot,
    torsoPlacement,
    headPlacement,
    comLocalAnalytic,
    comHeightAnalyticM: comLocalAnalytic.z,
    comOverrideLocal,
    defaultAttachment: { left: attachLeft, right: attachRight }
  };
}
