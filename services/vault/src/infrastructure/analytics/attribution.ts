/**
 * Where this visit came from, read once at startup and kept in memory.
 *
 * Campaign parameters on the landing URL win. Without them, the `bbn_src`
 * cookie that the babylonlabs.io website writes on the parent domain carries
 * the source of the visit that led here, but only when this visit came from
 * the website or has no referrer: a visit from another site is that site's.
 * The app only reads that cookie and writes no cookie or storage of its own.
 * Another site sets it, so it is untrusted input: only known keys with string
 * values are kept. Every UTM value, from the URL or the cookie, has addresses
 * and long hex scrubbed and is then truncated. Ad click ids are sent unchanged
 * so they still match the ad platform's record, or dropped when they are not
 * a plain token.
 */

import logger from "../logger";

/** Cookie written by the website's footer script. */
const SOURCE_COOKIE_NAME = "bbn_src";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

/** Ad click ids, kept verbatim so a visit can be matched to its ad click. */
const CLICK_ID_KEYS = ["gclid", "twclid"] as const;

const ATTRIBUTION_KEYS = [...UTM_KEYS, ...CLICK_ID_KEYS] as const;

type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];
type ClickIdKey = (typeof CLICK_ID_KEYS)[number];

type CampaignFields = Partial<Record<AttributionKey, string>>;

/** Longest UTM value kept; the website script uses the same limit. */
const MAX_ATTRIBUTION_VALUE_LENGTH = 100;

/**
 * A click id as the ad platforms issue it: letters, digits, `-` and `_`, no
 * longer than the 255 characters a URL parameter value is commonly capped at.
 * Anything else is not a click id and is dropped, never cut or rewritten.
 */
const CLICK_ID_SHAPE = /^[A-Za-z0-9_-]{1,255}$/;

/**
 * Addresses and long hex scrubbed out of UTM values, following MetaMask's
 * Sentry scrubbing (`app/scripts/lib/setupSentry.ts`). A prefixed form (`0x`,
 * `bc1`, `tb1`, `bbn1`, in any case) or a long hex run is matched anywhere, so
 * one joined directly to other text is still caught, and so is any bare run of
 * 40 or more hex digits (an Ethereum address without `0x`, with whatever hex
 * letters adjoin it). These patterns all run on the original value and every
 * span any of them matches is replaced: `b`, `c` and `1` are hex digits, so
 * applied one after another a hex pattern would take the start of a `bc1` or
 * `bbn1` address glued after it and send the rest. Overlapping spans are
 * replaced as one, with the label of the one that starts first (the earlier
 * pattern on a tie). The `bc1`/`tb1` and `bbn1` patterns have no upper bound:
 * a pattern's matches never overlap each other, so a capped match that ended
 * inside a second address joined after it would leave that address's tail.
 * They take the whole alphanumeric run instead.
 */
const PREFIXED_SCRUB_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/0x[0-9a-f]{41,}|[0-9a-f]{64,}/gi, "[HEX_REDACTED]"],
  [/0x[0-9a-f]{40}/gi, "[ETH_ADDR]"],
  [/[0-9a-f]{40,}/gi, "[ETH_ADDR]"],
  [/(?:bc1|tb1)[a-z0-9]{24,}/gi, "[BTC_ADDR]"],
  [/bbn1[a-z0-9]{38,}/gi, "[BBN_ADDR]"],
];

/**
 * A legacy Bitcoin address (mainnet `1`/`3`, testnet `m`/`n`/`2`, 25 to 35
 * base58 characters) has no distinctive prefix, so it is matched only where
 * each end meets a boundary: unanchored, it would eat ordinary campaign words.
 * A boundary is the edge of the value, a non-alphanumeric character, or a
 * character a prefixed pattern matched. That last case matters because `1`,
 * `2`, `3`, `b`, `c` and `t` are both hex and base58: a hex match can take the
 * first or last characters of a legacy address glued to it, and a `bc1` or
 * `tb1` match can take the tail of one that contains it, so the address is
 * matched on the original value and its span merged with theirs. Even so a
 * campaign word of that shape is replaced; scrubbing too much is the accepted
 * direction.
 */
const LEGACY_BTC_FIRST = /[13mn2]/;
const BASE58_CHARACTER = /[a-km-zA-HJ-NP-Z1-9]/;
const ALPHANUMERIC = /[A-Za-z0-9]/;
const LEGACY_BTC_MIN_LENGTH = 25;
const LEGACY_BTC_MAX_LENGTH = 35;
const LEGACY_BTC_LABEL = "[BTC_ADDR]";

interface ScrubSpan {
  start: number;
  end: number;
  label: string;
}

/**
 * Every legacy address in the value, the longest at each start. Lookbehind is
 * avoided, which Safari before 16.4 rejects: this module runs at startup, so
 * an unsupported pattern would stop the app.
 */
function legacySpans(
  value: string,
  prefixedSpans: readonly ScrubSpan[],
): ScrubSpan[] {
  const matched = (index: number) =>
    prefixedSpans.some((span) => span.start <= index && index < span.end);
  const isBoundary = (index: number) =>
    index < 0 ||
    index >= value.length ||
    !ALPHANUMERIC.test(value[index]) ||
    matched(index);
  const spans: ScrubSpan[] = [];
  for (let start = 0; start < value.length; start++) {
    if (!LEGACY_BTC_FIRST.test(value[start]) || !isBoundary(start - 1)) {
      continue;
    }
    let runEnd = start;
    while (
      runEnd < value.length &&
      runEnd - start < LEGACY_BTC_MAX_LENGTH &&
      BASE58_CHARACTER.test(value[runEnd])
    ) {
      runEnd++;
    }
    for (let end = runEnd; end - start >= LEGACY_BTC_MIN_LENGTH; end--) {
      if (isBoundary(end)) {
        spans.push({ start, end, label: LEGACY_BTC_LABEL });
        break;
      }
    }
  }
  return spans;
}

/**
 * Replace every span a prefixed pattern or a legacy address covers in the
 * original value, overlaps merged.
 */
function scrubAddresses(value: string): string {
  const prefixedSpans: ScrubSpan[] = PREFIXED_SCRUB_PATTERNS.flatMap(
    ([pattern, label]) =>
      Array.from(value.matchAll(pattern), (match) => ({
        start: match.index,
        end: match.index + match[0].length,
        label,
      })),
  );
  const spans = [...prefixedSpans, ...legacySpans(value, prefixedSpans)];
  // Stable, so a tie keeps the pattern order.
  spans.sort((a, b) => a.start - b.start);
  const merged: ScrubSpan[] = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last !== undefined && span.start < last.end) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  let scrubbed = "";
  let cursor = 0;
  for (const span of merged) {
    scrubbed += value.slice(cursor, span.start) + span.label;
    cursor = span.end;
  }
  return scrubbed + value.slice(cursor);
}

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

/** Cut by code point, so an emoji is never split into a lone surrogate. */
function truncate(value: string): string {
  return Array.from(value).slice(0, MAX_ATTRIBUTION_VALUE_LENGTH).join("");
}

function isClickIdKey(key: AttributionKey): key is ClickIdKey {
  return (CLICK_ID_KEYS as readonly string[]).includes(key);
}

/**
 * A UTM value as sent. Scrubbed before truncating: an address cut mid-way no
 * longer matches the patterns.
 */
function cleanUtmValue(value: string): string {
  return truncate(scrubAddresses(value));
}

/** The value to send for a key, or null when it must not be sent. */
function cleanValue(key: AttributionKey, value: string): string | null {
  if (!isClickIdKey(key)) return cleanUtmValue(value);
  return CLICK_ID_SHAPE.test(value) ? value : null;
}

function addValue(out: CampaignFields, key: AttributionKey, value: string) {
  const cleaned = cleanValue(key, value);
  if (cleaned !== null) out[key] = cleaned;
}

interface QueryCampaign {
  fields: CampaignFields;
  /**
   * Whether the URL named any campaign key, even one whose value was then
   * dropped: such a URL is its own source, never the cookie's.
   */
  present: boolean;
}

function fromQuery(search: string): QueryCampaign {
  const query = new URLSearchParams(search);
  const fields: CampaignFields = {};
  let present = false;
  for (const key of ATTRIBUTION_KEYS) {
    const value = query.get(key);
    if (!value) continue;
    present = true;
    addValue(fields, key, value);
  }
  return { fields, present };
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

/**
 * Another site's value: malformed means "no source", not an app error. The
 * value itself is not logged: it may hold an address.
 */
function warnMalformedCookie(): void {
  logger.warn("Analytics source cookie is malformed; the visit has no source", {
    category: "analytics",
  });
}

/**
 * The website's source cookie. Absent means no source; malformed, or JSON that
 * is not an object, means no source and is logged.
 */
function fromCookie(cookieHeader: string): CampaignFields {
  const raw = readCookie(cookieHeader, SOURCE_COOKIE_NAME);
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    warnMalformedCookie();
    return {};
  }
  if (typeof parsed !== "object" || parsed === null) {
    warnMalformedCookie();
    return {};
  }
  const out: CampaignFields = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value: unknown = Reflect.get(parsed, key);
    if (typeof value === "string" && value) addValue(out, key, value);
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
  let source = campaign.fields;
  if (!campaign.present && cookieApplies) {
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
    logger.warn(`Analytics attribution unavailable: ${String(error)}`, {
      category: "analytics",
    });
  }
}

/** The attribution captured at startup, or null before `captureAttribution`. */
export function getAttribution(): Attribution | null {
  return captured;
}
