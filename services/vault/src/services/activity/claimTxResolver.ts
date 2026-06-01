/**
 * Resolves the BTC `claim_txid` for each `redeem` activity row.
 *
 * The Activity tab needs a BTC explorer link for redeem rows, but the
 * indexer only sees the EVM `VaultMarkedRedeemed` event — the BTC claim
 * is broadcast off-chain by the vault provider's claimer. This module
 * groups redeem vaults by `vaultProvider`, calls the SDK's
 * `vaultProvider_batchGetPegoutStatus` RPC per provider, and returns a
 * `vaultId -> claim_txid` map.
 *
 * Failure handling: any VP-level error, missing claimer, or unknown
 * pegin_txid is dropped from the result. The activity row will then
 * render the existing "Pending…" affordance — strictly better than
 * surfacing the unrelated EVM hash, which is the bug this module fixes.
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  batchPollByProvider,
  type GetPegoutStatusResponse,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";

import { logger } from "@/infrastructure";
import { getPegoutTxLinkFlags } from "@/models/pegoutStateMachine";
import { createVpClient } from "@/utils/rpc";

export interface RedeemVaultLookup {
  peginTxHash: string;
  vaultProvider: string;
}

export interface RedeemActivityRef {
  vaultId: string;
}

interface PerVaultEntry {
  vaultId: string;
  peginTxHash: string;
}

export async function resolveRedeemClaimTxids(
  redeemActivities: readonly RedeemActivityRef[],
  vaultLookup: ReadonlyMap<string, RedeemVaultLookup>,
): Promise<Map<string, string>> {
  if (redeemActivities.length === 0) return new Map();

  const byProvider = new Map<string, PerVaultEntry[]>();
  for (const { vaultId } of redeemActivities) {
    const info = vaultLookup.get(vaultId);
    if (!info) {
      logger.warn(
        "[claimTxResolver] redeem activity without vault metadata; skipping",
        { data: { vaultId } },
      );
      continue;
    }
    if (!info.vaultProvider || !info.vaultProvider.startsWith("0x")) {
      logger.warn(
        "[claimTxResolver] redeem vault missing valid provider address; skipping",
        { data: { vaultId, vaultProvider: info.vaultProvider } },
      );
      continue;
    }
    const bucket = byProvider.get(info.vaultProvider);
    const entry: PerVaultEntry = { vaultId, peginTxHash: info.peginTxHash };
    if (bucket) bucket.push(entry);
    else byProvider.set(info.vaultProvider, [entry]);
  }

  const out = new Map<string, string>();

  await Promise.all(
    Array.from(byProvider, async ([providerAddress, entries]) => {
      const rpcClient = createVpClient(providerAddress);
      try {
        await batchPollByProvider<PerVaultEntry, GetPegoutStatusResponse>({
          items: entries,
          getTxid: (e) => stripHexPrefix(e.peginTxHash),
          batchCall: (pegin_txids) =>
            rpcClient.batchGetPegoutStatus({ pegin_txids }),
          onItem: (entry, envelope) => {
            if (envelope.error !== null) return;
            const claimer = envelope.result?.claimer;
            if (!claimer) return;
            // The claim txid is pre-computed at peg-in, so it exists before the
            // claim tx is on-chain. Only surface it once the claimer status
            // says it's been broadcast — otherwise the row would link to a tx
            // that isn't in any mempool yet, the exact broken link this fixes.
            if (!getPegoutTxLinkFlags(claimer.status).linkClaim) return;
            const claimTxid = claimer.claim_txid;
            if (typeof claimTxid === "string" && claimTxid.length > 0) {
              out.set(entry.vaultId, claimTxid);
            }
          },
          onMissing: () => {},
          onDuplicate: () => {},
          onDuplicateBatch: () => {},
          onWholeBatchError: (_chunk, error) => {
            logger.warn(
              `[claimTxResolver] batch failed for VP ${providerAddress}`,
              { data: { error: String(error) } },
            );
          },
          onUnexpected: () => {},
        });
      } catch (error) {
        logger.warn(
          `[claimTxResolver] VP ${providerAddress} threw outside the batch envelope`,
          { data: { error: String(error) } },
        );
      }
    }),
  );

  return out;
}
