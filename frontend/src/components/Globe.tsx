import { useEffect, useRef, useState } from "react";
import { Globe2, Rotate3D } from "lucide-react";
import type * as ThreeTypes from "three";
import { asset } from "../lib/api";
import type { BBox } from "../lib/types";
type Three = typeof ThreeTypes;
function outline(THREE: Three, [west, south, east, north]: BBox) {
  const e = east < west ? east + 360 : east;
  const corners = [
    [west, south],
    [e, south],
    [e, north],
    [west, north],
    [west, south],
  ];
  const points = corners.map(([lon, lat]) => {
    const longitude = (lon * Math.PI) / 180,
      latitude = (lat * Math.PI) / 180;
    return new THREE.Vector3(
      Math.cos(longitude) * Math.cos(latitude) * 1.008,
      Math.sin(latitude) * 1.008,
      -Math.sin(longitude) * Math.cos(latitude) * 1.008,
    );
  });
  const area = new THREE.Group();
  area.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: 0xc2f19d, transparent: true, opacity: 0.95 }),
    ),
  );
  // A glowing marker at the centre, so small areas are visible from orbit.
  const lon = (((west + e) / 2) * Math.PI) / 180,
    lat = (((south + north) / 2) * Math.PI) / 180;
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.014, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xc2f19d, transparent: true, opacity: 0.9 }),
  );
  marker.position.set(
    Math.cos(lon) * Math.cos(lat) * 1.01,
    Math.sin(lat) * 1.01,
    -Math.sin(lon) * Math.cos(lat) * 1.01,
  );
  marker.userData.marker = true;
  area.add(marker);
  return area;
}

/**
 * A stylised NISAR: gold-foiled bus, one long solar wing, a boom carrying the
 * large gold-mesh radar reflector, and a radar beam to the ground. The group's
 * local +Z axis points at Earth after lookAt(0,0,0). Not to scale.
 */
function buildNisar(THREE: Three) {
  const group = new THREE.Group(),
    s = 1.8; // overall size in scene units (enlarged so it reads at globe scale)
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8a94a, metalness: 0.85, roughness: 0.35 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xc9d3dc, metalness: 0.8, roughness: 0.3 });
  const bus = new THREE.Mesh(new THREE.BoxGeometry(0.03 * s, 0.03 * s, 0.038 * s), gold);
  group.add(bus);
  // Solar wing: dark cells in a light frame, sticking out sideways.
  const wing = new THREE.Group();
  const cells = new THREE.Mesh(
    new THREE.BoxGeometry(0.12 * s, 0.003 * s, 0.034 * s),
    new THREE.MeshStandardMaterial({ color: 0x1b3f8f, metalness: 0.4, roughness: 0.25, emissive: 0x08152f }),
  );
  cells.position.x = 0.085 * s;
  wing.add(cells);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.002 * s, 0.002 * s, 0.025 * s, 6), silver);
  arm.rotation.z = Math.PI / 2;
  arm.position.x = 0.02 * s;
  wing.add(arm);
  for (let i = 1; i < 4; i++) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.0015 * s, 0.0035 * s, 0.035 * s), silver);
    seam.position.x = (0.025 + i * 0.03) * s;
    wing.add(seam);
  }
  group.add(wing);
  // Boom out to the reflector, which faces Earth and a little to the side.
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.0022 * s, 0.0022 * s, 0.07 * s, 6), silver);
  boom.rotation.x = Math.PI / 2;
  boom.rotation.z = 0.5;
  boom.position.set(-0.018 * s, 0.006 * s, 0.03 * s);
  group.add(boom);
  const dishProfile: ThreeTypes.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const r = (i / 12) * 0.06 * s;
    dishProfile.push(new THREE.Vector2(r, (r * r) / (0.12 * s)));
  }
  const dish = new THREE.Mesh(
    new THREE.LatheGeometry(dishProfile, 36),
    new THREE.MeshStandardMaterial({
      color: 0xe6c77a,
      metalness: 0.75,
      roughness: 0.45,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.88,
    }),
  );
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.06 * s, 0.0016 * s, 6, 48), silver);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = (0.06 * s * 0.06 * s) / (0.12 * s);
  const reflector = new THREE.Group();
  // Fine wire pattern so it reads as NISAR's gold mesh antenna.
  const mesh = new THREE.Mesh(
    dish.geometry,
    new THREE.MeshBasicMaterial({ color: 0xfff1c4, wireframe: true, transparent: true, opacity: 0.35 }),
  );
  reflector.add(dish, mesh, rim);
  // Dish opens toward +Z (Earth), tilted to look off to one side.
  reflector.rotation.x = Math.PI / 2;
  reflector.rotation.y = 0.35;
  reflector.position.set(-0.035 * s, 0.012 * s, 0.062 * s);
  group.add(reflector);
  // Radar beam: an open cone from the reflector down to the surface.
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(0.05, 0.117, 32, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x55d9f3,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  // Cone tip at the satellite, base on the ground (~0.117 below), pointing along +Z.
  beam.rotation.x = -Math.PI / 2;
  beam.position.z = 0.117 / 2 + 0.006;
  beam.position.x = -0.012;
  group.add(beam);
  const spot = new THREE.Mesh(
    new THREE.CircleGeometry(0.05, 32),
    new THREE.MeshBasicMaterial({
      color: 0x8fe9ff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  spot.position.set(-0.012, 0, 0.117);
  group.add(spot);
  return { group, beam, spot };
}
export default function Globe({
  onSelect,
  areas = [],
}: {
  onSelect?: (lon: number, lat: number) => void;
  areas?: BBox[];
}) {
  const scene3d = useRef<{ THREE: Three; earth: ThreeTypes.Mesh; group: ThreeTypes.Group }>(null);
  const mount = useRef<HTMLDivElement>(null),
    [fallback, setFallback] = useState(false),
    [loaded, setLoaded] = useState(false);
  const callback = useRef(onSelect);
  callback.current = onSelect;
  const areasRef = useRef(areas);
  areasRef.current = areas;
  const areaKey = areas.map((a) => a.join(",")).join("|");
  useEffect(() => {
    const s = scene3d.current;
    if (!s) return;
    s.group.children.slice().forEach((c) => {
      s.group.remove(c);
      c.traverse((o) => {
        if (o instanceof s.THREE.Line || o instanceof s.THREE.Mesh) {
          o.geometry.dispose();
          (o.material as ThreeTypes.Material).dispose();
        }
      });
    });
    for (const box of areas) s.group.add(outline(s.THREE, box));
  }, [areaKey]);
  useEffect(() => {
    let disposed = false,
      cleanup = () => {};
    const container = mount.current;
    if (!container) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    (async () => {
      try {
        const THREE = await import("three");
        const geo = (await fetch(asset("geo/countries.json")).then((r) =>
          r.json(),
        )) as GeoJSON.FeatureCollection;
        if (disposed) return;
        const scene = new THREE.Scene(),
          camera = new THREE.PerspectiveCamera(37, 1, 0.1, 100);
        camera.position.set(0, 0, 4.65);
        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: "low-power",
        });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
        renderer.setClearColor(0x070d19, 0);
        container.append(renderer.domElement);
        renderer.domElement.setAttribute(
          "aria-label",
          "Interactive 3D Earth: drag to rotate, click to explore a location",
        );
        renderer.domElement.setAttribute("role", "img");
        // Borders only, on a transparent layer just above the imagery.
        const surface = document.createElement("canvas");
        surface.width = 4096;
        surface.height = 2048;
        const c = surface.getContext("2d")!;
        c.strokeStyle = "rgba(225, 240, 255, 0.32)";
        c.lineWidth = 1.4;
        for (const feature of geo.features) {
          const g = feature.geometry;
          if (g?.type !== "Polygon" && g?.type !== "MultiPolygon") continue;
          const polygons = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
          for (const rings of polygons)
            for (const ring of rings) {
              c.beginPath();
              ring.forEach((p, i) => {
                const x = ((p[0] + 180) / 360) * 4096,
                  y = ((90 - p[1]) / 180) * 2048;
                i ? c.lineTo(x, y) : c.moveTo(x, y);
              });
              c.stroke();
            }
        }
        const texture = new THREE.CanvasTexture(surface);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

        // NASA Blue Marble by day, city lights at night, relief for shading (public domain).
        const loader = new THREE.TextureLoader();
        const load = (file: string, srgb = true) =>
          new Promise<ThreeTypes.Texture>((resolve, reject) =>
            loader.load(
              asset(file),
              (t) => {
                if (srgb) t.colorSpace = THREE.SRGBColorSpace;
                t.anisotropy = renderer.capabilities.getMaxAnisotropy();
                resolve(t);
              },
              undefined,
              reject,
            ),
          );
        const [dayMap, nightMap, reliefMap] = await Promise.all([
          load("geo/earth-day.webp"),
          load("geo/earth-night.webp"),
          load("geo/earth-relief.webp", false),
        ]);
        if (disposed) return;
        const sun = new THREE.Vector3(-0.92, 0.26, 0.28).normalize();
        const earthMaterial = new THREE.ShaderMaterial({
          uniforms: {
            dayMap: { value: dayMap },
            nightMap: { value: nightMap },
            reliefMap: { value: reliefMap },
            sunDir: { value: sun },
          },
          vertexShader: `
            varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorld;
            void main() {
              vUv = uv;
              vNormal = normalize(mat3(modelMatrix) * normal);
              vec4 w = modelMatrix * vec4(position, 1.0);
              vWorld = w.xyz;
              gl_Position = projectionMatrix * viewMatrix * w;
            }`,
          fragmentShader: `
            uniform sampler2D dayMap; uniform sampler2D nightMap; uniform sampler2D reliefMap;
            uniform vec3 sunDir;
            varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorld;
            void main() {
              vec3 n = normalize(vNormal);
              vec3 view = normalize(cameraPosition - vWorld);
              float ndl = dot(n, sunDir);
              float dayMix = smoothstep(-0.12, 0.22, ndl);
              vec3 day = texture2D(dayMap, vUv).rgb;
              float relief = texture2D(reliefMap, vUv).r;
              day *= 0.9 + 0.25 * relief;
              vec3 lit = day * (0.12 + 1.05 * max(ndl, 0.0));
              // Oceans: blue-dominant pixels get a soft sun glint.
              float water = smoothstep(0.04, 0.2, day.b - max(day.r, day.g));
              float glint = pow(max(dot(reflect(-sunDir, n), view), 0.0), 38.0) * water;
              lit += vec3(1.0, 0.93, 0.8) * glint * 0.55 * dayMix;
              vec3 lights = texture2D(nightMap, vUv).rgb;
              vec3 night = lights * vec3(1.15, 0.95, 0.7) * 1.25 + day * 0.035;
              vec3 color = mix(night, lit, dayMix);
              // Thin atmosphere on the limb.
              float rim = pow(1.0 - max(dot(n, view), 0.0), 3.0);
              color += vec3(0.25, 0.6, 1.0) * rim * (0.25 + 0.6 * smoothstep(-0.3, 0.6, ndl));
              gl_FragColor = vec4(color, 1.0);
              #include <colorspace_fragment>
            }`,
        });
        const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), earthMaterial);
        earth.rotation.set(0.17, -1.6, 0);
        scene.add(earth);
        const borders = new THREE.Mesh(
          new THREE.SphereGeometry(1.0015, 96, 64),
          new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
        );
        earth.add(borders);
        // Outlines only the actual processed study extents; this is not acquisition coverage.
        const group = new THREE.Group();
        earth.add(group);
        scene3d.current = { THREE, earth, group };
        for (const box of areasRef.current) group.add(outline(THREE, box));
        const atmosphere = new THREE.Mesh(
          new THREE.SphereGeometry(1.045, 64, 48),
          new THREE.ShaderMaterial({
            transparent: true,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            uniforms: { sunDir: { value: sun } },
            vertexShader:
              "varying vec3 vNormal; varying vec3 vPosition; varying vec3 vWorldN; void main(){vNormal=normalize(normalMatrix*normal);vWorldN=normalize(mat3(modelMatrix)*normal);vPosition=(modelViewMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*vec4(vPosition,1.);}",
            fragmentShader:
              "uniform vec3 sunDir; varying vec3 vNormal; varying vec3 vPosition; varying vec3 vWorldN; void main(){float glow=pow(max(0.,.62-dot(vNormal,normalize(-vPosition))),3.2);float lit=.2+.8*smoothstep(-.5,.4,dot(-vWorldN,sunDir));gl_FragColor=vec4(.32,.66,1.,glow*.9*lit);}",
          }),
        );
        scene.add(atmosphere);
        // A quiet star field for depth.
        const starPositions = new Float32Array(900 * 3);
        for (let i = 0; i < 900; i++) {
          const u = Math.random() * 2 - 1,
            t = Math.random() * Math.PI * 2,
            r = 18 + Math.random() * 10,
            k = Math.sqrt(1 - u * u);
          starPositions.set([r * k * Math.cos(t), r * u, r * k * Math.sin(t) - 6], i * 3);
        }
        const stars = new THREE.Points(
          new THREE.BufferGeometry().setAttribute(
            "position",
            new THREE.BufferAttribute(starPositions, 3),
          ),
          new THREE.PointsMaterial({
            color: 0xcfe6ff,
            size: 0.045,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
          }),
        );
        scene.add(stars);
        scene.add(new THREE.AmbientLight(0x9bbacc, 0.55));
        const light = new THREE.DirectionalLight(0xfff4e0, 2.4);
        light.position.copy(sun).multiplyScalar(5);
        scene.add(light);

        // NISAR flies a near-polar, sun-synchronous orbit about 747 km up (radius 1.117).
        const ORBIT = 1.117,
          orbitTilt = new THREE.Euler(1.18, 0.0, 0.42);
        const orbitPoint = (a: number) =>
          new THREE.Vector3(Math.sin(a) * ORBIT, Math.cos(a) * ORBIT, 0).applyEuler(orbitTilt);
        const ringPoints: ThreeTypes.Vector3[] = [];
        for (let i = 0; i <= 240; i++) ringPoints.push(orbitPoint((i / 240) * Math.PI * 2));
        scene.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(ringPoints),
            new THREE.LineBasicMaterial({ color: 0x55d9f3, transparent: true, opacity: 0.16 }),
          ),
        );
        // A fading trail behind the satellite.
        const TRAIL = 60;
        const trailGeometry = new THREE.BufferGeometry();
        trailGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
        const trailColors = new Float32Array(TRAIL * 3);
        for (let i = 0; i < TRAIL; i++) {
          const f = 1 - i / TRAIL;
          trailColors.set([0.33 * f, 0.85 * f, 0.95 * f], i * 3);
        }
        trailGeometry.setAttribute("color", new THREE.BufferAttribute(trailColors, 3));
        const trail = new THREE.Line(
          trailGeometry,
          new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
          }),
        );
        scene.add(trail);

        const satellite = buildNisar(THREE);
        scene.add(satellite.group);
        let dragging = false,
          lastX = 0,
          lastY = 0,
          distance = 0,
          visible = true,
          frame = 0;
        const ray = new THREE.Raycaster();
        const down = (e: PointerEvent) => {
          dragging = true;
          lastX = e.clientX;
          lastY = e.clientY;
          distance = 0;
          renderer.domElement.setPointerCapture(e.pointerId);
        };
        const move = (e: PointerEvent) => {
          if (!dragging) return;
          const dx = e.clientX - lastX,
            dy = e.clientY - lastY;
          distance += Math.abs(dx) + Math.abs(dy);
          earth.rotation.y += dx * 0.005;
          earth.rotation.x = Math.max(
            -1.2,
            Math.min(1.2, earth.rotation.x + dy * 0.005),
          );
          lastX = e.clientX;
          lastY = e.clientY;
        };
        const up = (e: PointerEvent) => {
          dragging = false;
          if (distance > 5) return;
          const r = renderer.domElement.getBoundingClientRect();
          ray.setFromCamera(
            new THREE.Vector2(
              ((e.clientX - r.left) / r.width) * 2 - 1,
              (-(e.clientY - r.top) / r.height) * 2 + 1,
            ),
            camera,
          );
          const hit = ray.intersectObject(earth)[0];
          if (hit) {
            const p = earth.worldToLocal(hit.point.clone()).normalize();
            const lon =
                (((((Math.atan2(-p.z, p.x) * 180) / Math.PI + 180) % 360) +
                  360) %
                  360) -
                180,
              lat = (Math.asin(p.y) * 180) / Math.PI;
            callback.current?.(lon, lat);
          }
        };
        renderer.domElement.addEventListener("pointerdown", down);
        renderer.domElement.addEventListener("pointermove", move);
        renderer.domElement.addEventListener("pointerup", up);
        const resize = () => {
          const { width, height } = container.getBoundingClientRect();
          renderer.setSize(width, height);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(container);
        resize();
        const intersection = new IntersectionObserver((entries) => {
          visible = entries[0].isIntersecting;
        });
        intersection.observe(container);
        const start = performance.now();
        let previous = 0;
        const animate = (t: number) => {
          if (disposed) return;
          frame = requestAnimationFrame(animate);
          if (!visible || document.hidden || t - previous < 32) return;
          previous = t;
          if (!reduced && !dragging) earth.rotation.y += 0.0009;
          const a = reduced ? -0.35 : -0.6 + (t - start) * 0.00012;
          const here = orbitPoint(a);
          satellite.group.position.copy(here);
          // Body flies along the orbit; the reflector looks down and to one side, as NISAR does.
          satellite.group.up.copy(orbitPoint(a + 0.01).sub(here).normalize());
          satellite.group.lookAt(0, 0, 0);
          const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin((t - start) * 0.004);
          (satellite.beam.material as ThreeTypes.MeshBasicMaterial).opacity = 0.16 + 0.2 * pulse;
          (satellite.spot.material as ThreeTypes.MeshBasicMaterial).opacity = 0.35 + 0.4 * pulse;
          const trailPositions = trail.geometry.getAttribute("position") as ThreeTypes.BufferAttribute;
          for (let i = 0; i < TRAIL; i++) {
            const p = orbitPoint(a - i * 0.012);
            trailPositions.setXYZ(i, p.x, p.y, p.z);
          }
          trailPositions.needsUpdate = true;
          for (const m of group.children)
            if (m instanceof THREE.Mesh && m.userData.marker)
              m.scale.setScalar(reduced ? 1 : 1 + 0.35 * Math.sin((t - start) * 0.003));
          renderer.render(scene, camera);
        };
        frame = requestAnimationFrame(animate);
        setLoaded(true);
        cleanup = () => {
          cancelAnimationFrame(frame);
          observer.disconnect();
          intersection.disconnect();
          renderer.domElement.removeEventListener("pointerdown", down);
          renderer.domElement.removeEventListener("pointermove", move);
          renderer.domElement.removeEventListener("pointerup", up);
          scene.traverse((o) => {
            if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
              o.geometry.dispose();
              const mats = Array.isArray(o.material)
                ? o.material
                : [o.material];
              mats.forEach((m) => m.dispose());
            }
          });
          texture.dispose();
          dayMap.dispose();
          nightMap.dispose();
          reliefMap.dispose();
          renderer.dispose();
          renderer.domElement.remove();
          scene3d.current = null;
        };
      } catch {
        if (!disposed) {
          setFallback(true);
          setLoaded(true);
        }
      }
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);
  return (
    <div className="globe-wrap">
      <div className="globe-aura" />
      <div ref={mount} className="globe-stage" />
      {fallback && (
        <div className="globe-fallback">
          <Globe2 size={210} />
          <p>Earth visualization · use the explorer to choose a location.</p>
        </div>
      )}
      <div className="globe-label north">
        <span>EARTH OBSERVATION</span>
        <strong>A planet in motion.</strong>
        <small>Green markers · processed study areas · NISAR in orbit</small>
      </div>
      <div className="globe-label south">
        <span className="live-dot" />
        <span>
          {loaded ? "NASA BLUE MARBLE · NIGHT LIGHTS" : "PREPARING THE PLANET"}
        </span>
      </div>
      <div className="globe-drag">
        <Rotate3D size={14} />
        Drag to rotate · click to explore
      </div>
      <div className="orbit-axis">
        N<span />S
      </div>
    </div>
  );
}
