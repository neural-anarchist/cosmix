import type { StatueGeometry } from "../statue/geometry";
import type { RopeGeometry, RopeParams } from "./ropeModel";

/**
 * Default hauler positions, as fractions of statue height H, so the arrangement
 * scales sensibly with statue size.
 *
 * The teams stand *ahead* of the statue and off to each side. That gives each
 * rope a dominant lateral component (which is what supplies the tipping moment
 * that drives rocking), a modest forward component, and a modest downward
 * component because the rope runs from high on the statue down to hands at
 * chest height.
 *
 * With the default 3.5 m statue this yields d̂ ≈ (0.46, ±0.76, −0.46):
 * lateral-dominant, forward-modest, exactly as intended for Phase 1's lateral
 * rocking study. All six coordinates per rope are user-editable, so
 * inward-pulling or crossed-rope arrangements are reachable too — set an
 * external anchor's |y| inside the attachment's |y| and the lateral component
 * reverses sign. Nothing here is baked into the force model; the model only
 * ever computes `normalize(external − attachment)`.
 */
const EXTERNAL_ANCHOR_FORWARD_RATIO = 0.43;
const EXTERNAL_ANCHOR_LATERAL_RATIO = 0.86;
const EXTERNAL_ANCHOR_HEIGHT_RATIO = 0.34;

export function defaultExternalAnchors(geometry: StatueGeometry): { left: RopeGeometry["externalAnchor"]; right: RopeGeometry["externalAnchor"] } {
  const H = geometry.heightM;
  const x = EXTERNAL_ANCHOR_FORWARD_RATIO * H;
  const y = EXTERNAL_ANCHOR_LATERAL_RATIO * H;
  const z = EXTERNAL_ANCHOR_HEIGHT_RATIO * H;
  return { left: { x, y, z }, right: { x, y: -y, z } };
}

export function defaultRopeParams(geometry: StatueGeometry, tensionN: number): RopeParams {
  const anchors = defaultExternalAnchors(geometry);
  return {
    left: { externalAnchor: anchors.left, attachmentLocal: { ...geometry.defaultAttachment.left } },
    right: { externalAnchor: anchors.right, attachmentLocal: { ...geometry.defaultAttachment.right } },
    tensionN
  };
}

/**
 * A purely lateral rope arrangement: the haulers stand level with the
 * attachment and directly out to the side, so `d̂` is exactly `(0, ±1, 0)`.
 *
 * This is the arrangement the classical threshold formulas
 * `F_slide = μMg` and `F_tip = Mgb/z_anchor` are derived for, so the static
 * equilibrium benchmark and the force-ramp test use it: it makes the measured
 * onset directly comparable to the analytic prediction, with no vertical force
 * component changing the normal load. See physics/thresholds.ts for the
 * general case.
 */
export function lateralRopeParams(geometry: StatueGeometry, tensionN: number, standoffM = 4): RopeParams {
  const left = { ...geometry.defaultAttachment.left };
  const right = { ...geometry.defaultAttachment.right };
  return {
    left: {
      externalAnchor: { x: left.x, y: left.y + standoffM, z: left.z },
      attachmentLocal: left
    },
    right: {
      externalAnchor: { x: right.x, y: right.y - standoffM, z: right.z },
      attachmentLocal: right
    },
    tensionN
  };
}
