# Contributing to TerraShift

Thanks for helping. TerraShift's promise is that every number is real and its limits are stated, so contributions keep that rule.

## Ground rules

- **No invented data.** Maps and figures come only from processed NISAR products. Missing observations stay missing; nothing is gap-filled or simulated for display.
- **Say how sure we are.** New results carry dates, product identifiers, units, references and known limits. A failed check is shown, not hidden.
- **Causes are hypotheses.** Describe likely drivers as candidates ("consistent with irrigation"), never as proven.
- **No secrets in the repo.** Earthdata credentials stay in your local, ignored `.netrc`.

## Development

See [Run locally](README.md#run-locally). Before opening a pull request:

```bash
uv run pytest -q && uv run ruff check src scripts tests && uv run ruff format --check src scripts tests
cd frontend && npm test && npm run build
```

## Requesting a new area

Use the **Request an area** issue template. Include the place, the dates, and the kind of change you expect. Processing needs NISAR coverage and a maintainer with Earthdata access, so requests are queued, not instant.
