import { PageIntro } from "../components/UI";
import { LearnLinks, NonEndorsement, OtherSarSources, OutLink, ThemeCards } from "../components/Resources";
import { NISAR_GUIDE } from "../lib/resources";

/** Learn: official resources from the challenge, by theme, plus other radar missions. */
export default function Learn() {
  return (
    <main className="content-page learn-page">
      <PageIntro
        eyebrow="LEARN / OFFICIAL RESOURCES"
        title="Learn to read radar."
        description="Short courses, NASA stories and data guides, chosen from the Dancing with the SARs challenge resources. Each opens on the publisher's own site."
      />
      <LearnLinks />
      <section className="learn-themes" aria-labelledby="themes-title">
        <h2 id="themes-title">Themes</h2>
        <p className="muted">
          What each kind of change can look like in radar. These are textbook explanations, so they are hypotheses
          to test, not findings about any particular image.
        </p>
        <ThemeCards />
      </section>
      <section className="learn-data" aria-labelledby="learn-data-title">
        <h2 id="learn-data-title">Get NISAR data yourself</h2>
        <p>
          Every product in the Explorer has a "Get the full data" panel with the steps and pre-filled links. Reading
          the files is explained in the <OutLink href={NISAR_GUIDE}>NISAR Data User Guide</OutLink>. Downloads need
          your own free NASA Earthdata login, which you enter on NASA's or ASF's site, never on TerraShift.
        </p>
      </section>
      <OtherSarSources />
      <NonEndorsement />
    </main>
  );
}
