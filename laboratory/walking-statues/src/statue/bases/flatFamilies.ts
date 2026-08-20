import {
  applyLateralAsymmetry,
  dShapeFootprint,
  ellipseFootprint,
  roundedRectangleFootprint,
  stadiumFootprint,
  teardropFootprint
} from "./footprints";
import { convexHull2D } from "./footprints";
import { extrudeFootprint, mirrorPolytopeForeAft, type Vec2 } from "./polytope";
import { definePolytopeFamily, FOOTPRINT_SEGMENTS, type BaseShape } from "./polytopeFamily";
import type { ResolvedBaseParams } from "./shared";
import type { BaseGeometryModule } from "./types";

/**
 * The flat-bottomed base families: A1, A2, A3, B0, B2, B3, B4 and B6.
 *
 * All of them are the same solid in different plan view — a prism on a flat
 * ground-contact face — so they share one construction: a convex footprint,
 * extruded to the base height. What distinguishes them is the outline, which is
 * exactly the variable Phase 2 exists to test. Keeping the vertical
 * construction identical across the whole set is what lets a later comparison
 * attribute a difference to plan shape rather than to eight subtly different
 * modelling decisions.
 *
 * Every one of them keeps a flat bottom, so the classical static tipping
 * threshold `F_tip = M g b / z_anchor` applies with `b` read off the footprint.
 */

const FLAT_PRISM_APPROXIMATION =
  "Flat-bottomed prism collided as the convex hull of the drawn mesh's own vertices — " +
  "the simulated solid and the displayed solid are the same triangles, so the only " +
  "approximation is the facet count of the curved outline.";

/** Shared vertical construction: flat bottom on the ground, flat top at H_base. */
function prism(footprint: Vec2[], resolved: ResolvedBaseParams): BaseShape {
  const topZAt = () => resolved.heightZ;
  return {
    polytope: extrudeFootprint(footprint, topZAt),
    topZAt,
    contactKind: "flat",
    footprint,
    mountLeanRad: 0
  };
}

const PLAN_PARAMS = [
  "baseWidthRatio",
  "baseLengthRatio",
  "baseHeightRatio",
  "baseLeftRightAsymmetry",
  "baseMassFraction"
] as const;

export const a1RoundedRect: BaseGeometryModule = definePolytopeFamily({
  id: "A1",
  label: "A1 — Rounded rectangular prism",
  summary: "A0 with its plan corners rounded, so the footprint loses its sharp corners without losing width.",
  usesParameters: [...PLAN_PARAMS, "baseEdgeRoundingRatio"],
  colliderApproximation: () =>
    `${FLAT_PRISM_APPROXIMATION} Corner rounding is in plan only; the bottom edge stays sharp.`,
  build(_params, resolved) {
    const footprint = applyLateralAsymmetry(
      roundedRectangleFootprint(resolved.lengthX, resolved.widthY, resolved.edgeRounding, 8),
      resolved.leftRightAsymmetry
    );
    return prism(footprint, resolved);
  }
});

export const a2Elliptical: BaseGeometryModule = definePolytopeFamily({
  id: "A2",
  label: "A2 — Elliptical prism",
  summary: "Oval footprint, symmetric fore-aft and left-right. The smooth-plan counterpart to A0.",
  usesParameters: PLAN_PARAMS,
  colliderApproximation: () =>
    `${FLAT_PRISM_APPROXIMATION} The ellipse is a ${FOOTPRINT_SEGMENTS}-gon.`,
  build(_params, resolved) {
    const footprint = applyLateralAsymmetry(
      ellipseFootprint(resolved.lengthX, resolved.widthY, FOOTPRINT_SEGMENTS),
      resolved.leftRightAsymmetry
    );
    return prism(footprint, resolved);
  }
});

export const a3Stadium: BaseGeometryModule = definePolytopeFamily({
  id: "A3",
  label: "A3 — Capsule / stadium prism",
  summary: "Straight sides with semicircular fore and aft caps. Full width is held over the central span.",
  usesParameters: PLAN_PARAMS,
  colliderApproximation: () =>
    `${FLAT_PRISM_APPROXIMATION} Each end cap is a ${FOOTPRINT_SEGMENTS / 2}-segment semicircle.`,
  build(_params, resolved) {
    const footprint = applyLateralAsymmetry(
      stadiumFootprint(resolved.lengthX, resolved.widthY, FOOTPRINT_SEGMENTS),
      resolved.leftRightAsymmetry
    );
    return prism(footprint, resolved);
  }
});

export const b0DBase: BaseGeometryModule = definePolytopeFamily({
  id: "B0",
  label: "B0 — D-base (flat rear, rounded front)",
  summary: "The first deliberately fore-aft asymmetric family: a rounded nose ahead of a flat transom.",
  usesParameters: [...PLAN_PARAMS, "baseFrontBackAsymmetry"],
  colliderApproximation: () =>
    `${FLAT_PRISM_APPROXIMATION} The nose is a ${FOOTPRINT_SEGMENTS}-segment quarter-ellipse per side; ` +
    "the rear transom is exactly flat.",
  build(_params, resolved) {
    const footprint = applyLateralAsymmetry(
      dShapeFootprint(
        resolved.lengthX,
        resolved.widthY,
        resolved.frontBackAsymmetry,
        FOOTPRINT_SEGMENTS
      ),
      resolved.leftRightAsymmetry
    );
    return prism(footprint, resolved);
  }
});

/**
 * B2 and B3 are one shape and its fore-aft reflection.
 *
 * B3 is not a second hand-written outline that resembles a mirrored B2 — it is
 * literally B2's polytope with x negated and its triangle winding reversed. A
 * mirror control is only worth running if the two shapes differ by *exactly*
 * the reflection and by nothing else, and the only way to be sure of that is to
 * generate one from the other rather than to write both and hope.
 */
function teardropShape(resolved: ResolvedBaseParams): BaseShape {
  const footprint = applyLateralAsymmetry(
    teardropFootprint(
      resolved.lengthX,
      resolved.widthY,
      resolved.foreAftRadius,
      resolved.frontBackAsymmetry,
      FOOTPRINT_SEGMENTS
    ),
    resolved.leftRightAsymmetry
  );
  return prism(footprint, resolved);
}

const TEARDROP_PARAMS = [...PLAN_PARAMS, "baseForeAftRadiusRatio", "baseFrontBackAsymmetry"] as const;

export const b2ForwardTeardrop: BaseGeometryModule = definePolytopeFamily({
  id: "B2",
  label: "B2 — Forward teardrop (broad front, narrow tail)",
  summary: "Widest at the front, tapering to a narrow rear tip. R_fore/H sets the tail radius.",
  usesParameters: TEARDROP_PARAMS,
  colliderApproximation: () =>
    `${FLAT_PRISM_APPROXIMATION} The outline is the hull of a front disc and a smaller rear disc, ` +
    `each sampled at ${FOOTPRINT_SEGMENTS} points.`,
  build: (_params, resolved) => teardropShape(resolved)
});

export const b3RearTeardrop: BaseGeometryModule = definePolytopeFamily({
  id: "B3",
  label: "B3 — Rear teardrop (fore-aft mirror control for B2)",
  summary: "B2 reflected through x = 0. Exists so a forward result can be tested against its own mirror.",
  usesParameters: TEARDROP_PARAMS,
  colliderApproximation: () =>
    `${FLAT_PRISM_APPROXIMATION} Generated as B2's exact fore-aft reflection, not as a separate outline.`,
  build(_params, resolved) {
    const forward = teardropShape(resolved);
    return {
      polytope: mirrorPolytopeForeAft(forward.polytope),
      topZAt: forward.topZAt,
      contactKind: "flat",
      // Re-hulled rather than just negated: reflecting a counter-clockwise
      // outline reverses its winding, which would hand back a negative signed
      // area and make B3 look like a rocker to the contact classifier.
      footprint: convexHull2D(forward.footprint!.map((p) => ({ x: -p.x, y: p.y }))),
      mountLeanRad: 0
    };
  }
});

export const b4OffsetDBase: BaseGeometryModule = definePolytopeFamily({
  id: "B4",
  label: "B4 — Offset D-base",
  summary: "B0 shifted fore or aft under the upper body, so the footprint is off-centre beneath the COM.",
  usesParameters: [...PLAN_PARAMS, "baseFrontBackAsymmetry", "baseOffsetXRatio"],
  colliderApproximation: () =>
    `${FLAT_PRISM_APPROXIMATION} Identical to B0's solid, translated along x by x_base.`,
  build(_params, resolved) {
    const footprint = applyLateralAsymmetry(
      dShapeFootprint(
        resolved.lengthX,
        resolved.widthY,
        resolved.frontBackAsymmetry,
        FOOTPRINT_SEGMENTS
      ),
      resolved.leftRightAsymmetry
    );
    // The x-offset itself is applied generically by `definePolytopeFamily`,
    // which is what keeps B4 provably "B0, translated".
    return prism(footprint, resolved);
  }
});

/**
 * B6 mounts the upper body on a plane cut at an angle, which is the mechanism
 * usually invoked for the real statues: the base is cut so the figure stands
 * leaning forward while its underside still sits flat on the ground.
 *
 * The tilt therefore belongs to the *base*, not to the body: ground contact is
 * completely unaffected, and the lean it produces is reported through the same
 * intrinsic-lean channel as the statue's own `forwardLeanDeg`. That separation
 * matters because a lean that changed the footprint would confound the two
 * things Phase 2 is trying to tell apart.
 */
export const b6MoaiDBase: BaseGeometryModule = definePolytopeFamily({
  id: "B6",
  label: "B6 — Moai D-base with angled mounting plane",
  summary: "A D-base whose top face is cut at theta_base, leaning the upper body without tilting the footprint.",
  usesParameters: [...PLAN_PARAMS, "baseFrontBackAsymmetry", "baseForwardLeanDeg"],
  colliderApproximation: () =>
    `${FLAT_PRISM_APPROXIMATION} The top face is a single flat plane cut at theta_base; the torso is ` +
    "mounted at that plane's centerline height, so it overlaps the wedge slightly toward the rear.",
  validate(_params, resolved) {
    const drop = Math.abs(Math.tan(resolved.mountLeanRad)) * (resolved.lengthX / 2);
    if (drop >= resolved.heightZ) {
      throw new Error(
        `B6: a base lean of ${(resolved.mountLeanRad * 180) / Math.PI}deg over a base length of ` +
          `${resolved.lengthX.toFixed(2)} m would cut the mounting plane through the ground ` +
          `(drop ${drop.toFixed(2)} m vs base height ${resolved.heightZ.toFixed(2)} m). ` +
          "Increase H_base/H, reduce L_base/H, or reduce theta_base."
      );
    }
  },
  build(_params, resolved) {
    const footprint = applyLateralAsymmetry(
      dShapeFootprint(
        resolved.lengthX,
        resolved.widthY,
        resolved.frontBackAsymmetry,
        FOOTPRINT_SEGMENTS
      ),
      resolved.leftRightAsymmetry
    );
    const slope = Math.tan(resolved.mountLeanRad);
    const topZAt = (p: Vec2) => resolved.heightZ - p.x * slope;
    return {
      // Lower at the front, higher at the rear: the mounting plane slopes
      // forward, so whatever is bolted to it leans forward.
      polytope: extrudeFootprint(footprint, topZAt),
      topZAt,
      contactKind: "flat",
      footprint,
      mountLeanRad: resolved.mountLeanRad,
      topZOverride: resolved.heightZ
    };
  }
});
