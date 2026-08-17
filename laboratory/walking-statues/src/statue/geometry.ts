import type { Vec3 } from "../core/vec3";
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
  torso: {
    widthY: number;
    depthX: number;
    heightZ: number;
    bottomZ: number;
    topZ: number;
    centerZ: number;
    massKg: number;
  };
  head: { radius: number; centerZ: number; massKg: number };
  /** Analytic COM height from the three lumped primitives, m. Cross-checked
   * against Rapier's own `worldCom()` in the unit tests. */
  comHeightAnalyticM: number;
  /** Default rope attachment points in body-local coordinates. */
  defaultAttachment: { left: Vec3; right: Vec3 };
}

export function computeStatueGeometry(params: StatueParams): StatueGeometry {
  const H = params.heightM;
  const M = params.totalMassKg;

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
  const torsoWidth = params.torsoWidthRatio * H;
  const torsoDepth = params.torsoDepthRatio * H;
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
  const torsoCenterZ = torsoBottomZ + torsoHeight / 2;
  const headCenterZ = torsoTopZ + headRadius;

  // Base COM: a uniform flat prism sits at half its height; a uniform
  // cylinder lying on its side sits at its radius, which is also topZ/2.
  const baseComZ = base.topZ / 2;
  const comHeightAnalyticM =
    (base.massKg * baseComZ + torsoMassKg * torsoCenterZ + headMassKg * headCenterZ) / M;

  const attachZ = torsoBottomZ + torsoHeight * DEFAULT_ATTACHMENT_HEIGHT_FRACTION_OF_TORSO;
  const attachY = torsoWidth / 2 + DEFAULT_ATTACHMENT_LATERAL_MARGIN_RATIO * H;

  return {
    heightM: H,
    totalMassKg: M,
    base,
    torso: {
      widthY: torsoWidth,
      depthX: torsoDepth,
      heightZ: torsoHeight,
      bottomZ: torsoBottomZ,
      topZ: torsoTopZ,
      centerZ: torsoCenterZ,
      massKg: torsoMassKg
    },
    head: { radius: headRadius, centerZ: headCenterZ, massKg: headMassKg },
    comHeightAnalyticM,
    defaultAttachment: {
      left: { x: 0, y: attachY, z: attachZ },
      right: { x: 0, y: -attachY, z: attachZ }
    }
  };
}
