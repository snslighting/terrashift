/**
 * Reliable catalog requests for the Explorer's live NASA CMR search.
 *
 * Why (measured 14 November 2026): each family's answer is about 1 MB (GUNW 0.93 MB, GCOV
 * 1.29 MB for 100 full records). On a 1.6 Mbit/s connection the GCOV request took 24.1 s, just
 * under the old fixed 25 s limit on the whole request, and one late family made the whole
 * search fail. Now a request only times out when no data has arrived for a while, each family
 * is fetched on its own and retried once, and results are shown as each family answers.
 */

export class StallError extends Error {
  name = "StallError";
}

/** No data for this long means the request has stalled. */
export const IDLE_MS = 20_000;
/** Hard limit for one request, however slowly data keeps arriving. */
export const TOTAL_MS = 90_000;
/** Pause before the single retry. */
export const RETRY_DELAY_MS = 1_200;

/**
 * Fetch JSON, aborting only when no bytes arrive for `idleMs` (or after `totalMs`), so a slow
 * but working connection is not cut off half-way through a large answer.
 */
export async function fetchJsonIdle<T>(
  url: string,
  signal?: AbortSignal,
  { idleMs = IDLE_MS, totalMs = TOTAL_MS, fetchImpl = fetch } = {},
): Promise<T> {
  const ctrl = new AbortController();
  let idle: ReturnType<typeof setTimeout> | undefined;
  const stall = () => ctrl.abort(new StallError("stalled"));
  const kick = () => {
    clearTimeout(idle);
    idle = setTimeout(stall, idleMs);
  };
  const total = setTimeout(stall, totalMs);
  const onAbort = () => ctrl.abort(signal?.reason);
  if (signal?.aborted) onAbort();
  signal?.addEventListener("abort", onAbort, { once: true });
  // Every wait races the abort, so a stalled download stops even if the body never errors.
  const aborted = new Promise<never>((_, fail) =>
    ctrl.signal.addEventListener("abort", () => fail(ctrl.signal.reason), { once: true }),
  );
  aborted.catch(() => {});
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    kick();
    const response = await Promise.race([fetchImpl(url, { signal: ctrl.signal }), aborted]);
    if (!response.ok)
      throw Error(
        response.status === 429
          ? "The data service is busy. Please wait and try again."
          : `Data service returned ${response.status}. Please try again.`,
      );
    if (!response.body) return (await Promise.race([response.json(), aborted])) as T;
    reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    for (;;) {
      kick();
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      parts.push(value);
    }
    const text = new TextDecoder().decode(await new Blob(parts as BlobPart[]).arrayBuffer());
    return JSON.parse(text) as T;
  } catch (e) {
    if (ctrl.signal.aborted && signal?.aborted) throw Error("Search cancelled.");
    if (ctrl.signal.reason instanceof StallError) throw new StallError("The data service took too long. Please retry.");
    if (e instanceof TypeError) throw Error("The data service could not be reached. Check your connection and retry.");
    throw e;
  } finally {
    if (ctrl.signal.aborted) reader?.cancel().catch(() => {});
    clearTimeout(idle);
    clearTimeout(total);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Run `task`; if it fails (and was not cancelled), wait and try once more. */
export async function withRetry<T>(task: () => Promise<T>, signal?: AbortSignal, delayMs = RETRY_DELAY_MS): Promise<T> {
  try {
    return await task();
  } catch (first) {
    if (signal?.aborted) throw first;
    await new Promise((ok) => setTimeout(ok, delayMs));
    if (signal?.aborted) throw first;
    return task();
  }
}

export type Settled<K extends string, T> = { kind: K; ok: true; value: T } | { kind: K; ok: false; error: unknown };

/**
 * Fetch several product families at once, each with one retry. `onUpdate` is called every time
 * a family settles, with everything settled so far and the families still pending, so the page
 * can show the first answers without waiting for the slowest one.
 */
export async function searchFamilies<K extends string, T>(
  kinds: K[],
  fetchFamily: (kind: K) => Promise<T>,
  onUpdate?: (settled: Settled<K, T>[], pending: K[]) => void,
  signal?: AbortSignal,
  delayMs = RETRY_DELAY_MS,
): Promise<Settled<K, T>[]> {
  const settled: Settled<K, T>[] = [];
  await Promise.all(
    kinds.map(async (kind) => {
      try {
        settled.push({ kind, ok: true, value: await withRetry(() => fetchFamily(kind), signal, delayMs) });
      } catch (error) {
        settled.push({ kind, ok: false, error });
      }
      if (!signal?.aborted && settled.length < kinds.length)
        onUpdate?.(
          [...settled],
          kinds.filter((k) => !settled.some((s) => s.kind === k)),
        );
    }),
  );
  return kinds.map((k) => settled.find((s) => s.kind === k)!);
}
