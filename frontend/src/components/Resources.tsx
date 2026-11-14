import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, ExternalLink, KeyRound } from "lucide-react";
import { presets, themeGuide, type Theme } from "../lib/presets";
import {
  fullDataLinks,
  learnResources,
  nisarApplications,
  NON_ENDORSEMENT,
  otherSarSources,
  themeCards,
  type Resource,
} from "../lib/resources";
import type { ChangeType, Product } from "../lib/types";
import { useApp } from "../lib/context";

/** A link that opens in a new tab, without giving the new page access to this one. */
export function OutLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className ?? "source-link"}>
      {children}
      <ExternalLink size={12} aria-hidden="true" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function ResourceList({ items, compact = false }: { items: Resource[]; compact?: boolean }) {
  return (
    <ul className={`resource-list ${compact ? "compact" : ""}`}>
      {items.map((r) => (
        <li key={r.url}>
          <OutLink href={r.url}>{r.title}</OutLink>
          {!compact && <span>{r.about}</span>}
        </li>
      ))}
    </ul>
  );
}

/** "Learn more" area: NISAR StoryMaps, applications white papers and UAVSAR postcards. */
export function LearnMore({ compact = false }: { compact?: boolean }) {
  return (
    <div className="learn-more">
      <div className="section-caption">LEARN MORE</div>
      <ResourceList items={nisarApplications} compact={compact} />
    </div>
  );
}

/** One card per theme: what radar may show (a hypothesis), sample places, and where to learn more. */
/** The catalog change type that matches a theme, for linking processed study areas. */
const themeChange: Partial<Record<Theme, ChangeType>> = {
  wetland: "flood",
  fire: "wildfire",
  farming: "agriculture",
  subsidence: "subsidence",
  earthquake: "earthquake",
};

export function ThemeCards() {
  const { catalog } = useApp();
  return (
    <div className="theme-cards">
      {themeCards.map((theme: Theme) => {
        const guide = themeGuide[theme],
          places = presets.filter((p) => p.theme === theme).slice(0, 3),
          processed = (catalog?.cases ?? []).filter((c) => themeChange[theme] && c.change_types.includes(themeChange[theme]!));
        return (
          <article className="theme-card" key={theme} id={`theme-${theme}`}>
            <h3>{guide.label}</h3>
            <p>
              <span className="hypothesis-tag">General hypothesis</span> {guide.look}
            </p>
            {places.length > 0 && (
              <p className="theme-places">
                NASA previews:{" "}
                {places.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && " · "}
                    <Link to={`/explore?preset=${p.id}`}>{p.name}</Link>
                  </span>
                ))}
              </p>
            )}
            {processed.length > 0 && (
              <p className="theme-places">
                Processed by TerraShift:{" "}
                {processed.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 && " · "}
                    <Link to={`/explore?case=${c.id}`}>{c.name}</Link>
                  </span>
                ))}
              </p>
            )}
            <LearnMore compact />
          </article>
        );
      })}
    </div>
  );
}

/**
 * Steps and links to get a product's science file. TerraShift never asks for, types or
 * stores an Earthdata login: the user signs in on NASA's or ASF's own site.
 */
export function FullDataPanel({ product }: { product: Pick<Product, "granule" | "kind" | "data_url"> }) {
  const links = fullDataLinks(product);
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard
      ?.writeText(product.granule)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  return (
    <details className="full-data">
      <summary>Get the full data</summary>
      <p className="full-data-login">
        <KeyRound size={14} aria-hidden="true" /> Downloads need your own free NASA Earthdata login. You sign in on
        NASA's or ASF's site; TerraShift never asks for or stores it.
      </p>
      <div className="granule-copy">
        <code>{product.granule}</code>
        <button type="button" className="text-button" onClick={copy} aria-label="Copy the product name">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy name"}
        </button>
      </div>
      <ol>
        <li>
          <OutLink href={links.earthdata}>NASA Earthdata Search</OutLink>: opens on this product. If the list is
          empty, paste the product name into the search box.
        </li>
        <li>
          <OutLink href={links.vertex}>ASF Vertex</OutLink>: opens a list search for this product. If it does not,
          choose "List Search" and paste the name.
        </li>
        {product.data_url && (
          <li>
            Or download the file directly: <OutLink href={product.data_url}>science file (HDF5)</OutLink>. Your
            browser goes to NASA's sign-in page first.
          </li>
        )}
        <li>
          Read the <OutLink href={links.guide}>NISAR Data User Guide</OutLink> to open the file: layers, units and
          quality flags.
        </li>
      </ol>
      <p className="tiny">
        A full {product.kind} file is large (often hundreds of megabytes to gigabytes). The pre-filled links follow
        the portals' address formats; if a portal changes them, use the product name.
      </p>
    </details>
  );
}

/** Other radar missions people can use. None of them is loaded in TerraShift. */
export function OtherSarSources() {
  return (
    <section className="other-sar" aria-labelledby="other-sar-title">
      <h2 id="other-sar-title">Other SAR sources</h2>
      <p className="muted">
        Not loaded in TerraShift. Listed so you can compare NISAR with other radars. No data from them is shown on
        this site.
      </p>
      <div className="other-sar-grid">
        {otherSarSources.map((s) => (
          <article key={s.title}>
            <h3>{s.title}</h3>
            <dl>
              <div>
                <dt>Radar band</dt>
                <dd>{s.band}</dd>
              </div>
              <div>
                <dt>Access</dt>
                <dd>{s.access}</dd>
              </div>
            </dl>
            <p>{s.about}</p>
            {s.url && <OutLink href={s.url}>Open the data page</OutLink>}
          </article>
        ))}
      </div>
    </section>
  );
}

/** Beginner material from NASA and the Canadian Space Agency. */
export function LearnLinks() {
  return (
    <section className="learn-links" aria-labelledby="learn-links-title">
      <h2 id="learn-links-title">Start learning</h2>
      <ResourceList items={learnResources} />
    </section>
  );
}

export function NonEndorsement() {
  return <p className="non-endorsement">{NON_ENDORSEMENT}</p>;
}
