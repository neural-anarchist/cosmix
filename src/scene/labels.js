// ============================================================
// WORLD LABELS
// Persistent HTML labels billboarded to each world via CSS2D, so
// you can read the map without hover-hunting. They fade with
// distance and lift on hover.
// ============================================================
import * as THREE from "three";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

export function createLabels(entries, container) {
  const renderer = new CSS2DRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.className = "label-layer";
  container.appendChild(renderer.domElement);

  const labels = entries.map(function (entry) {
    const el = document.createElement("div");
    el.className = "world-label";
    el.innerHTML = `
      <span class="world-label-dot" aria-hidden="true"></span>
      <span class="world-label-text">${entry.world.label}</span>
      <span class="world-label-kicker">${entry.world.kicker.split("·")[1] || ""}</span>
    `;

    const object = new CSS2DObject(el);
    // Hug the world closely: pushed further out, a label drifts far
    // enough to land on whichever world is sitting behind it.
    object.position.set(0, entry.world.size * 1.75 + 0.15, 0);
    object.center.set(0.5, 1);
    entry.group.add(object);

    return { entry, el, object };
  });

  const worldPos = new THREE.Vector3();

  return {
    domElement: renderer.domElement,

    update(camera) {
      labels.forEach(function (label) {
        label.entry.group.getWorldPosition(worldPos);
        const distance = camera.position.distanceTo(worldPos);

        // Labels rest quiet so four of them never fight each other or
        // the hero, then come fully forward on hover.
        const far = THREE.MathUtils.clamp(1 - (distance - 18) / 30, 0.1, 1);
        const opacity = Math.min(1, far * 0.5 + label.entry.hover * 0.9);

        label.el.style.opacity = opacity.toFixed(3);
        label.el.classList.toggle("is-active", label.entry.hover > 0.5);
      });
    },

    render(scene, camera) {
      renderer.render(scene, camera);
    },

    setSize(width, height) {
      renderer.setSize(width, height);
    },

    setVisible(visible) {
      renderer.domElement.style.display = visible ? "" : "none";
    }
  };
}
