/**
 * Projection layer: converts a single GraphQL activity item into the display
 * shape rendered by the Activity tab (`ActivityLog` rows). Owns formatting
 * helpers, the BTC-collateral invariant, and the BTC-vs-EVM tx-hash routing.
 *
 * Liquidation grouping lives in `classification.ts`; this file handles the
 * one-row-per-event projections (Deposit, Withdraw, Borrow, Repay, Redeem,
 * refunded Deposit).
 */

import { formatUnits } from "viem";

import { getNetworkConfigBTC } from "../../config";
import type {
  ActivityAmount,
  ActivityChain,
  ActivityLog,
  ActivityType,
} from "../../types/activityLog";

import type { GraphQLActivityType, GraphQLVaultActivityItem } from "./query";

const btcConfig = getNetworkConfigBTC();

/**
 * Asset metadata for the protocol's single collateral type.
 *
 * Vaults today hold BTC only; the on-chain `liquidation` event has no
 * `collateralReserveId` because there is nothing to disambiguate. Every
 * place that formats a collateral amount funnels through this constant so
 * the implicit "collateral === BTC" invariant lives at one site. If the
 * protocol ever ships multi-collateral vaults, this becomes a per-vault
 * lookup rather than a hunt-and-replace across the projection logic.
 */
export const VAULT_COLLATERAL_ASSET = {
  symbol: btcConfig.coinSymbol,
  decimals: 8, // sats
  icon: btcConfig.icon,
} as const;

// Cap display precision so we never round the integer part of high-decimals
// tokens through JS number space. Fractional digits beyond this are dropped
// (not rounded) to keep formatting deterministic.
const MAX_DISPLAY_FRACTION_DIGITS = 8;

/**
 * Activity types whose primary user-facing transaction is on Bitcoin (the peg-in tx).
 *  - `deposit`: links to the peg-in BTC tx.
 *  - `claim_expired`: the expired peg-in's depositor reclaimed their BTC. We
 *     render this as a refunded Deposit (red dot) and surface the original
 *     peg-in BTC tx hash so users can audit the deposit chain.
 *  Everything else is an EVM-only action (collateral ops, loans, withdraw).
 */
const BTC_PRIMARY_ACTIVITIES: ReadonlySet<GraphQLActivityType> = new Set([
  "deposit",
  "claim_expired",
]);

/**
 * GraphQL types that produce a `kind: "row"` ActivityLog via projectStandardRow.
 * `liquidation` is handled by buildLiquidationGroup and `claim_expired` by
 * projectRefundedDeposit, both of which dispatch ahead of this map.
 */
export type StandardGraphQLActivityType = Exclude<
  GraphQLActivityType,
  "liquidation" | "claim_expired"
>;

export const STANDARD_TYPE_LABEL: Record<
  StandardGraphQLActivityType,
  ActivityType
> = {
  deposit: "Deposit",
  withdrawal: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  redeem: "Redeem",
};

// Positive whitelist so any future indexer type that isn't enumerated above
// falls through to the "unknown" branch and surfaces a warning, instead of
// silently rendering as a malformed row.
const STANDARD_ACTIVITY_TYPES = new Set<string>(
  Object.keys(STANDARD_TYPE_LABEL),
);

export function isStandardActivity(
  item: GraphQLVaultActivityItem,
): item is GraphQLVaultActivityItem & { type: StandardGraphQLActivityType } {
  return STANDARD_ACTIVITY_TYPES.has(item.type);
}

/**
 * Empty/placeholder transaction hashes that the indexer can legitimately
 * emit before a tx is observed on-chain. Centralised so a future indexer
 * change to the placeholder shape touches one site, not every call site.
 */
const EMPTY_TX_HASH_SENTINELS: ReadonlySet<string> = new Set([
  "",
  "0x",
  `0x${"0".repeat(64)}`,
]);

function isValidTxHash(hash: string | null | undefined): hash is string {
  if (typeof hash !== "string") return false;
  return !EMPTY_TX_HASH_SENTINELS.has(hash);
}

/**
 * Decide which hash + chain to surface in the "Transaction Hash" column.
 * For peg-in deposits we surface the BTC pegin txid (matches how the rest of
 * the dApp identifies a deposit). For all other activity types the meaningful
 * tx is the EVM event that triggered the indexer record.
 *
 * Fail closed for BTC-primary rows: if the indexer ever returns a missing or
 * malformed peg-in hash, keep chain="BTC" and emit an empty hash so the row
 * renders as "Pending..." rather than redirecting users to the ETH explorer
 * for what is logically a BTC operation.
 */
export function resolveDisplayTx(
  item: GraphQLVaultActivityItem,
  peginTxHashByVaultId: ReadonlyMap<string, string>,
): {
  chain: ActivityChain;
  transactionHash: string;
} {
  if (BTC_PRIMARY_ACTIVITIES.has(item.type)) {
    const peginTxHash = item.vaultId
      ? peginTxHashByVaultId.get(item.vaultId)
      : undefined;
    return {
      chain: "BTC",
      transactionHash: isValidTxHash(peginTxHash) ? peginTxHash : "",
    };
  }
  return { chain: "ETH", transactionHash: item.transactionHash };
}

export function formatAmount(amount: string, decimals: number): string {
  // Format whole/fraction separately to avoid parseFloat precision loss on
  // large or high-decimals values.
  const [wholeRaw, fracRaw = ""] = formatUnits(BigInt(amount), decimals).split(
    ".",
  );
  const whole = BigInt(wholeRaw).toLocaleString("en-US");
  const frac = fracRaw.slice(0, MAX_DISPLAY_FRACTION_DIGITS).replace(/0+$/, "");
  return frac.length > 0 ? `${whole}.${frac}` : whole;
}

/**
 * Caller-injected dependencies. The hook layer reads these from the AaveConfig
 * context provider (which already loads them once at app startup), keeping
 * this service free of global registry / network dependencies for non-
 * activity data.
 */
export interface FetchUserActivitiesDeps {
  /** Map of debtReserveId -> { symbol, decimals, icon }, e.g. from `useAaveConfig().borrowableReserves`. */
  reserves: ReadonlyMap<
    string,
    { symbol: string; decimals: number; icon: string | undefined }
  >;
}

/**
 * `claim_expired` represents the depositor reclaiming an expired peg-in — i.e.
 * the deposit was refunded. The UI renders this as a Deposit row with a red
 * dot, not a separate "Claim Expired" row, so the user sees a single Deposit
 * entry marked as refunded.
 *
 * Indexer invariant: a vault either reaches `AVAILABLE` (which emits
 * `deposit`) or expires before activation and is reclaimed (which emits
 * `claim_expired`) — never both. So projecting a refunded Deposit here does
 * NOT duplicate an existing `deposit` row; the two activity types are
 * mutually exclusive per vault by the state machine in
 * `babylon-vault-indexer/src/core/pegin.ts` (`PeginActivated` →
 * `AVAILABLE` → `deposit`; `ExpiredVaultClaimed` → reclaim → `claim_expired`).
 */
export function projectRefundedDeposit(
  item: GraphQLVaultActivityItem,
  peginTxHashByVaultId: ReadonlyMap<string, string>,
): ActivityLog {
  const { chain, transactionHash } = resolveDisplayTx(
    item,
    peginTxHashByVaultId,
  );
  return {
    kind: "row",
    id: item.id,
    date: new Date(parseInt(item.timestamp, 10) * 1000),
    tokenIcon: VAULT_COLLATERAL_ASSET.icon,
    type: "Deposit",
    amount: {
      value: formatAmount(item.amount, VAULT_COLLATERAL_ASSET.decimals),
      symbol: VAULT_COLLATERAL_ASSET.symbol,
    },
    chain,
    transactionHash,
    isRefunded: true,
  };
}

export function projectStandardRow(
  item: GraphQLVaultActivityItem & { type: StandardGraphQLActivityType },
  peginTxHashByVaultId: ReadonlyMap<string, string>,
  deps: FetchUserActivitiesDeps,
): ActivityLog {
  const isPositionScoped = item.type === "borrow" || item.type === "repay";
  const reserve =
    isPositionScoped && item.debtReserveId != null
      ? deps.reserves.get(item.debtReserveId)
      : undefined;

  const amount: ActivityAmount = isPositionScoped
    ? {
        value: reserve
          ? formatAmount(item.amount, reserve.decimals)
          : item.amount,
        symbol: reserve?.symbol ?? "—",
      }
    : {
        value: formatAmount(item.amount, VAULT_COLLATERAL_ASSET.decimals),
        symbol: VAULT_COLLATERAL_ASSET.symbol,
      };

  const tokenIcon = isPositionScoped
    ? (reserve?.icon ?? "")
    : VAULT_COLLATERAL_ASSET.icon;
  const { chain, transactionHash } = resolveDisplayTx(
    item,
    peginTxHashByVaultId,
  );

  return {
    kind: "row",
    id: item.id,
    date: new Date(parseInt(item.timestamp, 10) * 1000),
    tokenIcon,
    type: STANDARD_TYPE_LABEL[item.type],
    amount,
    chain,
    transactionHash,
  };
}
