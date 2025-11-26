import { initBTCCurve } from "@babylonlabs-io/btc-staking-ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "react-error-boundary";
import { BrowserRouter } from "react-router";

import GlobalError from "@/ui/common/global-error";
import Providers from "@/ui/common/providers";
import { Router } from "@/ui/router";

import "@/ui/globals.css";
import "../sentry.client.config";

/**
 * Initialize the ECC library for bitcoinjs-lib before app starts.
 * This must be called before any Bitcoin operations.
 *
 * Note: We use pnpm.overrides in the workspace root package.json to ensure
 * all packages (including @reown/appkit-adapter-bitcoin) use the same
 * bitcoinjs-lib version, so this single initialization call works for the entire app.
 * Can be removed once @reown/appkit-adapter-bitcoin makes bitcoinjs-lib a peer dependency.
 */
initBTCCurve();

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
