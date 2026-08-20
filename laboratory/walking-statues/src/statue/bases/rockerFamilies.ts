import { loftRocker, type RockerStation } from "./polytope";
import { definePolytopeFamily, ROCKER_ARC_SEGMENTS, ROCKER_STATIONS, type BaseShape } from "./polytopeFamily";
import type { BaseGeometryModule } from "./types";

/**
 * The curved-bottom families, A5 and B5.
 *
 * Both touch the ground along a line or a point rather than a face, so neither
 * has a finite static tipping lever arm and neither has a static tipping
 * threshold — the same reasoning that makes the static-equilibrium benchmark
 * report NOT APPLICABLE for A4 applies to them unchanged.
 *
 * Both are faceted. A4 stays an exact analytic cylinder precisely so that a
 * faceted rocker can be checked against a smooth one: if a result here depends
 * on facet count, that is a numerical artefact and A4 is the control that
 * exposes it.
 */

const ROCKER_APPROXIMATION =
  `Curved bottom collided as the convex hull of the drawn mesh's own vertices — ` +
  `${ROCKER_ARC_SEGMENTS} facets across the rolling arc and ${ROCKER_STATIONS} stations along x. ` +
  "Unlike A4's exact analytic cylinder, this rolls by stepping between facets; " +
  "A4 is the smooth control for that.";

function rocker(stations: RockerStation[]): BaseShape {
  return {
    polytope: loftRocker({ stations, arcSegments: ROCKER_ARC_SEGMENTS }),
    contactKind: "rocker",
    footprint: null,
    mountLeanRad: 0
  };
}

/**
 * A5: the lower half of an ellipsoid, closed with a flat lid at the equator.
 *
 * Curved in both directions, so unlike A4 it can pitch as well as roll. Its
 * lateral and fore-aft semi-axes come straight from W_base and L_base; the
 * height follows from the requested lateral curvature radius, since for an
 * ellipsoid `R_lat = b^2 / c` — you cannot choose width, lateral curvature and
 * height independently, and pretending otherwise would mean one of the three
 * controls silently losing. H_base/H is therefore not used by this family and
 * the resulting height is reported instead.
 */
export const a5EllipsoidalRocker: BaseGeometryModule = definePolytopeFamily({
  id: "A5",
  label: "A5 — Ellipsoidal / spherical rocker",
  summary: "Curved fore-aft as well as laterally. Height follows from W_base and R_lat; equal semi-axes give a sphere.",
  usesParameters: [
    "baseWidthRatio",
    "baseLengthRatio",
    "baseLateralRadiusRatio",
    "baseMassFraction"
  ],
  colliderApproximation: () => ROCKER_APPROXIMATION,
  validate(_params, resolved) {
    const semiY = resolved.widthY / 2;
    const height = (semiY * semiY) / resolved.lateralRadius;
    if (!(height > 1e-4)) {
      throw new Error(
        `A5: W_base/H = ${resolved.widthY.toFixed(3)} m with R_lat = ${resolved.lateralRadius.toFixed(3)} m ` +
          `gives a base only ${height.toFixed(4)} m tall. Reduce R_lat/H or increase W_base/H.`
      );
    }
  },
  build(_params, resolved) {
    const semiY = resolved.widthY / 2;
    const semiX = resolved.lengthX / 2;
    // R_lat = b^2 / c for an ellipsoid, so the height is fixed once the width
    // and the requested lateral curvature are.
    const height = (semiY * semiY) / resolved.lateralRadius;

    const stations: RockerStation[] = [];
    // Stations spaced by angle rather than by x, so the sharply curved tips get
    // as much resolution as the flat middle. The end stations collapse to a
    // single apex vertex, which is correct for an ellipsoid: the duplicate
    // points are harmless to the hull and contribute zero volume.
    for (let i = 0; i < ROCKER_STATIONS; i++) {
      const t = -Math.PI / 2 + (Math.PI * i) / (ROCKER_STATIONS - 1);
      const s = Math.cos(t);
      stations.push({
        x: semiX * Math.sin(t),
        semiY: semiY * s,
        semiZ: height * s,
        centerZ: height
      });
    }
    return rocker(stations);
  }
});

/**
 * B5: a lateral rocker whose fore-aft profile curves up by a different amount
 * ahead of and behind the contact point.
 *
 * The lateral cross-section is a constant circle of radius `W_base/2`, so
 * side-to-side rolling behaves as it does on A4 — the family isolates fore-aft
 * asymmetry rather than changing two things at once. The fore-aft profile is a
 * parabola matched to the requested curvature radius at the contact point,
 * `z = x^2 / 2R`, rather than a circular arc: a parabola is defined for every
 * base length, whereas a circular arc of radius R simply does not exist beyond
 * |x| > R, which would make short-radius asymmetry unbuildable for no physical
 * reason. Curvature at contact — the quantity that governs rocking — is
 * identical either way.
 */
export const b5AsymmetricRocker: BaseGeometryModule = definePolytopeFamily({
  id: "B5",
  label: "B5 — Fore-aft asymmetric rocker",
  summary: "Rolls laterally like A4, but the hull rises more steeply on one side of the contact point than the other.",
  usesParameters: [
    "baseWidthRatio",
    "baseLengthRatio",
    "baseForeAftRadiusRatio",
    "baseFrontBackAsymmetry",
    "baseMassFraction"
  ],
  colliderApproximation: () =>
    `${ROCKER_APPROXIMATION} The fore-aft profile is a parabola matched to R_fore at the contact point.`,
  validate(_params, resolved) {
    if (Math.abs(resolved.frontBackAsymmetry) >= 1) {
      throw new Error(
        `B5: front/back asymmetry ${resolved.frontBackAsymmetry} would make one side's curvature radius ` +
          "zero or negative. Keep |f_fb| below 1."
      );
    }
  },
  build(_params, resolved) {
    const radius = resolved.widthY / 2;
    const semiX = resolved.lengthX / 2;
    // Splitting the fore-aft radius this way keeps the mean curvature fixed as
    // the asymmetry is dialled up, so a comparison against the symmetric case
    // varies asymmetry alone.
    const frontRadius = resolved.foreAftRadius * (1 + resolved.frontBackAsymmetry);
    const rearRadius = resolved.foreAftRadius * (1 - resolved.frontBackAsymmetry);

    const stations: RockerStation[] = [];
    for (let i = 0; i < ROCKER_STATIONS; i++) {
      const x = -semiX + (2 * semiX * i) / (ROCKER_STATIONS - 1);
      const profileRadius = x >= 0 ? frontRadius : rearRadius;
      const rise = (x * x) / (2 * profileRadius);
      stations.push({ x, semiY: radius, semiZ: radius, centerZ: radius + rise });
    }
    return rocker(stations);
  }
});
