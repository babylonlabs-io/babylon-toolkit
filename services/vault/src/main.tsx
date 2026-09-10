// Must come first — env validation initializes the network config
// runtime (`@/config/network`) at module load, before any other module
// reads from it.
import "@/config/env";

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib } from "bitcoinjs-lib";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "react-error-boundary";
import { BrowserRouter } from "react-router";

import GlobalError from "@/components/pages/global-error";
import { initSpeculosTransportForE2E } from "@/e2e/speculosTransportBootstrap";
import { logger } from "@/infrastructure";
import Providers from "@/providers";
import { Router } from "@/router";
import { reloadForStaleDeploy } from "@/utils/lazyWithRetry";

import "@/globals.css";
import "../sentry.client.config";

// Initialize ECC library for bitcoinjs-lib (required by p2tr, Taproot operations).
// Must run before any code that touches Bitcoin addresses or PSBTs.
initEccLib(ecc);

// Vite fires this on a dynamic-import preload failure (stale chunk 404 after a
// redeploy) — trigger the bounded one-shot reload. No preventDefault: letting
// Vite rethrow keeps the rejection a real stale-deploy error so lazyWithRetry's
// catch classifies it and stays suspended (preventDefault would resolve the
// import to undefined → a spurious TypeError).
window.addEventListener("vite:preloadError", () => {
  reloadForStaleDeploy();
});

function renderApp(): void {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter>
        <ErrorBoundary FallbackComponent={GlobalError}>
          <Providers>
            <Router />
          </Providers>
        </ErrorBoundary>
      </BrowserRouter>
    </StrictMode>,
  );
}

// E2E-only (#2110): with NEXT_PUBLIC_TBV_E2E_SPECULOS_URL set in a DEV build,
// arm the Ledger DMK's Speculos transport BEFORE first render so a driven
// connect can never race the override. Returns undefined in production — the
// render call below is then the same synchronous call it always was. On a
// failed arm (bad URL, failed kit import) degrade to a working app with a
// loud console diagnostic rather than a blank page: the E2E then fails at
// connect with a readable cause, and the wallet gate stays closed because
// isSpeculosTransportArmed() is still false.
const speculosReady = initSpeculosTransportForE2E();
if (speculosReady !== undefined) {
  void speculosReady.then(renderApp, (error: unknown) => {
    logger.error(error instanceof Error ? error : new Error(String(error)), {
      data: { context: "Speculos transport bootstrap failed" },
    });
    renderApp();
  });
} else {
  renderApp();
}
