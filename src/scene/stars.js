// ============================================================
// STARFIELD
// Three counter-drifting parallax layers. A custom shader is used
// so the per-star size and twinkle phase actually reach the GPU —
// PointsMaterial silently ignores a per-vertex size attribute.
// ============================================================
import * as THREE from "three";
import { STAR_LAYERS } from "../config.js";

const STAR_PALETTE = [
  new THREE.Color(0xffffff),
  new THREE.Color(0xcfe0ff),
  new THREE.Color(0xffe9c4),
  new THREE.Color(0xd7b470),
  new THREE.Color(0xffd0d0)
];

function createLayer(layer, pixelRatio) {
  const { count, innerRadius, outerRadius } = layer;

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const radius = innerRadius + Math.random() * (outerRadius - innerRadius);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    const i3 = i * 3;
    positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = radius * Math.cos(phi);
    positions[i3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

    const color = STAR_PALETTE[Math.floor(Math.random() * STAR_PALETTE.length)];
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;

    // Squared distribution: many faint stars, a few bright ones.
    sizes[i] = layer.size * (0.35 + Math.pow(Math.random(), 2.2) * 1.9);
    phases[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uOpacity: { value: layer.opacity }
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aPhase;

      uniform float uTime;
      uniform float uPixelRatio;

      varying vec3 vColor;
      varying float vTwinkle;

      void main() {
        vColor = aColor;

        // Each star keeps its own phase so the field shimmers
        // instead of pulsing in unison.
        vTwinkle = 0.62 + 0.38 * sin(uTime * 1.4 + aPhase * 6.28318);

        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPixelRatio * (140.0 / max(-mv.z, 0.001));
        gl_PointSize = clamp(gl_PointSize, 0.5, 28.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;

      varying vec3 vColor;
      varying float vTwinkle;

      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p) * 2.0;

        float halo = smoothstep(1.0, 0.0, d);
        float core = smoothstep(0.45, 0.0, d);
        float alpha = (halo * 0.55 + core * 0.75) * vTwinkle * uOpacity;

        if (alpha < 0.004) discard;
        gl_FragColor = vec4(vColor * (0.7 + vTwinkle * 0.5), alpha);
      }
    `
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -8;
  return { points, material, drift: layer.drift };
}

export function createStars(scene, pixelRatio) {
  const layers = STAR_LAYERS.map(function (layer) {
    const created = createLayer(layer, pixelRatio);
    scene.add(created.points);
    return created;
  });

  return {
    update(elapsed, delta) {
      layers.forEach(function (layer, index) {
        layer.material.uniforms.uTime.value = elapsed;
        // Alternate direction per layer to deepen the parallax.
        const direction = index % 2 === 0 ? 1 : -1;
        layer.points.rotation.y += layer.drift * direction * delta * 60;
      });
    },
    setPixelRatio(value) {
      layers.forEach(function (layer) {
        layer.material.uniforms.uPixelRatio.value = value;
      });
    },
    dispose() {
      layers.forEach(function (layer) {
        layer.points.geometry.dispose();
        layer.material.dispose();
      });
    }
  };
}
