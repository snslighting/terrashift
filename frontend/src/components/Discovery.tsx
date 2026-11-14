import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, ArrowRight, Pause, Play, RefreshCw, X } from "lucide-react";
import { asset } from "../lib/api";
import { holdPreview, loadPreview, previewChoices, footprintBounds, footprintRing, type PreviewImage } from "../lib/browse";
import { startPreview, stateFor, type PreviewState } from "../lib/previewRequest";
import { geometries, placeStats, timeline } from "../lib/catalogStats";
import { ladder, sameGeometry, trustLabels, type Trust } from "../lib/evidence";
import { presets, themeGuide, COUNTS_DATE, type Preset } from "../lib/presets";
import { longDate } from "../lib/science";
import { LearnMore } from "./Resources";
import type { Product, ProductKind } from "../lib/types";

export const kindLabels: Record<ProductKind, { short: string; long: string }> = {
  GUNW: { short: "Ground motion", long: "Ground motion (GUNW interferograms)" },
  GCOV: { short: "Backscatter", long: "Backscatter (GCOV, by polarization)" },
};

/** "21 Oct 2026" for a GCOV, "9 Oct → 21 Oct 2026" for a GUNW pair. */
export function productDates(p: Product) {
  if (p.kind === "GUNW" && p.before && p.after)
    return `${longDate(p.before.slice(0, 10))} → ${longDate(p.after.slice(0, 10))}`;
  return p.date ? longDate(p.date) : "Unknown date";
}

/** Four-level status ladder: what exists for this result, and how far it was checked. */
export function StatusLadder({ level, trust }: { level: 1 | 2 | 3 | 4; trust?: Trust }) {
  return (
    <div className="status-ladder" aria-label={`Status: level ${level} of 4, ${ladder[level - 1].short}`}>
      <ol>
        {ladder.map((r) => (
          <li key={r.level} className={r.level <= level ? "reached" : ""} title={r.text}>
            <i>{r.level}</i>
            <span>{r.short}</span>
          </li>
        ))}
      </ol>
      <p className="tiny">
        {ladder[level - 1].text}
        {level === 4 && trust ? ` ${trustLabels[trust]}.` : ""}
      </p>
    </div>
  );
}

export type { PreviewState };

/** Key of the image a view wants: product, image choice and retry attempt. */
export function previewKey(product: Product | undefined, choice: string, attempt = 0) {
  if (!product || product.cached_pair) return "";
  const options = previewChoices(product),
    pick = options.find((o) => o.id === choice) ?? options[0];
  return pick && footprintBounds(product) ? `${product.id}|${pick.id}|${attempt}` : "";
}

/**
 * NASA preview for a product: the 100 px thumbnail first (instant), then the
 * full image with download progress. When the product, data type or
 * polarization changes, the previous image is dropped at once and its download
 * cancelled; results of earlier requests are ignored. After 20 seconds the
 * request stops with an error and `retry` tries again. Failures leave the
 * footprint and the report card in place.
 */
export function usePreview(product: Product | undefined, choice: string) {
  const [attempt, setAttempt] = useState(0);
  const key = previewKey(product, choice, attempt);
  const [raw, setState] = useState<PreviewState>({ status: "idle", key: "" });
  useEffect(() => {
    if (!key || !product) return;
    const footprint = footprintRing(product),
      options = previewChoices(product),
      pick = options.find((o) => o.id === choice) ?? options[0];
    return startPreview(
      {
        key,
        url: pick.url,
        native: pick.native,
        footprint,
        thumbnail: pick.id === "combined" ? product.browse.thumbnail : undefined,
      },
      setState,
      loadPreview,
    );
  }, [key]);
  const state = stateFor(raw, key);
  // Keep the image in memory while it is on screen.
  const onScreen = state.status === "ready" ? state.image.id : state.status === "loading" ? state.thumb?.id : undefined;
  useEffect(() => (onScreen ? holdPreview(onScreen) : undefined), [onScreen]);
  return { state, retry: () => setAttempt((n) => n + 1) };
}

/** Image buttons for a product (combined, HH, HV, frequency A/B), with a reading guide. */
export function PolarizationSwitch({
  product,
  choice,
  onChoice,
}: {
  product: Product;
  choice: string;
  onChoice: (id: string) => void;
}) {
  const options = previewChoices(product);
  if (options.length < 2) return null;
  const current = options.find((o) => o.id === choice) ?? options[0];
  const twoFreq = new Set(product.browse.bands.map((b) => b.frequency)).size > 1;
  return (
    <div className="polarization-switch">
      <div className="section-caption">PREVIEW IMAGE</div>
      <div className="segmented wrap" role="group" aria-label="Preview image">
        {options.map((o) => (
          <button
            key={o.id}
            className={current.id === o.id ? "active" : ""}
            aria-pressed={current.id === o.id}
            onClick={() => onChoice(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <ul className="polarization-guide">
        <li>
          <b>HH</b> (sent and received horizontally) is strong over rough ground, buildings and
          flooded vegetation, and weak over calm water.
        </li>
        <li>
          <b>HV</b> (sent horizontally, received vertically) responds to the volume of vegetation:
          forests are bright, bare fields and water dark.
        </li>
        <li>
          A drop in HH over land can mean new open water; a rise can mean flooded vegetation. This
          is general guidance, not a finding about this image.
        </li>
        {twoFreq && (
          <li>
            Frequencies A and B are both L-band: A uses a wider bandwidth (finer detail), B a
            narrower one.
          </li>
        )}
      </ul>
      <p className="tiny">
        {current.native
          ? "Single-polarization images come in the product's own map grid (UTM, or polar stereographic near the poles). "
          : "The combined image is on a latitude/longitude grid. "}
        NASA's preview files carry no map coordinates, so TerraShift places them from the product
        footprint: approximate placement. Checked against coastlines on three scenes (Libya and
        Iceland), within about 0.2 to 1.5 km.
      </p>
    </div>
  );
}

/** How long play shows each date once its image is ready. */
export const PLAY_DWELL_MS = 1500;

/** Date slider over one family's products, with play and a compare button. */
export function TimeScrubber({
  products,
  active,
  onPick,
  onCompare,
  ready = true,
}: {
  products: Product[];
  active?: Product;
  onPick: (p: Product) => void;
  onCompare: () => void;
  /** False while the current date's image is still loading: play waits for it. */
  ready?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const index = Math.max(0, products.findIndex((p) => p.id === active?.id));
  const latest = useRef({ index, products, onPick });
  latest.current = { index, products, onPick };
  // Play shows each date for 1.5 s once its image is on the map, so images are
  // never requested faster than they arrive.
  useEffect(() => {
    if (!playing || !ready) return;
    const t = setTimeout(() => {
      const { index: i, products: list, onPick: pick } = latest.current;
      pick(list[(i + 1) % list.length]);
    }, PLAY_DWELL_MS);
    return () => clearTimeout(t);
  }, [playing, ready, index]);
  useEffect(() => setPlaying(false), [products]);
  if (products.length < 2) return null;
  const current = products[index];
  return (
    <div className="time-scrubber">
      <button
        className="scrubber-play"
        onClick={() => setPlaying(!playing)}
        aria-label={playing ? "Pause the time series" : "Play the time series"}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <label>
        <span>
          {productDates(current)} · track {current.track ?? "?"} {current.orbit?.toLowerCase() ?? ""}
          <small>
            {index + 1} / {products.length}
          </small>
        </span>
        <input
          type="range"
          min={0}
          max={products.length - 1}
          value={index}
          onChange={(e) => {
            setPlaying(false);
            onPick(products[+e.target.value]);
          }}
          aria-label="Observation date"
          aria-valuetext={productDates(current)}
        />
      </label>
      <button className="scrubber-compare" onClick={onCompare}>
        <ArrowLeftRight size={15} />
        <span>Compare two dates</span>
      </button>
    </div>
  );
}

/** A decoded preview drawn into a canvas (previews are bitmaps, not files). */
export function BitmapCanvas({ image, ...rest }: { image: PreviewImage } & React.CanvasHTMLAttributes<HTMLCanvasElement>) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = image.width;
    c.height = image.height;
    c.getContext("2d")?.drawImage(image.bitmap, 0, 0);
    return () => {
      // Release the canvas copy as soon as the view closes.
      c.width = c.height = 0;
    };
  }, [image.id]);
  return <canvas ref={ref} aria-hidden="true" {...rest} />;
}

/** One image placed in a shared geographic frame (CSS percentages). */
function Placed({ image, frame }: { image: PreviewImage; frame: [number, number, number, number] }) {
  const [w, s, e, n] = frame,
    [[left, top], , [right, bottom]] = image.coordinates;
  return (
    <BitmapCanvas
      image={image}
      style={{
        left: `${((left - w) / (e - w)) * 100}%`,
        width: `${((right - left) / (e - w)) * 100}%`,
        top: `${((n - top) / (n - s)) * 100}%`,
        height: `${((top - bottom) / (n - s)) * 100}%`,
      }}
    />
  );
}

/**
 * Swipe between two dates of the same track and orbit direction. Different
 * geometries look different for reasons unrelated to change, so they are not offered.
 */
export function SwipeCompare({
  products,
  start,
  choice,
  onClose,
}: {
  products: Product[];
  start: Product;
  choice: string;
  onClose: () => void;
}) {
  const options = useMemo(() => products.filter((p) => sameGeometry(p, start)), [products, start.id]);
  const [aId, setA] = useState(() => (options.at(0)?.id === start.id ? options[1]?.id : options[0]?.id) ?? start.id),
    [bId, setB] = useState(start.id),
    [split, setSplit] = useState(50),
    a = options.find((p) => p.id === aId) ?? start,
    b = options.find((p) => p.id === bId) ?? start,
    A = usePreview(a, choice),
    B = usePreview(b, choice),
    dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  const imgA = A.state.status === "ready" ? A.state.image : undefined,
    imgB = B.state.status === "ready" ? B.state.image : undefined;
  const frame = useMemo(() => {
    const corners = [imgA, imgB].flatMap((i) => i?.coordinates ?? []);
    if (!corners.length) return null;
    const lons = corners.map((c) => c[0]),
      lats = corners.map((c) => c[1]);
    return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] as [number, number, number, number];
  }, [imgA, imgB]);
  const aspect = frame ? ((frame[2] - frame[0]) * Math.cos((((frame[1] + frame[3]) / 2) * Math.PI) / 180)) / (frame[3] - frame[1]) : 1;
  const select = (value: string, set: (v: string) => void, label: string) => (
    <label>
      {label}
      <select value={value} onChange={(e) => set(e.target.value)}>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {productDates(p)} · frame {p.frame ?? "?"}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialog}
        className="swipe-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Compare two dates"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="dialog-x" onClick={onClose} aria-label="Close comparison">
          <X size={18} />
        </button>
        <span className="eyebrow">
          <span />
          NASA PREVIEWS · TRACK {start.track ?? "?"} / FRAME {start.frame ?? "?"}, {start.orbit?.toUpperCase() ?? ""}
        </span>
        <h2>Compare two dates.</h2>
        <div className="swipe-pickers">
          {select(aId, setA, "Left")}
          {select(bId, setB, "Right")}
        </div>
        {options.length < 2 ? (
          <p className="warning">
            Only one product shares this track, frame and orbit direction. Other geometries are not offered,
            because the radar sees the ground from another angle and the images differ for reasons
            unrelated to change.
          </p>
        ) : (
          <div className="swipe-stage" style={{ aspectRatio: String(aspect || 1) }}>
            {frame && imgB && (
              <div className="swipe-layer">
                <Placed image={imgB} frame={frame} />
              </div>
            )}
            {frame && imgA && (
              <div className="swipe-layer" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
                <Placed image={imgA} frame={frame} />
              </div>
            )}
            {(!imgA || !imgB) && (
              <div className="swipe-loading">
                <RefreshCw size={16} className="spin" /> Loading NASA previews…
              </div>
            )}
            <div className="swipe-line" style={{ left: `${split}%` }}>
              <span>
                <ArrowLeftRight size={16} />
              </span>
            </div>
            <span className="comparison-date left">{a.date}</span>
            <span className="comparison-date right">{b.date}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={split}
              onChange={(e) => setSplit(+e.target.value)}
              aria-label="Move the divider between the two dates"
            />
          </div>
        )}
        <p className="tiny">
          Only dates from the same track, frame and orbit direction can be compared. These are NASA's preview
          images, not TerraShift measurements: differences are clues, not results.
        </p>
      </div>
    </div>
  );
}

/** Acquisition calendar: one row per family, track and direction; one mark per date. */
export function AcquisitionCalendar({
  products,
  active,
  onPick,
}: {
  products: Product[];
  active?: Product;
  onPick: (p: Product) => void;
}) {
  const rows = geometries(products);
  const dates = products.map((p) => p.date).filter((d): d is string => Boolean(d)).sort();
  if (!rows.length || !dates.length) return null;
  const t0 = Date.parse(dates[0]),
    t1 = Math.max(Date.parse(dates.at(-1)!), t0 + 864e5 * 30),
    W = 300,
    L = 74,
    R = 6,
    rowH = 14,
    H = rows.length * rowH + 18,
    x = (d: string) => L + ((Date.parse(d) - t0) / (t1 - t0)) * (W - L - R);
  return (
    <figure className="acq-calendar">
      <figcaption className="section-caption">
        <span>WHEN NISAR LOOKED</span>
        <span>
          <i className="dot gunw" /> GUNW <i className="dot gcov" /> GCOV
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Acquisition calendar: ${products.length} products on ${rows.length} track rows from ${dates[0]} to ${dates.at(-1)}.`}>
        {rows.map((r, i) => (
          <g key={r.key} transform={`translate(0 ${i * rowH})`}>
            <text x={0} y={10} className="acq-label">
              {r.kind} {r.track ?? "?"} {r.orbit?.[0] ?? ""}
            </text>
            <line x1={L} x2={W - R} y1={6} y2={6} className="acq-rule" />
            {products
              .filter((p) => p.date && `${p.kind}-${p.track ?? "?"}-${p.orbit ?? "?"}` === r.key)
              .map((p) => (
                <rect
                  key={p.id}
                  x={x(p.date!) - 2}
                  y={1}
                  width={4}
                  height={10}
                  rx={1}
                  className={`acq-mark ${p.kind.toLowerCase()} ${p.id === active?.id ? "active" : ""}`}
                  onClick={() => onPick(p)}
                >
                  <title>
                    {p.kind} · {productDates(p)} · track {p.track}, frame {p.frame}
                  </title>
                </rect>
              ))}
          </g>
        ))}
        <text x={L} y={H - 2} className="acq-label">
          {dates[0]}
        </text>
        <text x={W - R} y={H - 2} className="acq-label" textAnchor="end">
          {dates.at(-1)}
        </text>
      </svg>
      <p className="tiny">
        Each mark is one product; gaps are dates with no product in the catalog. Catalog availability
        is not measurement quality.
      </p>
    </figure>
  );
}

/** What exists here, how often NISAR passes, and what to look for. */
export function PlaceCard({ products, preset, hits }: { products: Product[]; preset?: Preset; hits?: Partial<Record<ProductKind, number | null>> }) {
  const s = placeStats(products);
  const guide = preset ? themeGuide[preset.theme] : undefined;
  const count = (k: ProductKind) => {
    const h = hits?.[k];
    return h != null && h > s.counts[k] ? `${s.counts[k]} of ${h}` : String(s.counts[k]);
  };
  return (
    <section className="place-card" aria-label="Place report">
      <div className="section-caption">
        <span>PLACE REPORT</span>
        <span>CATALOG FACTS</span>
      </div>
      <dl>
        <div>
          <dt>Ground motion (GUNW)</dt>
          <dd>{count("GUNW")}</dd>
        </div>
        <div>
          <dt>Backscatter (GCOV)</dt>
          <dd>{count("GCOV")}</dd>
        </div>
        <div>
          <dt>First → latest</dt>
          <dd>{s.first && s.last ? `${s.first} → ${s.last}` : "—"}</dd>
        </div>
        <div>
          <dt>Typical repeat</dt>
          <dd>{s.repeatDays ? `${Math.round(s.repeatDays)} days` : "—"}</dd>
        </div>
        <div className="wide">
          <dt>Tracks</dt>
          <dd>
            {s.tracks.length
              ? s.tracks.map((t) => `${t.track ?? "?"} ${t.orbit?.toLowerCase() ?? ""}`).join(" · ")
              : "—"}
          </dd>
        </div>
      </dl>
      {guide && (
        <p className="place-guide">
          <span className="hypothesis-tag">General hypothesis</span>
          <b>{guide.label}:</b> {guide.look}
        </p>
      )}
      {guide && <LearnMore compact />}
    </section>
  );
}

/** One list of sample places: one click sets the area, theme and dates and searches. */
export function PlaceGallery({
  onPick,
  compact = false,
  limit,
}: {
  onPick?: (p: Preset) => void;
  compact?: boolean;
  limit?: number;
}) {
  const list = limit ? presets.slice(0, limit) : presets;
  return (
    <div className={`place-gallery ${compact ? "compact" : ""}`}>
      {list.map((p) => {
        const body = (
          <>
            {p.quicklook && !compact ? (
              <img src={asset(`evidence/quicklooks/${p.quicklook}.webp`)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
            ) : null}
            <span className="place-theme">{themeGuide[p.theme].label}</span>
            <strong>{p.name}</strong>
            <small>{p.region}</small>
            {!compact && <span className="place-why">{p.why}</span>}
            <span className="place-counts">
              {p.counts ? (
                <>
                  {p.counts.GUNW} GUNW · {p.counts.GCOV} GCOV
                </>
              ) : (
                "NASA quick-look place"
              )}
              <ArrowRight size={13} />
            </span>
          </>
        );
        return onPick ? (
          <button key={p.id} className="place-tile" onClick={() => onPick(p)}>
            {body}
          </button>
        ) : (
          <Link key={p.id} className="place-tile" to={`/explore?preset=${p.id}`}>
            {body}
          </Link>
        );
      })}
      <p className="tiny place-note">
        Product counts from NASA's catalog on {longDate(COUNTS_DATE)}, all dates, every product whose
        footprint touches the box. A search shows today's numbers.
      </p>
    </div>
  );
}

export { timeline };
