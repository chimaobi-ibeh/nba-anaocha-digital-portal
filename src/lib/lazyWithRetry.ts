import { lazy, type ComponentType } from "react";

// After a deploy, the fingerprinted chunk files of the previous build stop
// existing — tabs opened before the deploy then fail dynamic imports with
// "Failed to fetch dynamically imported module". One silent reload fetches
// the new build and the navigation succeeds. The sessionStorage flag keeps a
// genuinely broken connection from looping: a second consecutive failure is
// rethrown to the ErrorBoundary instead.
const RELOAD_FLAG = "chunk-reload";

export function lazyWithRetry<T extends ComponentType<unknown>>(
  importer: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const mod = await importer();
      sessionStorage.removeItem(RELOAD_FLAG);
      return mod;
    } catch (err) {
      if (!sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, "1");
        window.location.reload();
        // Halt rendering while the reload takes over.
        return new Promise<never>(() => {});
      }
      sessionStorage.removeItem(RELOAD_FLAG);
      throw err;
    }
  });
}
