import * as Sentry from "@sentry/react";
import { v4 as uuidv4 } from "uuid";

import { REPLAYS_ON_ERROR_RATE, SENTRY_DEVICE_ID_KEY } from "../constants";
import type { SentryInitOptions } from "./types";

/**
 * Initialize Sentry with shared configuration for Babylon services
 *
 * @param options - Configuration options for Sentry initialization
 */
export function initSentry(options: SentryInitOptions): void {
  const {
    getCommitHash,
    isProductionEnv,
    analyticsCategories = [],
    analyticsMessages = [],
    customBeforeSend,
    customBeforeBreadcrumb,
  } = options;

  const analyticsCategorySet = new Set<string>(analyticsCategories);
  const analyticsMessageSet = new Set<string>(analyticsMessages);

  const isAnalyticsBreadcrumbCategory = (category?: string): boolean => {
    if (!category) return false;
    return analyticsCategorySet.has(category);
  };

  Sentry.init({
    enabled: Boolean(
      process.env.NEXT_PUBLIC_SIDECAR_API_URL &&
        process.env.NEXT_PUBLIC_SENTRY_DSN,
    ),
    // DSN (Data Source Name) for the Sentry project
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Tunnel endpoint for proxying Sentry events through our own server
    // This helps avoid ad-blockers and CSP issues
    tunnel: process.env.NEXT_PUBLIC_SIDECAR_API_URL
      ? `${process.env.NEXT_PUBLIC_SIDECAR_API_URL}/sentry-tunnel`
      : "http://localhost:8092/sentry-tunnel",

    // Environment from CI
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "local",

    // Release ID for source map uploads
    release: process.env.NEXT_PUBLIC_RELEASE_ID ?? "local-dev",

    // Dist ID for source map uploads
    dist: process.env.NEXT_PUBLIC_DIST_ID ?? "local",

    // Sampling configuration
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

    // Debug mode (disabled by default)
    debug: false,

    // Breadcrumb filtering (only if analytics categories are provided)
    beforeBreadcrumb(breadcrumb) {
      // Apply custom handler first if provided
      if (customBeforeBreadcrumb) {
        const result = customBeforeBreadcrumb(breadcrumb);
        if (result === null) return null;
      }

      // Drop analytics breadcrumbs (by category)
      if (isAnalyticsBreadcrumbCategory(breadcrumb.category)) {
        return null;
      }

      // Drop 'sentry.event' breadcrumbs created by analytics captures only
      if (
        breadcrumb.category === "sentry.event" &&
        typeof breadcrumb.message === "string" &&
        analyticsMessageSet.has(breadcrumb.message)
      ) {
        return null;
      }

      return breadcrumb;
    },

    replaysOnErrorSampleRate: REPLAYS_ON_ERROR_RATE,
    replaysSessionSampleRate: 0,

    integrations: [
      Sentry.replayIntegration({
        maskAllText: isProductionEnv(),
        blockAllMedia: true,
      }),
      // Browser tracing for performance monitoring
      Sentry.browserTracingIntegration(),
    ],

    beforeSend(event, hint) {
      // If this is an analytics event, clear its breadcrumbs only
      const analyticsCategoryTag =
        (event as any)?.tags?.["analytics.category"] ?? undefined;
      if (analyticsCategoryTag) {
        event.breadcrumbs = [];
      }

      event.extra = {
        ...(event.extra || {}),
        version: getCommitHash(),
      };

      const exception = hint?.originalException as { code?: string };

      if (exception?.code) {
        event.fingerprint = ["{{ default }}", exception.code];
      }

      // Strip analytics breadcrumbs attached directly to events as well
      if (Array.isArray(event.breadcrumbs) && analyticsCategorySet.size > 0) {
        event.breadcrumbs = event.breadcrumbs.filter(
          (bc) => !isAnalyticsBreadcrumbCategory(bc.category),
        );
      }

      // Apply custom handler if provided
      if (customBeforeSend) {
        return customBeforeSend(event, hint);
      }

      return event;
    },
  });

  // Set up anonymous device ID for user tracking
  try {
    let deviceId = localStorage.getItem(SENTRY_DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = uuidv4();
      localStorage.setItem(SENTRY_DEVICE_ID_KEY, deviceId);
    }
    Sentry.setUser({ id: deviceId });
  } catch {
    Sentry.setUser({ id: uuidv4() });
  }
}
