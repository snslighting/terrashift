import { useEffect, useRef } from "react";

/**
 * Animated, conceptual explainer of how NISAR measures change: the satellite
 * flies over a curved Earth, its side-looking radar sends pulses (cyan) that hit
 * the ground and return as echoes (violet), and a second visit 12 days later is
 * compared three ways. Not a measurement. Static frame for reduced motion.
 */
export default function RadarDiagram() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0,
      h = 0,
      frame = 0,
      visible = true;
    const stars = Array.from({ length: 90 }, () => ({
      x: Math.random(),
      y: Math.random() * 0.62,
      r: Math.random() * 1.1 + 0.2,
      p: Math.random() * Math.PI * 2,
    }));
    // A fixed, made-up ground profile: fields, a fault step, hills, a lake.
    const ground = Array.from({ length: 121 }, (_, i) => {
      const x = i / 120;
      return (
        Math.sin(x * 9) * 0.006 +
        Math.sin(x * 23 + 1) * 0.004 +
        (x > 0.58 ? 0.012 : 0) + // the fault step
        Math.max(0, Math.sin((x - 0.75) * 14)) * 0.02 * (x > 0.75 ? 1 : 0)
      );
    });
    const resize = () => {
      const r = canvas.getBoundingClientRect(),
        dpr = Math.min(devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver((e) => (visible = e[0].isIntersecting));
    io.observe(canvas);

    // Earth: a large circle whose top arc forms the horizon.
    const earth = () => ({ cx: w * 0.5, cy: h * 2.25, r: h * 1.72 });
    const surfaceY = (x: number) => {
      const { cx, cy, r } = earth();
      const dx = x - cx;
      return cy - Math.sqrt(Math.max(0, r * r - dx * dx));
    };
    const groundAt = (x: number) => {
      const i = Math.max(0, Math.min(120, Math.round((x / w) * 120)));
      return surfaceY(x) - ground[i] * h;
    };

    const drawSatellite = (x: number, y: number, tilt: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tilt);
      const s = Math.max(0.8, Math.min(1.3, w / 520));
      ctx.scale(s, s);
      // solar wing
      ctx.fillStyle = "#1d3f86";
      ctx.strokeStyle = "#9fb7d6";
      ctx.lineWidth = 1;
      ctx.fillRect(-74, -6, 56, 12);
      ctx.strokeRect(-74, -6, 56, 12);
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-74 + i * 14, -6);
        ctx.lineTo(-74 + i * 14, 6);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-18, 0);
      ctx.lineTo(-9, 0);
      ctx.stroke();
      // gold bus
      const gold = ctx.createLinearGradient(-9, -9, 9, 9);
      gold.addColorStop(0, "#f2cf7a");
      gold.addColorStop(1, "#a8761f");
      ctx.fillStyle = gold;
      ctx.fillRect(-9, -9, 18, 18);
      // boom and reflector, looking down and to the side
      ctx.strokeStyle = "#c9d3dc";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(6, 8);
      ctx.lineTo(26, 26);
      ctx.stroke();
      ctx.save();
      ctx.translate(30, 30);
      ctx.rotate(-0.75);
      const dish = ctx.createLinearGradient(-22, 0, 22, 0);
      dish.addColorStop(0, "#fff1c4");
      dish.addColorStop(1, "#b68a33");
      ctx.fillStyle = dish;
      ctx.beginPath();
      ctx.ellipse(0, 0, 24, 8, 0, 0, Math.PI);
      ctx.fill();
      ctx.strokeStyle = "#fff6d8aa";
      ctx.lineWidth = 0.7;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 9, 0);
        ctx.lineTo(i * 5, 7);
        ctx.stroke();
      }
      ctx.restore();
      ctx.restore();
    };

    const label = (text: string, x: number, y: number, color: string, alpha = 1) => {
      ctx.globalAlpha = alpha;
      ctx.font = "600 11px 'DM Sans', system-ui, sans-serif";
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      ctx.globalAlpha = 1;
    };

    const start = performance.now();
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (!visible || document.hidden) return;
      const t = reduced ? 4200 : now - start;
      ctx.clearRect(0, 0, w, h);

      // Space
      const sky = ctx.createRadialGradient(w * 0.5, h * 0.95, h * 0.1, w * 0.5, h * 0.6, h);
      sky.addColorStop(0, "#10294a");
      sky.addColorStop(1, "#060c18");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      for (const s of stars) {
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 0.0012 + s.p);
        ctx.fillStyle = "#d7ebff";
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Earth with atmosphere glow
      const { cx, cy, r } = earth();
      const glow = ctx.createRadialGradient(cx, cy, r * 0.98, cx, cy, r * 1.06);
      glow.addColorStop(0, "#4fb6ff55");
      glow.addColorStop(1, "#4fb6ff00");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 4) ctx.lineTo(x, groundAt(x));
      ctx.lineTo(w + 2, groundAt(w));
      ctx.lineTo(w + 2, h);
      ctx.closePath();
      const land = ctx.createLinearGradient(0, h * 0.6, 0, h);
      land.addColorStop(0, "#2c5d4a");
      land.addColorStop(0.35, "#1c3b3d");
      land.addColorStop(1, "#0b1a2a");
      ctx.fillStyle = land;
      ctx.fill();
      // field strips
      ctx.save();
      ctx.clip();
      for (let i = 0; i < 9; i++) {
        const x = w * (0.1 + i * 0.05);
        ctx.fillStyle = i % 2 ? "#4c7a3d33" : "#9c8a4a2a";
        ctx.fillRect(x, groundAt(x) - 2, w * 0.045, 14);
      }
      // lake
      ctx.fillStyle = "#1a4b7a";
      ctx.beginPath();
      ctx.ellipse(w * 0.86, groundAt(w * 0.86) + 6, w * 0.06, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "#7fd6c9";
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) x ? ctx.lineTo(x, groundAt(x)) : ctx.moveTo(x, groundAt(x));
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Orbit path
      const orbitY = (x: number) => h * 0.2 + ((x - w / 2) / w) ** 2 * h * 0.28;
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = "#55d9f344";
      ctx.beginPath();
      for (let x = -20; x <= w + 20; x += 8) x > -20 ? ctx.lineTo(x, orbitY(x)) : ctx.moveTo(x, orbitY(x));
      ctx.stroke();
      ctx.setLineDash([]);

      // Satellite moves across; the scene loops every 14 s with two "visits".
      const loop = 14000,
        phase = (t % loop) / loop,
        visit = Math.floor(t / loop) % 2,
        sx = w * (0.18 + phase * 0.64),
        sy = orbitY(sx);
      const tilt = Math.atan2(orbitY(sx + 1) - sy, 1) * 0.8;

      // Side-looking beam to a swath on the ground (ahead and to the right).
      const gx1 = sx + w * 0.06,
        gx2 = sx + w * 0.22,
        dishX = sx + 30,
        dishY = sy + 30;
      const beam = ctx.createLinearGradient(dishX, dishY, (gx1 + gx2) / 2, groundAt(gx1));
      beam.addColorStop(0, "#55d9f355");
      beam.addColorStop(1, "#55d9f30d");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(dishX, dishY);
      ctx.lineTo(gx1, groundAt(gx1));
      ctx.lineTo(gx2, groundAt(gx2));
      ctx.closePath();
      ctx.fill();
      // swath highlight
      ctx.strokeStyle = "#8fe9ff";
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      for (let x = gx1; x <= gx2; x += 3) x > gx1 ? ctx.lineTo(x, groundAt(x)) : ctx.moveTo(x, groundAt(x));
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Pulses out (cyan arcs) and echoes back (violet arcs).
      const mid = (gx1 + gx2) / 2,
        my = groundAt(mid),
        dist = Math.hypot(mid - dishX, my - dishY),
        angle = Math.atan2(my - dishY, mid - dishX);
      for (let k = 0; k < 3; k++) {
        const f = ((t / 1400 + k / 3) % 1) * 2; // 0..1 out, 1..2 back
        const out = f < 1;
        const d = (out ? f : 2 - f) * dist;
        ctx.strokeStyle = out ? "#55d9f3" : "#b9adff";
        ctx.globalAlpha = 0.85 * (1 - Math.abs(f - 1) * 0.35);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(dishX, dishY, Math.max(1, d), angle - 0.22, angle + 0.22);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      drawSatellite(sx, sy, tilt);

      // Labels
      label("01 / TRANSMIT", sx + 46, sy - 10, "#8fe9ff");
      label("02 / LISTEN", mid - 30, my + 26, "#d4ccff");
      const tag = visit ? "VISIT 2 · 12 DAYS LATER" : "VISIT 1";
      ctx.font = "600 11px 'DM Sans', system-ui, sans-serif";
      const tw = ctx.measureText(tag).width;
      ctx.fillStyle = "#070d19cc";
      ctx.fillRect(18, 18, tw + 20, 24);
      ctx.strokeStyle = visit ? "#b9adff88" : "#55d9f388";
      ctx.strokeRect(18.5, 18.5, tw + 19, 23);
      label(tag, 28, 34, visit ? "#d4ccff" : "#8fe9ff");

      // 03 / COMPARE: the three ways change shows, highlighted in turn.
      const items = ["Coherence · did it change?", "Phase · did it move?", "Brightness · water or plants?"];
      const lit = Math.floor((t / 2400) % 3);
      label("03 / COMPARE THE TWO VISITS", 18, h - 86, "#9fb7c9");
      items.forEach((text, i) => {
        const y = h - 64 + i * 19;
        ctx.fillStyle = i === lit ? "#55d9f3" : "#2a4a63";
        ctx.beginPath();
        ctx.arc(24, y - 4, 3.5, 0, Math.PI * 2);
        ctx.fill();
        label(text, 34, y, i === lit ? "#e8f6ff" : "#7f97ab");
      });
      if (reduced) cancelAnimationFrame(frame);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
    };
  }, []);
  return (
    <canvas
      ref={ref}
      className="radar-canvas"
      role="img"
      aria-label="Conceptual animation: NISAR flies over the Earth and sends radar pulses to a strip of ground; the echoes return to the satellite. A second visit 12 days later is compared by coherence, phase and brightness."
    />
  );
}
