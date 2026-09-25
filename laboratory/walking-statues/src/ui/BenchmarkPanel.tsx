import { useState } from "react";
import { DEFAULT_FORCE_RAMP, runForceRamp, type ForceRampResult } from "../benchmark/forceRamp";
import {
  DEFAULT_STATIC_EQUILIBRIUM,
  runStaticEquilibriumBenchmark,
  type StaticEquilibriumResult
} from "../benchmark/staticEquilibrium";
import { getRapier } from "../physics/rapierSetup";
import { useSimStore } from "../state/store";
import { Katex } from "./math/Katex";

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");

/**
 * Runs the two verification checks against the *current* statue and road
 * settings, in their own throwaway physics worlds, so the live simulation is
 * untouched.
 *
 * Both run synchronously on the main thread. The static check is ~1.3k steps
 * and the ramp ~8k, which together take well under a second on the default
 * statue — not enough to warrant a background worker yet.
 */
export function BenchmarkPanel() {
  const statueParams = useSimStore((s) => s.statueParams);
  const roadParams = useSimStore((s) => s.roadParams);

  const [busy, setBusy] = useState<null | "equilibrium" | "ramp">(null);
  const [equilibrium, setEquilibrium] = useState<StaticEquilibriumResult | null>(null);
  const [ramp, setRamp] = useState<ForceRampResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (which: "equilibrium" | "ramp") => {
    setBusy(which);
    setError(null);
    try {
      const RAPIER = await getRapier();
      // Yield a frame so the button's busy state paints before we block.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (which === "equilibrium") {
        setEquilibrium(
          runStaticEquilibriumBenchmark(RAPIER, { statueParams, roadParams, ...DEFAULT_STATIC_EQUILIBRIUM })
        );
      } else {
        setRamp(runForceRamp(RAPIER, { statueParams, roadParams, ...DEFAULT_FORCE_RAMP }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="control-card control-card-wide">
      <h3>Verification checks</h3>
      <p className="hint">
        Both checks arrange the rope purely sideways, which is the case the
        formulas <Katex tex="F_{\text{slide}} = \mu M g" /> and{" "}
        <Katex tex="F_{\text{tip}} = M g\,b / z_a" /> are derived for, so the
        measured result is directly comparable to the prediction.
      </p>

      <div className="transport benchmark-buttons">
        <button className="btn btn-primary" type="button" disabled={busy !== null} onClick={() => run("equilibrium")}>
          {busy === "equilibrium" ? "Running…" : "Run static-hold check"}
        </button>
        <button className="btn" type="button" disabled={busy !== null} onClick={() => run("ramp")}>
          {busy === "ramp" ? "Running…" : "Run force-ramp check"}
        </button>
      </div>

      {error ? <p className="benchmark-error">{error}</p> : null}

      {equilibrium ? (
        <div className="benchmark-result">
          <h4>
            Static hold
            {equilibrium.notApplicableReason ? (
              <span className="verdict verdict-na">not applicable</span>
            ) : (
              <span className={`verdict ${equilibrium.pass ? "verdict-pass" : "verdict-fail"}`}>
                {equilibrium.pass ? "held still" : "moved"}
              </span>
            )}
          </h4>

          {equilibrium.notApplicableReason ? (
            <p className="hint">{equilibrium.notApplicableReason}</p>
          ) : (
            <>
              <p className="benchmark-meta">
                mass {fmt(equilibrium.massKg, 0)} kg · tipping arm{" "}
                <Katex tex="b" srLabel="b" /> {fmt(equilibrium.baseHalfWidthM, 3)} m · attachment height{" "}
                {fmt(equilibrium.attachmentHeightM, 3)} m · friction{" "}
                <Katex tex="\mu" srLabel="mu" /> {fmt(equilibrium.frictionCoefficient, 2)} · center-of-mass height{" "}
                {fmt(equilibrium.comHeightM, 3)} m
              </p>
              <p className="benchmark-meta">
                <Katex tex="F_{\text{slide}}" srLabel="sliding threshold" /> = {fmt(equilibrium.thresholds.fSlideRefN, 0)} N ·{" "}
                <Katex tex="F_{\text{tip}}" srLabel="tipping threshold" /> ={" "}
                {equilibrium.thresholds.fTipRefN === null
                  ? "n/a"
                  : `${fmt(equilibrium.thresholds.fTipRefN, 0)} N`}{" "}
                · applied {fmt(equilibrium.appliedTensionN, 0)} N ={" "}
                {fmt(equilibrium.tensionFraction * 100, 0)}% of threshold, held{" "}
                {equilibrium.holdSeconds} s · {equilibrium.contactCount} contact points
              </p>
              <table className="benchmark-table">
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>Measured</th>
                    <th>Limit</th>
                    <th>Margin</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {equilibrium.checks.map((c) => (
                    <tr key={c.name} className={c.pass ? "" : "row-fail"}>
                      <td>{c.name}</td>
                      <td className="num">
                        {c.measured.toExponential(2)} {c.unit}
                      </td>
                      <td className="num">
                        {c.limit} {c.unit}
                      </td>
                      <td className="num">
                        {c.measured > 0 ? `${fmt(c.limit / c.measured, 1)}×` : "∞"}
                      </td>
                      <td className="num">{c.pass ? "within limit" : "over limit"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      ) : null}

      {ramp ? (
        <div className="benchmark-result">
          <h4>Force ramp</h4>
          <p className="benchmark-meta">
            predicted <Katex tex="F_{\text{slide}}" srLabel="sliding threshold" /> = {fmt(ramp.thresholds.fSlideRefN, 0)} N · predicted{" "}
            <Katex tex="F_{\text{tip}}" srLabel="tipping threshold" /> ={" "}
            {ramp.thresholds.fTipRefN === null ? "n/a" : `${fmt(ramp.thresholds.fTipRefN, 0)} N`} · governed by{" "}
            {ramp.thresholds.governingRef.toLowerCase()}
            {ramp.tippingAngleDeg !== null ? (
              <>
                {" "}
                · <Katex tex="\theta_{\text{crit}}" srLabel="critical tipping angle" /> = {fmt(ramp.tippingAngleDeg, 2)}°
              </>
            ) : null}
          </p>
          <p className="benchmark-meta">
            <strong>
              Motion first appears at:{" "}
              {ramp.onsetTensionN === null
                ? "no motion up to the highest level tested"
                : `${fmt(ramp.onsetTensionN, 0)} N (${fmt((ramp.onsetFraction ?? 0) * 100, 0)}% of prediction) — ${ramp.onsetMode?.toLowerCase() ?? "moving"}`}
            </strong>
          </p>
          <table className="benchmark-table">
            <thead>
              <tr>
                <th>% of predicted threshold</th>
                <th>Tension</th>
                <th>Displacement</th>
                <th>Roll change</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {ramp.points.map((p) => (
                <tr key={p.fraction} className={p.moved ? "row-moved" : ""}>
                  <td className="num">{fmt(p.fraction * 100, 0)}%</td>
                  <td className="num">{fmt(p.tensionN, 0)} N</td>
                  <td className="num">{fmt(p.displacementM * 1000, 2)} mm</td>
                  <td className="num">{fmt(p.rollDeltaDeg, 3)}°</td>
                  <td className="num">{p.moved ? (p.mode?.toLowerCase() ?? "moving") : "held still"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="hint">
        Each ramp level is an independent trial from a fresh reset rather than
        one continuous sweep, so no sub-threshold micro-motion carries into
        the level above.
      </p>
    </div>
  );
}
