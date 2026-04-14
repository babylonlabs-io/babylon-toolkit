import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib } from "bitcoinjs-lib";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "react-error-boundary";
import { BrowserRouter } from "react-router";

import GlobalError from "@/components/pages/global-error";
import Providers from "@/providers";
import { Router } from "@/router";

import "@/globals.css";
import "../sentry.client.config";

// Initialize ECC library for bitcoinjs-lib (required by p2tr, Taproot operations).
// Must run before any code that touches Bitcoin addresses or PSBTs.
initEccLib(ecc);

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
