/**
 * Fire-and-forget product analytics. One event goes straight to the PostHog
 * capture API with `fetch`, so no third-party script runs in the app.
 * Analytics must never affect a deposit or a borrow: this function never
 * throws, and a failed send is only logged.
 */
import { analyticsConfigError, ENV, type AnalyticsConfig } from "@/config/env";

import logger from "../logger";

import type {
  AnalyticsEventName,
  AnalyticsEventProperties,
} from "./analyticsEvents";
import { getSessionId, getVisitId } from "./analyticsSession";

const CAPTURE_PATH = "/batch/";

const LOG_CATEGORY = "analytics";

/**
 * Statuses PostHog returns when the request itself is wrong: a bad or revoked
 * project key, or a host that is not a PostHog capture API. Rate limiting
 * (429) and server errors (5xx) are PostHog's outages, not ours.
 */
const CONFIGURATION_FAULT_STATUSES: ReadonlySet<number> = new Set([
  400, 401, 403, 404,
]);

/**
 * Whether a configuration fault or a failure to build an event has been
 * reported this page load. Both repeat on every event, so one report each is
 * enough.
 */
let rejectionReported = false;
let buildFailureReported = false;

type EnabledAnalyticsConfig = Extract<AnalyticsConfig, { enabled: true }>;

/** A browser's Global Privacy Control signal opts the visitor out entirely. */
function hasOptedOut(): boolean {
  const gpc: unknown = Reflect.get(navigator, "globalPrivacyControl");
  return gpc === true;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildCaptureBody<E extends AnalyticsEventName>(
  config: EnabledAnalyticsConfig,
  event: E,
  properties: AnalyticsEventProperties[E],
  timestamp: string,
) {
  return {
    api_key: config.projectKey,
    batch: [
      {
        event,
        distinct_id: getVisitId(),
        timestamp,
        properties: {
          ...properties,
          network: config.network,
          $session_id: getSessionId(),
          // Events only: PostHog builds no person profile from them.
          $process_person_profile: false,
        },
      },
    ],
  };
}

export function trackEvent<E extends AnalyticsEventName>(
  event: E,
  properties: AnalyticsEventProperties[E],
  config: AnalyticsConfig = ENV.ANALYTICS,
): void {
  try {
    if (!config.enabled || hasOptedOut()) return;
    const body = buildCaptureBody(
      config,
      event,
      properties,
      new Date().toISOString(),
    );
    fetch(`${config.host}${CAPTURE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Delivered even when the event fires just before a navigation.
      keepalive: true,
      credentials: "omit",
      // The event carries the route template only; a same-origin proxy would
      // otherwise receive the full page URL, query included, as the Referer.
      referrerPolicy: "no-referrer",
    }).then(
      (response) => {
        if (response.ok) return;
        if (!CONFIGURATION_FAULT_STATUSES.has(response.status)) {
          logger.warn(`Analytics capture failed: HTTP ${response.status}`, {
            category: LOG_CATEGORY,
            event,
          });
          return;
        }
        if (rejectionReported) return;
        // A host that is not PostHog usually fails CORS instead and lands in
        // the network-failure branch below, with ad blockers and CSP.
        rejectionReported = true;
        logger.error(
          new Error(`Analytics capture rejected: HTTP ${response.status}`),
          { tags: { category: LOG_CATEGORY, event } },
        );
      },
      (error: unknown) => {
        logger.warn(`Analytics capture failed: ${describe(error)}`, {
          category: LOG_CATEGORY,
          event,
        });
      },
    );
  } catch (error) {
    // Building or sending the request threw synchronously: a bug in the
    // payload code or a browser refusing the request, never an ad blocker.
    if (buildFailureReported) return;
    buildFailureReported = true;
    logger.error(
      new Error(`Analytics event could not be sent: ${describe(error)}`),
      { tags: { category: LOG_CATEGORY, event } },
    );
  }
}

/**
 * Report why analytics is off despite being configured. Call it once Sentry
 * is running: the configuration is read before Sentry starts.
 */
export function reportAnalyticsConfigError(
  error: string | null = analyticsConfigError,
): void {
  if (error === null) return;
  logger.error(new Error(error), { tags: { category: LOG_CATEGORY } });
}
