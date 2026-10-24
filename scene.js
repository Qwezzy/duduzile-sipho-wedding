/* Three.js backdrop for the horizontal variant.
   - Two interlocking champagne-gold rings that turn slowly, tilt with the pointer and roll away as you move through the cards
   - Drifting petals in the wedding colours (chocolate, champagne, white) that fall past the camera
   - Soft gold dust with depth
   The camera pans sideways with window.hzProgress (set by hz.js), so the scene parallaxes behind the cards.
   Falls back to the plain gradient if WebGL is unavailable; renders one still frame for reduced motion. */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const canvas = document.getElementById("stage");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = matchMedia("(max-width: 700px)").matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
} catch (_) { canvas.remove(); }

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf2eadd, 9, 26);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
  camera.position.set(0, 0, 10);

  /* Reflections for the metal: a neutral studio room, warmed by the lights below */
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0xd8c3a0, 0.6));
  const key = new THREE.DirectionalLight(0xfff1dc, 1.6); key.position.set(4, 6, 8); scene.add(key);

  const SPAN = 18;   // how far the camera travels from the first card to the last

  /* ---- Rings ---- */
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8b47a, metalness: 1, roughness: 0.22 });
  const rose = new THREE.MeshStandardMaterial({ color: 0xe6cfae, metalness: 1, roughness: 0.3 });
  const ringGeo = new THREE.TorusGeometry(1.15, 0.12, 48, 160);
  const rings = new THREE.Group();
  const r1 = new THREE.Mesh(ringGeo, gold); r1.rotation.set(0.35, 0.5, 0);
  const r2 = new THREE.Mesh(ringGeo, rose); r2.position.x = 1.25; r2.rotation.set(-0.3, -0.55, 0.9);
  rings.add(r1, r2);
  /* a small solitaire on the first ring */
  const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0, transmission: 0.9, thickness: 0.4, ior: 2.4 }));
  stone.position.set(0, 1.3, 0); r1.add(stone);
  scene.add(rings);

  /* ---- Petals: instanced, curved planes in the three wedding colours ---- */
  const petalGeo = new THREE.PlaneGeometry(0.34, 0.5, 4, 4);
  const pos = petalGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {                // cup the petal a little
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, (x * x) * 1.6 - (y * y) * 0.35);
    pos.setX(i, x * (1 - Math.abs(y) * 0.9));          // taper to a tip
  }
  petalGeo.computeVertexNormals();
  const petalMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.65, metalness: 0 });
  const COUNT = small ? 70 : 140;
  const petals = new THREE.InstancedMesh(petalGeo, petalMat, COUNT);
  const palette = [new THREE.Color(0x4a2c1d), new THREE.Color(0xd8c3a0), new THREE.Color(0xfcfaf6), new THREE.Color(0xa8845a)];
  const seeds = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < COUNT; i++) {
    seeds.push({
      x: (Math.random() - 0.2) * (SPAN + 14), y: Math.random() * 14 - 7, z: -Math.random() * 12 + 2,
      vy: 0.25 + Math.random() * 0.35, sway: Math.random() * 6.28, spin: (Math.random() - 0.5) * 1.6,
      rx: Math.random() * 6.28, ry: Math.random() * 6.28, sc: 0.6 + Math.random() * 0.8
    });
    petals.setColorAt(i, palette[i % 4 === 0 ? 0 : i % 4 === 1 ? 1 : i % 4 === 2 ? 2 : 3]);
  }
  petals.instanceColor.needsUpdate = true;
  scene.add(petals);

  /* ---- Gold dust ---- */
  const dotTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,240,210,1)"); grd.addColorStop(0.35, "rgba(216,180,122,.6)"); grd.addColorStop(1, "rgba(216,180,122,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const DUST = small ? 500 : 1100;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = (Math.random() - 0.2) * (SPAN + 16);
    dustPos[i * 3 + 1] = Math.random() * 14 - 7;
    dustPos[i * 3 + 2] = -Math.random() * 16 + 3;
  }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ map: dotTex, size: 0.13, transparent: true, depthWrite: false, opacity: 0.85, sizeAttenuation: true }));
  scene.add(dust);

  /* ---- Sizing, pointer, loop ---- */
  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    /* keep the rings in view to the side of the hero card on wide screens, above it on phones */
    /* wide: centre the rings in the left third, beside the opening card. Narrow: they wait in the gap after it */
    const wide = w >= 900 && w / h >= 1.25;
    const visW = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z * camera.aspect;
    rings.scale.setScalar(Math.min(1.1, (visW * 0.26) / 3.6));
    rings.position.set(wide ? -visW / 2 + visW * 0.17 - 0.6 * rings.scale.x : visW * 0.5, wide ? 0 : 0.4, 0);
  };
  addEventListener("resize", resize); resize();

  let px = 0, py = 0, tx = 0, ty = 0;
  addEventListener("pointermove", (ev) => { tx = ev.clientX / innerWidth - 0.5; ty = ev.clientY / innerHeight - 0.5; }, { passive: true });

  const clock = new THREE.Clock();
  let prog = 0, visible = true;
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; if (visible) clock.getDelta(); });

  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    prog += ((window.hzProgress || 0) - prog) * 0.08;      // ease towards the track position
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;

    camera.position.x = prog * SPAN + px * 0.8;
    camera.position.y = -py * 0.6;
    camera.lookAt(camera.position.x + px * 0.6, -py * 0.3, 0);

    rings.rotation.y = t * 0.25 + px * 0.6 + prog * 4;
    rings.rotation.x = Math.sin(t * 0.4) * 0.15 + py * 0.4;
    rings.position.y += (Math.sin(t * 0.8) * 0.002);
    stone.rotation.y = t * 1.2;

    for (let i = 0; i < COUNT; i++) {
      const k = seeds[i];
      k.y -= k.vy * dt; if (k.y < -8) { k.y = 8; k.x = camera.position.x + (Math.random() - 0.5) * 22; }
      p.set(k.x + Math.sin(t * 0.7 + k.sway) * 0.6, k.y, k.z);
      e.set(k.rx + t * k.spin, k.ry + t * k.spin * 0.7, Math.sin(t + k.sway) * 0.6);
      q.setFromEuler(e); s.setScalar(k.sc);
      m.compose(p, q, s); petals.setMatrixAt(i, m);
    }
    petals.instanceMatrix.needsUpdate = true;
    dust.rotation.z = Math.sin(t * 0.05) * 0.02;
    dust.position.y = Math.sin(t * 0.2) * 0.15;

    renderer.render(scene, camera);
  };

  if (reduce) {
    frame();
    let q2 = false;
    addEventListener("resize", () => { if (!q2) { q2 = true; requestAnimationFrame(() => { q2 = false; frame(); }); } });
    document.querySelector(".wrap")?.addEventListener("scroll", () => { prog = window.hzProgress || 0; requestAnimationFrame(frame); }, { passive: true });
  } else {
    renderer.setAnimationLoop(() => { if (visible) frame(); });
  }
}
