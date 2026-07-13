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
import { redactData, scrubSentryEvent, scrubString } from "@/utils/telemetry";

const SENTRY_DEVICE_ID_KEY = "sentry_device_id";

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// Telemetry is gated on the DSN alone. Events go directly to Sentry unless a tunnel is
// configured. A tunnel proxies events through our own host to dodge ad-blockers; it is an
// optimization, not a requirement, and is deliberately independent of the (logo) sidecar so
// that unrelated infrastructure can never silently disable telemetry again.
const tunnelUrl = process.env.NEXT_PUBLIC_SENTRY_TUNNEL_URL;
const sentryEnabled = Boolean(sentryDsn);

// These environment variables are provided by CI; their absence means a local build.
const LOCAL_ENVIRONMENT = "local";
const LOCAL_RELEASE = "local-dev";
const sentryEnvironment =
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? LOCAL_ENVIRONMENT;
const sentryRelease = process.env.NEXT_PUBLIC_RELEASE_ID ?? LOCAL_RELEASE;
// A deployed build is detected by its CI-injected release id (github.sha), NOT by the Sentry
// env vars — those are exactly what a broken env-injection step might drop, and the warning
// must survive that. RELEASE_ID comes from the github context, so it is still present even if
// the DSN and environment vars are both dropped.
const isDeployedBuild = sentryRelease !== LOCAL_RELEASE;

// Warn on any telemetry misconfiguration a deployed build should never ship with. Local builds
// legitimately run without a DSN, so the "off" case stays quiet there.
if (isDeployedBuild && !sentryEnabled) {
  // Deployed build, telemetry off: reports nothing, including its own silence — regardless of
  // whether the environment var was also dropped (which would resolve environment to "local").
  console.warn(
    `[sentry] disabled in a deployed build (env "${sentryEnvironment}") — no events will be transmitted. Missing: NEXT_PUBLIC_SENTRY_DSN`,
  );
} else if (sentryEnabled && sentryEnvironment === LOCAL_ENVIRONMENT) {
  // Enabled but tagged "local": either a deployed build that forgot
  // NEXT_PUBLIC_SENTRY_ENVIRONMENT (events mislabeled, likely filtered out) or a local build
  // with a stray DSN (transmitting a developer's session). Neither is intended.
  console.warn(
    `[sentry] enabled but environment is "local" — deployed builds must set NEXT_PUBLIC_SENTRY_ENVIRONMENT; a local build should unset NEXT_PUBLIC_SENTRY_DSN.`,
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
  release: sentryRelease,

  // Ensure this dist ID matches the one used during 'vite build' for source map uploads
  // It's passed via NEXT_PUBLIC_DIST_ID in the build environment (e.g., GitHub Actions)
  dist: process.env.NEXT_PUBLIC_DIST_ID ?? "local",

  // Performance tracing is intentionally OFF. beforeSend (and thus scrubSentryEvent) runs
  // only on error/message events, never on transaction envelopes — those need a separate
  // beforeSendTransaction hook. With browserTracingIntegration, auto-instrumented fetch spans
  // carry full request URLs, and this app fetches `${UTILS_API_URL}/address/screening?address=
  // <btc-addr>`, so the depositor's address would transmit unredacted. No tracesSampleRate and
  // no browserTracingIntegration => no transactions are created. Restore tracing together with
  // a transaction-side URL scrubber (planned for the SDK-upgrade PR).

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

  // Session Replay is intentionally OFF for the same reason: replay envelopes bypass
  // beforeSend/scrubSentryEvent, and maskAllText/maskAllInputs do not mask request URLs or
  // href attributes (the app renders the depositor's BTC address in both — the screening
  // request URL and explorer /address/<addr> links). Leaving out replayIntegration keeps only
  // Sentry's default integrations (error handlers, breadcrumbs), which carry no address data
  // that scrubSentryEvent does not already cover. Restore replay only with a replay-side
  // redaction hook (URL + href masking).

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
