// ============================================================
// CAMERA RIG
// OrbitControls for free 3D control, plus an eased fly-to used
// when a world is selected. Controls are suspended mid-flight so
// user input and the tween never fight each other.
// ============================================================
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CAMERA } from "../config.js";

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function createCameraRig(camera, domElement) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.zoomSpeed = 0.75;
  controls.rotateSpeed = 0.55;
  controls.minDistance = CAMERA.minDistance;
  controls.maxDistance = CAMERA.maxDistance;
  controls.minPolarAngle = CAMERA.minPolarAngle;
  controls.maxPolarAngle = CAMERA.maxPolarAngle;
  controls.target.set(0, 0, 0);

  camera.position.set(CAMERA.home.x, CAMERA.home.y, CAMERA.home.z);
  controls.update();

  let flight = null;
  let autoSpin = 0;

  const fromPos = new THREE.Vector3();
  const fromTarget = new THREE.Vector3();
  const toPos = new THREE.Vector3();
  const toTarget = new THREE.Vector3();

  function flyTo(targetPoint, distance, duration = CAMERA.flyDuration) {
    fromPos.copy(camera.position);
    fromTarget.copy(controls.target);
    toTarget.copy(targetPoint);

    // Approach along the current view direction so the move reads as
    // a push-in rather than a teleport, with a little added elevation.
    const direction = new THREE.Vector3()
      .subVectors(camera.position, controls.target)
      .normalize();
    if (direction.lengthSq() < 0.0001) direction.set(0, 0.4, 1).normalize();
    direction.y = Math.max(direction.y, 0.22);
    direction.normalize();

    toPos.copy(targetPoint).addScaledVector(direction, distance);

    flight = { start: performance.now(), duration };
    controls.enabled = false;
  }

  function focusOn(point, radius) {
    const distance = Math.max(
      CAMERA.focusMinDistance,
      radius * CAMERA.focusDistanceFactor
    );
    flyTo(point, distance);
  }

  function goHome() {
    flyTo(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(CAMERA.home.x, CAMERA.home.y, CAMERA.home.z).length()
    );
  }

  // Cinematic sweep used by "Explore the map".
  function sweep() {
    autoSpin = 1;
    goHome();
  }

  function update(delta) {
    if (flight) {
      const elapsed = performance.now() - flight.start;
      const t = Math.min(1, elapsed / flight.duration);
      const eased = easeInOutCubic(t);

      camera.position.lerpVectors(fromPos, toPos, eased);
      controls.target.lerpVectors(fromTarget, toTarget, eased);

      if (t >= 1) {
        flight = null;
        controls.enabled = true;
      }
    } else if (autoSpin > 0) {
      // Gentle drift that decays back to manual control.
      const angle = 0.12 * delta * autoSpin;
      const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      camera.position.copy(controls.target).add(offset);
      autoSpin = Math.max(0, autoSpin - delta * 0.12);
    }

    controls.update();
  }

  // Any manual interaction cancels the cinematic drift.
  controls.addEventListener("start", function () {
    autoSpin = 0;
  });

  return {
    controls,
    update,
    focusOn,
    goHome,
    sweep,
    get isFlying() {
      return flight !== null;
    }
  };
}
