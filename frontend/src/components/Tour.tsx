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
}

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

interface TourState {
  start: (autoplay?: boolean) => void;
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
  const start = useCallback((play = false) => {
    remember();
    setInvite(false);
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
          step={step}
          autoplay={autoplay}
          setAutoplay={setAutoplay}
          go={(n) => (n < 0 || n >= tourSteps.length ? close() : setStep(n))}
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
  step,
  autoplay,
  setAutoplay,
  go,
  close,
}: {
  step: number;
  autoplay: boolean;
  setAutoplay: (v: boolean) => void;
  go: (n: number) => void;
  close: () => void;
}) {
  const s = tourSteps[step],
    navigate = useNavigate(),
    location = useLocation(),
    card = useRef<HTMLDivElement>(null),
    [box, setBox] = useState<Box | null>(null),
    [found, setFound] = useState(false),
    [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null),
    reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const here = location.pathname.replace(/(.)\/+$/, "$1") + location.search;

  // Go to the step's page.
  useEffect(() => {
    const [path, query = ""] = s.to.split("?");
    const onPage =
      location.pathname.replace(/(.)\/+$/, "$1") === path &&
      (!query || query.split("&").every((q) => location.search.includes(q)));
    if (!onPage) navigate(s.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Wait for the target, then scroll it into view and track its position.
  useEffect(() => {
    setFound(false);
    setBox(null);
    if (!s.target) {
      setFound(true);
      return;
    }
    let el: Element | null = null,
      frame = 0,
      tries = 0,
      stopped = false;
    const measure = () => {
      if (!el || stopped) return;
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const look = () => {
      if (stopped) return;
      el = document.querySelector(s.target!);
      if (el && el.getBoundingClientRect().height > 0) {
        // On phones the card docks at the bottom, so bring the target to the top.
        el.scrollIntoView({
          block: window.innerWidth < 700 ? "start" : "center",
          behavior: reduced ? "auto" : "smooth",
        });
        setTimeout(measure, reduced ? 0 : 450);
        setFound(true);
        window.addEventListener("scroll", onMove, true);
        window.addEventListener("resize", onMove);
        return;
      }
      if (++tries < 60) setTimeout(look, 100);
      else setFound(true); // not on screen (e.g. hidden on phones): show the card centred
    };
    // Give a page transition time to finish before looking.
    const t = setTimeout(look, 150);
    return () => {
      stopped = true;
      clearTimeout(t);
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, here]);

  // Place the card next to the spotlight, or centred / docked when there is no room.
  useLayoutEffect(() => {
    const c = card.current;
    if (!c) return;
    const vw = window.innerWidth,
      vh = window.innerHeight,
      w = c.offsetWidth,
      h = c.offsetHeight,
      gap = 16;
    if (!box || vw < 700) {
      setCardPos(null); // CSS centres it, or docks it at the bottom on phones
      return;
    }
    const left = Math.min(Math.max(box.left, 16), vw - w - 16);
    if (box.top + box.height + gap + h < vh - 16) setCardPos({ top: box.top + box.height + gap, left });
    else if (box.top - gap - h > 16) setCardPos({ top: box.top - gap - h, left });
    else if (box.left + box.width + gap + w < vw - 16)
      setCardPos({ top: Math.min(Math.max(box.top, 16), vh - h - 16), left: box.left + box.width + gap });
    else setCardPos({ top: vh - h - 24, left: vw - w - 24 });
  }, [box, step]);

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

  // Guided demo: advance automatically while playing.
  useEffect(() => {
    if (!autoplay || !found) return;
    const t = setTimeout(() => go(step + 1), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [autoplay, found, step, go]);

  const pad = 8;
  return (
    <div className="tour-layer" aria-live="polite">
      {box ? (
        <div
          className="tour-spotlight"
          style={{
            top: box.top - pad,
            left: box.left - pad,
            width: box.width + pad * 2,
            height: box.height + pad * 2,
          }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      <div
        ref={card}
        className={`tour-card${cardPos ? "" : " floating"}`}
        style={cardPos ?? undefined}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
      >
        <div className="tour-card-top">
          <span>
            {autoplay ? "GUIDED DEMO" : "TOUR"} · {step + 1} / {tourSteps.length}
          </span>
          <button className="tour-icon" onClick={close} aria-label="Close the tour">
            <X size={16} />
          </button>
        </div>
        <h2 id="tour-title">{s.title}</h2>
        <p id="tour-body">{s.body}</p>
        <div className="tour-progress" aria-hidden="true">
          {tourSteps.map((_, i) => (
            <i key={i} className={i < step ? "done" : i === step ? "active" : ""}>
              {i === step && autoplay && found && (
                <b style={{ animationDuration: `${AUTOPLAY_MS}ms` }} />
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
            {step === tourSteps.length - 1 ? "Finish" : "Next"}
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
