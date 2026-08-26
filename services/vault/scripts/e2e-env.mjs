#!/usr/bin/env node
/**
 * `pnpm --filter vault run e2e:env`
 *
 * Standalone process boot for the e2e mock backends. Useful for manual
 * dev when you want to point a local browser at the vault dApp with
 * deterministic backend responses (vault-provider proxy + mempool +
 * eth-rpc + graphql).
 *
 * Playwright tests do NOT boot this script. They install per-test
 * route handlers via `services/vault/e2e/fixtures/networkRoutes.ts`,
 * which intercepts the same URLs at the page-context layer.
 *
 * Boots HTTP listeners on the ports declared in playwright.config.ts:
 *   - 9998  vault-provider proxy (vp-health, rpc/{addr})
 *   - 9997  eth rpc (POST /rpc)
 *   - 9996  mempool api (everything under /mempool)
 *   - 9999  graphql (POST /graphql)
 *
 * Ctrl-C tears all four down cleanly.
 */

import http from "node:http";

const PORTS = {
  vp: 9998,
  ethRpc: 9997,
  mempool: 9996,
  graphql: 9999,
};

const DEFAULT_BTC_ADDRESS = "tb1qce0n0rv27dwx37dfvhxaaly4lnwelqjuqywvka";
const DEFAULT_BALANCE_SATS = 100_000_000;

// Mirrors `deriveScriptPubKey` in `services/vault/e2e/fixtures/seededWallets.ts`
// so the standalone dev backend and the Playwright fixtures hand the
// dApp byte-identical placeholders for the same address. When changing
// the algorithm, update both sites.
function hashAddressToHex(address, hexChars) {
  let hash = 0n;
  for (const ch of address) {
    hash = (hash * 1315423911n) ^ BigInt(ch.charCodeAt(0));
  }
  return hash.toString(16).padStart(hexChars, "0").slice(-hexChars);
}

function deriveScriptPubKey(address) {
  const lower = address.toLowerCase();
  if (lower.startsWith("bc1q") || lower.startsWith("tb1q")) {
    return `0014${hashAddressToHex(address, 40)}`;
  }
  if (lower.startsWith("bc1p") || lower.startsWith("tb1p")) {
    return `5120${hashAddressToHex(address, 64)}`;
  }
  return `5120${hashAddressToHex(address, 64)}`;
}

const DEFAULT_SCRIPT_PUBKEY = deriveScriptPubKey(DEFAULT_BTC_ADDRESS);

function jsonResponse(res, body, status = 200) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw.length ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function handlePreflight(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end();
    return true;
  }
  return false;
}

const vpServer = http.createServer((req, res) => {
  if (handlePreflight(req, res)) return;
  const url = new URL(req.url ?? "/", `http://localhost:${PORTS.vp}`);
  if (url.pathname === "/vp-health") {
    jsonResponse(res, []);
    return;
  }
  if (url.pathname.startsWith("/rpc/")) {
    jsonResponse(res, {
      jsonrpc: "2.0",
      id: 1,
      result: null,
    });
    return;
  }
  jsonResponse(res, { error: "not found" }, 404);
});

const ethServer = http.createServer(async (req, res) => {
  if (handlePreflight(req, res)) return;
  const url = new URL(req.url ?? "/", `http://localhost:${PORTS.ethRpc}`);
  if (url.pathname !== "/rpc" || req.method !== "POST") {
    jsonResponse(res, { error: "not found" }, 404);
    return;
  }
  let body;
  try {
    body = await readBody(req);
  } catch {
    jsonResponse(res, { error: "invalid json" }, 400);
    return;
  }
  const method = body.method ?? "";
  let result = null;
  if (method === "eth_chainId") {
    result = "0xaa36a7";
  } else if (method === "eth_blockNumber") {
    result = "0x1";
  } else if (method === "eth_getBalance") {
    result = "0x0";
  }
  jsonResponse(res, { jsonrpc: "2.0", id: body.id ?? 1, result });
});

const mempoolServer = http.createServer((req, res) => {
  if (handlePreflight(req, res)) return;
  const url = new URL(req.url ?? "/", `http://localhost:${PORTS.mempool}`);
  // The dApp emits URLs of the form
  //   `${NEXT_PUBLIC_MEMPOOL_API}/<network>/api/...`
  // on signet and `${NEXT_PUBLIC_MEMPOOL_API}/api/...` on mainnet.
  // Suffix-match the path so a single handler covers both shapes and
  // every supported BTC network. Mirrors the Playwright glob in
  // `networkRoutes.ts` (`**/address/{addr}/utxo`, etc.).
  const path = url.pathname;
  if (path.endsWith(`/address/${DEFAULT_BTC_ADDRESS}/utxo`)) {
    jsonResponse(res, [
      {
        txid: `ee${"00".repeat(30)}0000`,
        vout: 0,
        value: DEFAULT_BALANCE_SATS,
        status: { confirmed: true },
      },
    ]);
    return;
  }
  if (path.endsWith(`/v1/validate-address/${DEFAULT_BTC_ADDRESS}`)) {
    jsonResponse(res, { isvalid: true, scriptPubKey: DEFAULT_SCRIPT_PUBKEY });
    return;
  }
  if (path.endsWith("/v1/fees/recommended")) {
    jsonResponse(res, {
      fastestFee: 5,
      halfHourFee: 4,
      hourFee: 3,
      economyFee: 2,
      minimumFee: 1,
    });
    return;
  }
  jsonResponse(res, { error: "not found" }, 404);
});

const graphqlServer = http.createServer(async (req, res) => {
  if (handlePreflight(req, res)) return;
  if (req.method !== "POST") {
    jsonResponse(res, { error: "method not allowed" }, 405);
    return;
  }
  jsonResponse(res, { data: {} });
});

function listen(server, port, label) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`[e2e:env] ${label} listening on http://localhost:${port}`);
      resolve();
    });
  });
}

async function main() {
  await Promise.all([
    listen(vpServer, PORTS.vp, "vault-provider-proxy"),
    listen(ethServer, PORTS.ethRpc, "eth-rpc"),
    listen(mempoolServer, PORTS.mempool, "mempool"),
    listen(graphqlServer, PORTS.graphql, "graphql"),
  ]);
  // eslint-disable-next-line no-console
  console.log("[e2e:env] all stubs up. Ctrl-C to stop.");
}

function shutdown() {
  // eslint-disable-next-line no-console
  console.log("\n[e2e:env] shutting down...");
  for (const server of [vpServer, ethServer, mempoolServer, graphqlServer]) {
    server.close();
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[e2e:env] failed to start", err);
  process.exit(1);
});
