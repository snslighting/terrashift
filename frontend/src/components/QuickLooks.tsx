import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Maximize2, X } from "lucide-react";
import { asset } from "../lib/api";
import { longDate } from "../lib/science";

export interface QuickLook {
  id: string;
  name: string;
  region: string;
  theme: string;
  longitude: number;
  latitude: number;
  why: string;
  granule: string;
  before: string;
  after: string;
  orbit: string;
  track: number;
  frame: number;
  image: string;
  metadata: string;
}

let cache: Promise<QuickLook[]> | undefined;
export const loadQuickLooks = () =>
  (cache ??= fetch(asset("evidence/quicklooks/quicklooks.json"))
    .then((r) => (r.ok ? r.json() : { places: [] }))
    .then((d: { places: QuickLook[] }) => d.places)
    .catch(() => {
      cache = undefined;
      return [];
    }));

const reading =
  "Repeating colour bands are interference fringes: the phase difference between the two radar dates. Tight fringes over glaciers and volcanoes usually mean the surface moved; broad, smooth bands are often atmosphere or ionosphere. Grainy areas (open water, fast-changing ground) lost coherence.";

/** NASA's own quick-look images of recent NISAR products, shown as distributed. */
export function QuickLookGallery() {
  const [items, setItems] = useState<QuickLook[]>([]),
    [open, setOpen] = useState<QuickLook>(),
    dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    loadQuickLooks().then(setItems);
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(undefined);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [open]);
  if (!items.length) return null;
  return (
    <section className="quicklooks" aria-labelledby="quicklooks-title">
      <span className="eyebrow">
        <span />
        AROUND THE WORLD WITH NISAR
      </span>
      <h2 id="quicklooks-title">Recent NISAR views from around the world.</h2>
      <p className="section-description">
        NASA's own quick-look images of recent NISAR interferograms over {items.length} places, found
        in NASA's public catalog. They are shown exactly as NASA produced them: TerraShift has not
        processed, corrected or validated them.
      </p>
      <div className="quicklook-grid">
        {items.map((q) => (
          <article key={q.id} className="quicklook-card">
            <button
              className="quicklook-image"
              onClick={() => setOpen(q)}
              aria-label={`Enlarge NASA quick-look of ${q.name}`}
            >
              <img src={asset(`evidence/${q.image}`)} alt="" loading="lazy" />
              <span className="quicklook-zoom">
                <Maximize2 size={14} />
              </span>
            </button>
            <div className="quicklook-copy">
              <span className="quicklook-theme">{q.theme}</span>
              <h3>{q.name}</h3>
              <p className="quicklook-region">{q.region}</p>
              <p>{q.why}</p>
              <p className="tiny">
                {longDate(q.before)} → {longDate(q.after)} · {q.orbit.toLowerCase()}, track {q.track}
              </p>
              <Link
                className="text-button"
                to={`/explore?lat=${q.latitude.toFixed(3)}&lon=${q.longitude.toFixed(3)}`}
              >
                Find observations here
                <ArrowUpRight size={14} />
              </Link>
            </div>
          </article>
        ))}
      </div>
      <p className="tiny quicklook-reading">{reading}</p>
      {open && (
        <div className="modal-backdrop quicklook-backdrop" onClick={() => setOpen(undefined)}>
          <div
            ref={dialog}
            className="quicklook-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quicklook-dialog-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="tour-icon quicklook-close" onClick={() => setOpen(undefined)} aria-label="Close">
              <X size={16} />
            </button>
            <img src={asset(`evidence/${open.image}`)} alt={`NASA quick-look interferogram of ${open.name}`} />
            <div>
              <span className="quicklook-theme">{open.theme}</span>
              <h3 id="quicklook-dialog-title">
                {open.name} · {open.region}
              </h3>
              <p>{open.why}</p>
              <p className="muted">{reading}</p>
              <p className="tiny">
                {longDate(open.before)} → {longDate(open.after)} · {open.orbit} orbit, track {open.track},
                frame {open.frame}
              </p>
              <code className="granule-id">{open.granule}</code>
              <p>
                <a className="source-link" href={open.metadata} target="_blank" rel="noopener noreferrer">
                  NASA catalog record
                  <ArrowUpRight size={13} />
                </a>
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
