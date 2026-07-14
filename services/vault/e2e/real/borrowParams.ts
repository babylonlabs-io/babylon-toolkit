/**
 * Borrow-parameter pre-flight: read the borrowable-token list, the depositor's collateral/debt, and a
 * best-effort max-borrow estimate for the selected network — the SAME sources the web app uses — so
 * the CLI can offer a token menu + a safe default amount before launching the browser.
 *
 * This mirrors the app's `useAaveReserveDetail` chain in Node against pure SDK reads (each takes a viem
 * client; nothing here reimplements a frozen/critical path):
 *   - Borrowable reserves: the indexer GraphQL `GetAaveAppConfig` (a raw-string mirror of
 *     `fetchAaveAppConfig`), filtered `borrowable && !paused && !frozen && id !== vBTC`.
 *   - Collateral/debt: on-chain `getPosition` (ETH addr → proxy) + `getUserAccountData` (aggregate).
 *   - Max borrow: `calculateMaxBorrowTokens`'s formula (helper is app-side; `BPS_SCALE` +
 *     `MIN_HEALTH_FACTOR_FOR_BORROW` are SDK-exported), fed the vBTC liquidation threshold + oracle price.
 *
 * Everything here is a best-effort ESTIMATE for a menu default / a "no collateral" heads-up — NEVER a
 * hard gate. The live borrow form (its Max button + validation) is the authoritative, position-aware
 * limit and is what actually blocks a too-large or uncollateralised borrow.
 */
import {
  aaveRayValueToUsd,
  aaveValueToUsd,
  BPS_SCALE,
  getDynamicReserveConfig,
  getOracleAddress,
  getPosition,
  getReserve,
  getReservesPrices,
  getUserAccountData,
  getUserPosition,
  MIN_HEALTH_FACTOR_FOR_BORROW,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { gql } from "graphql-request";
import { type Address, type PublicClient } from "viem";

import { type NetworkName } from "./config";
import {
  createEthClient,
  createGraphQLClient,
  resolveCoreSpoke,
  resolveNetworkContracts,
} from "./networkContracts";
import { formatTokenAmount } from "./tokenAmount";

/**
 * Default borrow = this fraction of the computed max, keeping the health factor well above the
 * MIN_HEALTH_FACTOR_FOR_BORROW (1.05) liquidation edge for a repeatable real-money test. The full max
 * stays reachable via `--borrow-amount` (or `--borrow-amount=max`) and the form's Max button.
 */
export const CONSERVATIVE_BORROW_FRACTION = 0.25;

/** The Aave oracle reports USD prices scaled by 1e8. */
const ORACLE_PRICE_SCALE = 1e8;

/**
 * Format a token amount for the borrow form's numeric input — the shared floored formatter (see
 * tokenAmount.ts). Kept as a named re-export so the borrow action's import is unchanged.
 */
export const formatBorrowAmount = formatTokenAmount;

/** A borrowable token as offered in the CLI menu / used to drive the asset picker. */
export interface BorrowReserve {
  symbol: string;
  name: string;
  reserveId: bigint;
  tokenAddress: string;
  /** Token (underlying) decimals — what the borrow amount is parsed against. */
  decimals: number;
}

/** The depositor's aggregate Aave position (collateral + debt). */
export interface BorrowContext {
  /** True when the position currently holds borrowable collateral (`totalCollateralBTC > 0`) — the same
   *  condition that enables the dashboard's Borrow button (`hasCollateral = collateralBtc > 0`). */
  hasCollateral: boolean;
  collateralUsd: number;
  currentDebtUsd: number;
}

/** A best-effort max-borrow estimate for one token. */
export interface MaxBorrow {
  symbol: string;
  decimals: number;
  /** Max tokens borrowable while keeping HF ≥ MIN_HEALTH_FACTOR_FOR_BORROW (0 when no collateral). */
  maxTokens: number;
}

const GET_AAVE_APP_CONFIG = gql`
  query GetAaveAppConfig {
    aaveConfig(id: 1) {
      vaultBtcReserveId
    }
    aaveReserves {
      items {
        id
        paused
        frozen
        borrowable
        underlyingToken {
          address
          symbol
          name
          decimals
        }
      }
    }
  }
`;

interface AaveAppConfigResponse {
  aaveConfig: { vaultBtcReserveId: string } | null;
  aaveReserves: {
    items: {
      id: string;
      paused: boolean;
      frozen: boolean;
      borrowable: boolean;
      underlyingToken: {
        address: string;
        symbol: string;
        name: string;
        decimals: number;
      } | null;
    }[];
  };
}

/**
 * Read the vBTC reserve id + the borrowable-token list from the indexer — a raw-string mirror of the
 * app's `fetchAaveAppConfig`: keep only reserves that are `borrowable && !paused && !frozen`, are not
 * the vBTC collateral reserve, and carry token metadata (mirrors the app's `mapReserveConfig` null-skip).
 */
async function fetchAaveReserveConfig(graphqlEndpoint: string): Promise<{
  vaultBtcReserveId: bigint;
  borrowable: BorrowReserve[];
}> {
  const client = createGraphQLClient(graphqlEndpoint);
  const response =
    await client.request<AaveAppConfigResponse>(GET_AAVE_APP_CONFIG);
  if (!response.aaveConfig)
    throw new Error(
      `No aaveConfig from the indexer at ${graphqlEndpoint} — cannot resolve borrowable reserves.`,
    );
  const vaultBtcReserveId = BigInt(response.aaveConfig.vaultBtcReserveId);

  const borrowable = response.aaveReserves.items
    .filter(
      (r) =>
        r.borrowable &&
        !r.paused &&
        !r.frozen &&
        BigInt(r.id) !== vaultBtcReserveId &&
        r.underlyingToken != null,
    )
    .map((r) => ({
      symbol: r.underlyingToken!.symbol,
      name: r.underlyingToken!.name,
      reserveId: BigInt(r.id),
      tokenAddress: r.underlyingToken!.address,
      decimals: r.underlyingToken!.decimals,
    }));

  return { vaultBtcReserveId, borrowable };
}

/** Fetch the borrowable-token list for `network` (for the CLI's asset menu + the browser asset picker). */
export async function fetchBorrowableReserves(
  network: NetworkName,
): Promise<BorrowReserve[]> {
  const { graphqlEndpoint } = resolveNetworkContracts(network);
  const { borrowable } = await fetchAaveReserveConfig(graphqlEndpoint);
  return borrowable;
}

/**
 * Shared prelude for every position-derived read: resolve the network's adapter + a Sepolia client,
 * then read the depositor's on-chain adapter position (`null` when none exists yet). `getPosition` maps
 * the ETH address to the Aave proxy — the app's `useAaveUserPosition` does the same. Exported so the
 * repay pre-flight (repayParams.ts) reuses the same proxy/client resolution.
 */
export async function openPosition(
  network: NetworkName,
  ethAddress: string,
): Promise<{
  client: PublicClient;
  appController: string;
  position: Awaited<ReturnType<typeof getPosition>>;
}> {
  const { appController, ethRpcUrl } = resolveNetworkContracts(network);
  const client = createEthClient(ethRpcUrl);
  const position = await getPosition(
    client,
    appController as Address,
    ethAddress as Address,
  );
  return { client, appController, position };
}

/**
 * The proxy's aggregate collateral + debt in USD, via the Core Spoke's account data. Returns the spoke
 * too so a caller needing further spoke reads (e.g. the max-borrow risk params) reuses it instead of
 * re-resolving.
 */
async function readAccountUsd(
  client: PublicClient,
  appController: string,
  proxy: Address,
): Promise<{ spoke: Address; collateralUsd: number; currentDebtUsd: number }> {
  const spoke = await resolveCoreSpoke(client, appController);
  const accountData = await getUserAccountData(client, spoke, proxy);
  return {
    spoke,
    collateralUsd: aaveValueToUsd(accountData.totalCollateralValue),
    currentDebtUsd: aaveRayValueToUsd(accountData.totalDebtValueRay),
  };
}

/**
 * Read the depositor's aggregate collateral + debt on `network`, mirroring the app's
 * `useAaveUserPosition`. `hasCollateral` uses `totalCollateralBTC > 0` — the same condition the
 * dashboard's Borrow button enables on. Returns a zero/`hasCollateral:false` context when the position
 * doesn't exist yet.
 */
export async function fetchBorrowContext(
  network: NetworkName,
  ethAddress: string,
): Promise<BorrowContext> {
  const { client, appController, position } = await openPosition(
    network,
    ethAddress,
  );
  if (!position || position.totalCollateralBTC <= 0n)
    return { hasCollateral: false, collateralUsd: 0, currentDebtUsd: 0 };

  const { collateralUsd, currentDebtUsd } = await readAccountUsd(
    client,
    appController,
    position.proxyContract,
  );
  return { hasCollateral: true, collateralUsd, currentDebtUsd };
}

/**
 * Read just the depositor's on-chain BTC collateral (in sats) from the adapter position. This is the
 * exact, PRICE-INDEPENDENT quantity that rises the moment a vault is registered as collateral — unlike
 * the USD collateral value (oracle-priced, so it drifts with BTC price between reads). Lighter than
 * `fetchBorrowContext` (a single `getPosition` read, no spoke/account-data), so it's cheap to poll for
 * the post-activation collateral-settle wait (see the borrow action). Returns 0n when no position
 * exists yet (e.g. a first-ever vault, before activation creates the position).
 */
export async function fetchCollateralSats(
  network: NetworkName,
  ethAddress: string,
): Promise<bigint> {
  const { position } = await openPosition(network, ethAddress);
  return position?.totalCollateralBTC ?? 0n;
}

/**
 * Max tokens borrowable while keeping health factor ≥ MIN_HEALTH_FACTOR_FOR_BORROW — the exact formula
 * of the app's `calculateMaxBorrowTokens` (the helper itself is app-side, but `BPS_SCALE` +
 * `MIN_HEALTH_FACTOR_FOR_BORROW` are SDK-exported). Not floored to token precision here — the caller
 * applies the conservative fraction + formatting.
 *
 * KEEP IN SYNC with src/applications/aave/components/LoanCard/Borrow/hooks/calculateMaxBorrowTokens.ts.
 * Reimplemented (not imported) because there's no SDK equivalent and the e2e layer intentionally does
 * not import from `src/` (see the file header) — this comment is the maintenance contract.
 */
function computeMaxBorrowTokens(
  collateralUsd: number,
  currentDebtUsd: number,
  liquidationThresholdBps: number,
  tokenPriceUsd: number,
): number {
  if (tokenPriceUsd <= 0) return 0;
  const maxTotalDebtUsd =
    (collateralUsd * liquidationThresholdBps) /
    BPS_SCALE /
    MIN_HEALTH_FACTOR_FOR_BORROW;
  const maxAdditionalBorrowUsd = maxTotalDebtUsd - currentDebtUsd;
  return Math.max(0, maxAdditionalBorrowUsd / tokenPriceUsd);
}

/**
 * Best-effort max-borrow estimate for one token on `network`, mirroring the app's borrow-form chain:
 * collateral/debt from the position, the vBTC reserve's liquidation threshold (the depositor's stored
 * `dynamicConfigKey` when a position exists, else the reserve's current key — matches the app), and the
 * token's oracle price. Returns `maxTokens: 0` when there's no collateral yet. Estimate only — the
 * form's Max is authoritative.
 */
export async function fetchMaxBorrow(
  network: NetworkName,
  ethAddress: string,
  symbol: string,
): Promise<MaxBorrow> {
  const { graphqlEndpoint } = resolveNetworkContracts(network);
  const { vaultBtcReserveId, borrowable } =
    await fetchAaveReserveConfig(graphqlEndpoint);
  const reserve = borrowable.find(
    (r) => r.symbol.toLowerCase() === symbol.toLowerCase(),
  );
  if (!reserve)
    throw new Error(
      `Token "${symbol}" is not a borrowable reserve on ${network} (available: ${borrowable.map((r) => r.symbol).join(", ")}).`,
    );

  const { client, appController, position } = await openPosition(
    network,
    ethAddress,
  );
  if (!position || position.totalCollateralBTC <= 0n)
    return { symbol: reserve.symbol, decimals: reserve.decimals, maxTokens: 0 };

  const { spoke, collateralUsd, currentDebtUsd } = await readAccountUsd(
    client,
    appController,
    position.proxyContract,
  );

  // Liquidation threshold from the vBTC reserve's dynamic config, keyed by the depositor's stored
  // `dynamicConfigKey` when the position has one (else the reserve's current key) — matches the app's
  // useVaultSplitParams. A missing user position falls back to the reserve baseline.
  const userVbtcPosition = await getUserPosition(
    client,
    spoke,
    vaultBtcReserveId,
    position.proxyContract,
  ).catch(() => null);
  const vbtcReserve = await getReserve(client, spoke, vaultBtcReserveId);
  const dynamicConfigKey =
    userVbtcPosition?.dynamicConfigKey ?? vbtcReserve.dynamicConfigKey;
  const dynamicConfig = await getDynamicReserveConfig(
    client,
    spoke,
    vaultBtcReserveId,
    dynamicConfigKey,
  );
  const liquidationThresholdBps = Number(dynamicConfig.collateralFactor);

  const oracle = await getOracleAddress(client, spoke);
  const priceRaw = (
    await getReservesPrices(client, oracle, [reserve.reserveId])
  )[0];
  const tokenPriceUsd = Number(priceRaw) / ORACLE_PRICE_SCALE;

  return {
    symbol: reserve.symbol,
    decimals: reserve.decimals,
    maxTokens: computeMaxBorrowTokens(
      collateralUsd,
      currentDebtUsd,
      liquidationThresholdBps,
      tokenPriceUsd,
    ),
  };
}
