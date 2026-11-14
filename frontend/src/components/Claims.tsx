import { Check, X } from "lucide-react";
import { useApp } from "../lib/context";
import { claims } from "../lib/claims";

/** One-page summary of what the evidence supports and what it does not. */
export function ClaimsBox() {
  const { catalog } = useApp();
  const { can, cannot } = claims(catalog);
  return (
    <section className="claims-box" aria-labelledby="claims-title">
      <h2 id="claims-title">What we can and cannot claim</h2>
      <div className="claims-columns">
        <div>
          <h3>We can say</h3>
          <ul>
            {can.map((t) => (
              <li key={t}>
                <Check size={15} aria-hidden="true" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>We cannot say</h3>
          <ul>
            {cannot.map((t) => (
              <li key={t}>
                <X size={15} aria-hidden="true" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
