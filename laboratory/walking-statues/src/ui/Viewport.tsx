import { useEffect, useRef, useState } from "react";
import { SimulationEngine } from "../core/SimulationEngine";
import { useSimStore } from "../state/store";

export function Viewport() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<SimulationEngine | null>(null);

  const [ready, setReady] = useState(false);
  // Cleanup runs in a closure captured at mount time, so it can't rely on
  // the `ready` state (which would always read back as its initial value
  // there). This ref is mutated in place and read at cleanup time instead.
  const engineReadyRef = useRef(false);
  const [running, setRunning] = useState(true);
  const [leftHeld, setLeftHeld] = useState(false);
  const [rightHeld, setRightHeld] = useState(false);

  const statueParams = useSimStore((s) => s.statueParams);
  const roadParams = useSimStore((s) => s.roadParams);
  const ropeParams = useSimStore((s) => s.ropeParams);
  const showColliders = useSimStore((s) => s.showColliders);
  const setShowColliders = useSimStore((s) => s.setShowColliders);
  const showComMarker = useSimStore((s) => s.showComMarker);
  const setShowComMarker = useSimStore((s) => s.setShowComMarker);
  const setReadout = useSimStore((s) => s.setReadout);
  const status = useSimStore((s) => s.readout?.status ?? "gray");

  // Mount: create the engine once against the initial store values. Later
  // param changes are pushed via the effects below rather than by
  // recreating the engine.
  useEffect(() => {
    if (!canvasRef.current) return;
    let cancelled = false;
    const engine = new SimulationEngine(canvasRef.current);
    engineRef.current = engine;

    engine
      .init(
        useSimStore.getState().statueParams,
        useSimStore.getState().roadParams,
        useSimStore.getState().ropeParams
      )
      .then(() => {
        if (cancelled) {
          engine.dispose();
          return;
        }
        engine.setShowColliders(useSimStore.getState().showColliders);
        engine.setShowComMarker(useSimStore.getState().showComMarker);
        engine.start();
        engineReadyRef.current = true;
        setReady(true);
      });

    const unsubscribe = engine.subscribe((snapshot) => setReadout(snapshot));

    return () => {
      cancelled = true;
      unsubscribe();
      if (engineReadyRef.current) {
        engine.dispose();
        engineReadyRef.current = false;
      }
      engineRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    engineRef.current?.updateStatueParams(statueParams);
  }, [ready, statueParams]);

  const roadGeometryKey = `${roadParams.type}|${roadParams.lengthM}|${roadParams.widthM}`;
  useEffect(() => {
    if (!ready) return;
    engineRef.current?.updateRoadParams(useSimStore.getState().roadParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, roadGeometryKey]);

  useEffect(() => {
    if (!ready) return;
    engineRef.current?.updateContact(roadParams.frictionCoefficient, roadParams.restitution);
  }, [ready, roadParams.frictionCoefficient, roadParams.restitution]);

  useEffect(() => {
    if (!ready) return;
    engineRef.current?.setShowColliders(showColliders);
  }, [ready, showColliders]);

  useEffect(() => {
    if (!ready) return;
    engineRef.current?.setShowComMarker(showComMarker);
  }, [ready, showComMarker]);

  useEffect(() => {
    if (!ready) return;
    engineRef.current?.updateRopeParams(ropeParams);
  }, [ready, ropeParams]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      engineRef.current?.onResize(width, height);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const togglePlay = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (running) {
      engine.stop();
    } else {
      engine.start();
    }
    setRunning(!running);
  };

  const handleReset = () => {
    engineRef.current?.reset();
  };

  const bindHold = (side: "left" | "right", setHeld: (v: boolean) => void) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      engineRef.current?.setRopeHeld(side, true);
      setHeld(true);
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      engineRef.current?.setRopeHeld(side, false);
      setHeld(false);
    },
    onPointerCancel: () => {
      engineRef.current?.setRopeHeld(side, false);
      setHeld(false);
    }
  });

  return (
    <div className="stage-wrap">
      <div className="stage" ref={containerRef}>
        <canvas ref={canvasRef} aria-label="Walking statue rigid-body simulation" />
        <div className="stage-overlay">
          <span className="status-chip" data-status={status}>
            <span className="status-dot" aria-hidden="true" />
            {ready ? "Simulation live" : "Loading physics…"}
          </span>
        </div>
      </div>

      <div className="transport">
        <button className="btn btn-primary" type="button" aria-pressed={running} onClick={togglePlay} disabled={!ready}>
          {running ? "Pause" : "Play"}
        </button>
        <button className="btn" type="button" onClick={handleReset} disabled={!ready}>
          Reset
        </button>
        <button
          className={`btn btn-left${leftHeld ? " is-held" : ""}`}
          type="button"
          disabled={!ready}
          {...bindHold("left", setLeftHeld)}
        >
          Hold to pull left
        </button>
        <button
          className={`btn btn-right${rightHeld ? " is-held" : ""}`}
          type="button"
          disabled={!ready}
          {...bindHold("right", setRightHeld)}
        >
          Hold to pull right
        </button>
      </div>

      <div className="controls">
        <div className="control-card">
          <h3>Display</h3>
          <label className="field field-checkbox">
            <input type="checkbox" checked={showColliders} onChange={(e) => setShowColliders(e.target.checked)} />
            <span>Show collider overlay</span>
          </label>
          <label className="field field-checkbox">
            <input type="checkbox" checked={showComMarker} onChange={(e) => setShowComMarker(e.target.checked)} />
            <span>Show center-of-mass marker</span>
          </label>
          <p className="hint">
            Drag to orbit, scroll to zoom. The collider overlay shows the actual
            simulated shapes — a small number of primitives, deliberately coarser
            than the display mesh (see PHYSICS_MODEL.md).
          </p>
        </div>
      </div>
    </div>
  );
}
