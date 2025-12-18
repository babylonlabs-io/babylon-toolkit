import * as Sentry from "@sentry/react";
import { v4 as uuidv4 } from "uuid";

import { getCommitHash, isProductionEnv } from "@/config";
import { REPLAYS_ON_ERROR_RATE } from "@/constants";

const SENTRY_DEVICE_ID_KEY = "sentry_device_id";

Sentry.init({
  enabled: Boolean(
    process.env.NEXT_PUBLIC_SIDECAR_API_URL &&
      process.env.NEXT_PUBLIC_SENTRY_DSN,
  ),
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tunnel: process.env.NEXT_PUBLIC_SIDECAR_API_URL
    ? `${process.env.NEXT_PUBLIC_SIDECAR_API_URL}/sentry-tunnel`
    : "http://localhost:8092/sentry-tunnel",

  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "local",

  release: process.env.NEXT_PUBLIC_RELEASE_ID ?? "local-dev",

  dist: process.env.NEXT_PUBLIC_DIST_ID ?? "local",

  tracesSampleRate: 1,
  tracesSampler: (samplingContext) => {
    const hasErrorTag = samplingContext.tags?.error === "true";

    if (hasErrorTag) {
      return 1.0;
    }

    return 0.01;
  },

  enableTracing: true,

  debug: false,

  replaysOnErrorSampleRate: REPLAYS_ON_ERROR_RATE,

  replaysSessionSampleRate: 0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: isProductionEnv(),
      blockAllMedia: true,
    }),
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

    return event;
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

