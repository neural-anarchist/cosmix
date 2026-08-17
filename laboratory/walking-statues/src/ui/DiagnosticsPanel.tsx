import { useState } from "react";
import type { Vec3 } from "../core/vec3";
import { REGIME_DESCRIPTION } from "../diagnostics/regime";
import { DEFAULT_REST_TOLERANCES } from "../diagnostics/tolerances";
import { useSimStore } from "../state/store";
import { SideViewDiagram } from "./diagrams/SideViewDiagram";
import { TopViewDiagram } from "./diagrams/TopViewDiagram";

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

              <DiagGroup title="Body state">
                <Row label="Mass (from Rapier)" value={`${fmt(readout.massKg, 0)} kg`} />
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
                <Row label="Roll / Pitch" value={`${fmt(readout.rollDeg)}° / ${fmt(readout.pitchDeg)}°`} />
              </DiagGroup>

              <DiagGroup title="Contact">
                <Row label="Contact pairs" value={`${readout.contactCount}`} flag={readout.contactCount === 0} />
                <Row label="Normal force (proxy)" value={`${fmt(readout.normalForceProxyN, 0)} N`} />
                <Row label="Friction μ (both surfaces)" value={fmt(readout.frictionCoefficient, 3)} />
                <Row label="Restitution" value={fmt(readout.restitution, 3)} />
                <Row label="Base half-width b" value={`${fmt(readout.baseHalfWidthM, 3)} m`} />
                <Row label="Contact kind" value={readout.contactKind} />
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
