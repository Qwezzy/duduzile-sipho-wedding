/* Three.js backdrop behind the page (fixed, transparent canvas).
   - Two interlocking champagne-gold rings with a small diamond: they turn slowly, tilt with the pointer,
     and roll away to the side as you scroll down. Shown where the page has room beside the column.
   - Small, soft petals (champagne, cream, white, a hint of cocoa) drifting down slowly, translucent and out of focus
   - Gold dust at different depths, plus a few large soft bokeh glows
   The camera drifts down with scroll, so the petals and dust parallax behind the sheets.
   No WebGL: the canvas removes itself and the plain page background shows. Reduced motion: one still frame. */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const canvas = document.getElementById("stage");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = matchMedia("(max-width: 700px)").matches;

let renderer = null;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" }); }
catch (_) { canvas.remove(); }

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe9decb, 8, 24);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
  camera.position.set(0, 0, 10);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0xd8c3a0, 0.7));
  const key = new THREE.DirectionalLight(0xfff1dc, 1.5); key.position.set(4, 6, 8); scene.add(key);

  const TRAVEL = 14;     // how far the camera drifts down from top to bottom of the page

  /* ---- Rings ---- */
  const ringGeo = new THREE.TorusGeometry(1.15, 0.12, 48, 160);
  const r1 = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0xd8b47a, metalness: 1, roughness: 0.22 }));
  const r2 = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0xe6cfae, metalness: 1, roughness: 0.3 }));
  r1.rotation.set(0.35, 0.5, 0);
  r2.position.x = 1.25; r2.rotation.set(-0.3, -0.55, 0.9);
  const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0, transmission: 0.9, thickness: 0.4, ior: 2.4 }));
  stone.position.set(0, 1.3, 0); r1.add(stone);
  const ringsInner = new THREE.Group(); ringsInner.add(r1, r2); ringsInner.position.x = -0.62;   // centre the pair
  const rings = new THREE.Group(); rings.add(ringsInner);
  scene.add(rings);

  /* ---- Petals: small, cupped, translucent ---- */
  const petalGeo = new THREE.PlaneGeometry(0.2, 0.28, 4, 4);
  const pp = petalGeo.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i), y = pp.getY(i);
    pp.setZ(i, x * x * 2.4 - y * y * 0.5);
    pp.setX(i, x * (1 - Math.abs(y) * 1.4));
  }
  petalGeo.computeVertexNormals();
  const petalMat = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide, roughness: 0.8, metalness: 0, transparent: true, opacity: 0.82, depthWrite: false,
    emissive: 0xfff2e0, emissiveIntensity: 0.18
  });
  const COUNT = small ? 60 : 140;
  const petals = new THREE.InstancedMesh(petalGeo, petalMat, COUNT);
  const palette = [0xd8c3a0, 0xf3e7d6, 0xfcfaf6, 0xe7d3bb, 0xd8c3a0, 0xf3e7d6, 0x9a7660].map((c) => new THREE.Color(c));
  const seeds = [];
  for (let i = 0; i < COUNT; i++) {
    seeds.push({
      x: (Math.random() - 0.5) * 22, y: Math.random() * (TRAVEL + 12) - 6 - TRAVEL, z: -Math.random() * 12 + 3,
      vy: 0.08 + Math.random() * 0.12, sway: Math.random() * 6.28, amp: 0.4 + Math.random() * 0.8,
      spin: (Math.random() - 0.5) * 0.9, rx: Math.random() * 6.28, ry: Math.random() * 6.28, sc: 0.55 + Math.random() * 0.6
    });
    petals.setColorAt(i, palette[i % palette.length]);
  }
  petals.instanceColor.needsUpdate = true;
  scene.add(petals);

  /* ---- Gold dust and bokeh ---- */
  const glow = (inner, mid) => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, inner); grd.addColorStop(0.4, mid); grd.addColorStop(1, "rgba(216,180,122,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const cloud = (n, spread, size, opacity, tex) => {
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      a[i * 3] = (Math.random() - 0.5) * spread;
      a[i * 3 + 1] = Math.random() * (TRAVEL + 14) - 7 - TRAVEL;
      a[i * 3 + 2] = -Math.random() * 16 + 3;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(a, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ map: tex, size, transparent: true, depthWrite: false, opacity, sizeAttenuation: true }));
  };
  const dust = cloud(small ? 450 : 900, 26, 0.11, 0.85, glow("rgba(255,240,210,1)", "rgba(216,180,122,.6)"));
  const bokeh = cloud(small ? 14 : 26, 24, 1.6, 0.22, glow("rgba(255,246,230,.9)", "rgba(232,212,182,.35)"));
  scene.add(dust, bokeh);

  /* ---- Layout: rings sit in the margin beside the page column, when there is one ---- */
  let ringsHome = new THREE.Vector3(), ringsShown = false, visW = 10, visH = 7;
  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    visH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    visW = visH * camera.aspect;
    const column = Math.min(760, w);                    // the page column width in px
    const gutter = (w - column) / 2;                    // free space on each side
    ringsShown = gutter >= 200;
    const unitsPerPx = visW / w;
    const want = Math.min(gutter * 0.78, 300) * unitsPerPx;   // ring pair width in world units
    rings.scale.setScalar(want / 3.6);
    ringsHome.set(-visW / 2 + (gutter / 2) * unitsPerPx, visH * 0.08, 0);
  };
  addEventListener("resize", resize); resize();

  let px = 0, py = 0, tx = 0, ty = 0;
  addEventListener("pointermove", (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; }, { passive: true });

  const progress = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
  };
  const clock = new THREE.Clock();
  let prog = progress(), visible = true;
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; if (visible) clock.getDelta(); });

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();

  const frame = (still) => {
    const dt = still ? 0 : Math.min(clock.getDelta(), 0.05), t = still ? 2 : clock.elapsedTime;
    prog += (progress() - prog) * (still ? 1 : 0.08);
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;

    camera.position.set(px * 0.6, -prog * TRAVEL - py * 0.4, 10);
    camera.lookAt(px * 0.4, camera.position.y - py * 0.2, 0);

    /* rings: home in the left margin, then roll out to the left over the first part of the page */
    const out = Math.min(1, prog / 0.28);
    const ease = out * out * (3 - 2 * out);
    const roll = ease * (visW * 0.45);
    rings.visible = ringsShown && ease < 0.999;
    rings.position.set(ringsHome.x - roll, camera.position.y + ringsHome.y, ringsHome.z);
    rings.rotation.z = roll / (1.2 * rings.scale.x);                 // rolls like a wheel as it leaves
    ringsInner.rotation.y = t * 0.25 + px * 0.6;
    ringsInner.rotation.x = Math.sin(t * 0.4) * 0.15 + py * 0.4;
    stone.rotation.y = t * 1.2;

    for (let i = 0; i < COUNT; i++) {
      const k = seeds[i];
      k.y -= k.vy * dt;
      if (k.y < camera.position.y - 8) { k.y = camera.position.y + 8; k.x = (Math.random() - 0.5) * 22; }
      pv.set(k.x + Math.sin(t * 0.35 + k.sway) * k.amp, k.y, k.z);
      eu.set(k.rx + t * k.spin, k.ry + t * k.spin * 0.6, Math.sin(t * 0.5 + k.sway) * 0.8);
      q.setFromEuler(eu); sv.setScalar(k.sc);
      m.compose(pv, q, sv); petals.setMatrixAt(i, m);
    }
    petals.instanceMatrix.needsUpdate = true;
    dust.position.y = Math.sin(t * 0.2) * 0.15;
    bokeh.position.x = Math.sin(t * 0.07) * 0.6;
    bokeh.material.opacity = 0.18 + Math.sin(t * 0.5) * 0.05;

    renderer.render(scene, camera);
  };

  if (reduce) {
    const still = () => requestAnimationFrame(() => frame(true));
    still(); addEventListener("resize", still); addEventListener("scroll", still, { passive: true });
  } else {
    renderer.setAnimationLoop(() => { if (visible) frame(false); });
  }
}
