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
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0xc2f19d, transparent: true, opacity: 0.95 }),
  );
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
      if (c instanceof s.THREE.Line) {
        c.geometry.dispose();
        (c.material as ThreeTypes.Material).dispose();
      }
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
        const geo = (await fetch(asset("geo/countries.geojson")).then((r) =>
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
        const surface = document.createElement("canvas");
        surface.width = 2048;
        surface.height = 1024;
        const c = surface.getContext("2d")!;
        c.fillStyle = "#081c31";
        c.fillRect(0, 0, 2048, 1024);
        c.strokeStyle = "#143346";
        c.lineWidth = 1;
        for (let lon = -180; lon <= 180; lon += 15) {
          const x = ((lon + 180) / 360) * 2048;
          c.beginPath();
          c.moveTo(x, 0);
          c.lineTo(x, 1024);
          c.stroke();
        }
        for (let lat = -90; lat <= 90; lat += 15) {
          const y = ((90 - lat) / 180) * 1024;
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(2048, y);
          c.stroke();
        }
        for (const feature of geo.features) {
          const g = feature.geometry;
          if (g?.type !== "Polygon" && g?.type !== "MultiPolygon") continue;
          const polygons =
            g.type === "Polygon" ? [g.coordinates] : g.coordinates;
          for (const rings of polygons) {
            c.beginPath();
            for (const ring of rings) {
              ring.forEach((p, i) => {
                const x = ((p[0] + 180) / 360) * 2048,
                  y = ((90 - p[1]) / 180) * 1024;
                i ? c.lineTo(x, y) : c.moveTo(x, y);
              });
              c.closePath();
            }
            c.fillStyle = "#286773";
            c.fill("evenodd");
            c.strokeStyle = "#429397";
            c.lineWidth = 1.1;
            c.stroke();
          }
        }
        const texture = new THREE.CanvasTexture(surface);
        texture.colorSpace = THREE.SRGBColorSpace;
        const earth = new THREE.Mesh(
          new THREE.SphereGeometry(1, 72, 48),
          new THREE.MeshPhongMaterial({
            map: texture,
            shininess: 13,
            specular: 0x0f677c,
          }),
        );
        earth.rotation.set(0.17, -1.6, 0);
        scene.add(earth);
        // Outlines only the actual processed study extents; this is not acquisition coverage.
        const group = new THREE.Group();
        earth.add(group);
        scene3d.current = { THREE, earth, group };
        for (const box of areasRef.current) group.add(outline(THREE, box));
        const atmosphere = new THREE.Mesh(
          new THREE.SphereGeometry(1.035, 48, 32),
          new THREE.ShaderMaterial({
            transparent: true,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            vertexShader:
              "varying vec3 vNormal; varying vec3 vPosition; void main(){vNormal=normalize(normalMatrix*normal);vPosition=(modelViewMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*vec4(vPosition,1.);}",
            fragmentShader:
              "varying vec3 vNormal; varying vec3 vPosition; void main(){float glow=pow(1.-abs(dot(vNormal,normalize(-vPosition))),3.);gl_FragColor=vec4(.16,.66,.94,glow*.54);}",
          }),
        );
        scene.add(atmosphere);
        scene.add(new THREE.AmbientLight(0x9bbacc, 0.85));
        const light = new THREE.DirectionalLight(0xd4f7ff, 2.2);
        light.position.set(-3, 2, 4);
        scene.add(light);
        const rim = new THREE.PointLight(0x55d9f3, 2, 20);
        rim.position.set(2, -1, -1);
        scene.add(rim);
        const orbitGroup = new THREE.Group();
        scene.add(orbitGroup);
        for (let k = 0; k < 3; k++) {
          const points = [];
          for (let i = 0; i <= 160; i++) {
            const a = (i / 160) * Math.PI * 2;
            points.push(
              new THREE.Vector3(Math.cos(a) * 1.35, Math.sin(a) * 1.35, 0),
            );
          }
          const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({
              color: k === 1 ? 0x8878ff : 0x55d9f3,
              transparent: true,
              opacity: k === 1 ? 0.16 : 0.23,
            }),
          );
          line.rotation.set(0.9 + k * 0.45, k * 0.85, 0.3);
          orbitGroup.add(line);
        }
        const satellite = new THREE.Group();
        satellite.add(
          new THREE.Mesh(
            new THREE.BoxGeometry(0.035, 0.04, 0.04),
            new THREE.MeshBasicMaterial({ color: 0xffffff }),
          ),
        );
        for (const x of [-0.047, 0.047]) {
          const panel = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.027, 0.006),
            new THREE.MeshBasicMaterial({ color: 0x55d9f3 }),
          );
          panel.position.x = x;
          satellite.add(panel);
        }
        scene.add(satellite);
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
          const a = reduced ? 0.5 : (t - start) * 0.00017;
          satellite.position.set(
            Math.cos(a) * 1.35,
            Math.sin(a) * 0.7,
            Math.sin(a) * 0.9,
          );
          satellite.rotation.z = a;
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
        <small>Green outlines · processed study areas</small>
      </div>
      <div className="globe-label south">
        <span className="live-dot" />
        <span>
          {loaded ? "GEOGRAPHY · NATURAL EARTH" : "PREPARING THE PLANET"}
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
