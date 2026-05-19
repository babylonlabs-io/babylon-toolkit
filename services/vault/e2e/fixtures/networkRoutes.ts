/**
 * Playwright route handlers for the network surfaces the vault dApp
 * hits at runtime: mempool.space, the vault-provider proxy
 * (`NEXT_PUBLIC_TBV_VP_PROXY_URL`), and the eth RPC
 * (`NEXT_PUBLIC_ETH_RPC_URL`). Centralising them keeps tests free of
 * URL literals and ensures the route patterns track playwright config.
 *
 * Each helper is composable: call several on the same `page` to layer
 * behaviour. The last-registered handler wins for overlapping patterns,
 * which mirrors Playwright's route precedence.
 */

import type { Page, Route } from "@playwright/test";

import type { VpHealthSnapshot } from "../../src/types/vpHealth";

import type {
  SeededBtcWallet,
  SeededEthWallet,
  SeededMempoolAddressInfo,
  SeededMempoolUtxo,
} from "./seededWallets";

const DEFAULT_NETWORK_FEES = {
  fastestFee: 5,
  halfHourFee: 4,
  hourFee: 3,
  economyFee: 2,
  minimumFee: 1,
};

function jsonResponse(
  route: Route,
  body: unknown,
  status = 200,
): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/** JSON-RPC error code for `method not found` per the spec. */
const JSON_RPC_METHOD_NOT_FOUND = -32601;

function jsonRpcMethodNotFound(
  route: Route,
  id: number | string | null,
  method: string,
): Promise<void> {
  return jsonResponse(route, {
    jsonrpc: "2.0",
    id,
    error: {
      code: JSON_RPC_METHOD_NOT_FOUND,
      message: `method not found: ${method}`,
    },
  });
}

/**
 * Mempool routes for a single seeded BTC address.
 *
 * Wires `/address/{addr}/utxo`, `/v1/validate-address/{addr}`, and
 * `/v1/fees/recommended` to return the wallet's seeded payloads. Other
 * mempool paths fall through unhandled, which surfaces as test
 * failures - tests that need more mempool behaviour must extend this
 * helper rather than silently 200 everything.
 */
export async function mockMempoolForSeededBtcWallet(
  page: Page,
  wallet: Pick<
    SeededBtcWallet,
    "address" | "mempoolUtxos" | "mempoolAddressInfo"
  >,
  feeOverrides?: Partial<typeof DEFAULT_NETWORK_FEES>,
): Promise<void> {
  const fees = { ...DEFAULT_NETWORK_FEES, ...feeOverrides };
  // The dApp builds URLs from the network config base; matching by
  // path suffix keeps the route portable across signet/mainnet bases.
  await page.route(`**/address/${wallet.address}/utxo`, (route) =>
    jsonResponse(route, wallet.mempoolUtxos satisfies SeededMempoolUtxo[]),
  );
  await page.route(`**/v1/validate-address/${wallet.address}`, (route) =>
    jsonResponse(
      route,
      wallet.mempoolAddressInfo satisfies SeededMempoolAddressInfo,
    ),
  );
  await page.route("**/v1/fees/recommended", (route) =>
    jsonResponse(route, fees),
  );
}

/**
 * VP proxy routes. Returns the supplied health snapshots from
 * `/vp-health` and 501s any RPC forwarder call unless a per-VP
 * handler is provided. Tests that exercise VP-specific RPC must pass
 * a `rpcHandler` that switches on `vpAddress`.
 */
export async function mockVpProxy(
  page: Page,
  options: {
    healthSnapshots?: VpHealthSnapshot[];
    rpcHandler?: (vpAddress: string, body: unknown) => unknown;
  } = {},
): Promise<void> {
  const snapshots = options.healthSnapshots ?? [];
  await page.route("**/vp-health", (route) => jsonResponse(route, snapshots));
  await page.route("**/rpc/*", async (route) => {
    if (!options.rpcHandler) {
      return jsonResponse(
        route,
        { error: "no VP rpc handler installed for this test" },
        501,
      );
    }
    const url = new URL(route.request().url());
    const vpAddress = url.pathname.split("/").pop() ?? "";
    const requestBody = route.request().postDataJSON();
    if (Array.isArray(requestBody)) {
      return jsonResponse(
        route,
        { error: "json-rpc batches are not supported by mockVpProxy" },
        400,
      );
    }
    const body = options.rpcHandler(vpAddress, requestBody);
    await jsonResponse(route, body);
  });
}

const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

/**
 * Sentinel returned from an eth-rpc handler to indicate "I don't know
 * this method". The route fulfills with a JSON-RPC `-32601` error
 * instead of a silent `result: null`, mirroring the fail-loud policy
 * `mockVpProxy` follows for unhandled paths.
 */
export const ETH_RPC_METHOD_NOT_HANDLED = Symbol("ETH_RPC_METHOD_NOT_HANDLED");

export interface MockEthRpcOptions {
  /**
   * Override the chain id returned for `eth_chainId`. Defaults to
   * sepolia. Override when the test asserts against a different chain
   * (mainnet, holesky, anvil, etc.).
   */
  chainIdHex?: `0x${string}`;
  /**
   * Handler keyed on `(method, params)`. Return a value to use as
   * `result`; return `ETH_RPC_METHOD_NOT_HANDLED` to fall through to
   * the default chain-id response or a JSON-RPC `method not found`
   * error.
   */
  handler?: (method: string, params: unknown[]) => unknown;
}

/**
 * Mock the ETH JSON-RPC endpoint. The dApp issues `eth_chainId`,
 * `eth_call`, `eth_getBalance`, etc. to `NEXT_PUBLIC_ETH_RPC_URL`.
 *
 * Default behaviour: answer `eth_chainId` with `chainIdHex` (sepolia
 * unless overridden) and respond to anything else with a JSON-RPC
 * `-32601 method not found` so a test that forgot to wire a handler
 * fails loudly instead of asserting against `result: null`.
 *
 * Tests that need contract reads pass `options.handler`; the handler
 * returns the `result` value, or `ETH_RPC_METHOD_NOT_HANDLED` to
 * delegate back to the defaults.
 *
 * Backwards-compat: a function passed in lieu of an options object is
 * treated as `options.handler`.
 */
export async function mockEthRpc(
  page: Page,
  optionsOrHandler?:
    | MockEthRpcOptions
    | ((method: string, params: unknown[]) => unknown),
): Promise<void> {
  const options: MockEthRpcOptions =
    typeof optionsOrHandler === "function"
      ? { handler: optionsOrHandler }
      : (optionsOrHandler ?? {});
  const chainIdHex = options.chainIdHex ?? SEPOLIA_CHAIN_ID_HEX;
  const handler = options.handler;

  await page.route("**/rpc", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      return jsonResponse(route, { error: "method not allowed" }, 405);
    }
    const raw = request.postDataJSON();
    if (Array.isArray(raw)) {
      return jsonResponse(
        route,
        { error: "json-rpc batches are not supported by mockEthRpc" },
        400,
      );
    }
    const body = (raw ?? {}) as {
      id?: number | string | null;
      method?: string;
      params?: unknown[];
    };
    const method = body.method ?? "";
    const params = body.params ?? [];
    const id = body.id ?? 1;

    if (handler) {
      const handled = handler(method, params);
      if (handled !== ETH_RPC_METHOD_NOT_HANDLED) {
        return jsonResponse(route, { jsonrpc: "2.0", id, result: handled });
      }
    }

    if (method === "eth_chainId") {
      return jsonResponse(route, { jsonrpc: "2.0", id, result: chainIdHex });
    }

    return jsonRpcMethodNotFound(route, id, method);
  });
}

/**
 * ETH JSON-RPC routes for a single seeded ETH wallet. Answers
 * `eth_chainId`, `eth_blockNumber`, and `eth_getBalance` (for the
 * wallet's account address) from the seeded fixture so simple
 * connect/balance flows resolve without per-test handler wiring. Any
 * other method falls through to `options.handler` if supplied;
 * otherwise the route fulfills with a JSON-RPC `method not found`
 * (matches `mockEthRpc`'s fail-loud default).
 */
export async function mockEthRpcForSeededWallet(
  page: Page,
  wallet: Pick<SeededEthWallet, "account" | "balanceWeiHex">,
  options: MockEthRpcOptions = {},
): Promise<void> {
  const accountAddress = wallet.account.address.toLowerCase();
  const chainIdHex = options.chainIdHex ?? SEPOLIA_CHAIN_ID_HEX;
  const userHandler = options.handler;
  await mockEthRpc(page, {
    chainIdHex,
    handler: (method, params) => {
      if (method === "eth_chainId") return chainIdHex;
      if (method === "eth_blockNumber") return "0x1";
      if (method === "eth_getBalance") {
        const [target] = params as [string | undefined];
        if (
          typeof target === "string" &&
          target.toLowerCase() === accountAddress
        ) {
          return wallet.balanceWeiHex;
        }
        return "0x0";
      }
      return userHandler
        ? userHandler(method, params)
        : ETH_RPC_METHOD_NOT_HANDLED;
    },
  });
}

/**
 * Mock the GraphQL endpoint with a request-shape-aware handler. The
 * vault app uses `graphql-request` so each request is `POST` with a
 * JSON body `{ query, variables, operationName }`. The handler returns
 * the data field; errors propagate verbatim.
 */
export async function mockGraphql(
  page: Page,
  handler: (operation: {
    operationName?: string;
    query: string;
    variables: Record<string, unknown>;
  }) => { data?: unknown; errors?: unknown[] },
): Promise<void> {
  await page.route("**/graphql", async (route) => {
    const body = (route.request().postDataJSON() ?? {}) as {
      operationName?: string;
      query?: string;
      variables?: Record<string, unknown>;
    };
    if (typeof body.query !== "string" || body.query.length === 0) {
      return jsonResponse(
        route,
        {
          errors: [
            { message: "mockGraphql: request body missing string `query`" },
          ],
        },
        400,
      );
    }
    const response = handler({
      operationName: body.operationName,
      query: body.query,
      variables: body.variables ?? {},
    });
    await jsonResponse(route, response);
  });
}
