/**
 * Where this visit came from, read once at startup and kept in memory.
 *
 * Campaign parameters on the landing URL win. Without them, the `bbn_src`
 * cookie that the babylonlabs.io website writes on the parent domain carries
 * the source of the visit that led here, but only when this visit came from
 * the website or has no referrer: a visit from another site is that site's.
 * The app only reads that cookie and writes no cookie or storage of its own.
 * Another site sets it, so it is untrusted input: only known keys with string
 * values are kept. Every campaign value, from the URL or the cookie, has
 * addresses and long hex scrubbed and is then truncated.
 */

import { scrubString } from "@/utils/telemetry";

import logger from "../logger";

/** Cookie written by the website's footer script. */
const SOURCE_COOKIE_NAME = "bbn_src";

const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "twclid",
] as const;

type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];

type CampaignFields = Partial<Record<AttributionKey, string>>;

/** Longest value kept; the website script uses the same limit. */
const MAX_ATTRIBUTION_VALUE_LENGTH = 100;

/** The marketing website only, not docs or other apps on its subdomains. */
const WEBSITE_HOST = /^(www\.)?babylonlabs\.io$/;

/** The app's own hosts, which never count as a referrer. */
const APP_HOST = /^btc-vaults(\.[a-z0-9-]+)*\.babylonlabs\.io$/;

/** PostHog's value for a visit with no referrer. */
const DIRECT_REFERRER = "$direct";

/**
 * `other` is any visit not from the website: another site, or no referrer.
 * `$referring_domain` tells those apart.
 */
type Via = "website" | "other";

type Attribution = CampaignFields & {
  /** Referrer hostname only, never its path or query. */
  $referring_domain: string;
  /** Whether the visit arrived from the babylonlabs.io website. */
  via: Via;
};

interface AttributionSources {
  search: string;
  referrer: string;
  cookie: string;
  ownHost: string;
}

function truncate(value: string): string {
  return value.slice(0, MAX_ATTRIBUTION_VALUE_LENGTH);
}

/**
 * A campaign value as sent. Scrubbed before truncating: an address cut
 * mid-way no longer matches the scrubbing patterns.
 */
function cleanCampaignValue(value: string): string {
  return truncate(scrubString(value));
}

function fromQuery(search: string): CampaignFields {
  const query = new URLSearchParams(search);
  const out: CampaignFields = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = query.get(key);
    if (value) out[key] = cleanCampaignValue(value);
  }
  return out;
}

function readCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

/** The website's source cookie; absent or malformed means no source. */
function fromCookie(cookieHeader: string): CampaignFields {
  const raw = readCookie(cookieHeader, SOURCE_COOKIE_NAME);
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    // Another site's value: malformed means "no source", not an app error.
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  const out: CampaignFields = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value: unknown = Reflect.get(parsed, key);
    if (typeof value === "string" && value) {
      out[key] = cleanCampaignValue(value);
    }
  }
  return out;
}

function referrerHost(referrer: string): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname;
  } catch {
    return null;
  }
}

/** Derive the visit's attribution from the landing page's inputs. */
export function deriveAttribution({
  search,
  referrer,
  cookie,
  ownHost,
}: AttributionSources): Attribution {
  const host = referrerHost(referrer);
  const externalHost =
    host !== null && host !== ownHost && !APP_HOST.test(host) ? host : null;
  const via: Via =
    externalHost !== null && WEBSITE_HOST.test(externalHost)
      ? "website"
      : "other";
  const campaign = fromQuery(search);
  // The cookie remembers an earlier website visit; it must not claim a visit
  // that arrived from somewhere else.
  const cookieApplies = externalHost === null || via === "website";
  let source = campaign;
  if (Object.keys(campaign).length === 0 && cookieApplies) {
    source = fromCookie(cookie);
  }
  return {
    ...source,
    $referring_domain:
      externalHost === null ? DIRECT_REFERRER : truncate(externalHost),
    via,
  };
}

let captured: Attribution | null = null;

/**
 * Read the landing page's attribution. Call once at startup, before the
 * router can rewrite the URL and drop its campaign parameters.
 */
export function captureAttribution(): void {
  try {
    captured = deriveAttribution({
      search: window.location.search,
      referrer: document.referrer,
      cookie: document.cookie,
      ownHost: window.location.hostname,
    });
  } catch (error) {
    // Reading `document.cookie` throws on an opaque origin. Analytics must
    // never stop the app from starting: the visit simply has no attribution.
    logger.warn(
      `Analytics attribution unavailable: ${error instanceof Error ? error.message : String(error)}`,
      { category: "analytics" },
    );
  }
}

/** The attribution captured at startup, or null before `captureAttribution`. */
export function getAttribution(): Attribution | null {
  return captured;
}
