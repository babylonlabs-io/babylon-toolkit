/**
 * Fire-and-forget product analytics. One event goes straight to the PostHog
 * capture API with `fetch`, so no third-party script runs in the app.
 * Analytics must never affect a deposit or a borrow: this function never
 * throws, and a failed send is only logged.
 *
 * Nothing leaves before the geofence outcome is known. Until then events are
 * held; they are sent if the visitor passed, and dropped if the visitor is
 * blocked or the region is unknown (the health check failed or never ran).
 */
import { ensureHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";

import { analyticsConfigError, ENV, type AnalyticsConfig } from "@/config/env";

import logger from "../logger";

import type {
  AnalyticsEventName,
  AnalyticsEventProperties,
} from "./analyticsEvents";
import { getSessionId, getVisitId, getWalletAddress } from "./analyticsSession";
import { getAttribution } from "./attribution";

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
 * Whether a configuration fault has been reported this page load. It repeats
 * on every event, so one report is enough.
 */
let rejectionReported = false;
/**
 * The events whose build has failed this page load. A failure repeats on every
 * send of its event, but one event's builder can fail while the others build,
 * so each event is reported once.
 */
const buildFailuresReported = new Set<AnalyticsEventName>();

type EnabledAnalyticsConfig = Extract<AnalyticsConfig, { enabled: true }>;

export type GeofenceOutcome = "passed" | "failed";

/** Events held until the geofence settles; any beyond this are dropped. */
const MAX_HELD_EVENTS = 50;

let geofenceOutcome: GeofenceOutcome | null = null;
const heldSends: (() => void)[] = [];
let holdOverflowReported = false;

/**
 * Settle the geofence for this page load: send the held events if the visitor
 * passed, drop them otherwise. Only the first outcome counts until the page
 * reloads. Retrying the global error screen remounts the geofence provider,
 * which checks again, but that answer is ignored: after a failed first check
 * nothing is sent, and after a passed one the remounted tracker's page view is
 * sent at once, a second view of the same path.
 */
export function settleGeofence(outcome: GeofenceOutcome): void {
  if (geofenceOutcome !== null) return;
  geofenceOutcome = outcome;
  const held = heldSends.splice(0);
  if (outcome === "passed") held.forEach((send) => send());
}

/** A browser's Global Privacy Control signal opts the visitor out entirely. */
function hasOptedOut(): boolean {
  const gpc: unknown = Reflect.get(navigator, "globalPrivacyControl");
  return gpc === true;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Vault ids reach the call sites in more than one form (with or without `0x`,
 * mixed case). One form keeps a vault's events joinable in PostHog and with
 * on-chain data.
 */
function normalizeVaultId(properties: object): object {
  const vaultId: unknown = Reflect.get(properties, "vault_id");
  if (typeof vaultId !== "string") return properties;
  return { ...properties, vault_id: ensureHexPrefix(vaultId.toLowerCase()) };
}

function buildCaptureBody<E extends AnalyticsEventName>(
  config: EnabledAnalyticsConfig,
  event: E,
  properties: AnalyticsEventProperties[E],
  timestamp: string,
) {
  // An event about a transaction names the account that sent it; the
  // session's address can change before the transaction is mined.
  const eventWallet: unknown = Reflect.get(properties, "wallet_address");
  const wallet =
    typeof eventWallet === "string"
      ? eventWallet.toLowerCase()
      : getWalletAddress();
  return {
    api_key: config.projectKey,
    batch: [
      {
        event,
        distinct_id: getVisitId(),
        timestamp,
        properties: {
          ...getAttribution(),
          ...normalizeVaultId(properties),
          ...(wallet === null ? {} : { wallet_address: wallet }),
          network: config.network,
          $session_id: getSessionId(),
          // Events only: PostHog builds no person profile from them.
          $process_person_profile: false,
        },
      },
    ],
  };
}

/**
 * `properties` may be a function that builds them. Pass one when building the
 * fields can throw: it runs inside this function's guard, so a throw is
 * reported here and never reaches the caller's flow.
 */
export function trackEvent<E extends AnalyticsEventName>(
  event: E,
  properties: AnalyticsEventProperties[E] | (() => AnalyticsEventProperties[E]),
  config: AnalyticsConfig = ENV.ANALYTICS,
): void {
  try {
    if (!config.enabled || hasOptedOut()) return;
    const resolved =
      typeof properties === "function" ? properties() : properties;
    // Built now, so a held event keeps the time and fields it was sent with.
    const body = JSON.stringify(
      buildCaptureBody(config, event, resolved, new Date().toISOString()),
    );
    if (geofenceOutcome === "passed") {
      post(config, event, body, true);
      return;
    }
    if (geofenceOutcome !== null) return;
    if (heldSends.length < MAX_HELD_EVENTS) {
      // Released together while the page is open, so without keepalive:
      // browsers cap all in-flight keepalive bodies at 64 KiB together.
      heldSends.push(() => post(config, event, body, false));
      return;
    }
    if (holdOverflowReported) return;
    holdOverflowReported = true;
    logger.warn(
      `Analytics dropped events beyond ${MAX_HELD_EVENTS} held during the geofence check`,
      { category: LOG_CATEGORY, event },
    );
  } catch (error) {
    reportBuildFailure(event, error);
  }
}

function post(
  config: EnabledAnalyticsConfig,
  event: AnalyticsEventName,
  body: string,
  keepalive: boolean,
): void {
  try {
    fetch(`${config.host}${CAPTURE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      // Delivered even when the event fires just before a navigation.
      keepalive,
      credentials: "omit",
      // `$pathname` is a route template and the campaign values are an
      // allow-list read once at startup; a Referer would otherwise send the
      // full current page URL, query included.
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
    reportBuildFailure(event, error);
  }
}

/**
 * Building or sending the request threw synchronously: a bug in the payload
 * code or a browser refusing the request, never an ad blocker.
 */
function reportBuildFailure(event: AnalyticsEventName, error: unknown): void {
  if (buildFailuresReported.has(event)) return;
  buildFailuresReported.add(event);
  logger.error(
    new Error(`Analytics event could not be sent: ${describe(error)}`),
    { tags: { category: LOG_CATEGORY, event } },
  );
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
