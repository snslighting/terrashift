import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Pause, Play, X } from "lucide-react";

/**
 * A site-wide guided tour. Each step names a page and an element on it; the tour
 * navigates there, waits for the element, scrolls it into view and spotlights it
 * with a caption. "Guided demo" mode advances on its own, for presentations.
 */
export interface TourStep {
  /** Route (path and optional query) the step lives on. */
  to: string;
  /** CSS selector of the element to spotlight; if missing, the card is centred. */
  target?: string;
  title: string;
  body: string;
  /** How long the step stays in the auto-playing demo (default AUTOPLAY_MS). */
  ms?: number;
  /** Something the step does on the page once its target is shown (the demo drives the controls). */
  action?: keyof typeof stepActions;
  /** The step shows a NASA preview: if it has not arrived in IMAGE_WAIT_MS, the demo moves on. */
  needsImage?: boolean;
}

/** How long a demo step waits for NASA's preview image before skipping ahead. */
export const IMAGE_WAIT_MS = 10_000;
/** Is NASA's preview on the map (not still loading)? */
export const imageReady = () =>
  !!document.querySelector(".map-ribbon.preview") && !document.querySelector(".map-result-panel .preview-status");
/**
 * Test hook: a speed factor for the auto-playing demo, read from session storage
 * ("terrashift-demo-speed"), so browser tests need not wait 90 seconds. 1 for everyone else.
 */
export function demoSpeed() {
  try {
    const v = Number(sessionStorage.getItem("terrashift-demo-speed"));
    return v > 0 ? v : 1;
  } catch {
    return 1;
  }
}

/** Set a React-controlled range input as a person would. */
function setRange(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (!input) return;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
export const stepActions = {
  /** Move the date slider to the first date. */
  firstDate: () => setRange(".time-scrubber input[type=range]", "0"),
  /** Switch the preview to HV (frequency A when there are two). */
  showHV: () =>
    [...document.querySelectorAll<HTMLButtonElement>(".polarization-switch button")]
      .find((b) => /^HV/.test(b.textContent ?? ""))
      ?.click(),
};

export const tourSteps: TourStep[] = [
  {
    to: "/",
    target: ".hero-copy h1",
    title: "Welcome to TerraShift",
    body: "TerraShift turns real NASA–ISRO NISAR radar observations into maps of how the ground changes: farm fields, earthquakes and sinking land. This tour takes about 90 seconds.",
  },
  {
    to: "/",
    target: ".hero-earth",
    title: "Start from the globe",
    body: "Drag to spin the Earth. Green outlines mark areas processed with real radar data. Click anywhere to look for NISAR observations there.",
  },
  {
    to: "/",
    target: "#perspective .change-grid",
    title: "What the radar can see",
    body: "Each card is a kind of change measured from real data. Floods and wildfire are listed as coming next: nothing is shown until real products are processed.",
  },
  {
    to: "/discoveries",
    target: "#venezuela-2026 .earth-story-stage",
    title: "Earth Stories",
    body: "Each story pairs a radar map with a short narrative. This one follows the M7.5 earthquake that moved the Caracas coast in June 2026.",
  },
  {
    to: "/discoveries",
    target: "#venezuela-2026 .story-steps",
    title: "Read it step by step",
    body: "Where it is and why it matters, what the radar saw, the likely drivers (always hypotheses), how sure we are, and who could use it. The map changes with each step.",
  },
  {
    to: "/analysis?case=venezuela-2026",
    target: ".analysis-summary",
    title: "The numbers, with their limits",
    body: "Analysis shows the key measurement next to how sure we are: the independent GNSS check, and total uncertainty when it is not yet known.",
  },
  {
    to: "/analysis?case=venezuela-2026",
    target: ".analysis-map",
    title: "Inspect any point",
    body: "Click or tap the map, or focus it and use the arrow keys, to read the value at a point, with the number of real radar pixels behind it. Missing data stays blank.",
  },
  {
    to: "/analysis?case=san-joaquin",
    target: ".analysis-toolbar",
    title: "Switch layers and dates",
    body: "Change what the map shows, step through radar pairs, or press play to watch the farmland change every 12 days.",
  },
  {
    to: "/analysis?case=san-joaquin",
    target: ".analysis-exports",
    title: "Share and export",
    body: "Copy a link to this exact view, or export the evidence with its source hashes so anyone can check it.",
  },
  {
    to: "/explore",
    target: ".explorer-panel",
    title: "Explore anywhere",
    body: "Search any place, pick dates and discover which NISAR observations exist there, straight from NASA's public catalog.",
  },
  {
    to: "/explore",
    target: ".tour-launch",
    title: "That's the tour",
    body: "Replay it any time from this button. The Science and Data pages explain how the radar works and how every number was made.",
  },
];

/**
 * The 90-second Explorer demo for judges and first-time visitors: a sample place, a NASA
 * preview, the date slider, HH/HV, a processed Earth Story, and what we can and cannot claim.
 * It needs NASA's live catalog for the sample place; offline, each card still explains the step.
 */
export const demoSteps: TourStep[] = [
  {
    to: "/explore?preset=pantanal",
    target: ".place-card",
    title: "1 · Pick a place",
    body: "One click on a sample place searched NASA's public catalog for every NISAR product over the Pantanal wetland in Brazil. The place report counts them: catalog facts, not measurements.",
    ms: 12500,
  },
  {
    to: "/explore?preset=pantanal",
    target: ".map-result-panel",
    title: "2 · Open a product",
    body: "The latest backscatter product opened by itself. The picture is NASA's own preview, placed on the map from the product footprint: level 2 of 4, not processed by TerraShift.",
    ms: 13500,
    needsImage: true,
  },
  {
    to: "/explore?preset=pantanal",
    target: ".time-scrubber",
    title: "3 · Move through time",
    body: "The slider steps through every date on the same track. The demo jumps to the first date; each image takes a few seconds to arrive.",
    action: "firstDate",
    ms: 15500,
    needsImage: true,
  },
  {
    to: "/explore?preset=pantanal",
    target: ".polarization-switch",
    title: "4 · Switch HH and HV",
    body: "HH is bright on rough ground and flooded vegetation; HV follows the volume of leaves and branches. The demo switches to HV. That reading is textbook guidance, a hypothesis to test, not a finding.",
    action: "showHV",
    ms: 15500,
    needsImage: true,
  },
  {
    to: "/discoveries",
    target: "#venezuela-2026 .earth-story-stage",
    title: "5 · Open a processed story",
    body: "Here TerraShift processed NASA's science file itself: the Caracas coast across the June 2026 M7.5 earthquake, with the GNSS check that partly confirms it.",
    ms: 13500,
  },
  {
    to: "/about",
    target: ".claims-box",
    title: "6 · What we can and cannot claim",
    body: "Every result says how far it was checked. This box lists what the evidence supports and what it does not.",
    ms: 12500,
  },
];

interface TourState {
  start: (autoplay?: boolean, path?: "tour" | "demo") => void;
  active: boolean;
}
const TourContext = createContext<TourState>({ start: () => {}, active: false });
export const useTour = () => useContext(TourContext);

const SEEN_KEY = "terrashift-tour-seen";
const remember = () => {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* storage may be unavailable; the invite simply shows again */
  }
};
const seenBefore = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
};

const AUTOPLAY_MS = 8000;
/** How long the first-visit invite stays before it tucks itself away. */
const INVITE_MS = 12000;

export function TourProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<number | null>(null),
    [steps, setSteps] = useState<TourStep[]>(tourSteps),
    [autoplay, setAutoplay] = useState(false),
    [invite, setInvite] = useState(false),
    onHome = useLocation().pathname.replace(/\/+$/, "") === "";
  useEffect(() => {
    // Invite first-time visitors once, on the home page only, after it has settled.
    // It never sits over data on other pages (the header Tour button stays there),
    // counts as seen once shown, and tucks itself away after a few seconds.
    if (!onHome || seenBefore()) {
      setInvite(false);
      return;
    }
    const show = setTimeout(() => {
      remember();
      setInvite(true);
    }, 2500);
    const hide = setTimeout(() => setInvite(false), 2500 + INVITE_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [onHome]);
  const start = useCallback((play = false, path: "tour" | "demo" = "tour") => {
    remember();
    setInvite(false);
    setSteps(path === "demo" ? demoSteps : tourSteps);
    setAutoplay(play);
    setStep(0);
  }, []);
  const close = useCallback(() => {
    remember();
    setStep(null);
    setAutoplay(false);
  }, []);
  return (
    <TourContext.Provider value={{ start, active: step !== null }}>
      {children}
      {step !== null && (
        <TourOverlay
          steps={steps}
          demo={steps === demoSteps}
          step={step}
          autoplay={autoplay}
          setAutoplay={setAutoplay}
          go={(n) => (n < 0 || n >= steps.length ? close() : setStep(n))}
          close={close}
        />
      )}
      {invite && step === null && (
        <div className="tour-invite" role="dialog" aria-label="Take the tour">
          <strong>New to TerraShift?</strong>
          <span>A 90-second tour shows what the radar found and how to read it.</span>
          <div>
            <button className="button" onClick={() => start(false)}>
              Take the tour
            </button>
            <button
              className="text-button"
              onClick={() => {
                remember();
                setInvite(false);
              }}
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </TourContext.Provider>
  );
}

type Box = { top: number; left: number; width: number; height: number };

function TourOverlay({
  steps,
  demo,
  step,
  autoplay,
  setAutoplay,
  go,
  close,
}: {
  steps: TourStep[];
  demo: boolean;
  step: number;
  autoplay: boolean;
  setAutoplay: (v: boolean) => void;
  go: (n: number) => void;
  close: () => void;
}) {
  const s = steps[step],
    navigate = useNavigate(),
    location = useLocation(),
    card = useRef<HTMLDivElement>(null),
    [box, setBox] = useState<Box | null>(null),
    // True when the latest box change should animate (a new step, or a layout shift);
    // false while the page scrolls, so the spotlight and card stay glued to the target.
    [glide, setGlide] = useState(false),
    // Which step's target has been found (or given up on); compared with `step` so a new step
    // never sees the previous one's "found" for a render.
    [foundStep, setFoundStep] = useState(-1),
    found = foundStep === step,
    [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null),
    [cardGlide, setCardGlide] = useState(false),
    // The card stays transparent until its first placement, so it never flashes in the middle.
    [shown, setShown] = useState(false),
    reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Go to the step's page, find the target, scroll it into view and wait until it has stopped
  // moving (smooth scroll, a page fading in, data arriving), then move the spotlight and card
  // there in one glide. Until then both hold still where they were: picking a place while the
  // target was still moving made the card bounce from side to side before it settled.
  // Afterwards the target is followed every frame, so scrolling, resizing, layout shifts and
  // URL rewrites (the Explorer and Analysis keep theirs in sync) never re-scroll the page.
  useEffect(() => {
    const [path, query = ""] = s.to.split("?");
    const samePath = location.pathname.replace(/(.)\/+$/, "$1") === path;
    const onPage = samePath && (!query || query.split("&").every((q) => location.search.includes(q)));
    if (!onPage) navigate(s.to);
    const setFound = (v: boolean) => v && setFoundStep(step);
    // A new page: drop the old spotlight (its element is going away) but keep the card in place.
    if (!samePath) setBox(null);
    if (!s.target) {
      setBox(null);
      setFound(true);
      return;
    }
    const target = s.target;
    let stopped = false,
      frame = 0,
      el: Element | null = null,
      shownBox: Box | null = null,
      settling = false,
      settleStart = 0,
      prev: Box | null = null,
      stableSince = 0,
      stableFrames = 0,
      lastScroll = -Infinity,
      lastChange = -Infinity,
      lastLook = -Infinity,
      gaveUp = false;
    const begin = performance.now(),
      // The old page fades out before the new one mounts: do not pick up its elements.
      startAfter = samePath ? 0 : 250,
      rectOf = (e: Element): Box => {
        const r = e.getBoundingClientRect();
        return { top: r.top, left: r.left, width: r.width, height: r.height };
      },
      same = (a: Box | null, b: Box | null) =>
        !!a &&
        !!b &&
        Math.abs(a.top - b.top) < 0.5 &&
        Math.abs(a.left - b.left) < 0.5 &&
        Math.abs(a.width - b.width) < 0.5 &&
        Math.abs(a.height - b.height) < 0.5,
      offScreen = (b: Box) => b.top + b.height < 0 || b.top > window.innerHeight,
      bringIntoView = (e: Element) => {
        // On phones the card docks at the bottom, so bring the target to the top.
        e.scrollIntoView({
          block: window.innerWidth < 700 ? "start" : "center",
          behavior: reduced ? "auto" : "smooth",
        });
        settling = true;
        settleStart = performance.now();
        prev = null;
        stableFrames = 0;
      },
      show = (b: Box, animate: boolean) => {
        shownBox = b;
        setGlide(animate && !reduced);
        setBox(b);
      };
    const onScroll = () => (lastScroll = performance.now());
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);

    const loop = (now: number) => {
      if (stopped) return;
      frame = requestAnimationFrame(loop);
      if (!el || !el.isConnected) {
        el = null;
        if (now - begin < startAfter || now - lastLook < 100) return;
        lastLook = now;
        const e = document.querySelector(target);
        if (!e || e.getBoundingClientRect().height === 0) {
          if (!gaveUp && now - begin > 6000) {
            // Not on screen (e.g. hidden on phones): show the card centred, keep looking.
            gaveUp = true;
            shownBox = null;
            setBox(null);
            setFound(true);
          }
          return;
        }
        el = e;
        // A first find always scrolls; a re-rendered target only if it is out of view.
        if (!shownBox || gaveUp || offScreen(rectOf(e))) bringIntoView(e);
        else settling = true;
      }
      const b = rectOf(el);
      if (settling) {
        if (same(b, prev)) stableFrames++;
        else {
          stableFrames = 0;
          stableSince = now;
        }
        prev = b;
        // Settled: unchanged for three frames and 120 ms (or give up waiting after 1.5 s).
        if ((stableFrames >= 3 && now - stableSince >= 120) || now - settleStart > 1500) {
          settling = false;
          lastChange = now;
          show(b, true);
          setFound(true);
        }
        return;
      }
      if (!same(b, shownBox)) {
        // Glide over a one-off layout shift; follow scrolling and continuous motion directly.
        const animate = now - lastScroll > 150 && now - lastChange > 150;
        lastChange = now;
        show(b, animate);
      }
    };
    frame = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Never keep the card hidden for long, even if the target is slow to appear.
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 700);
    return () => clearTimeout(t);
  }, []);

  // Place the card next to the spotlight, or centred / docked when there is no room. It is
  // placed only once the target has settled, and while following a scroll it keeps the side it
  // is on for as long as it fits, so it never flips back and forth.
  const side = useRef<"below" | "above" | "right" | "corner" | null>(null);
  useLayoutEffect(() => {
    const c = card.current;
    if (!c || !found) return; // hold still while the next target is being found
    const vw = window.innerWidth,
      vh = window.innerHeight,
      w = c.offsetWidth,
      h = c.offsetHeight,
      gap = 16;
    const hadPos = cardPos !== null;
    setShown(true);
    if (!box || vw < 700) {
      side.current = null;
      setCardGlide(false);
      setCardPos(null); // CSS centres it, or docks it at the bottom on phones
      return;
    }
    const left = Math.min(Math.max(box.left, 16), vw - w - 16);
    const places = {
      below: box.top + box.height + gap + h < vh - 16 && { top: box.top + box.height + gap, left },
      above: box.top - gap - h > 16 && { top: box.top - gap - h, left },
      right: box.left + box.width + gap + w < vw - 16 && {
        top: Math.min(Math.max(box.top, 16), vh - h - 16),
        left: box.left + box.width + gap,
      },
      corner: { top: vh - h - 24, left: vw - w - 24 },
    };
    const order = ["below", "above", "right", "corner"] as const;
    // Following a scroll: stay on the same side while it still fits.
    const keep = !glide && side.current && places[side.current] ? side.current : null;
    const pick = keep ?? order.find((k) => places[k])!;
    side.current = pick;
    setCardGlide(glide && hadPos);
    setCardPos(places[pick] as { top: number; left: number });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box, found]);

  // Keyboard: arrows move, Escape closes. Focus the card for screen readers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Leave arrows to text fields, sliders and the map.
      const busy = t?.closest("input, textarea, select, [contenteditable], .maplibregl-map");
      if (e.key === "Escape") close();
      else if (busy) return;
      else if (e.key === "ArrowRight") go(step + 1);
      else if (e.key === "ArrowLeft" && step > 0) go(step - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, go, close]);
  useEffect(() => {
    if (found) card.current?.focus({ preventScroll: true });
  }, [found, step]);

  // A step's action runs once its target is on screen, after a moment to look at it.
  useEffect(() => {
    if (!found || !s.action) return;
    const t = setTimeout(stepActions[s.action], (reduced ? 300 : 2500) / demoSpeed());
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, step]);

  // Guided demo: advance automatically while playing. `go` changes on every address change
  // (the Explorer rewrites its URL as the demo moves the slider), so it is read through a ref:
  // otherwise each URL update restarted the countdown and a busy page could hold a step forever.
  const stay = (s.ms ?? AUTOPLAY_MS) / demoSpeed();
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    if (!autoplay || !found) return;
    const t = setTimeout(() => goRef.current(step + 1), stay);
    return () => clearTimeout(t);
  }, [autoplay, found, step, stay]);

  // A slow NASA image never holds the demo: if it has not arrived within IMAGE_WAIT_MS, say so
  // and move on two seconds later.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!autoplay || !s.needsImage) return;
    const speed = demoSpeed();
    let skip: ReturnType<typeof setTimeout> | undefined;
    const wait = setTimeout(() => {
      if (imageReady()) return;
      setSlow(true);
      skip = setTimeout(() => goRef.current(step + 1), 2000 / speed);
    }, IMAGE_WAIT_MS / speed);
    return () => {
      clearTimeout(wait);
      clearTimeout(skip);
    };
  }, [autoplay, step]);

  const pad = 8;
  return (
    <div className="tour-layer" aria-live="polite">
      {box ? (
        <div
          className={`tour-spotlight${glide ? " glide" : ""}`}
          style={{
            transform: `translate3d(${box.left - pad}px, ${box.top - pad}px, 0)`,
            width: box.width + pad * 2,
            height: box.height + pad * 2,
          }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      <div
        ref={card}
        className={`tour-card${cardPos ? " placed" : " floating"}${cardGlide ? " glide" : ""}${shown ? "" : " pending"}`}
        style={cardPos ? { transform: `translate3d(${cardPos.left}px, ${cardPos.top}px, 0)` } : undefined}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        aria-busy={!found}
        tabIndex={-1}
      >
        <div className="tour-card-top">
          <span>
            {demo ? "90-SECOND DEMO" : autoplay ? "GUIDED DEMO" : "TOUR"} · {step + 1} / {steps.length}
          </span>
          <button className="tour-icon" onClick={close} aria-label="Close the tour">
            <X size={16} />
          </button>
        </div>
        <h2 id="tour-title">{s.title}</h2>
        <p id="tour-body">{s.body}</p>
        {slow && (
          <p className="tour-slow" role="status">
            NASA's image is slow right now, so the demo moves on. It will be there when you come back.
          </p>
        )}
        <div className="tour-progress" aria-hidden="true">
          {steps.map((_, i) => (
            <i key={i} className={i < step ? "done" : i === step ? "active" : ""}>
              {i === step && autoplay && found && (
                <b style={{ animationDuration: `${stay}ms` }} />
              )}
            </i>
          ))}
        </div>
        <div className="tour-actions">
          <button className="text-button" onClick={() => go(step - 1)} disabled={step === 0}>
            <ArrowLeft size={15} />
            Back
          </button>
          <button
            className="tour-icon"
            onClick={() => setAutoplay(!autoplay)}
            aria-label={autoplay ? "Pause the guided demo" : "Play the tour automatically"}
            title={autoplay ? "Pause" : "Play automatically"}
          >
            {autoplay ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button className="button" onClick={() => go(step + 1)}>
            {step === steps.length - 1 ? "Finish" : "Next"}
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
