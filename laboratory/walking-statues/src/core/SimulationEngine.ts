import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type * as RAPIER from "@dimforge/rapier3d-compat";
import { getRapier, type RapierModule } from "../physics/rapierSetup";
import { FIXED_TIMESTEP_S, GRAVITY_M_S2, MAX_SUBSTEPS_PER_FRAME, READOUT_PUBLISH_HZ } from "./constants";
import { quaternionToRollPitchYaw, radToDeg } from "./orientation";
import { add, length as vecLength, type Quat, type Vec3 } from "./vec3";
import { buildFlatRoad } from "../road/flatRoad";
import type { RoadBuild, RoadParams } from "../road/types";
import { getBaseModule } from "../statue/bases/registry";
import { createStatue } from "../statue/factory";
import type { StatueBuild, StatueParams } from "../statue/types";
import { applyRopeForces } from "../control/ropeForces";
import { solveRopes, type RopeHoldState, type RopeParams, type RopeSolution } from "../control/ropeModel";
import { computeThresholds, staticTippingAngleRad, type Thresholds } from "../physics/thresholds";
import { classifyRegime, type Regime } from "../diagnostics/regime";
import { DEFAULT_REGIME_THRESHOLDS } from "../diagnostics/tolerances";

export type RunStatus = "gray" | "yellow" | "red";

export interface RopeDiagnostic {
  side: "left" | "right";
  active: boolean;
  tensionN: number;
  externalAnchor: Vec3;
  attachmentWorld: Vec3;
  direction: Vec3;
  force: Vec3;
  torqueAboutCom: Vec3;
  ropeLengthM: number;
}

export interface EngineSnapshot {
  simTimeS: number;
  running: boolean;
  status: RunStatus;
  regime: Regime;

  dxM: number;
  dyM: number;
  rollDeg: number;
  /**
   * Dynamic pitch: the live simulated fore-aft tilt read off the body's
   * quaternion. Deliberately reported separately from `intrinsicLeanDeg` — a
   * statue built leaning forward 10 deg and standing still has 10 deg of
   * intrinsic lean and 0 deg of dynamic pitch, and conflating the two would make
   * a static statue look like it was falling over.
   */
  pitchDeg: number;
  yawDeg: number;
  /** Intrinsic forward lean baked into the geometry, degrees. A modelling
   * parameter, not a simulation result. */
  intrinsicLeanDeg: number;
  /** Total fore-aft attitude of the upper body: intrinsic lean + dynamic pitch. */
  totalUpperBodyPitchDeg: number;

  massKg: number;
  comWorld: Vec3;
  comHeightM: number;
  /** COM in body-local coordinates, so it can be compared against the
   * geometry's analytic value and against an override. */
  comLocal: Vec3;
  principalInertia: Vec3;
  /** True when the COM was explicitly overridden rather than derived from
   * geometry — an abstract probe, not a self-consistent rigid body. */
  comOverridden: boolean;
  /** Compound components and how each one's collider approximates its visual. */
  components: { component: string; approximation: string }[];
  baseFamily: string;
  baseLabel: string;

  linvel: Vec3;
  angvel: Vec3;
  speedMps: number;
  angularSpeedDegPerS: number;

  ropes: { left: RopeDiagnostic; right: RopeDiagnostic };
  /** Vector sum of all active rope forces, N. */
  totalForceN: Vec3;
  /** Vector sum of all active rope torques about the COM, N·m. */
  totalTorqueNm: Vec3;

  thresholds: Thresholds;
  /** Static tipping angle of the current geometry, deg; null for a rocker. */
  tippingAngleDeg: number | null;

  contactCount: number;
  /** Normal contact force proxy from the solver's impulses, N. Carries the
   * penetration-correction bias, so it is a proxy rather than a measurement. */
  normalForceProxyN: number;
  frictionCoefficient: number;
  restitution: number;

  baseHalfWidthM: number;
  contactKind: "flat" | "rocker";
}

const CAMERA_FOV_DEG = 45;
const CAMERA_NEAR = 0.05;
const CAMERA_FAR = 500;

const ROPE_ACTIVE_COLORS = { left: 0x83b8d7, right: 0xd68c70 } as const;
const ROPE_IDLE_COLOR = 0x4a5876;
const ANCHOR_MARKER_RADIUS_M = 0.12;

/**
 * Framework-agnostic owner of the Three.js scene/renderer/camera and the
 * Rapier world. Runs its own fixed-timestep accumulator loop and exposes an
 * imperative API; React only mounts a canvas into it and reads a throttled
 * snapshot. See ARCHITECTURE.md "The engine loop".
 */
export class SimulationEngine {
  private readonly canvas: HTMLCanvasElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private RAPIER!: RapierModule;
  private world!: RAPIER.World;

  private road: RoadBuild | null = null;
  private statue: StatueBuild | null = null;
  private statueParams!: StatueParams;
  private roadParams!: RoadParams;
  private ropeParams!: RopeParams;
  private held: RopeHoldState = { leftHeld: false, rightHeld: false };

  private showColliders = false;
  private showComMarker = true;

  private accumulatorS = 0;
  private simTimeS = 0;
  private lastFrameTimeMs: number | null = null;
  private rafHandle: number | null = null;
  private running = false;
  private everStarted = false;
  /** True once init() has fully constructed the scene/world. Guards every
   * public method against firing while construction is still in flight —
   * e.g. a ResizeObserver callback landing before the async Rapier WASM
   * init resolves. */
  private initialized = false;

  private readonly prevPos = new THREE.Vector3();
  private readonly prevQuat = new THREE.Quaternion();
  private readonly currPos = new THREE.Vector3();
  private readonly currQuat = new THREE.Quaternion();
  private readonly scratchPos = new THREE.Vector3();
  private readonly scratchQuat = new THREE.Quaternion();

  private ropeLines: Record<"left" | "right", THREE.Line> | null = null;
  private ropeArrows: Record<"left" | "right", THREE.ArrowHelper> | null = null;
  private anchorMarkers: Record<"left" | "right", THREE.Mesh> | null = null;

  /** Last solved rope state, kept so the render path and the diagnostics
   * publish the exact same numbers the solver was given. */
  private lastRopes: { left: RopeSolution; right: RopeSolution } | null = null;

  private initialComXY: { x: number; y: number } | null = null;

  private readonly listeners = new Set<(snapshot: EngineSnapshot) => void>();
  private lastPublishMs = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init(statueParams: StatueParams, roadParams: RoadParams, ropeParams: RopeParams): Promise<void> {
    this.RAPIER = await getRapier();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070b14);
    this.scene.fog = new THREE.Fog(0x070b14, 20, 90);

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 1, CAMERA_NEAR, CAMERA_FAR);
    // Native z-up world (see ARCHITECTURE.md "Coordinate convention"):
    // camera.up must be set before OrbitControls is constructed.
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(6, -8, 4.5);
    this.camera.lookAt(0, 0, 1.2);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 1.2);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.update();

    this.addLighting();

    this.world = new this.RAPIER.World({ x: 0, y: 0, z: -GRAVITY_M_S2 });
    this.world.timestep = FIXED_TIMESTEP_S;

    this.roadParams = roadParams;
    this.road = buildFlatRoad({ RAPIER: this.RAPIER, world: this.world, scene: this.scene }, roadParams);

    this.statueParams = statueParams;
    this.ropeParams = ropeParams;
    this.rebuildStatue();
    this.initRopeVisuals();
    this.initialized = true;
    this.renderInterpolated(0);
  }

  private initRopeVisuals(): void {
    const makeLine = (): THREE.Line => {
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: ROPE_IDLE_COLOR }));
      this.scene.add(line);
      return line;
    };
    const makeArrow = (color: number): THREE.ArrowHelper => {
      const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.5, color);
      arrow.visible = false;
      this.scene.add(arrow);
      return arrow;
    };
    const makeMarker = (color: number): THREE.Mesh => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(ANCHOR_MARKER_RADIUS_M, 12, 10),
        new THREE.MeshBasicMaterial({ color })
      );
      this.scene.add(mesh);
      return mesh;
    };

    this.ropeLines = { left: makeLine(), right: makeLine() };
    this.ropeArrows = { left: makeArrow(ROPE_ACTIVE_COLORS.left), right: makeArrow(ROPE_ACTIVE_COLORS.right) };
    this.anchorMarkers = { left: makeMarker(ROPE_ACTIVE_COLORS.left), right: makeMarker(ROPE_ACTIVE_COLORS.right) };
  }

  private addLighting(): void {
    const ambient = new THREE.AmbientLight(0x8fa5c9, 0.55);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff2d8, 1.1);
    sun.position.set(8, -4, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 40;
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x83b8d7, 0.25);
    fill.position.set(-6, 5, 6);
    this.scene.add(fill);
  }

  private rebuildStatue(): void {
    this.statue?.dispose();
    this.statue = createStatue(
      this.statueParams,
      { RAPIER: this.RAPIER, world: this.world, scene: this.scene },
      this.roadParams.frictionCoefficient,
      this.roadParams.restitution
    );
    this.statue.colliderVisual.visible = this.showColliders;
    this.statue.comMarker.visible = this.showComMarker;

    const t = this.statue.rigidBody.translation();
    const r = this.statue.rigidBody.rotation();
    this.prevPos.set(t.x, t.y, t.z);
    this.currPos.copy(this.prevPos);
    this.prevQuat.set(r.x, r.y, r.z, r.w);
    this.currQuat.copy(this.prevQuat);

    const com = this.statue.rigidBody.worldCom();
    this.initialComXY = { x: com.x, y: com.y };

    this.simTimeS = 0;
    this.accumulatorS = 0;
    // everStarted deliberately not reset here: it means "has start() ever
    // been called", not "since the last rebuild" — resetting it on every
    // param tweak or Reset click stranded the status chip on gray forever
    // after the first rebuild despite the sim still running.
    this.lastRopes = null;
  }

  updateStatueParams(params: StatueParams): void {
    this.statueParams = params;
    this.rebuildStatue();
    this.publish();
  }

  updateRoadParams(params: RoadParams): void {
    this.roadParams = params;
    this.road?.dispose();
    this.road = buildFlatRoad({ RAPIER: this.RAPIER, world: this.world, scene: this.scene }, params);
  }

  /** Live friction/restitution update on the existing colliders — no
   * rebuild, no interruption to a run in progress. */
  updateContact(frictionCoefficient: number, restitution: number): void {
    this.roadParams = { ...this.roadParams, frictionCoefficient, restitution };
    if (this.road) {
      this.road.collider.setFriction(frictionCoefficient);
      this.road.collider.setRestitution(restitution);
    }
    this.statue?.colliders.forEach((collider) => {
      collider.setFriction(frictionCoefficient);
      collider.setRestitution(restitution);
    });
  }

  updateRopeParams(params: RopeParams): void {
    this.ropeParams = params;
    if (!this.running) this.publish();
  }

  /** The geometry the current statue was built from, so the UI can derive
   * default rope attachments without duplicating the math. */
  get statueGeometry() {
    return this.statue?.geometry ?? null;
  }

  setShowColliders(visible: boolean): void {
    this.showColliders = visible;
    if (this.statue) this.statue.colliderVisual.visible = visible;
  }

  setShowComMarker(visible: boolean): void {
    this.showComMarker = visible;
    if (this.statue) this.statue.comMarker.visible = visible;
  }

  setRopeHeld(side: "left" | "right", held: boolean): void {
    if (side === "left") this.held.leftHeld = held;
    else this.held.rightHeld = held;
  }

  reset(): void {
    this.rebuildStatue();
    this.publish();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.everStarted = true;
    this.lastFrameTimeMs = null;
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = null;
  }

  onResize(widthPx: number, heightPx: number): void {
    if (!this.initialized || widthPx <= 0 || heightPx <= 0) return;
    this.camera.aspect = widthPx / heightPx;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(widthPx, heightPx, false);
    if (!this.running) this.renderInterpolated(this.accumulatorS / FIXED_TIMESTEP_S);
  }

  subscribe(listener: (snapshot: EngineSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.stop();
    this.road?.dispose();
    this.statue?.dispose();
    if (this.ropeLines) {
      for (const line of Object.values(this.ropeLines)) {
        this.scene.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }
    }
    if (this.ropeArrows) {
      this.scene.remove(this.ropeArrows.left, this.ropeArrows.right);
    }
    if (this.anchorMarkers) {
      for (const marker of Object.values(this.anchorMarkers)) {
        this.scene.remove(marker);
        marker.geometry.dispose();
        (marker.material as THREE.Material).dispose();
      }
    }
    this.controls.dispose();
    this.renderer.dispose();
    this.listeners.clear();
  }

  private readonly tick = (nowMs: number): void => {
    if (!this.running) return;
    if (this.lastFrameTimeMs === null) this.lastFrameTimeMs = nowMs;
    const frameDtS = Math.min((nowMs - this.lastFrameTimeMs) / 1000, 0.25);
    this.lastFrameTimeMs = nowMs;
    this.accumulatorS += frameDtS;

    let steps = 0;
    while (this.accumulatorS >= FIXED_TIMESTEP_S && steps < MAX_SUBSTEPS_PER_FRAME) {
      this.stepPhysics();
      this.accumulatorS -= FIXED_TIMESTEP_S;
      steps++;
    }
    if (steps === MAX_SUBSTEPS_PER_FRAME) {
      // Dropped simulated time rather than spiral-of-death catch-up; the
      // tab was likely backgrounded. Documented rather than hidden.
      this.accumulatorS = 0;
    }

    this.renderInterpolated(this.accumulatorS / FIXED_TIMESTEP_S);
    this.maybePublish(nowMs);

    this.rafHandle = requestAnimationFrame(this.tick);
  };

  private bodyTranslation(): Vec3 {
    const t = this.statue!.rigidBody.translation();
    return { x: t.x, y: t.y, z: t.z };
  }

  private bodyRotation(): Quat {
    const r = this.statue!.rigidBody.rotation();
    return { x: r.x, y: r.y, z: r.z, w: r.w };
  }

  private comWorld(): Vec3 {
    const c = this.statue!.rigidBody.worldCom();
    return { x: c.x, y: c.y, z: c.z };
  }

  private stepPhysics(): void {
    if (!this.statue) return;
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);

    const ropes = solveRopes(
      this.ropeParams,
      this.held,
      this.bodyTranslation(),
      this.bodyRotation(),
      this.comWorld()
    );
    // Resets Rapier's persistent force/torque latch, then applies exactly this
    // step's rope forces. See control/ropeForces.ts for why the reset matters.
    applyRopeForces(this.statue.rigidBody, [ropes.left, ropes.right]);
    this.lastRopes = ropes;

    this.world.step();
    this.simTimeS += FIXED_TIMESTEP_S;

    const t = this.statue.rigidBody.translation();
    const r = this.statue.rigidBody.rotation();
    this.currPos.set(t.x, t.y, t.z);
    this.currQuat.set(r.x, r.y, r.z, r.w);
  }

  private renderInterpolated(alpha: number): void {
    if (this.statue) {
      this.scratchPos.copy(this.prevPos).lerp(this.currPos, alpha);
      this.scratchQuat.copy(this.prevQuat).slerp(this.currQuat, alpha);
      this.statue.visual.position.copy(this.scratchPos);
      this.statue.visual.quaternion.copy(this.scratchQuat);
      this.statue.colliderVisual.position.copy(this.scratchPos);
      this.statue.colliderVisual.quaternion.copy(this.scratchQuat);

      const com = this.statue.rigidBody.worldCom();
      this.statue.comMarker.position.set(com.x, com.y, com.z);

      this.updateRopeVisuals();
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Draws each rope from its statue attachment to its external anchor, and the
   * force arrow along the same direction the solver used.
   *
   * Both come from the same `RopeSolution` the physics consumed, so the picture
   * cannot disagree with the forces — the Phase 1 visual fabricated its own
   * unrelated ground anchor and drew the rope at one angle while the solver
   * pulled at another (PHASE1_FORCE_CONTACT_AUDIT.md §7.2).
   */
  private updateRopeVisuals(): void {
    if (!this.statue || !this.ropeLines || !this.ropeArrows || !this.anchorMarkers) return;

    // Solve against the interpolated render pose so ropes track the drawn
    // statue rather than the last physics tick.
    const renderPose = {
      translation: { x: this.scratchPos.x, y: this.scratchPos.y, z: this.scratchPos.z },
      rotation: {
        x: this.scratchQuat.x,
        y: this.scratchQuat.y,
        z: this.scratchQuat.z,
        w: this.scratchQuat.w
      }
    };
    const ropes = solveRopes(this.ropeParams, this.held, renderPose.translation, renderPose.rotation, this.comWorld());

    for (const side of ["left", "right"] as const) {
      const solution = ropes[side];
      const line = this.ropeLines[side];
      const arrow = this.ropeArrows[side];
      const marker = this.anchorMarkers[side];

      const positions = line.geometry.attributes.position as THREE.BufferAttribute;
      positions.setXYZ(0, solution.attachmentWorld.x, solution.attachmentWorld.y, solution.attachmentWorld.z);
      positions.setXYZ(1, solution.externalAnchor.x, solution.externalAnchor.y, solution.externalAnchor.z);
      positions.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      (line.material as THREE.LineBasicMaterial).color.setHex(
        solution.active ? ROPE_ACTIVE_COLORS[side] : ROPE_IDLE_COLOR
      );

      marker.position.set(solution.externalAnchor.x, solution.externalAnchor.y, solution.externalAnchor.z);

      arrow.visible = solution.active;
      if (solution.active) {
        const weightN = Math.max(this.statue.rigidBody.mass() * GRAVITY_M_S2, 1);
        const lengthM = THREE.MathUtils.clamp((solution.tensionN / weightN) * 1.2, 0.15, 2.5);
        arrow.position.set(
          solution.attachmentWorld.x,
          solution.attachmentWorld.y,
          solution.attachmentWorld.z
        );
        arrow.setDirection(
          new THREE.Vector3(solution.direction.x, solution.direction.y, solution.direction.z)
        );
        arrow.setLength(lengthM, lengthM * 0.25, lengthM * 0.15);
      }
    }
  }

  private contactCount(): number {
    if (!this.statue) return 0;
    let count = 0;
    for (const collider of this.statue.colliders) {
      this.world.contactPairsWith(collider, () => {
        count++;
      });
    }
    return count;
  }

  private normalForceProxyN(): number {
    if (!this.statue || !this.road) return 0;
    let impulse = 0;
    for (const collider of this.statue.colliders) {
      this.world.contactPair(collider, this.road.collider, (manifold) => {
        for (let i = 0; i < manifold.numContacts(); i++) impulse += manifold.contactImpulse(i);
      });
    }
    return impulse / FIXED_TIMESTEP_S;
  }

  private maybePublish(nowMs: number): void {
    const intervalMs = 1000 / READOUT_PUBLISH_HZ;
    if (nowMs - this.lastPublishMs < intervalMs) return;
    this.lastPublishMs = nowMs;
    this.publish();
  }

  private publish(): void {
    if (!this.statue) return;
    // Captured locally because the listener callback at the end of this method
    // is a closure, and TypeScript cannot carry the `this.statue` narrowing into
    // it.
    const statue = this.statue;
    const body = statue.rigidBody;
    const geometry = statue.geometry;

    const com = this.comWorld();
    const rot = body.rotation();
    const { roll, pitch, yaw } = quaternionToRollPitchYaw(rot.x, rot.y, rot.z, rot.w);
    const rollDeg = radToDeg(roll);
    const pitchDeg = radToDeg(pitch);

    const ropes =
      this.lastRopes ??
      solveRopes(this.ropeParams, this.held, this.bodyTranslation(), this.bodyRotation(), com);

    const lv = body.linvel();
    const av = body.angvel();
    const linvel = { x: lv.x, y: lv.y, z: lv.z };
    const angvel = { x: av.x, y: av.y, z: av.z };
    const speedMps = vecLength(linvel);
    const angularSpeedRadPerS = vecLength(angvel);

    const massKg = body.mass();

    // Thresholds are reported for whichever rope is actually loaded; with none
    // held, the left rope's geometry is shown as a preview of what a pull would
    // do. attachmentHeight/lateral come from that same rope so the reported
    // F_tip matches the reported direction.
    const reference = ropes.left.active ? ropes.left : ropes.right.active ? ropes.right : ropes.left;
    const referenceAttachmentLocal =
      reference.side === "left" ? this.ropeParams.left.attachmentLocal : this.ropeParams.right.attachmentLocal;

    const thresholds = computeThresholds({
      massKg,
      frictionCoefficient: this.roadParams.frictionCoefficient,
      contactHalfWidthY: geometry.base.contactHalfWidthY,
      contactKind: geometry.base.contactKind,
      attachmentHeightM: reference.attachmentWorld.z,
      attachmentLateralM: referenceAttachmentLocal.y,
      direction: reference.direction
    });

    const tippingAngleRad = staticTippingAngleRad(
      geometry.base.contactHalfWidthY,
      com.z,
      geometry.base.contactKind
    );
    const tippingAngleDeg = tippingAngleRad === null ? null : radToDeg(tippingAngleRad);

    const contactCount = this.contactCount();
    const regime = classifyRegime({
      contactCount,
      speedMps,
      angularSpeedRadPerS,
      rollDeg,
      appliedTensionN: ropes.left.tensionN + ropes.right.tensionN,
      tippingAngleDeg,
      thresholds: DEFAULT_REGIME_THRESHOLDS
    });

    const totalForceN = add(
      ropes.left.active ? ropes.left.force : { x: 0, y: 0, z: 0 },
      ropes.right.active ? ropes.right.force : { x: 0, y: 0, z: 0 }
    );
    const totalTorqueNm = add(
      ropes.left.active ? ropes.left.torqueAboutCom : { x: 0, y: 0, z: 0 },
      ropes.right.active ? ropes.right.torqueAboutCom : { x: 0, y: 0, z: 0 }
    );

    const dxM = this.initialComXY ? com.x - this.initialComXY.x : 0;
    const dyM = this.initialComXY ? com.y - this.initialComXY.y : 0;

    let status: RunStatus = "gray";
    if (this.everStarted) status = regime === "TOPPLING" || regime === "AIRBORNE" ? "red" : "yellow";

    const principal = body.principalInertia();

    this.listeners.forEach((fn) =>
      fn({
        simTimeS: this.simTimeS,
        running: this.running,
        status,
        regime,
        dxM,
        dyM,
        rollDeg,
        pitchDeg,
        yawDeg: radToDeg(yaw),
        intrinsicLeanDeg: radToDeg(geometry.forwardLeanRad),
        totalUpperBodyPitchDeg: radToDeg(geometry.forwardLeanRad) + pitchDeg,
        massKg,
        comWorld: com,
        comHeightM: com.z,
        comLocal: statue.mass.comLocal,
        principalInertia: { x: principal.x, y: principal.y, z: principal.z },
        comOverridden: statue.mass.comOverridden,
        components: statue.colliderInfo.map((info) => ({
          component: info.component,
          approximation: info.approximation
        })),
        baseFamily: this.statueParams.baseFamily,
        baseLabel: getBaseModule(this.statueParams.baseFamily).label,
        linvel,
        angvel,
        speedMps,
        angularSpeedDegPerS: radToDeg(angularSpeedRadPerS),
        ropes: { left: toDiagnostic(ropes.left), right: toDiagnostic(ropes.right) },
        totalForceN,
        totalTorqueNm,
        thresholds,
        tippingAngleDeg,
        contactCount,
        normalForceProxyN: this.normalForceProxyN(),
        frictionCoefficient: this.roadParams.frictionCoefficient,
        restitution: this.roadParams.restitution,
        baseHalfWidthM: geometry.base.contactHalfWidthY,
        contactKind: geometry.base.contactKind
      })
    );
  }
}

function toDiagnostic(solution: RopeSolution): RopeDiagnostic {
  return {
    side: solution.side,
    active: solution.active,
    tensionN: solution.tensionN,
    externalAnchor: solution.externalAnchor,
    attachmentWorld: solution.attachmentWorld,
    direction: solution.direction,
    force: solution.force,
    torqueAboutCom: solution.torqueAboutCom,
    ropeLengthM: solution.ropeLengthM
  };
}
