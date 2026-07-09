import { lazy, type ComponentType } from "react";

// After a deploy, the fingerprinted chunk files of the previous build stop
// existing — tabs opened before the deploy then fail dynamic imports with
// "Failed to fetch dynamically imported module". One silent reload fetches
// the new build and the navigation succeeds. The sessionStorage flag keeps a
// genuinely broken connection from looping: a second consecutive failure is
// rethrown to the ErrorBoundary instead.
const RELOAD_FLAG = "chunk-reload";

// One silent reload per stale-chunk incident. Returns true if it triggered the
// reload (caller should halt), false if a reload has already been attempted and
// the failure is genuine (caller should surface the error).
export function reloadOnceForChunkError(): boolean {
  if (!sessionStorage.getItem(RELOAD_FLAG)) {
    sessionStorage.setItem(RELOAD_FLAG, "1");
    window.location.reload();
    return true;
  }
  sessionStorage.removeItem(RELOAD_FLAG);
  return false;
}

// Matches the browser phrasings for "a dynamically imported chunk could not be
// loaded". Deliberately excludes Safari's bare "Load failed" — that is Safari's
// generic message for ANY failed fetch (including real API calls), so matching
// it would auto-reload on genuine network errors. Safari's stale-chunk case is
// caught reliably by the dedicated `vite:preloadError` event instead.
export function isChunkLoadError(reason: unknown): boolean {
  const msg =
    typeof reason === "string"
      ? reason
      : reason instanceof Error
        ? reason.message
        : "";
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Expected a JavaScript module script/i.test(
    msg
  );
}

export function lazyWithRetry<T extends ComponentType<unknown>>(
  importer: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const mod = await importer();
      sessionStorage.removeItem(RELOAD_FLAG);
      return mod;
    } catch (err) {
      if (reloadOnceForChunkError()) {
        // Halt rendering while the reload takes over.
        return new Promise<never>(() => {});
      }
      throw err;
    }
  });
}
