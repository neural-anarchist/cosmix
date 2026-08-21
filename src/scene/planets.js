// ============================================================
// WORLDS
// Each world keeps its distinct silhouette from the original
// design (crystal / terrain / ringed / station) but now carries a
// Fresnel atmosphere and a comet-style orbit trail.
// ============================================================
import * as THREE from "three";
import { WORLDS, PALETTE } from "../config.js";
import { makeMarsTexture, makeGlowSprite } from "./textures.js";

const TAU = Math.PI * 2;

// ------------------------------------------------------------
// Fresnel atmosphere shell — the single biggest "these look real"
// upgrade. Rim brightness falls off with view angle.
// ------------------------------------------------------------
function createAtmosphere(radius, color, intensity = 0.85, power = 3.0) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uPower: { value: power }
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalV;
      varying vec3 vViewDir;

      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalV = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uPower;

      varying vec3 vNormalV;
      varying vec3 vViewDir;

      void main() {
        float rim = 1.0 - abs(dot(normalize(vNormalV), normalize(vViewDir)));
        float glow = pow(rim, uPower);
        gl_FragColor = vec4(uColor, glow * uIntensity);
      }
    `
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.28, 32, 32), material);
  mesh.renderOrder = 2;
  return { mesh, material };
}

// ------------------------------------------------------------
// Orbit trail: a faint full ring plus a head-relative gradient so
// the brightest arc is the path the world just swept through.
// ------------------------------------------------------------
function createOrbitTrail(radius, tilt, color) {
  const segments = 256;
  const positions = new Float32Array((segments + 1) * 3);
  const angles = new Float32Array(segments + 1);

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * TAU;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
    angles[i] = angle;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aAngle", new THREE.BufferAttribute(angles, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: {
      uHead: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uBoost: { value: 0 }
    },
    vertexShader: /* glsl */ `
      attribute float aAngle;
      uniform float uHead;
      varying float vAlpha;

      void main() {
        // Angular distance travelling *backwards* from the world.
        float d = mod(uHead - aAngle, 6.2831853) / 6.2831853;
        vAlpha = mix(0.75, 0.05, pow(d, 0.45));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uBoost;
      varying float vAlpha;

      void main() {
        gl_FragColor = vec4(uColor, vAlpha * (0.4 + uBoost * 0.6));
      }
    `
  });

  const line = new THREE.Line(geometry, material);
  line.rotation.x = tilt;
  line.frustumCulled = false;
  return { line, material };
}

// ------------------------------------------------------------
// Style builders
// ------------------------------------------------------------
function buildCrystal(world) {
  const globe = new THREE.Mesh(
    new THREE.IcosahedronGeometry(world.size, 0),
    new THREE.MeshStandardMaterial({
      color: world.color,
      flatShading: true,
      roughness: 0.35,
      metalness: 0.4,
      emissive: world.color,
      emissiveIntensity: 0.28
    })
  );

  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(world.size * 1.4, 0),
    new THREE.MeshBasicMaterial({
      color: world.color,
      wireframe: true,
      transparent: true,
      opacity: 0.45
    })
  );

  return { globe, extras: [shell], shell };
}

function buildMars(world) {
  const geometry = new THREE.SphereGeometry(world.size, 64, 64);
  const position = geometry.attributes.position;
  const vertex = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    const n = vertex.clone().normalize();
    const noise =
      Math.sin(n.x * 7.3 + n.y * 4.1) * 0.5 +
      Math.sin(n.y * 9.7 + n.z * 6.5) * 0.35 +
      Math.sin(n.z * 12.1 + n.x * 5.9) * 0.25 +
      Math.sin(n.x * 21.0 * n.y * 3.0) * 0.12;
    vertex.multiplyScalar(1 + noise * 0.075);
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  geometry.computeVertexNormals();

  const globe = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      map: makeMarsTexture(),
      roughness: 0.95,
      metalness: 0.02,
      // A touch of self-illumination keeps the night side from
      // reading as a hole cut out of the nebula behind it.
      emissive: 0x35150c,
      emissiveIntensity: 1
    })
  );

  return { globe, extras: [] };
}

function buildRings(world) {
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(world.size, 48, 48),
    new THREE.MeshStandardMaterial({
      color: world.color,
      roughness: 0.4,
      metalness: 0.3,
      emissive: world.color,
      emissiveIntensity: 0.12
    })
  );

  const ringGroup = new THREE.Group();
  const configs = [
    { radius: world.size * 1.6, tube: 0.018, tiltX: 1.35, tiltZ: 0.1, color: world.color, opacity: 0.55 },
    { radius: world.size * 2.0, tube: 0.012, tiltX: 0.9, tiltZ: 0.6, color: 0xcfe0ff, opacity: 0.35 },
    { radius: world.size * 2.4, tube: 0.009, tiltX: 0.3, tiltZ: 1.1, color: world.color, opacity: 0.25 }
  ];

  const rings = configs.map(function (config) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(config.radius, config.tube, 8, 96),
      new THREE.MeshBasicMaterial({
        color: config.color,
        transparent: true,
        opacity: config.opacity
      })
    );
    ring.rotation.x = config.tiltX;
    ring.rotation.z = config.tiltZ;
    ringGroup.add(ring);
    return ring;
  });

  return { globe, extras: [ringGroup], rings };
}

function buildStation(world) {
  const group = new THREE.Group();
  const s = world.size;

  const hull = new THREE.MeshStandardMaterial({
    color: 0xc7ccd6,
    metalness: 0.75,
    roughness: 0.3
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x1c222c,
    metalness: 0.5,
    roughness: 0.5
  });
  const glow = new THREE.MeshStandardMaterial({
    color: PALETTE.violet,
    emissive: 0xb388ff,
    emissiveIntensity: 2.4,
    metalness: 0.2,
    roughness: 0.3
  });

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(s * 0.55, s * 0.55, s * 1.1, 20),
    hull
  );
  hub.rotation.z = Math.PI / 2;
  group.add(hub);

  const capLeft = new THREE.Mesh(
    new THREE.SphereGeometry(s * 0.55, 20, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    hull
  );
  capLeft.rotation.z = -Math.PI / 2;
  capLeft.position.x = -s * 0.55;
  const capRight = capLeft.clone();
  capRight.rotation.z = Math.PI / 2;
  capRight.position.x = s * 0.55;
  group.add(capLeft, capRight);

  const collarGeometry = new THREE.TorusGeometry(s * 0.58, s * 0.05, 8, 24);
  [-s * 0.25, 0, s * 0.25].forEach(function (x) {
    const collar = new THREE.Mesh(collarGeometry, dark);
    collar.rotation.y = Math.PI / 2;
    collar.position.x = x;
    group.add(collar);
  });

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(s * 1.9, s * 0.045, 10, 72),
    new THREE.MeshStandardMaterial({
      color: 0xc7ccd6,
      emissive: 0x7c4dff,
      emissiveIntensity: 0.6,
      metalness: 0.6,
      roughness: 0.4
    })
  );
  group.add(ring);

  const spokeGeometry = new THREE.CylinderGeometry(s * 0.02, s * 0.02, s * 1.9, 6);
  [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach(function (angle) {
    const spoke = new THREE.Mesh(spokeGeometry, dark);
    spoke.rotation.z = Math.PI / 2;
    spoke.position.set(Math.cos(angle) * s * 0.95, Math.sin(angle) * s * 0.95, 0);
    spoke.rotation.y = angle;
    group.add(spoke);
  });

  const panelGeometry = new THREE.BoxGeometry(s * 0.06, s * 1.7, s * 0.7);
  const panelLeft = new THREE.Mesh(panelGeometry, dark);
  panelLeft.position.set(0, 0, -s * 1.5);
  const panelRight = new THREE.Mesh(panelGeometry, dark);
  panelRight.position.set(0, 0, s * 1.5);
  group.add(panelLeft, panelRight);

  const strutGeometry = new THREE.CylinderGeometry(s * 0.02, s * 0.02, s * 0.8, 6);
  const strutLeft = new THREE.Mesh(strutGeometry, dark);
  strutLeft.rotation.x = Math.PI / 2;
  strutLeft.position.set(0, 0, -s * 1.0);
  const strutRight = new THREE.Mesh(strutGeometry, dark);
  strutRight.rotation.x = Math.PI / 2;
  strutRight.position.set(0, 0, s * 1.0);
  group.add(strutLeft, strutRight);

  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(s * 0.015, s * 0.015, s * 0.8, 6),
    hull
  );
  antenna.position.set(0, s * 0.85, 0);
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(s * 0.12, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    hull
  );
  dish.rotation.x = Math.PI;
  dish.position.set(0, s * 1.25, 0);
  group.add(antenna, dish);

  const lights = [];
  [
    [s * 0.6, 0, 0],
    [-s * 0.6, 0, 0],
    [0, 0, s * 0.6],
    [0, 0, -s * 0.6]
  ].forEach(function (pos) {
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(s * 0.04, 8, 8),
      glow.clone()
    );
    light.position.set(pos[0], pos[1], pos[2]);
    group.add(light);
    lights.push(light);
  });

  group.add(new THREE.PointLight(PALETTE.violet, 6, world.size * 8, 2));
  group.add(makeGlowSprite(PALETTE.violet, world.size * 3.2));

  return { globe: group, extras: [], ring, lights };
}

const BUILDERS = {
  crystal: buildCrystal,
  mars: buildMars,
  rings: buildRings,
  station: buildStation
};

// ------------------------------------------------------------
function createMoon(config) {
  const pivot = new THREE.Group();
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(config.size, 24, 24),
    new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.85,
      metalness: 0.05
    })
  );
  moon.position.x = config.distance;
  pivot.add(moon);
  pivot.rotation.x = 0.4;
  return { pivot, speed: config.speed };
}

// ------------------------------------------------------------
export function createWorlds(scene, activeId) {
  const list = activeId
    ? WORLDS.filter(function (w) { return w.id === activeId; })
    : WORLDS;

  const worlds = list.map(function (world) {
    const group = new THREE.Group();
    const built = (BUILDERS[world.style] || buildCrystal)(world);

    group.add(built.globe);
    built.extras.forEach(function (extra) { group.add(extra); });

    // The station is an assembly, not a globe, so it gets a wider
    // and softer shell than the solid bodies.
    const atmosphere = createAtmosphere(
      world.size,
      world.atmosphere,
      world.style === "station" ? 0.5 : 0.85,
      world.style === "station" ? 2.2 : 3.0
    );
    group.add(atmosphere.mesh);

    let moon = null;
    if (world.moon) {
      moon = createMoon(world.moon);
      group.add(moon.pivot);
    }

    const trail = createOrbitTrail(
      world.orbitRadius,
      world.orbitTilt,
      world.style === "station" ? PALETTE.violet : world.color
    );
    scene.add(trail.line);
    scene.add(group);

    group.userData = { world };

    return {
      world,
      group,
      globe: built.globe,
      shell: built.shell || null,
      rings: built.rings || null,
      ring: built.ring || null,
      lights: built.lights || null,
      atmosphere,
      moon,
      trail,
      angle: world.startAngle,
      hover: 0,
      targetHover: 0
    };
  });

  function positionAt(entry, angle) {
    const { orbitRadius: r, orbitTilt: tilt } = entry.world;
    return new THREE.Vector3(
      r * Math.cos(angle),
      -r * Math.sin(angle) * Math.sin(tilt),
      r * Math.sin(angle) * Math.cos(tilt)
    );
  }

  // Place everything before the first frame so nothing pops in.
  worlds.forEach(function (entry) {
    entry.group.position.copy(positionAt(entry, entry.angle));
    entry.trail.material.uniforms.uHead.value = entry.angle;
  });

  return {
    entries: worlds,
    pickTargets: worlds.map(function (entry) { return entry.group; }),

    update(elapsed, delta, moving) {
      const step = delta * 60;

      worlds.forEach(function (entry) {
        if (moving) {
          entry.angle += entry.world.orbitSpeed * 0.005 * step;
          entry.group.position.copy(positionAt(entry, entry.angle));
          entry.trail.material.uniforms.uHead.value = entry.angle;

          entry.globe.rotation.y += entry.world.spin * step;

          if (entry.shell) {
            entry.shell.rotation.y -= 0.006 * step;
            entry.shell.rotation.x += 0.002 * step;
          }
          if (entry.rings) {
            entry.rings.forEach(function (ring, i) {
              ring.rotation.z += 0.0025 * (i % 2 === 0 ? 1 : -1) * step;
            });
          }
          if (entry.ring) {
            entry.ring.rotation.z += 0.004 * step;
          }
          if (entry.lights) {
            const pulse = 0.6 + Math.sin(elapsed * 3.0) * 0.4;
            entry.lights.forEach(function (light) {
              light.material.emissiveIntensity = 0.8 + pulse * 0.8;
            });
          }
          if (entry.moon) {
            entry.moon.pivot.rotation.y += entry.moon.speed * 0.01 * step;
          }
        }

        // Damped hover response — the original snapped instantly.
        entry.hover += (entry.targetHover - entry.hover) * Math.min(1, delta * 9);
        const scale = 1 + entry.hover * 0.16;
        entry.group.scale.setScalar(scale);
        entry.atmosphere.material.uniforms.uIntensity.value =
          (entry.world.style === "station" ? 0.5 : 0.85) + entry.hover * 0.9;
        entry.trail.material.uniforms.uBoost.value = entry.hover;
      });
    },

    setHover(group) {
      worlds.forEach(function (entry) {
        entry.targetHover = entry.group === group ? 1 : 0;
      });
    },

    findByGroup(group) {
      return worlds.find(function (entry) { return entry.group === group; }) || null;
    },

    findById(id) {
      return worlds.find(function (entry) { return entry.world.id === id; }) || null;
    }
  };
}
