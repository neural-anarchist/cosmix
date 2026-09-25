import { useState } from "react";
import { COMPARISON_PRESETS, type ComparisonPresetId } from "../comparison/presets";
import type { LockReport, MatchedComparisonConfig } from "../comparison/types";
import { selectResolution, useSimStore } from "../state/store";

const fmt = (v: number | null, digits = 4) =>
  v === null || !Number.isFinite(v) ? "—" : v.toFixed(digits);

const STATUS_LABEL: Record<LockReport["status"], string> = {
  MET: "met",
  VIOLATED: "not met",
  NOT_APPLICABLE: "n/a",
  UNLOCKED: "not locked"
};

/** Every individual lock, for the advanced view. Grouped the way the constraints
 * actually divide: what the body is, what its base is, and what surrounds it. */
const LOCK_FIELDS: { key: keyof MatchedComparisonConfig; label: string; group: string }[] = [
  { key: "lockTotalHeight", label: "Total height", group: "Body" },
  { key: "lockTotalMass", label: "Total mass", group: "Body" },
  { key: "lockTotalCOM", label: "Center of mass", group: "Body" },
  { key: "lockPrincipalInertia", label: "Rotational inertia (abstract)", group: "Body" },
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
  const [showTable, setShowTable] = useState(false);
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
      ? "No matching applied — shapes are built as-is, so a difference between them may just be their size or weight, not the mechanism being tested."
      : invalid
        ? "This comparison is invalid — at least one locked quantity could not be matched between the two shapes."
        : "Comparison valid — every locked quantity matches within tolerance, so the shape is the only thing that differs.";

  const metCount = resolution.reports.filter((r) => r.status === "MET").length;
  const lockedCount = resolution.reports.filter((r) => r.status !== "NOT_APPLICABLE").length;

  return (
    <div className="control-card comparison-panel">
      <h3>Compare base shapes</h3>
      <p className="hint">
        Switching the base shape while its mass, balance point or size keep
        changing too makes any difference in behavior hard to attribute to
        the shape itself. A preset below can hold chosen quantities equal
        across a shape switch, adding hidden internal weight if needed, so
        the comparison isolates one variable at a time.
      </p>

      <p className={`comparison-banner ${bannerClass}`}>{bannerText}</p>

      <div className="field">
        <label title="A preset says which quantities are held equal; capturing a baseline says equal to what.">
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
        {preset.summary} <strong>Left to vary:</strong> {preset.leavesFree}
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
              A locked setting changed after the baseline was captured — {d.label}: {d.detail}
            </li>
          ))}
        </ul>
      )}

      <div className="comparison-scenarios">
        <button className="btn" type="button" onClick={captureBaseline}>
          Save this as the baseline
        </button>
        <button className="btn" type="button" onClick={captureCandidate} disabled={!baseline}>
          Save this as the candidate
        </button>
        <button className="btn" type="button" onClick={() => loadScenario("baseline")} disabled={!baseline}>
          Load baseline
        </button>
        <button className="btn" type="button" onClick={() => loadScenario("candidate")} disabled={!candidate}>
          Load candidate
        </button>
        <button className="btn" type="button" onClick={clearComparison} disabled={!baseline && !candidate}>
          Clear
        </button>
      </div>
      <p className="hint">
        Baseline: {baseline ? baseline.label : "not saved yet"} · candidate:{" "}
        {candidate ? candidate.label : "not saved yet"}. Switching between saved
        shapes restores each one and its environment, while the shared
        constraints above stay in place.
      </p>

      <label className="checkbox-row">
        <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
        <span>Choose individual locks instead of a preset</span>
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
        <span>Show the added internal weight in the collider overlay</span>
      </label>

      <p className="hint">
        {resolution.status === "RAW"
          ? "No locks are active in this mode."
          : `${metCount} of ${lockedCount} locked quantities are matched within tolerance.`}{" "}
        <button type="button" className="link-button" onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Hide the full comparison table" : "Show the full comparison table"}
        </button>
      </p>

      {showTable && (
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Quantity</th>
              <th className="num">Target</th>
              <th className="num">This shape</th>
              <th className="num">Difference</th>
              <th>Status</th>
              <th>How it's matched</th>
            </tr>
          </thead>
          <tbody>
            {resolution.reports.map((report, i) => (
              <ReportRow key={`${report.id}-${report.label}-${i}`} report={report} />
            ))}
            <EnvironmentRow
              label="Rotational inertia (kg·m²)"
              value={
                readout
                  ? `${readout.principalInertia.x.toFixed(0)}, ${readout.principalInertia.y.toFixed(0)}, ${readout.principalInertia.z.toFixed(0)}`
                  : "—"
              }
              locked={config.lockPrincipalInertia}
              method={config.lockPrincipalInertia ? "forced to match — not a real mass placement" : "derived from geometry and any added weight"}
            />
            {(["left", "right"] as const).map((side) => (
              <EnvironmentRow
                key={`anchor-${side}`}
                label={`${side} rope hauler position (m)`}
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
                method={config.lockRopeAttachments ? "kept from re-snapping to the new shape" : "follows the statue's geometry"}
              />
            ))}
            <EnvironmentRow
              label="Tension limit (N)"
              value={fmt(ropeParams.tensionN, 0)}
              locked={config.lockMaxTension}
              method="set independently of the statue"
            />
            <EnvironmentRow
              label="Road friction / slope"
              value={`μ ${fmt(roadParams.frictionCoefficient, 3)} · ${fmt(roadParams.longitudinalSlopeRad, 4)} rad`}
              locked={config.lockRoad}
              method="set independently of the statue"
            />
            <EnvironmentRow
              label="Timestep / solver"
              value={`1/240 s · 4 velocity iterations`}
              locked={config.lockSolver}
              method="fixed for the whole simulation"
            />
            <EnvironmentRow
              label="Initial pose"
              value="origin, upright"
              locked={config.lockInitialPose}
              method="every run starts from the same pose"
            />
          </tbody>
        </table>
      )}
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
      <td>{STATUS_LABEL[report.status]}</td>
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
      <td>{locked ? "locked" : "not locked"}</td>
      <td>{method}</td>
    </tr>
  );
}
