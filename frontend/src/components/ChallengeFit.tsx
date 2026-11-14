import { Link } from "react-router-dom";
import { useApp } from "../lib/context";
import { presets } from "../lib/presets";

/**
 * How each part of the challenge is answered, with an honest status. Counts come from the
 * catalog and the sample-place list, so they stay right when data is added.
 */
export function ChallengeFit() {
  const { catalog } = useApp();
  const cases = catalog?.cases ?? [],
    pairs = cases.reduce((n, c) => n + c.pairs.length, 0);
  const rows: { need: string; status: "Done" | "Partly done"; what: React.ReactNode }[] = [
    {
      need: "Study areas",
      status: "Done",
      what: (
        <>
          {cases.length} areas processed by TerraShift ({cases.map((c) => c.name).join(", ")}); NASA previews for any
          place NISAR has looked, with {presets.length} one-click sample places. <Link to="/explore">Explorer</Link>
        </>
      ),
    },
    {
      need: "Physical drivers",
      status: "Done",
      what: (
        <>
          Every Earth Story has "likely drivers" with the evidence behind each, labelled as hypotheses, not
          findings. <Link to="/discoveries">Earth Stories</Link>
        </>
      ),
    },
    {
      need: "Polarizations",
      status: "Partly done",
      what: (
        <>
          HH and HV previews (frequencies A and B) for every backscatter product, with a reading guide and a
          colour legend. Measured HH and HV change needs a processed backscatter case: the Pantanal wetland case is
          prepared, not run yet.
        </>
      ),
    },
    {
      need: "Ancillary data",
      status: "Done",
      what: (
        <>
          Independent GNSS stations (Nevada Geodetic Laboratory), USGS earthquake epicentres, NASA GIBS MODIS
          optical imagery of the radar's day, satellite and terrain basemaps, country outlines.
        </>
      ),
    },
    {
      need: "Time series",
      status: "Partly done",
      what: (
        <>
          A date slider, play button, same-track compare and acquisition calendar for every place; {pairs} processed
          radar pairs; GNSS time series at stations. A processed backscatter series is prepared (9 dates), not run.
        </>
      ),
    },
    {
      need: "Future applications",
      status: "Done",
      what: (
        <>
          "What NISAR could do next" on the <Link to="/discoveries">Earth Stories</Link> page, and NASA's NISAR
          applications papers and StoryMaps on the <Link to="/learn">Learn</Link> page.
        </>
      ),
    },
    {
      need: "Open source",
      status: "Done",
      what: <>MIT licence, public repository, documented pipeline, tests and evidence exports with source hashes.</>,
    },
  ];
  return (
    <section className="challenge-fit" aria-labelledby="challenge-fit-title">
      <h2 id="challenge-fit-title">How TerraShift answers the challenge</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">The challenge asks for</th>
            <th scope="col">Status</th>
            <th scope="col">Where and how</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.need}>
              <th scope="row">{r.need}</th>
              <td>
                <span className={`fit-status ${r.status === "Done" ? "done" : "partly"}`}>{r.status}</span>
              </td>
              <td>{r.what}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
