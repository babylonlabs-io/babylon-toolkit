import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "react-error-boundary";
import { BrowserRouter } from "react-router";

import GlobalError from "@/components/pages/global-error";
import Providers from "@/providers";
import { Router } from "@/router";

import "@/globals.css";
import "../sentry.client.config";

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
