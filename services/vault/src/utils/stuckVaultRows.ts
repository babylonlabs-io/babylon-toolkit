/**
 * Rows for the vaults `useStuckVaults` found, built from the chain and Bitcoin.
 *
 * A stuck vault's row replaces whatever the indexer said about it, or stands in
 * for a row the indexer left out: a wrong field on an indexed row would otherwise
 * filter the vault back out of the state it has just been proven to be in.
 */

import { formatSatoshisToBtc } from "@babylonlabs-io/ts-sdk/tbv/core";

import { getNetworkConfigBTC } from "../config";
import type { StuckVault } from "../hooks/useStuckVaults";
import { ContractStatus, getPeginState } from "../models/peginStateMachine";
import type { VaultActivity } from "../types";

const btcConfig = getNetworkConfigBTC();

/**
 * The row of one stuck vault. Only the timestamp comes from an indexed row, for
 * sorting: the registry's `createdAt` is a block number, not a time.
 */
export function buildStuckActivity(
  vault: StuckVault,
  indexedRow: VaultActivity | undefined,
): VaultActivity {
  const { id, basic, protocol, peginTxHash, prePeginTxHex } = vault;
  return {
    id,
    peginTxHash,
    prePeginTxHash: protocol.prePeginTxHash,
    collateral: {
      amount: formatSatoshisToBtc(basic.amount),
      symbol: btcConfig.coinSymbol,
      icon: btcConfig.icon,
    },
    contractStatus: ContractStatus.VERIFIED,
    stuckOnChain: true,
    isInUse: false,
    displayLabel: getPeginState(ContractStatus.VERIFIED, { isInUse: false })
      .displayLabel,
    providers: [{ id: basic.vaultProvider }],
    applicationEntryPoint: basic.applicationEntryPoint,
    timestamp: indexedRow?.timestamp,
    depositorBtcPubkey: basic.depositorBtcPubKey,
    depositorSignedPeginTx: protocol.depositorSignedPeginTx,
    unsignedPrePeginTx: prePeginTxHex,
    htlcVout: protocol.htlcVout,
    constructionIndex: protocol.htlcVout,
    depositorWotsPkHash: protocol.depositorWotsPkHash,
    offchainParamsVersion: protocol.offchainParamsVersion,
  };
}

/**
 * The indexed rows with every stuck vault's row in place of its indexed one, or
 * added if there was none. Ids compare lowercased: the indexer's are
 * unnormalized, and a mixed-case row left beside the chain's would be a duplicate.
 *
 * A vault in `chainExpiries` is left alone. The expiry check read the deadline
 * passed, and the vault's exit is no longer this one.
 */
export function applyStuckVaults(
  indexedRows: VaultActivity[],
  stuckVaults: ReadonlyMap<string, StuckVault>,
  chainExpiries: ReadonlyMap<string, unknown>,
): VaultActivity[] {
  const stuck = [...stuckVaults].filter(([id]) => !chainExpiries.has(id));
  if (stuck.length === 0) return indexedRows;

  const stuckIds = new Set(stuck.map(([id]) => id));
  const indexedById = new Map(
    indexedRows.map((row) => [row.id.toLowerCase(), row]),
  );
  return [
    ...indexedRows.filter((row) => !stuckIds.has(row.id.toLowerCase())),
    ...stuck.map(([id, vault]) =>
      buildStuckActivity(vault, indexedById.get(id)),
    ),
  ];
}
