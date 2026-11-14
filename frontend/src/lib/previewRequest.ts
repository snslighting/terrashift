import type { Position } from "./types";
import type { PreviewImage, Progress } from "./browse";

/** How long a preview may take (download and preparation) before we give up and offer a retry. */
export const PREVIEW_TIMEOUT_MS = 20_000;

/**
 * State of one preview request. `key` names the product and image it belongs
 * to, so a result for an earlier product can never be shown under a later one.
 */
export type PreviewState =
  | { status: "idle"; key: string }
  | { status: "loading"; key: string; progress: number; loaded: number; total: number; thumb?: PreviewImage }
  | { status: "ready"; key: string; image: PreviewImage }
  | { status: "error"; key: string; message: string; timedOut: boolean };

export interface PreviewRequest {
  key: string;
  url: string;
  /** Single-polarization image in the product's own map grid (else lat/lon). */
  native: boolean;
  /** Outer ring of the product footprint. */
  footprint: Position[];
  /** NASA's 100 px thumbnail, shown while the full image loads (combined image only). */
  thumbnail?: string;
}

type Load = (
  url: string,
  footprint: Position[],
  native: boolean,
  options: { onProgress?: Progress; signal?: AbortSignal },
) => Promise<PreviewImage>;

class TimeoutError extends Error {
  name = "TimeoutError";
}

/** Plain-language message for a failed preview. */
export function previewErrorMessage(error: unknown, timeoutMs = PREVIEW_TIMEOUT_MS): string {
  if (error instanceof TimeoutError)
    return `NASA's image server did not deliver the preview within ${Math.round(timeoutMs / 1000)} seconds.`;
  if (error instanceof TypeError) return "NASA's image server could not be reached.";
  return (error as Error)?.message || "The preview could not be loaded.";
}

/**
 * Start loading one preview. Every state is reported through `emit` with the
 * request's key. Calling the returned function cancels the request: its
 * download is aborted and nothing it produces afterwards is reported. After
 * `timeoutMs` the request is aborted and reported as an error.
 */
export function startPreview(
  request: PreviewRequest,
  emit: (state: PreviewState) => void,
  load: Load,
  timeoutMs = PREVIEW_TIMEOUT_MS,
): () => void {
  const controller = new AbortController(),
    { key } = request;
  let live = true,
    thumb: PreviewImage | undefined,
    progress = { progress: 0, loaded: 0, total: 0 };
  const send = (state: PreviewState) => live && emit(state);
  const timer = setTimeout(() => controller.abort(new TimeoutError("timeout")), timeoutMs);
  const finish = () => {
    clearTimeout(timer);
    live = false;
  };
  send({ status: "loading", key, ...progress });
  if (request.thumbnail)
    load(request.thumbnail, request.footprint, false, { signal: controller.signal })
      .then((image) => {
        thumb = image;
        send({ status: "loading", key, ...progress, thumb });
      })
      .catch(() => {});
  load(request.url, request.footprint, request.native, {
    signal: controller.signal,
    onProgress: (fraction, loaded, total) => {
      progress = { progress: fraction, loaded, total };
      send({ status: "loading", key, ...progress, thumb });
    },
  })
    .then((image) => {
      send({ status: "ready", key, image });
      finish();
    })
    .catch((error) => {
      const timedOut = controller.signal.reason instanceof TimeoutError;
      send({ status: "error", key, message: previewErrorMessage(timedOut ? controller.signal.reason : error, timeoutMs), timedOut });
      finish();
    });
  return () => {
    finish();
    controller.abort();
  };
}

/**
 * The state to show for the current key. Until the effect for a new product or
 * image has run, React still holds the previous state: treat it as loading
 * with no image, so the old picture is never drawn under the new label.
 */
export function stateFor(state: PreviewState, key: string): PreviewState {
  if (!key) return { status: "idle", key };
  return state.key === key ? state : { status: "loading", key, progress: 0, loaded: 0, total: 0 };
}
