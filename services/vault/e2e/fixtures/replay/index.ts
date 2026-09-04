/**
 * Serves the dApp's four external boundaries from a recorded devnet run.
 *
 * The visual capture used to leave these unmocked. The app then failed every
 * contract read, rendered its error boundary, and ten of the twelve captured
 * screens were photographs of "Something went wrong" - identical on both
 * sides of every diff, so the check reported "no visual changes" for pages it
 * had never rendered. This replaces that with the recorded responses of a
 * real peg-in, so the screens under comparison are the populated app.
 *
 * Deliberately no live fallthrough: an unmatched request is answered with an
 * explicit error and recorded in {@link ReplayBackend.misses}. A capture that
 * silently reached the network would be non-deterministic run to run, and on
 * a fork PR it would leak.
 */

import type { Page, Route } from "@playwright/test";
import type { Hex } from "viem";

import { MOCK_ENV_VARS } from "../../../playwright.config";

import {
  buildRecordedChain,
  MULTICALL3_ADDRESS,
  type JsonRpcRequest,
  type RecordedChain,
} from "./chain";
import {
  DEFAULT_REPLAY_STEP,
  graphqlKey,
  loadRecordedRun,
  parseJson,
  PEGIN_RECORDING_PATH,
  type RecordedBackend,
  type RecordedExchange,
} from "./recording";

/** JSON-RPC error code for `method not found`, per the spec. */
const JSON_RPC_METHOD_NOT_FOUND = -32601;

/**
 * Placeholders the mempool path normaliser substitutes for the recorded
 * address and txid, so a lookup keys on the shape of the request rather than
 * on values that belong to the wallet the recording happened to use.
 */
const ANY_ADDRESS = ":address";
const ANY_TXID = ":txid";

export interface ReplayBackend {
  /**
   * Requests the recording could not answer, as human-readable labels.
   * Asserted empty by the capture: a miss means the app now reads something
   * the recording predates, and the screen it feeds is showing an error or an
   * empty state rather than data.
   */
  readonly misses: readonly string[];
  /** The fake chain, exposed so a spec can assert on unanswered inner calls. */
  readonly chain: RecordedChain;
  /**
   * How many requests this backend answered, per boundary.
   *
   * The counterpart to {@link ReplayBackend.misses}, and needed because a
   * miss can only be recorded for a request that ARRIVED. Point the app at a
   * boundary this backend does not serve - a stale URL, a moved port, an env
   * override - and nothing reaches it: no miss is logged, no error state
   * renders, and a screen that depends on that boundary quietly falls back to
   * its "nothing to show" variant. That variant is stable, so it diffs clean
   * against itself forever - the same silent-green failure this whole fixture
   * exists to end.
   *
   * Per boundary rather than one total because the total cannot see it: with
   * only the chain moved, the other three still answer and the count is
   * healthy while every contract read has gone nowhere. A screen states which
   * boundaries it actually depends on and those are the ones asserted.
   */
  readonly served: Readonly<Record<RecordedBackend, number>>;
}

function jsonResponse(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/**
 * Reduce a mempool REST path to a key that ignores the address or txid in it.
 *
 * The recording holds exactly one wallet and one transaction, so keeping
 * those values in the key would only mean that a capture wallet with any
 * other address matches nothing. Ignoring them lets the injected wallet keep
 * its own address while still being funded by the recorded UTXO set.
 */
function mempoolKey(pathname: string): string {
  return pathname
    .replace(/\/address\/[^/]+\/utxo$/, `/address/${ANY_ADDRESS}/utxo`)
    .replace(
      /\/v1\/validate-address\/[^/]+$/,
      `/v1/validate-address/${ANY_ADDRESS}`,
    )
    .replace(/\/tx\/[0-9a-f]{64}$/i, `/tx/${ANY_TXID}`)
    .replace(/^.*\/api\//, "/");
}

/**
 * Index recorded exchanges by key, last one winning.
 *
 * Last rather than first because the run moves forward through a deposit: the
 * final response for a given query is the one describing the furthest-along
 * state, which is what a screenshot of a populated app should show. The
 * earlier responses describe a half-built position nobody wants pictured.
 */
function indexBy(
  entries: readonly RecordedExchange[],
  key: (entry: RecordedExchange) => string,
): Map<string, RecordedExchange> {
  const index = new Map<string, RecordedExchange>();
  for (const entry of entries) index.set(key(entry), entry);
  return index;
}

/**
 * Install the recorded backend on `page`.
 *
 * Call before `page.goto`. Registers one handler per boundary; each matches
 * the localhost bases pinned in `MOCK_ENV_VARS` by path shape, so the
 * handlers stay correct if a port moves.
 */
export interface ReplayOptions {
  /** Which recording to replay. */
  readonly recordingPath?: string;
  /**
   * Which moment of it to replay - see `DEFAULT_REPLAY_STEP`. A later step
   * shows a further-along world (a pending deposit, a spent balance).
   */
  readonly upToStep?: string;
}

export async function installRecordedBackend(
  page: Page,
  options: ReplayOptions = {},
): Promise<ReplayBackend> {
  const run = loadRecordedRun(
    options.recordingPath ?? PEGIN_RECORDING_PATH,
    options.upToStep ?? DEFAULT_REPLAY_STEP,
  );
  const chain = buildRecordedChain(run);
  const misses: string[] = [];

  const vpHealth = (run.byBackend.get("vp-health") ?? []).at(-1);
  const vpRpc = indexBy(
    run.byBackend.get("vp-rpc") ?? [],
    (entry) => parseJson<JsonRpcRequest>(entry.reqBody)?.method ?? "",
  );
  const graphql = indexBy(run.byBackend.get("graphql") ?? [], (entry) =>
    graphqlKey(entry.method, new URL(entry.url).pathname, entry.reqBody),
  );
  const mempool = indexBy(run.byBackend.get("mempool") ?? [], (entry) =>
    mempoolKey(new URL(entry.url).pathname),
  );

  const miss = (label: string): void => {
    misses.push(label);
  };

  const served: Record<RecordedBackend, number> = {
    "eth-rpc": 0,
    "vp-health": 0,
    "vp-rpc": 0,
    graphql: 0,
    mempool: 0,
  };
  const serve =
    <T>(backend: RecordedBackend, handler: (route: Route) => T) =>
    (route: Route): T => {
      served[backend] += 1;
      return handler(route);
    };

  /**
   * Match a boundary by ORIGIN, not by a path glob.
   *
   * A glob is wrong here twice over. `**‌/rpc` also matches the dev server's
   * own asset paths, and `**‌/mempool/**` matched
   * `/@fs/.../ts-sdk/dist/tbv/core/clients/mempool/index.js` - a module
   * request answered with recorded JSON, which is a blank page and a
   * confusing miss. The four backends live on four pinned ports, so the
   * origin identifies them exactly and keeps doing so if a path moves.
   */
  const originOf = (value: string): string => new URL(value).origin;
  const ETH_RPC_ORIGIN = originOf(MOCK_ENV_VARS.NEXT_PUBLIC_ETH_RPC_URL);
  const VP_ORIGIN = originOf(MOCK_ENV_VARS.NEXT_PUBLIC_TBV_VP_PROXY_URL);
  const GRAPHQL_ORIGIN = originOf(
    MOCK_ENV_VARS.NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT,
  );
  const MEMPOOL_ORIGIN = originOf(MOCK_ENV_VARS.NEXT_PUBLIC_MEMPOOL_API);
  const on =
    (origin: string, matches: (pathname: string) => boolean) => (url: URL) =>
      url.origin === origin && matches(url.pathname);

  // --- Ethereum JSON-RPC -------------------------------------------------
  await page.route(
    on(ETH_RPC_ORIGIN, () => true),
    serve("eth-rpc", async (route) => {
      const body = parseJson<JsonRpcRequest>(route.request().postData() ?? "");
      const id = body?.id ?? 1;
      const method = body?.method ?? "";

      if (method === "eth_call") {
        const [call] = (body?.params ?? []) as [
          { to?: string; data?: Hex } | undefined,
        ];
        const to = call?.to ?? "";
        const data = call?.data;
        if (data === undefined) {
          miss("eth_call with no calldata");
          return jsonResponse(route, {
            jsonrpc: "2.0",
            id,
            error: { code: JSON_RPC_METHOD_NOT_FOUND, message: "no calldata" },
          });
        }
        const result =
          to.toLowerCase() === MULTICALL3_ADDRESS
            ? chain.answerMulticall(data)
            : chain.answerCall(to, data);
        if (result === null) {
          miss(`eth_call ${to.toLowerCase()} ${data.slice(0, 10)}`);
          return jsonResponse(route, {
            jsonrpc: "2.0",
            id,
            error: {
              code: JSON_RPC_METHOD_NOT_FOUND,
              message: `no recorded answer for ${to} ${data.slice(0, 10)}`,
            },
          });
        }
        return jsonResponse(route, { jsonrpc: "2.0", id, result });
      }

      const recorded = chain.answerMethod(method);
      if (recorded === undefined) {
        miss(`eth rpc ${method}`);
        return jsonResponse(route, {
          jsonrpc: "2.0",
          id,
          error: {
            code: JSON_RPC_METHOD_NOT_FOUND,
            message: `method not recorded: ${method}`,
          },
        });
      }
      return jsonResponse(route, { jsonrpc: "2.0", id, result: recorded });
    }),
  );

  // --- Vault provider proxy ----------------------------------------------
  await page.route(
    on(VP_ORIGIN, (p) => p.startsWith("/vp-health")),
    serve("vp-health", (route) => {
      if (!vpHealth) {
        miss("vp-health");
        return jsonResponse(route, [], 503);
      }
      return route.fulfill({
        status: vpHealth.status,
        contentType: "application/json",
        body: vpHealth.resBody ?? "[]",
      });
    }),
  );

  await page.route(
    on(VP_ORIGIN, (p) => p.startsWith("/rpc/")),
    serve("vp-rpc", async (route) => {
      const body = parseJson<JsonRpcRequest>(route.request().postData() ?? "");
      const method = body?.method ?? "";
      const recorded = vpRpc.get(method);
      if (!recorded) {
        miss(`vp rpc ${method}`);
        return jsonResponse(
          route,
          {
            jsonrpc: "2.0",
            id: body?.id ?? 1,
            error: {
              code: JSON_RPC_METHOD_NOT_FOUND,
              message: `method not recorded: ${method}`,
            },
          },
          200,
        );
      }
      // The recorded body carries the recorded request's id. Rewriting it to
      // this request's id matters: a JSON-RPC client that matches responses by
      // id would otherwise drop every reply and hang on its own timeout.
      const parsed = parseJson<Record<string, unknown>>(recorded.resBody) ?? {};
      return jsonResponse(route, { ...parsed, id: body?.id ?? 1 });
    }),
  );

  // --- Indexer GraphQL ----------------------------------------------------
  await page.route(
    on(GRAPHQL_ORIGIN, () => true),
    serve("graphql", (route) => {
      const request = route.request();
      const key = graphqlKey(
        request.method(),
        new URL(request.url()).pathname,
        request.postData() ?? undefined,
      );
      const recorded = graphql.get(key);
      if (!recorded) {
        miss(`graphql ${key}`);
        return jsonResponse(route, {
          errors: [{ message: `operation not recorded: ${key}` }],
        });
      }
      return route.fulfill({
        status: recorded.status,
        contentType: "application/json",
        body: recorded.resBody ?? "{}",
      });
    }),
  );

  // --- Bitcoin mempool REST -----------------------------------------------
  await page.route(
    on(MEMPOOL_ORIGIN, () => true),
    serve("mempool", (route) => {
      const key = mempoolKey(new URL(route.request().url()).pathname);
      const recorded = mempool.get(key);
      if (!recorded) {
        miss(`mempool ${key}`);
        return jsonResponse(route, { error: `path not recorded: ${key}` }, 404);
      }
      return route.fulfill({
        status: recorded.status,
        contentType: "application/json",
        body: recorded.resBody ?? "{}",
      });
    }),
  );

  // `served` is the live object, not a copy: the counts keep rising while the
  // page runs, and a caller reading them after the walk must see the totals
  // rather than the zeroes they held when the backend was installed.
  return { misses, chain, served };
}
