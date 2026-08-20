import { useState } from "react";
import type { Vec3 } from "../core/vec3";
import { REGIME_DESCRIPTION } from "../diagnostics/regime";
import { SHARED_BASE_PARAMETERS } from "../statue/bases/shared";
import { DEFAULT_REST_TOLERANCES } from "../diagnostics/tolerances";
import { useSimStore } from "../state/store";
import { SideViewDiagram } from "./diagrams/SideViewDiagram";
import { TopViewDiagram } from "./diagrams/TopViewDiagram";

/** Matches the wireframe colours in `statue/factory.ts` so the overlay and this
 * legend name the same thing. */
const COMPONENT_SWATCH: Record<string, string> = {
  base: "◼ blue",
  torso: "◼ gold",
  head: "◼ rust"
};

const fmt = (v: number, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : "—");
const fmtVec = (v: Vec3, digits = 1) => `(${fmt(v.x, digits)}, ${fmt(v.y, digits)}, ${fmt(v.z, digits)})`;
const fmtOrNull = (v: number | null, digits = 0, suffix = "") =>
  v === null ? "n/a" : `${fmt(v, digits)}${suffix}`;

export function DiagnosticsPanel() {
  const [open, setOpen] = useState(false);
  const readout = useSimStore((s) => s.readout);

  return (
    <div className="diagnostics">
      <button
        className="diagnostics-toggle"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="diagnostics-caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        Physics Diagnostics
        {readout ? <span className="regime-chip">{readout.regime}</span> : null}
      </button>

      {open ? (
        readout ? (
          <div className="diagnostics-body">
            <p className="diagnostics-regime">
              <strong>{readout.regime}</strong> — {REGIME_DESCRIPTION[readout.regime]}
            </p>

            <div className="diag-grid">
              <DiagGroup title="Static thresholds">
                <Row label="F_slide = μMg" value={`${fmt(readout.thresholds.fSlideRefN, 0)} N`} />
                <Row
                  label="F_tip = Mgb/z_anchor"
                  value={fmtOrNull(readout.thresholds.fTipRefN, 0, " N")}
                  note={readout.contactKind === "rocker" ? "rocker: line contact, no lever arm" : undefined}
                />
                <Row
                  label="min(F_slide, F_tip)"
                  value={`${fmt(readout.thresholds.fMinRefN, 0)} N`}
                  note={`governed by ${readout.thresholds.governingRef}`}
                />
                <Row
                  label="F_slide (this rope's direction)"
                  value={fmtOrNull(readout.thresholds.fSlideGeomN, 0, " N")}
                  note="accounts for the rope's vertical component"
                />
                <Row
                  label="F_tip (this rope's direction)"
                  value={fmtOrNull(readout.thresholds.fTipGeomN, 0, " N")}
                />
                <Row
                  label="Static tipping angle"
                  value={fmtOrNull(readout.tippingAngleDeg, 2, "°")}
                />
              </DiagGroup>

              <DiagGroup title="Applied load">
                <Row label="Total rope force (N)" value={fmtVec(readout.totalForceN)} />
                <Row label="Total torque about COM (N·m)" value={fmtVec(readout.totalTorqueNm)} />
                <Row
                  label="Applied tension"
                  value={`${fmt(readout.ropes.left.tensionN + readout.ropes.right.tensionN, 0)} N`}
                />
                <Row label="Weight Mg" value={`${fmt(readout.thresholds.weightN, 0)} N`} />
              </DiagGroup>

              <DiagGroup title="Attitude">
                <Row
                  label="Intrinsic forward lean"
                  value={`${fmt(readout.intrinsicLeanDeg, 2)}°`}
                  note="geometry parameter, not a result"
                />
                <Row
                  label="— from the body"
                  value={`${fmt(readout.bodyLeanDeg, 2)}°`}
                  note="upper body leaned on a level base"
                />
                <Row
                  label="— from the base"
                  value={`${fmt(readout.baseMountLeanDeg, 2)}°`}
                  note="base's top face cut at an angle; footprint unaffected"
                />
                <Row
                  label="Dynamic pitch"
                  value={`${fmt(readout.pitchDeg, 3)}°`}
                  note="live simulated fore-aft tilt"
                />
                <Row
                  label="Upper-body total"
                  value={`${fmt(readout.totalUpperBodyPitchDeg, 3)}°`}
                  note="lean + dynamic pitch"
                />
                <Row label="Roll" value={`${fmt(readout.rollDeg, 3)}°`} />
                <Row label="Yaw" value={`${fmt(readout.yawDeg, 3)}°`} />
              </DiagGroup>

              <DiagGroup title="Compound components">
                <Row label="Base family" value={readout.baseLabel} />
                {readout.components.map((c) => (
                  <Row
                    key={c.component}
                    label={c.component}
                    value={COMPONENT_SWATCH[c.component] ?? "—"}
                    note={c.approximation}
                  />
                ))}
              </DiagGroup>

              <DiagGroup title="Base geometry">
                <Row
                  label="Fore-aft symmetry"
                  value={readout.baseIsSymmetric ? "symmetric" : "asymmetric"}
                  note={
                    readout.baseIsSymmetric
                      ? "validation model: no mechanism to prefer a direction"
                      : readout.baseMirrorFamily
                        ? `mirror control available: ${readout.baseMirrorFamily}`
                        : "NO EXACT MIRROR CONTROL — a mirrored trial is unavailable for this outline"
                  }
                  flag={!readout.baseIsSymmetric && readout.baseMirrorFamily === null}
                />
                <Row label="Contact kind" value={readout.contactKind} />
                <Row
                  label="Length x width (m)"
                  value={`${fmt(readout.baseGeometry.lengthXM, 3)} x ${fmt(readout.baseGeometry.widthYM, 3)}`}
                />
                <Row label="Top of base (m)" value={fmt(readout.baseGeometry.topZM, 3)} />
                <Row label="Solid volume (m³)" value={fmt(readout.baseGeometry.volumeM3, 5)} />
                <Row
                  label="Footprint area (m²)"
                  value={
                    readout.baseGeometry.footprintAreaM2 === null
                      ? "n/a"
                      : fmt(readout.baseGeometry.footprintAreaM2, 5)
                  }
                  note={readout.baseGeometry.footprintAreaM2 === null ? "rocker: line contact" : undefined}
                />
                <Row
                  label="Tipping arm b, left / right (m)"
                  value={`${fmt(readout.baseGeometry.contactHalfWidthYLeftM, 3)} / ${fmt(readout.baseGeometry.contactHalfWidthYRightM, 3)}`}
                  note="the smaller arm governs the static threshold"
                />
                <Row label="Base x-offset (m)" value={fmt(readout.baseGeometry.offsetXM, 3)} />
                <Row label="Base centroid (body-local, m)" value={fmtVec(readout.baseGeometry.comLocal, 3)} />
                <Row
                  label="Parameters this family reads"
                  value={`${readout.baseUsesParameters.length} of ${SHARED_BASE_PARAMETERS.length}`}
                  note={SHARED_BASE_PARAMETERS.filter((p) => readout.baseUsesParameters.includes(p.id))
                    .map((p) => p.symbol)
                    .join(", ")}
                />
                <Row
                  label="Inert for this family"
                  value={`${SHARED_BASE_PARAMETERS.length - readout.baseUsesParameters.length}`}
                  note={
                    SHARED_BASE_PARAMETERS.filter((p) => !readout.baseUsesParameters.includes(p.id))
                      .map((p) => p.symbol)
                      .join(", ") || "none"
                  }
                />
              </DiagGroup>

              <DiagGroup title="Raw mass bookkeeping">
                {readout.componentMass.map((c) => (
                  <Row
                    key={c.component}
                    label={c.component}
                    value={`${fmt(c.rapierMassKg, 1)} kg`}
                    note={`target ${fmt(c.targetMassKg, 1)} kg · vol ${fmt(c.volumeM3, 5)} m³ (collider ${fmt(c.colliderVolumeM3, 5)}) · rho ${fmt(c.densityKgPerM3, 0)} kg/m³`}
                    flag={Math.abs(c.rapierMassKg - c.targetMassKg) > 0.01 * c.targetMassKg}
                  />
                ))}
                <Row
                  label="Sum vs total"
                  value={`${fmt(readout.componentMass.reduce((a, c) => a + c.rapierMassKg, 0), 1)} / ${fmt(readout.massKg, 1)} kg`}
                />
              </DiagGroup>

              <DiagGroup title="Body state">
                <Row label="Mass (from Rapier)" value={`${fmt(readout.massKg, 0)} kg`} />
                <Row
                  label="COM (body-local, m)"
                  value={fmtVec(readout.comLocal, 3)}
                  note={readout.comOverridden ? "EXPLICITLY OVERRIDDEN — abstract probe" : "derived from geometry"}
                  flag={readout.comOverridden}
                />
                <Row
                  label="COM (analytic, m)"
                  value={fmtVec(readout.comLocalAnalytic, 3)}
                  note={`independent cross-check · disagreement ${fmt(
                    1000 *
                      Math.hypot(
                        readout.comLocal.x - readout.comLocalAnalytic.x,
                        readout.comLocal.y - readout.comLocalAnalytic.y,
                        readout.comLocal.z - readout.comLocalAnalytic.z
                      ),
                    3
                  )} mm`}
                  flag={
                    !readout.comOverridden &&
                    Math.hypot(
                      readout.comLocal.x - readout.comLocalAnalytic.x,
                      readout.comLocal.y - readout.comLocalAnalytic.y,
                      readout.comLocal.z - readout.comLocalAnalytic.z
                    ) > 1e-3
                  }
                />
                <Row label="Principal inertia (kg·m²)" value={fmtVec(readout.principalInertia, 0)} />
                <Row label="COM position (m)" value={fmtVec(readout.comWorld, 3)} />
                <Row label="Velocity (m/s)" value={fmtVec(readout.linvel, 4)} />
                <Row label="Angular velocity (rad/s)" value={fmtVec(readout.angvel, 4)} />
                <Row
                  label="Speed"
                  value={`${fmt(readout.speedMps * 1000, 3)} mm/s`}
                  note={`rest tolerance ${DEFAULT_REST_TOLERANCES.speedMps * 1000} mm/s`}
                  flag={readout.speedMps > DEFAULT_REST_TOLERANCES.speedMps}
                />
                <Row
                  label="Angular speed"
                  value={`${fmt(readout.angularSpeedDegPerS, 4)} °/s`}
                  note={`rest tolerance ${DEFAULT_REST_TOLERANCES.angularSpeedDegPerS} °/s`}
                  flag={readout.angularSpeedDegPerS > DEFAULT_REST_TOLERANCES.angularSpeedDegPerS}
                />
              </DiagGroup>

              <DiagGroup title="Contact">
                <Row label="Contact pairs" value={`${readout.contactCount}`} flag={readout.contactCount === 0} />
                <Row label="Normal force (proxy)" value={`${fmt(readout.normalForceProxyN, 0)} N`} />
                <Row label="Friction μ (both surfaces)" value={fmt(readout.frictionCoefficient, 3)} />
                <Row label="Restitution" value={fmt(readout.restitution, 3)} />
                <Row label="Base half-width b" value={`${fmt(readout.baseHalfWidthM, 3)} m`} />
              </DiagGroup>

              {(["left", "right"] as const).map((side) => {
                const rope = readout.ropes[side];
                return (
                  <DiagGroup key={side} title={`${side === "left" ? "Left" : "Right"} rope`}>
                    <Row label="Hauled" value={rope.active ? "yes" : "no"} />
                    <Row label="Tension" value={`${fmt(rope.tensionN, 0)} N`} />
                    <Row label="Direction d̂" value={fmtVec(rope.direction, 3)} />
                    <Row label="Force (N)" value={fmtVec(rope.force)} />
                    <Row label="Torque about COM (N·m)" value={fmtVec(rope.torqueAboutCom)} />
                    <Row label="Attachment (world, m)" value={fmtVec(rope.attachmentWorld, 3)} />
                    <Row label="Haulers (world, m)" value={fmtVec(rope.externalAnchor, 2)} />
                    <Row label="Rope length" value={`${fmt(rope.ropeLengthM, 2)} m`} />
                  </DiagGroup>
                );
              })}
            </div>

            <div className="diagram-row">
              <TopViewDiagram />
              <SideViewDiagram />
            </div>

            <p className="hint">
              The reference thresholds are the classical formulas for a purely
              horizontal lateral pull. The "this rope's direction" rows apply the
              same force and moment balance to the rope geometry actually
              configured — once a rope pulls partly downward it presses the
              statue into the road, raising both thresholds. Both are shown
              because quoting only the reference numbers next to an angled rope
              would be wrong.
            </p>
          </div>
        ) : (
          <div className="diagnostics-body">
            <p className="hint">Waiting for the first simulation frame…</p>
          </div>
        )
      ) : null}
    </div>
  );
}

function DiagGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="diag-group">
      <h4>{title}</h4>
      <dl>{children}</dl>
    </div>
  );
}

function Row({
  label,
  value,
  note,
  flag
}: {
  label: string;
  value: string;
  note?: string;
  flag?: boolean;
}) {
  return (
    <div className={`diag-row${flag ? " is-flagged" : ""}`}>
      <dt>{label}</dt>
      <dd>
        {value}
        {note ? <span className="diag-note">{note}</span> : null}
      </dd>
    </div>
  );
}
