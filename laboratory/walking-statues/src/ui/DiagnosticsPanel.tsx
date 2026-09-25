import { useState } from "react";
import type { ReactNode } from "react";
import type { Vec3 } from "../core/vec3";
import { REGIME_DESCRIPTION } from "../diagnostics/regime";
import { SHARED_BASE_PARAMETERS } from "../statue/bases/shared";
import { DEFAULT_REST_TOLERANCES } from "../diagnostics/tolerances";
import { useSimStore } from "../state/store";
import { Katex } from "./math/Katex";
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
  const [consistencyOpen, setConsistencyOpen] = useState(false);
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
        Physics details
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
                <Row
                  label={<Katex tex="F_{\text{slide}} = \mu M g" srLabel="sliding threshold equals friction coefficient times mass times gravity" />}
                  value={`${fmt(readout.thresholds.fSlideRefN, 0)} N`}
                  note="the pull needed to overcome friction"
                />
                <Row
                  label={<Katex tex="F_{\text{tip}} = \dfrac{M g\, b}{z_a}" srLabel="tipping threshold" />}
                  value={fmtOrNull(readout.thresholds.fTipRefN, 0, " N")}
                  note={
                    readout.contactKind === "rocker"
                      ? "a rocker touches along a line, so there is no lever arm and no static tipping threshold"
                      : "the pull needed to tip the base over its contact edge"
                  }
                />
                <Row
                  label={<Katex tex="\min(F_{\text{slide}}, F_{\text{tip}})" srLabel="the smaller of the two thresholds" />}
                  value={`${fmt(readout.thresholds.fMinRefN, 0)} N`}
                  note={`whichever of the two happens first governs — currently ${readout.thresholds.governingRef.toLowerCase()}`}
                />
                <Row
                  label="Sliding threshold, this rope's actual direction"
                  value={fmtOrNull(readout.thresholds.fSlideGeomN, 0, " N")}
                  note="accounts for the rope's vertical component changing the normal force"
                />
                <Row
                  label="Tipping threshold, this rope's actual direction"
                  value={fmtOrNull(readout.thresholds.fTipGeomN, 0, " N")}
                />
                <Row
                  label={<Katex tex="\theta_{\text{crit}}" srLabel="critical tipping angle" />}
                  value={fmtOrNull(readout.tippingAngleDeg, 2, "°")}
                  note="roll angle at which gravity stops restoring the base"
                />
              </DiagGroup>

              <DiagGroup title="Applied load">
                <Row label="Total rope force (N)" value={fmtVec(readout.totalForceN)} />
                <Row label="Total torque about the center of mass (N·m)" value={fmtVec(readout.totalTorqueNm)} />
                <Row
                  label="Applied tension"
                  value={`${fmt(readout.ropes.left.tensionN + readout.ropes.right.tensionN, 0)} N`}
                />
                <Row label={<Katex tex="Mg" srLabel="weight" />} value={`${fmt(readout.thresholds.weightN, 0)} N`} note="weight" />
              </DiagGroup>

              <DiagGroup title="Attitude">
                <Row
                  label="Intrinsic forward lean"
                  value={`${fmt(readout.intrinsicLeanDeg, 2)}°`}
                  note="a geometry setting, not something the physics produced"
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
                  note="lean plus dynamic pitch"
                />
                <Row label="Roll" value={`${fmt(readout.rollDeg, 3)}°`} />
                <Row label="Yaw" value={`${fmt(readout.yawDeg, 3)}°`} />
              </DiagGroup>

              <DiagGroup title="Body parts (as simulated)">
                <Row label="Base shape" value={readout.baseLabel} />
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
                  label="Front-to-back symmetry"
                  value={readout.baseIsSymmetric ? "symmetric" : "asymmetric"}
                  note={
                    readout.baseIsSymmetric
                      ? "a shape that looks the same front and back has no reason to advance one way rather than the other, so it can rock but can't demonstrate directed walking on its own"
                      : readout.baseMirrorFamily
                        ? `has an exact mirror image for a left/right control comparison: ${readout.baseMirrorFamily}`
                        : "no exact mirror image exists for this outline, so a left/right control comparison isn't possible for it"
                  }
                  flag={!readout.baseIsSymmetric && readout.baseMirrorFamily === null}
                />
                <Row label="Contact type" value={readout.contactKind === "rocker" ? "rolls on a curve" : "flat on the ground"} />
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
                  note={readout.baseGeometry.footprintAreaM2 === null ? "rocker: line contact, no footprint area" : undefined}
                />
                <Row
                  label={<>Tipping arm <Katex tex="b" />, left / right (m)</>}
                  value={`${fmt(readout.baseGeometry.contactHalfWidthYLeftM, 3)} / ${fmt(readout.baseGeometry.contactHalfWidthYRightM, 3)}`}
                  note="the smaller of the two sets the static threshold"
                />
                <Row label="Base x-offset (m)" value={fmt(readout.baseGeometry.offsetXM, 3)} />
                <Row label="Base centroid (body-local, m)" value={fmtVec(readout.baseGeometry.comLocal, 3)} />
                <Row
                  label="Controls this shape uses"
                  value={`${readout.baseUsesParameters.length} of ${SHARED_BASE_PARAMETERS.length}`}
                  note={SHARED_BASE_PARAMETERS.filter((p) => readout.baseUsesParameters.includes(p.id))
                    .map((p) => p.symbol)
                    .join(", ")}
                />
                <Row
                  label="Controls this shape ignores"
                  value={`${SHARED_BASE_PARAMETERS.length - readout.baseUsesParameters.length}`}
                  note={
                    SHARED_BASE_PARAMETERS.filter((p) => !readout.baseUsesParameters.includes(p.id))
                      .map((p) => p.symbol)
                      .join(", ") || "none"
                  }
                />
              </DiagGroup>

              <DiagGroup title="Body state">
                <Row label="Mass" value={`${fmt(readout.massKg, 0)} kg`} />
                <Row
                  label="Center of mass (body-local, m)"
                  value={fmtVec(readout.comLocal, 3)}
                  note={readout.comOverridden ? "set by hand — not a physically consistent statue" : "derived from geometry"}
                  flag={readout.comOverridden}
                />
                <Row label="Principal inertia (kg·m²)" value={fmtVec(readout.principalInertia, 0)} />
                <Row label="Center-of-mass position (m)" value={fmtVec(readout.comWorld, 3)} />
                <Row label="Velocity (m/s)" value={fmtVec(readout.linvel, 4)} />
                <Row label="Angular velocity (rad/s)" value={fmtVec(readout.angvel, 4)} />
                <Row
                  label="Speed"
                  value={`${fmt(readout.speedMps * 1000, 3)} mm/s`}
                  note={`counted as "at rest" below ${DEFAULT_REST_TOLERANCES.speedMps * 1000} mm/s`}
                  flag={readout.speedMps > DEFAULT_REST_TOLERANCES.speedMps}
                />
                <Row
                  label="Angular speed"
                  value={`${fmt(readout.angularSpeedDegPerS, 4)} °/s`}
                  note={`counted as "at rest" below ${DEFAULT_REST_TOLERANCES.angularSpeedDegPerS} °/s`}
                  flag={readout.angularSpeedDegPerS > DEFAULT_REST_TOLERANCES.angularSpeedDegPerS}
                />
              </DiagGroup>

              <DiagGroup title="Contact">
                <Row label="Contact points" value={`${readout.contactCount}`} flag={readout.contactCount === 0} />
                <Row label="Normal force (estimate)" value={`${fmt(readout.normalForceProxyN, 0)} N`} />
                <Row label={<>Friction <Katex tex="\mu" srLabel="mu" /> (both surfaces)</>} value={fmt(readout.frictionCoefficient, 3)} />
                <Row label="Restitution (bounciness)" value={fmt(readout.restitution, 3)} />
                <Row label={<>Half-width <Katex tex="b" /></>} value={`${fmt(readout.baseHalfWidthM, 3)} m`} />
              </DiagGroup>

              {(["left", "right"] as const).map((side) => {
                const rope = readout.ropes[side];
                return (
                  <DiagGroup key={side} title={`${side === "left" ? "Left" : "Right"} rope`}>
                    <Row label="Being pulled" value={rope.active ? "yes" : "no"} />
                    <Row label="Tension" value={`${fmt(rope.tensionN, 0)} N`} />
                    <Row label={<>Direction <Katex tex="\hat{d}" srLabel="unit direction" /></>} value={fmtVec(rope.direction, 3)} />
                    <Row label="Force (N)" value={fmtVec(rope.force)} />
                    <Row label="Torque about the center of mass (N·m)" value={fmtVec(rope.torqueAboutCom)} />
                    <Row label="Attachment on the statue (world, m)" value={fmtVec(rope.attachmentWorld, 3)} />
                    <Row label="Hauler position (world, m)" value={fmtVec(rope.externalAnchor, 2)} />
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
              The threshold rows above assume a purely horizontal pull. The
              "this rope's actual direction" rows apply the same balance of
              forces to the rope geometry actually configured — once a rope
              pulls partly downward it presses the statue into the road,
              raising both thresholds, so both are shown rather than only the
              horizontal-pull numbers.
            </p>

            <details
              className="diagnostics-nested"
              open={consistencyOpen}
              onToggle={(e) => setConsistencyOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary>Internal consistency checks</summary>
              <div className="diagnostics-nested-body">
                <p className="hint">
                  These rows exist to catch a mismatch between the geometry
                  the statue is built from and the mass properties the
                  physics engine ends up with. They are not needed to
                  understand or operate the simulation above.
                </p>
                <div className="diag-grid">
                  <DiagGroup title="Per-part mass check">
                    {readout.componentMass.map((c) => (
                      <Row
                        key={c.component}
                        label={c.component}
                        value={`${fmt(c.rapierMassKg, 1)} kg`}
                        note={`target ${fmt(c.targetMassKg, 1)} kg · volume ${fmt(c.volumeM3, 5)} m³ (collider ${fmt(c.colliderVolumeM3, 5)} m³) · density ${fmt(c.densityKgPerM3, 0)} kg/m³`}
                        flag={Math.abs(c.rapierMassKg - c.targetMassKg) > 0.01 * c.targetMassKg}
                      />
                    ))}
                    <Row
                      label="Sum of parts vs. reported total"
                      value={`${fmt(readout.componentMass.reduce((a, c) => a + c.rapierMassKg, 0), 1)} / ${fmt(readout.massKg, 1)} kg`}
                    />
                  </DiagGroup>
                  <DiagGroup title="Center-of-mass cross-check">
                    <Row
                      label="Center of mass, computed independently (m)"
                      value={fmtVec(readout.comLocalAnalytic, 3)}
                      note={`disagreement with the physics engine's own figure: ${fmt(
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
                  </DiagGroup>
                </div>
              </div>
            </details>
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

function DiagGroup({ title, children }: { title: string; children: ReactNode }) {
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
  label: ReactNode;
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
