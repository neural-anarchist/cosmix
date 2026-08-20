import { useState } from "react";
import { COMPARISON_PRESETS, type ComparisonPresetId } from "../comparison/presets";
import type { LockReport, MatchedComparisonConfig } from "../comparison/types";
import { selectResolution, useSimStore } from "../state/store";

const fmt = (v: number | null, digits = 4) =>
  v === null || !Number.isFinite(v) ? "—" : v.toFixed(digits);

/** Every individual lock, for advanced mode. Grouped the way the constraints
 * actually divide: what the body is, what its base is, and what surrounds it. */
const LOCK_FIELDS: { key: keyof MatchedComparisonConfig; label: string; group: string }[] = [
  { key: "lockTotalHeight", label: "Total height", group: "Body" },
  { key: "lockTotalMass", label: "Total mass", group: "Body" },
  { key: "lockTotalCOM", label: "Centre of mass", group: "Body" },
  { key: "lockPrincipalInertia", label: "Principal inertia (abstract)", group: "Body" },
  { key: "lockMaximumLateralWidth", label: "Maximum lateral width", group: "Base" },
  { key: "lockForeAftLength", label: "Fore-aft length", group: "Base" },
  { key: "lockBaseHeight", label: "Base height", group: "Base" },
  { key: "lockBaseMass", label: "Base mass", group: "Base" },
  { key: "lockBaseVolume", label: "Base volume", group: "Base" },
  { key: "lockRoad", label: "Road", group: "Environment" },
  { key: "lockRopeAnchors", label: "Rope anchors", group: "Environment" },
  { key: "lockRopeAttachments", label: "Rope attachments", group: "Environment" },
  { key: "lockMaxTension", label: "Maximum tension", group: "Environment" },
  { key: "lockProtocol", label: "Pull protocol", group: "Environment" },
  { key: "lockSolver", label: "Timestep & solver", group: "Environment" },
  { key: "lockInitialPose", label: "Initial pose", group: "Environment" }
];

export function ComparisonPanel() {
  const [advanced, setAdvanced] = useState(false);
  const resolution = useSimStore(selectResolution);
  const config = useSimStore((s) => s.comparisonConfig);
  const presetId = useSimStore((s) => s.comparisonPresetId);
  const setPreset = useSimStore((s) => s.setComparisonPreset);
  const setLock = useSimStore((s) => s.setComparisonLock);
  const baseline = useSimStore((s) => s.baselineScenario);
  const candidate = useSimStore((s) => s.candidateScenario);
  const captureBaseline = useSimStore((s) => s.captureBaseline);
  const captureCandidate = useSimStore((s) => s.captureCandidate);
  const loadScenario = useSimStore((s) => s.loadScenario);
  const clearComparison = useSimStore((s) => s.clearComparison);
  const drift = useSimStore((s) => s.environmentDrift);
  const groupId = useSimStore((s) => s.comparisonGroupId);
  const readout = useSimStore((s) => s.readout);
  const roadParams = useSimStore((s) => s.roadParams);
  const ropeParams = useSimStore((s) => s.ropeParams);
  const showBallast = useSimStore((s) => s.showBallast);
  const setShowBallast = useSimStore((s) => s.setShowBallast);

  const preset = COMPARISON_PRESETS.find((p) => p.id === presetId)!;
  const invalid = resolution.status === "MATCHED_INVALID" || drift.length > 0;
  const bannerClass =
    resolution.status === "RAW" ? "is-raw" : invalid ? "is-invalid" : "is-matched";
  const bannerText =
    resolution.status === "RAW"
      ? "RAW GEOMETRY — not a controlled performance comparison"
      : invalid
        ? "MATCHED COMPARISON INVALID — one or more constraints cannot be met"
        : "MATCHED COMPARISON — all required locks satisfied";

  return (
    <div className="control-card comparison-panel">
      <h3>Comparison mode</h3>

      <p className={`comparison-banner ${bannerClass}`}>{bannerText}</p>

      {resolution.status === "RAW" && (
        <p className="hint">
          Each family carries the mass, COM and inertia its own shape and densities
          imply. Useful for inspecting a physically-constructed candidate — but a
          shape that happens to be heavier, wider or lower-slung will look better for
          reasons that have nothing to do with the mechanism under test. Pick a
          matched preset before comparing families.
        </p>
      )}

      <div className="field">
        <label title="A preset says which quantities are held equal; the captured baseline says equal to what.">
          <span>Preset</span>
        </label>
        <select value={presetId} onChange={(e) => setPreset(e.target.value as ComparisonPresetId)}>
          {COMPARISON_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <p className="hint">
        {preset.summary} <strong>Left free:</strong> {preset.leavesFree}
      </p>

      {resolution.abstract && resolution.abstractNote && (
        <p className="comparison-abstract">{resolution.abstractNote}</p>
      )}

      {resolution.problems.length > 0 && (
        <ul className="comparison-problems">
          {resolution.problems.map((problem, i) => (
            <li key={i}>{problem}</li>
          ))}
        </ul>
      )}

      {drift.length > 0 && (
        <ul className="comparison-problems">
          {drift.map((d, i) => (
            <li key={i}>
              Locked environment changed since the baseline — {d.label}: {d.detail}
            </li>
          ))}
        </ul>
      )}

      <div className="comparison-scenarios">
        <button type="button" onClick={captureBaseline}>
          Capture baseline
        </button>
        <button type="button" onClick={captureCandidate} disabled={!baseline}>
          Capture candidate
        </button>
        <button type="button" onClick={() => loadScenario("baseline")} disabled={!baseline}>
          Load baseline
        </button>
        <button type="button" onClick={() => loadScenario("candidate")} disabled={!candidate}>
          Load candidate
        </button>
        <button type="button" onClick={clearComparison} disabled={!baseline && !candidate}>
          Clear
        </button>
      </div>
      <p className="hint">
        Group <code>{groupId}</code> · baseline {baseline ? baseline.label : "not captured"} ·
        candidate {candidate ? candidate.label : "not captured"}. Switching between saved
        scenarios restores each statue and its environment while leaving the shared
        constraints alone.
      </p>

      <label className="checkbox-row">
        <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
        <span>Advanced: individual locks</span>
      </label>

      {advanced && (
        <div className="comparison-locks">
          {["Body", "Base", "Environment"].map((group) => (
            <div key={group}>
              <h4>{group}</h4>
              {LOCK_FIELDS.filter((f) => f.group === group).map((field) => (
                <label key={String(field.key)} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={Boolean(config[field.key])}
                    onChange={(e) => setLock({ [field.key]: e.target.checked, enabled: true })}
                  />
                  <span>{field.label}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}

      <label className="checkbox-row">
        <input type="checkbox" checked={showBallast} onChange={(e) => setShowBallast(e.target.checked)} />
        <span>Show internal ballast in collider overlay</span>
      </label>

      <table className="comparison-table">
        <thead>
          <tr>
            <th>Quantity</th>
            <th className="num">Target</th>
            <th className="num">Candidate</th>
            <th className="num">Difference</th>
            <th>Status</th>
            <th>Method</th>
          </tr>
        </thead>
        <tbody>
          {resolution.reports.map((report, i) => (
            <ReportRow key={`${report.id}-${report.label}-${i}`} report={report} />
          ))}
          <EnvironmentRow
            label="Principal inertia (kg·m²)"
            value={
              readout
                ? `${readout.principalInertia.x.toFixed(0)}, ${readout.principalInertia.y.toFixed(0)}, ${readout.principalInertia.z.toFixed(0)}`
                : "—"
            }
            locked={config.lockPrincipalInertia}
            method={config.lockPrincipalInertia ? "abstract probe" : "derived from geometry and ballast"}
          />
          {(["left", "right"] as const).map((side) => (
            <EnvironmentRow
              key={`anchor-${side}`}
              label={`${side} rope anchor (m)`}
              value={`${fmt(ropeParams[side].externalAnchor.x, 3)}, ${fmt(ropeParams[side].externalAnchor.y, 3)}, ${fmt(ropeParams[side].externalAnchor.z, 3)}`}
              locked={config.lockRopeAnchors}
              method="held fixed in world space"
            />
          ))}
          {(["left", "right"] as const).map((side) => (
            <EnvironmentRow
              key={`attach-${side}`}
              label={`${side} rope attachment (m)`}
              value={`${fmt(ropeParams[side].attachmentLocal.x, 3)}, ${fmt(ropeParams[side].attachmentLocal.y, 3)}, ${fmt(ropeParams[side].attachmentLocal.z, 3)}`}
              locked={config.lockRopeAttachments}
              method={config.lockRopeAttachments ? "auto-resnap suppressed" : "follows statue geometry"}
            />
          ))}
          <EnvironmentRow
            label="Tension limit (N)"
            value={fmt(ropeParams.tensionN, 0)}
            locked={config.lockMaxTension}
            method="not derived from the statue"
          />
          <EnvironmentRow
            label="Road friction / slope"
            value={`μ ${fmt(roadParams.frictionCoefficient, 3)} · ${fmt(roadParams.longitudinalSlopeRad, 4)} rad`}
            locked={config.lockRoad}
            method="not derived from the statue"
          />
          <EnvironmentRow
            label="Timestep / solver"
            value={`1/240 s · 4 velocity iterations`}
            locked={config.lockSolver}
            method="fixed for the whole project"
          />
          <EnvironmentRow
            label="Initial pose"
            value="origin, upright"
            locked={config.lockInitialPose}
            method="every statue spawns at (0, 0, 0)"
          />
        </tbody>
      </table>
    </div>
  );
}

function ReportRow({ report }: { report: LockReport }) {
  const difference =
    report.absoluteError === null
      ? "—"
      : `${report.absoluteError >= 0 ? "+" : ""}${report.absoluteError.toExponential(2)}${
          report.relativeError !== null ? ` (${(report.relativeError * 100).toFixed(3)}%)` : ""
        }`;
  return (
    <tr className={`status-${report.status.toLowerCase()}`}>
      <td>{report.label}</td>
      <td className="num">{report.target === null ? "—" : fmt(report.target)}</td>
      <td className="num">{report.achieved === null ? "—" : fmt(report.achieved)}</td>
      <td className="num">{difference}</td>
      <td>{report.status.replace("_", " ")}</td>
      <td>
        {report.method}
        {report.warning ? <span className="diag-note">{report.warning}</span> : null}
      </td>
    </tr>
  );
}

function EnvironmentRow({
  label,
  value,
  locked,
  method
}: {
  label: string;
  value: string;
  locked: boolean;
  method: string;
}) {
  return (
    <tr className={locked ? "status-met" : "status-unlocked"}>
      <td>{label}</td>
      <td className="num">{locked ? value : "—"}</td>
      <td className="num">{value}</td>
      <td className="num">—</td>
      <td>{locked ? "LOCKED" : "UNLOCKED"}</td>
      <td>{method}</td>
    </tr>
  );
}
