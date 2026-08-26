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
