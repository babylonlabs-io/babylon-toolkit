// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/react/

/**
 * Extra notes:
 * This file is manually imported in the main entry point for Vite builds.
 * Source maps are handled by the Sentry Vite plugin during build time.
 * Reference: https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/vite/
 */

import * as Sentry from "@sentry/react";
import { v4 as uuidv4 } from "uuid";

import { getCommitHash } from "@/config";
import { REPLAYS_ON_ERROR_RATE } from "@/constants";
import { redactData, scrubSentryEvent, scrubString } from "@/utils/telemetry";

const SENTRY_DEVICE_ID_KEY = "sentry_device_id";

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// Telemetry is gated on the DSN alone. Events go directly to Sentry unless a tunnel is
// configured. A tunnel proxies events through our own host to dodge ad-blockers; it is an
// optimization, not a requirement, and is deliberately independent of the (logo) sidecar so
// that unrelated infrastructure can never silently disable telemetry again.
const tunnelUrl = process.env.NEXT_PUBLIC_SENTRY_TUNNEL_URL;
const sentryEnabled = Boolean(sentryDsn);

// This environment variable is provided in the CI; its absence means a local build.
const LOCAL_ENVIRONMENT = "local";
const sentryEnvironment =
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? LOCAL_ENVIRONMENT;

// A deployed build with Sentry off is a defect that reports nothing — including its own
// silence. Say so at boot. Local builds legitimately run without a DSN, so stay quiet there.
if (!sentryEnabled && sentryEnvironment !== LOCAL_ENVIRONMENT) {
  console.warn(
    `[sentry] disabled in "${sentryEnvironment}" — no events will be transmitted. Missing: NEXT_PUBLIC_SENTRY_DSN`,
  );
}

Sentry.init({
  enabled: sentryEnabled,
  // This is pointing to the DSN (Data Source Name) for the Sentry project
  dsn: sentryDsn,

  // Tunnel endpoint for proxying Sentry events through our own host (ad-blocker/CSP
  // resistance). Omitted when unset so events go directly to Sentry.
  ...(tunnelUrl ? { tunnel: tunnelUrl } : {}),

  environment: sentryEnvironment,

  // Ensure this release ID matches the one used during 'vite build' for source map uploads
  // It's passed via NEXT_PUBLIC_RELEASE_ID in the build environment (e.g., GitHub Actions)
  release: process.env.NEXT_PUBLIC_RELEASE_ID ?? "local-dev",

  // Ensure this dist ID matches the one used during 'vite build' for source map uploads
  // It's passed via NEXT_PUBLIC_DIST_ID in the build environment (e.g., GitHub Actions)
  dist: process.env.NEXT_PUBLIC_DIST_ID ?? "local",

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1,
  tracesSampler: (samplingContext) => {
    const hasErrorTag = samplingContext.tags?.error === "true";

    // Only sample at 100% if it's an error transaction with the error tag
    if (hasErrorTag) {
      return 1.0;
    }

    // Default sampling rate for everything else
    return 0.01;
  },

  enableTracing: true,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.message) {
      breadcrumb.message = scrubString(breadcrumb.message);
    }
    if (breadcrumb.data) {
      breadcrumb.data = redactData(breadcrumb.data);
    }
    return breadcrumb;
  },

  replaysOnErrorSampleRate: REPLAYS_ON_ERROR_RATE,

  replaysSessionSampleRate: 0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
    // Browser tracing for performance monitoring and React component annotation
    Sentry.browserTracingIntegration(),
  ],

  beforeSend(event, hint) {
    event.extra = {
      ...(event.extra || {}),
      version: getCommitHash(),
    };

    const exception = hint?.originalException as { code?: string };

    if (exception?.code) {
      event.fingerprint = ["{{ default }}", exception.code];
    }

    return scrubSentryEvent(event);
  },
});

try {
  let deviceId = localStorage.getItem(SENTRY_DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = uuidv4();
    localStorage.setItem(SENTRY_DEVICE_ID_KEY, deviceId);
  }
  Sentry.setUser({ id: deviceId });
} catch (e) {
  Sentry.setUser({ id: uuidv4() });
}
