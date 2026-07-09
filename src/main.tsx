import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initMonitoring, reportError } from "./lib/monitoring";
import { isChunkLoadError, reloadOnceForChunkError } from "./lib/lazyWithRetry";
import "./index.css";

initMonitoring();

const REQUIRED_ENV_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
] as const;

const missing = REQUIRED_ENV_VARS.filter(
  (key) => !import.meta.env[key]
);

if (missing.length > 0) {
  document.body.innerHTML = `<div style="font-family:sans-serif;padding:2rem;color:#c00">
    <h2>Missing environment variables</h2>
    <p>The following variables are required but not set:</p>
    <ul>${missing.map((k) => `<li><code>${k}</code></li>`).join('')}</ul>
    <p>Copy <code>.env.example</code> to <code>.env</code> and fill in the values.</p>
  </div>`;
  throw new Error(`Missing env vars: ${missing.join(', ')}`);
}

// Vite fires this when a dynamically imported chunk (or one of its deps) fails
// to load — the classic "stale chunk after a deploy" case, which Safari reports
// as a bare "Load failed". lazyWithRetry only guards the top-level page import;
// this catches dependency-chunk failures that surface during preload. Recover
// with one silent reload instead of leaving the user on a broken page.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  reloadOnceForChunkError();
});

window.addEventListener('unhandledrejection', (event) => {
  // Stale-chunk failures are transient and self-heal via the reload above, so
  // don't page ourselves over them.
  if (isChunkLoadError(event.reason)) {
    reloadOnceForChunkError();
    return;
  }
  console.error('[Unhandled Promise Rejection]', event.reason);
  reportError(event.reason, { source: 'unhandledrejection' });
});

createRoot(document.getElementById("root")!).render(<App />);
