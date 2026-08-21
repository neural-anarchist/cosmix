// ============================================================
// CANVAS-GENERATED TEXTURES
// Every texture in Cosmix is procedural so the site ships with
// no binary image dependencies for the 3D scene.
// ============================================================
import * as THREE from "three";

function makeCanvas(size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

// Soft radial dot used for star points and glow sprites.
export function makeSoftDotTexture(size = 64, falloff = 0.3) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(falloff, "rgba(255,255,255,0.7)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Granulated stellar surface — used as the sun's base colour map.
export function makeSunTexture(size = 512) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, "#fff6d8");
  gradient.addColorStop(0.35, "#ffd27f");
  gradient.addColorStop(0.7, "#ff9d4d");
  gradient.addColorStop(1, "#c65a1f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 900; i++) {
    ctx.beginPath();
    ctx.fillStyle = Math.random() > 0.5 ? "#ffffff" : "#ff7a1f";
    ctx.arc(
      Math.random() * size,
      Math.random() * size,
      Math.random() * 10 + 2,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Cratered rust surface for The Trials.
export function makeMarsTexture(size = 256) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#a8452c";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 260; i++) {
    ctx.globalAlpha = Math.random() * 0.25 + 0.05;
    ctx.fillStyle = Math.random() > 0.5 ? "#7a2f1c" : "#c96b45";
    ctx.beginPath();
    ctx.arc(
      Math.random() * size,
      Math.random() * size,
      Math.random() * 8 + 2,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Tinted additive halo sprite. Unlike the previous implementation
// this actually honours the colour it is handed.
export function makeGlowSprite(color, size) {
  const canvas = makeCanvas(128);
  const ctx = canvas.getContext("2d");
  const tint = new THREE.Color(color);
  const r = Math.round(tint.r * 255);
  const g = Math.round(tint.g * 255);
  const b = Math.round(tint.b * 255);

  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
  gradient.addColorStop(0.4, `rgba(${r},${g},${b},0.35)`);
  gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    })
  );
  sprite.scale.set(size, size, 1);
  return sprite;
}
