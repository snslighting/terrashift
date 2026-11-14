import { motion, useReducedMotion } from "motion/react";
import { asset } from "../lib/api";
import { AI_ASSISTANCE, credits, INDEPENDENCE, team } from "../lib/team";

/** Team members from lib/team.ts, in the order given. */
export function TeamSection() {
  const reduced = useReducedMotion();
  // The glow follows the pointer and the card tilts a little toward it (CSS reads the variables).
  const spotlight = (e: React.PointerEvent<HTMLLIElement>) => {
    const el = e.currentTarget,
      r = el.getBoundingClientRect(),
      x = (e.clientX - r.left) / r.width,
      y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${x * 100}%`);
    el.style.setProperty("--my", `${y * 100}%`);
    if (!reduced) {
      el.style.setProperty("--rx", `${(0.5 - y) * 8}deg`);
      el.style.setProperty("--ry", `${(x - 0.5) * 10}deg`);
    }
  };
  const settle = (e: React.PointerEvent<HTMLLIElement>) => {
    e.currentTarget.style.setProperty("--rx", "0deg");
    e.currentTarget.style.setProperty("--ry", "0deg");
  };
  return (
    <section className="team-section" aria-labelledby="team-title">
      <h2 id="team-title">Team</h2>
      <ul className="team-list">
        {team.map((m, i) => (
          <motion.li
            key={m.name}
            // Visible at rest: cards only slide up in turn as they enter, so nothing stays hidden.
            initial={reduced ? false : { y: 28, scale: 0.97 }}
            whileInView={{ y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            onPointerMove={spotlight}
            onPointerLeave={settle}
          >
            {m.photo ? (
              <span className="team-photo">
                <img src={asset(m.photo)} alt={`Portrait of ${m.name}`} width={320} height={427} loading="lazy" />
              </span>
            ) : (
              <span className="team-initials" aria-hidden="true">
                {m.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")}
              </span>
            )}
            <div className="team-caption">
              <strong>{m.name}</strong>
              <span>{m.role}</span>
            </div>
          </motion.li>
        ))}
      </ul>
      <p className="team-independence">{INDEPENDENCE}</p>
      <p className="team-independence" data-testid="ai-assistance">
        {AI_ASSISTANCE}
      </p>
    </section>
  );
}

/** Data and tools, with the terms recorded in THIRD_PARTY_NOTICES.md. */
export function CreditsSection() {
  return (
    <section className="credits-section" aria-labelledby="credits-title">
      <h2 id="credits-title">Credits</h2>
      <dl>
        {credits.map((c) => (
          <div key={c.source}>
            <dt>{c.source}</dt>
            <dd>
              {c.use}.{c.terms && <span> {c.terms}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="tiny">
        Library and data notices:{" "}
        <a
          href="https://github.com/snslighting/terrashift/blob/main/frontend/public/THIRD_PARTY_NOTICES.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          THIRD_PARTY_NOTICES.md
        </a>
        .
      </p>
    </section>
  );
}
