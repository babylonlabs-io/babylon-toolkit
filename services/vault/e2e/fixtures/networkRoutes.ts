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
    const requestBody = route.request().postDataJSON?.() ?? null;
    const body = options.rpcHandler(vpAddress, requestBody);
    await jsonResponse(route, body);
  });
}

const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

/**
 * Mock the ETH JSON-RPC endpoint. The dApp issues `eth_chainId`,
 * `eth_call`, `eth_getBalance`, etc. to `NEXT_PUBLIC_ETH_RPC_URL`. The
 * default handler answers `eth_chainId` with sepolia and returns null
 * for everything else - tests that need contract reads must supply a
 * handler keyed on `(method, params)`. Use
 * `mockEthRpcForSeededWallet` when the seeded ETH balance must be
 * reflected in `eth_getBalance` responses.
 */
export async function mockEthRpc(
  page: Page,
  handler?: (method: string, params: unknown[]) => unknown,
): Promise<void> {
  await page.route("**/rpc", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      return jsonResponse(route, { error: "method not allowed" }, 405);
    }
    const body = (request.postDataJSON?.() ?? {}) as {
      id?: number | string | null;
      method?: string;
      params?: unknown[];
    };
    const method = body.method ?? "";
    const params = body.params ?? [];
    let result: unknown = null;
    if (handler) {
      result = handler(method, params);
    } else if (method === "eth_chainId") {
      result = SEPOLIA_CHAIN_ID_HEX;
    }
    await jsonResponse(route, {
      jsonrpc: "2.0",
      id: body.id ?? 1,
      result,
    });
  });
}

/**
 * ETH JSON-RPC routes for a single seeded ETH wallet. Answers
 * `eth_chainId`, `eth_blockNumber`, and `eth_getBalance` (for the
 * wallet's account address) from the seeded fixture so simple
 * connect/balance flows resolve without per-test handler wiring. Any
 * other method falls through to `handler` if supplied, otherwise
 * returns null - tests that exercise contract reads must pass a
 * handler keyed on `(method, params)`.
 */
export async function mockEthRpcForSeededWallet(
  page: Page,
  wallet: Pick<SeededEthWallet, "account" | "balanceWeiHex">,
  handler?: (method: string, params: unknown[]) => unknown,
): Promise<void> {
  const accountAddress = wallet.account.address.toLowerCase();
  await mockEthRpc(page, (method, params) => {
    if (method === "eth_chainId") return SEPOLIA_CHAIN_ID_HEX;
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
    return handler ? handler(method, params) : null;
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
    const body = (route.request().postDataJSON?.() ?? {}) as {
      operationName?: string;
      query?: string;
      variables?: Record<string, unknown>;
    };
    const response = handler({
      operationName: body.operationName,
      query: body.query ?? "",
      variables: body.variables ?? {},
    });
    await jsonResponse(route, response);
  });
}
