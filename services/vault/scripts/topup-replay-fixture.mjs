#!/usr/bin/env node
/**
 * Tops up the committed replay fixture with the indexer's answers to GraphQL
 * operations the app gained after the recording was made.
 *
 * A recording is a photograph of one moment in the app's history, and the app
 * keeps adding reads. `supplements.ts` can only recover an `eth_call` whose
 * answer the recording already holds somewhere else; a new indexer query has
 * no such source, so the capture of any screen that issues it fails on both
 * sides and the run is never clean. Re-recording is the honest fix, but the
 * real-wallet CLI records a peg-in and never visits the routes that issue
 * these queries, so a fresh run would not hold them either.
 *
 * This asks the SAME indexer the recording was made against - its address is
 * read out of the fixture, never typed here - for exactly the operations named
 * in {@link TOPUP_OPERATIONS}, with the variables the app derives from the
 * recording's own data, and appends each exchange verbatim. Every appended
 * line is a real response from the real indexer; nothing is invented. What it
 * cannot promise is that the answer describes the same moment as the rest of
 * the recording, which is acceptable for a price-history chart photographed
 * against a frozen clock and is why this list is short and named rather than
 * open-ended.
 *
 * Usage (from services/vault):
 *   node scripts/topup-replay-fixture.mjs
 *
 * Idempotent, and offline once complete: an operation the fixture already
 * answers is neither asked again nor appended, and its recorded answer feeds
 * the operations that depend on it, so a second run touches no network and
 * appends nothing. Delete the appended lines and re-run to refresh them.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  DEFAULT_REPLAY_STEP,
  graphqlKey,
  parseJson,
  PEGIN_RECORDING_PATH,
} from "../e2e/fixtures/replay/recording.ts";

/**
 * The daily-candle window the liquidation Timeline asks for. Mirrors
 * `CANDLE_INTERVAL` / `CANDLE_LIMIT` in
 * `src/applications/aave/hooks/useBtcPriceCandles.ts`; the replay keys a
 * query on its variables, so a change there makes the capture miss loudly and
 * this constant has to follow it.
 */
const CANDLE_INTERVAL = "day_1";
const CANDLE_LIMIT = 180;

/** `GetAavePriceFeedSource` as `src/applications/aave/services/fetchPriceCandles.ts` sends it. */
const GET_PRICE_FEED_SOURCE = `
  query GetAavePriceFeedSource($reserveId: BigInt!) {
    aavePriceFeedSource(id: $reserveId) {
      feed
    }
  }
`;

/** `GetAavePriceCandles` as the same module sends it. */
const GET_PRICE_CANDLES = `
  query GetAavePriceCandles(
    $feed: String!
    $interval: aavePriceInterval!
    $limit: Int!
  ) {
    aavePriceCandles(
      where: { feed: $feed, interval: $interval }
      orderBy: "bucketStart"
      orderDirection: "desc"
      limit: $limit
    ) {
      items {
        bucketStart
        open
        high
        low
        close
        decimals
      }
    }
  }
`;

/**
 * Read the vaultBTC reserve id the recorded `GetAaveAppConfig` reports - the
 * same value `supplements.ts` recovers, and the one the app puts into
 * `GetAavePriceFeedSource`.
 */
function recordedReserveId(entries) {
  for (const entry of [...entries].reverse()) {
    const id = parseJson(entry.resBody)?.data?.aaveConfig?.vaultBtcReserveId;
    if (id !== undefined) return String(id);
  }
  throw new Error(
    "The fixture holds no GetAaveAppConfig response with a vaultBtcReserveId - " +
      "nothing to derive the price-feed lookup from.",
  );
}

/**
 * The operations to top up, in dependency order: the candle query's `feed`
 * variable is the feed-source query's answer, so the second is built from the
 * first's response.
 */
const TOPUP_OPERATIONS = [
  {
    operationName: "GetAavePriceFeedSource",
    query: GET_PRICE_FEED_SOURCE,
    variables: ({ entries }) => ({ reserveId: recordedReserveId(entries) }),
  },
  {
    operationName: "GetAavePriceCandles",
    query: GET_PRICE_CANDLES,
    variables: ({ answers }) => {
      const feed =
        answers.GetAavePriceFeedSource?.data?.aavePriceFeedSource?.feed;
      if (typeof feed !== "string") {
        throw new Error(
          "GetAavePriceFeedSource answered with no feed - the reserve has no " +
            "price source registered, so there are no candles to record.",
        );
      }
      return { feed, interval: CANDLE_INTERVAL, limit: CANDLE_LIMIT };
    },
  },
];

/** The indexer the recording was made against, read from the fixture itself. */
function recordedIndexerUrl(entries) {
  const entry = entries.find(
    (candidate) =>
      candidate.method === "POST" &&
      new URL(candidate.url).hostname.includes("indexer-api"),
  );
  if (!entry) {
    throw new Error(
      "The fixture holds no indexer exchange to read the endpoint from.",
    );
  }
  return entry.url;
}

async function main() {
  const raw = fs.readFileSync(PEGIN_RECORDING_PATH, "utf8");
  const entries = raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
  const url = recordedIndexerUrl(entries);
  // Recorded answers by the key the replay looks them up under. Last one
  // wins, as in the replay itself.
  const recorded = new Map();
  for (const entry of entries) {
    if (entry.method !== "POST" || entry.url !== url) continue;
    recorded.set(
      graphqlKey(entry.method, new URL(entry.url).pathname, entry.reqBody),
      entry,
    );
  }

  const answers = {};
  const appended = [];
  for (const operation of TOPUP_OPERATIONS) {
    const variables = operation.variables({ entries, answers });
    const reqBody = JSON.stringify({
      query: operation.query,
      variables,
      operationName: operation.operationName,
    });
    const key = graphqlKey("POST", new URL(url).pathname, reqBody);

    const known = recorded.get(key);
    if (known !== undefined) {
      answers[operation.operationName] = parseJson(known.resBody);
      console.log(`skip   ${key} (already in the fixture)`);
      continue;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: reqBody,
    });
    const resBody = await response.text();
    const parsed = parseJson(resBody);
    if (!response.ok || parsed === null || parsed.errors !== undefined) {
      throw new Error(
        `${operation.operationName} failed against ${url}: HTTP ${response.status} ${resBody.slice(0, 200)}`,
      );
    }
    answers[operation.operationName] = parsed;
    appended.push(
      JSON.stringify({
        t: new Date().toISOString(),
        step: DEFAULT_REPLAY_STEP,
        method: "POST",
        url,
        status: response.status,
        reqBody,
        resBody,
      }),
    );
    console.log(`append ${key} (${resBody.length} bytes)`);
  }

  if (appended.length === 0) {
    console.log("Nothing to append.");
    return;
  }
  const body = raw.endsWith("\n") ? raw : `${raw}\n`;
  fs.writeFileSync(PEGIN_RECORDING_PATH, `${body}${appended.join("\n")}\n`);
  console.log(
    `Wrote ${path.relative(process.cwd(), PEGIN_RECORDING_PATH)}: +${appended.length} exchange(s).`,
  );
}

await main();
