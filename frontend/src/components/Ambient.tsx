import { useEffect, useRef } from "react";

/**
 * Site-wide ambience: a fixed layer of slowly drifting aurora glows and a softly
 * twinkling star field behind the content, a scroll-progress bar, and a pointer
 * "spotlight" on cards. Everything is decorative (aria-hidden), throttled, paused
 * in hidden tabs, and static when the visitor prefers reduced motion.
 */
export default function Ambient() {
  const stars = useRef<HTMLCanvasElement>(null),
    bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canvas = stars.current!,
      ctx = canvas.getContext("2d");
    let frame = 0,
      last = 0;
    const field = Array.from({ length: 140 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.1 + 0.25,
      p: Math.random() * Math.PI * 2,
      s: 0.4 + Math.random() * 1.2,
    }));
    const size = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    addEventListener("resize", size);
    const draw = (t: number) => {
      frame = requestAnimationFrame(draw);
      if (!ctx || document.hidden || t - last < 66) return; // ~15 fps is plenty for a twinkle
      last = t;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      // Parallax: stars drift up slightly as the page scrolls.
      const shift = (scrollY * 0.04) % innerHeight;
      for (const s of field) {
        const y = (s.y * innerHeight - shift * s.s + innerHeight) % innerHeight;
        ctx.globalAlpha = reduced ? 0.45 : 0.25 + 0.3 * (1 + Math.sin(t * 0.001 * s.s + s.p)) * 0.5;
        ctx.fillStyle = "#d7ebff";
        ctx.beginPath();
        ctx.arc(s.x * innerWidth, y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (reduced) cancelAnimationFrame(frame);
    };
    frame = requestAnimationFrame(draw);

    // Scroll progress.
    const progress = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    };
    progress();
    addEventListener("scroll", progress, { passive: true });

    // Pointer spotlight: cards read --mx/--my to place a soft glow.
    const cards =
      ".change-card, .case-card, .quicklook-card, .applications-grid > div, .data-principle, .science-topics > *, .radar-facts > div, .area-panel, .confidence";
    const move = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.(cards) as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    if (!reduced) addEventListener("pointermove", move, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("resize", size);
      removeEventListener("scroll", progress);
      removeEventListener("pointermove", move);
    };
  }, []);

  return (
    <>
      <div className="ambient" aria-hidden="true">
        <i className="aurora a1" />
        <i className="aurora a2" />
        <i className="aurora a3" />
        <canvas ref={stars} className="ambient-stars" />
      </div>
      <div className="scroll-progress" aria-hidden="true">
        <div ref={bar} />
      </div>
    </>
  );
}
