import { asset } from "../lib/api";
import { credits, INDEPENDENCE, team } from "../lib/team";

/** Team members from lib/team.ts, in the order given. */
export function TeamSection() {
  return (
    <section className="team-section" aria-labelledby="team-title">
      <h2 id="team-title">Team</h2>
      <ul className="team-list">
        {team.map((m) => (
          <li key={m.name}>
            {m.photo ? (
              <img src={asset(m.photo)} alt={`Portrait of ${m.name}`} width={96} height={128} loading="lazy" />
            ) : (
              <span className="team-initials" aria-hidden="true">
                {m.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")}
              </span>
            )}
            <strong>{m.name}</strong>
            <span>{m.role}</span>
          </li>
        ))}
      </ul>
      <p className="team-independence">{INDEPENDENCE}</p>
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
