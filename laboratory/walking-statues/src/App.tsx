import { BaselineNotice } from "./ui/BaselineNotice";
import { ComparisonPanel } from "./ui/ComparisonPanel";
import { ControlPanel } from "./ui/ControlPanel";
import { DeveloperTools } from "./ui/DeveloperTools";
import { DiagnosticsPanel } from "./ui/DiagnosticsPanel";
import { ReadoutPanel } from "./ui/ReadoutPanel";
import { RopeControls } from "./ui/RopeControls";
import { TheorySection } from "./ui/theory/TheorySection";
import { Viewport } from "./ui/Viewport";

export function App() {
  return (
    <div className="page">
      <a className="skip-link" href="#section-statue">
        Skip to the simulation
      </a>

      <a className="back-link" href="../../../">
        ← Back to Cosmix
      </a>

      <header className="page-header">
        <p className="eyebrow">Rigid-body dynamics · Walking-Moai hypothesis</p>
        <h1>Walking Statues</h1>
        <p className="lede">
          A free six-degree-of-freedom statue on a road, driven only by
          gravity, friction, ground contact, and rope forces pulled by hand.
          Forward motion — if it happens — has to emerge from side-to-side
          rocking; nothing here scripts a step.
        </p>
      </header>

      <nav className="section-nav" aria-label="Section navigation">
        <a href="#section-statue">1 · The Statue</a>
        <a href="#section-theory">2 · Rocking Geometry &amp; Theory</a>
      </nav>

      <section className="section" id="section-statue">
        <div className="section-head">
          <p className="section-kicker">Section one</p>
          <h2>The Statue</h2>
          <p className="section-lede">
            The physics engine steps a compound rigid body at a fixed 1/240 s,
            independent of how fast your screen refreshes. Hold a rope button
            to haul on one side at the tension set below: below the statue's
            sliding and tipping thresholds it must not budge, and above them
            it rocks. Both thresholds are predicted and shown in "Physics
            details" below the readouts.
          </p>
        </div>

        <Viewport />
        <BaselineNotice />
        <ReadoutPanel />
        <DiagnosticsPanel />
        <div className="controls">
          <RopeControls />
        </div>
        <ControlPanel />
        <div className="controls">
          <ComparisonPanel />
        </div>
        <DeveloperTools />
      </section>

      <section className="section" id="section-theory">
        <div className="section-head">
          <p className="section-kicker">Section two</p>
          <h2>Rocking Geometry &amp; Theory</h2>
          <p className="section-lede">
            From Newton-Euler rigid-body dynamics to the flat-base and rocker
            stability conditions, with a live diagram driven by the statue above.
          </p>
        </div>

        <TheorySection />
      </section>

      <footer className="page-footer">
        <p>
          Cosmix Laboratory · Vite + React + TypeScript, Three.js rendering,
          Rapier3D (WASM) rigid-body physics. This is a simplified rigid-body
          simulation with assumed geometry, friction, rope tension, and a
          flat rigid ground — not a historically validated demonstration of
          Moai transport, and not proof that Moai were walked this way.
        </p>
      </footer>
    </div>
  );
}
