// ============================================================
// NEBULA
// Two cooperating layers:
//   1. a deep fBm shader shell that fills the whole sky
//   2. instanced billboard wisps drifting in the mid-ground,
//      which is what sells parallax when the camera orbits
// ============================================================
import * as THREE from "three";
import { NEBULA, PALETTE } from "../config.js";
import { NOISE_CHUNK } from "./glsl.js";

const TAU = Math.PI * 2;

// ------------------------------------------------------------
// Layer 1 — background shell
// ------------------------------------------------------------
function createShell() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uBase: { value: new THREE.Color(PALETTE.space) },
      uCloudA: { value: new THREE.Color(0x1b2f5c) },
      uCloudB: { value: new THREE.Color(0x4a2a6b) },
      uCloudC: { value: new THREE.Color(PALETTE.blue) },
      uBand: { value: new THREE.Color(0x8fa6d8) }
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uBase;
      uniform vec3 uCloudA;
      uniform vec3 uCloudB;
      uniform vec3 uCloudC;
      uniform vec3 uBand;
      varying vec3 vDir;

      ${NOISE_CHUNK}

      void main() {
        vec3 dir = normalize(vDir);
        float t = uTime * 0.012;

        // Two drifting octave sets give the clouds internal motion
        // without ever looking like a scrolling texture.
        vec3 q = dir * 2.1;
        float base = cxFbm4(q + vec3(t, t * 0.3, -t * 0.6));
        float detail = cxFbm3(q * 3.4 + vec3(-t * 0.8, t * 0.5, t * 0.7));

        float clouds = smoothstep(0.32, 0.92, base * 0.78 + detail * 0.34);
        float hot = smoothstep(0.62, 1.0, detail);

        // Milky Way band across a tilted axis.
        float axis = dot(dir, normalize(vec3(0.34, 1.0, 0.16)));
        float band = exp(-pow(axis * 2.6, 2.0));
        float bandNoise = cxFbm2(dir * 6.0 + vec3(t * 0.4));

        vec3 col = uBase;
        col = mix(col, uCloudA, clouds * 0.55);
        col = mix(col, uCloudB, hot * 0.30);
        col += uCloudC * clouds * 0.06;
        col += uBand * band * (0.05 + bandNoise * 0.09);

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `
  });

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(NEBULA.shellRadius, 48, 32),
    material
  );
  shell.renderOrder = -10;
  shell.frustumCulled = false;
  return { mesh: shell, material };
}

// ------------------------------------------------------------
// Layer 2 — instanced billboard wisps
// One draw call. Billboarding happens in view space, so unlike
// point sprites these never clip when their centre leaves frame.
// ------------------------------------------------------------
function createWisps() {
  const count = NEBULA.wispCount;

  const base = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.attributes.position = base.attributes.position;
  geometry.attributes.uv = base.attributes.uv;
  geometry.instanceCount = count;

  const offsets = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const phases = new Float32Array(count);
  const seeds = new Float32Array(count);

  const tints = [
    new THREE.Color(0x2f4f8f),
    new THREE.Color(0x5a3a8a),
    new THREE.Color(PALETTE.blue),
    new THREE.Color(PALETTE.violet),
    new THREE.Color(0x8a5a3a)
  ];

  for (let i = 0; i < count; i++) {
    const radius =
      NEBULA.wispInner + Math.random() * (NEBULA.wispOuter - NEBULA.wispInner);
    const theta = Math.random() * TAU;
    // Bias toward a band so the wisps read as one cloud structure
    // rather than an even shell of blobs.
    const phi = Math.acos(2 * Math.random() - 1) * 0.75 + Math.PI * 0.125;

    const i3 = i * 3;
    offsets[i3] = radius * Math.sin(phi) * Math.cos(theta);
    offsets[i3 + 1] = radius * Math.cos(phi) * 0.55;
    offsets[i3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

    const tint = tints[Math.floor(Math.random() * tints.length)];
    colors[i3] = tint.r;
    colors[i3 + 1] = tint.g;
    colors[i3 + 2] = tint.b;

    scales[i] =
      NEBULA.wispMinScale +
      Math.random() * (NEBULA.wispMaxScale - NEBULA.wispMinScale);
    phases[i] = Math.random();
    seeds[i] = Math.random() * TAU;
  }

  geometry.setAttribute("iOffset", new THREE.InstancedBufferAttribute(offsets, 3));
  geometry.setAttribute("iColor", new THREE.InstancedBufferAttribute(colors, 3));
  geometry.setAttribute("iScale", new THREE.InstancedBufferAttribute(scales, 1));
  geometry.setAttribute("iPhase", new THREE.InstancedBufferAttribute(phases, 1));
  geometry.setAttribute("iSeed", new THREE.InstancedBufferAttribute(seeds, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.16 }
    },
    vertexShader: /* glsl */ `
      attribute vec3 iOffset;
      attribute vec3 iColor;
      attribute float iScale;
      attribute float iPhase;
      attribute float iSeed;

      uniform float uTime;

      varying vec2 vUv;
      varying vec3 vColor;
      varying float vSeed;

      void main() {
        vUv = uv;
        vColor = iColor;
        vSeed = iSeed;

        // Slow rotation keeps overlapping wisps from looking stamped.
        float angle = iSeed + uTime * 0.01 * (0.4 + iPhase);
        float s = sin(angle);
        float c = cos(angle);
        vec2 p = position.xy * iScale;
        vec2 rotated = vec2(p.x * c - p.y * s, p.x * s + p.y * c);

        // Billboard by offsetting in view space.
        vec4 mv = modelViewMatrix * vec4(iOffset, 1.0);
        mv.xy += rotated;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform float uTime;

      varying vec2 vUv;
      varying vec3 vColor;
      varying float vSeed;

      void main() {
        vec2 p = vUv - 0.5;
        float d = length(p) * 2.0;

        // Angular ripple breaks the perfect circle into a wisp.
        float a = atan(p.y, p.x);
        float ripple = 0.78
          + 0.22 * sin(a * 3.0 + vSeed)
          + 0.12 * sin(a * 5.0 - vSeed * 1.7);

        float alpha = smoothstep(ripple, 0.0, d);
        alpha = pow(alpha, 2.4);

        gl_FragColor = vec4(vColor, alpha * uOpacity);
        if (gl_FragColor.a < 0.002) discard;
      }
    `
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -5;
  return { mesh, material };
}

// ------------------------------------------------------------
export function createNebula(scene) {
  const shell = createShell();
  const wisps = createWisps();

  scene.add(shell.mesh);
  scene.add(wisps.mesh);

  return {
    update(elapsed) {
      shell.material.uniforms.uTime.value = elapsed;
      wisps.material.uniforms.uTime.value = elapsed;
    },
    dispose() {
      shell.mesh.geometry.dispose();
      shell.material.dispose();
      wisps.mesh.geometry.dispose();
      wisps.material.dispose();
    }
  };
}
