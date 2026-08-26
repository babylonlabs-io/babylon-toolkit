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
import { isAddress } from "viem";

import { logger } from "@/infrastructure";
import { getPegoutTxLinkFlags } from "@/models/pegoutStateMachine";
import { createVpClient } from "@/utils/rpc";

/**
 * Per-VP RPC timeout for this best-effort, display-only enrichment. Tighter
 * than the SDK's 60s default and with no retries: a slow or dead VP must not
 * stall the whole Activity tab on initial render — its redeem rows just stay
 * "Pending…" and fill in on a later refetch.
 */
export const CLAIM_TX_RPC_TIMEOUT_MS = 10_000;

/** A Bitcoin txid is 32 bytes — exactly 64 hex chars, no `0x` prefix. */
const BTC_TXID_REGEX = /^[0-9a-f]{64}$/i;

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
    if (!isAddress(info.vaultProvider, { strict: false })) {
      logger.warn(
        "[claimTxResolver] redeem vault has an invalid provider address; skipping",
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
      try {
        // Inside the try: createVpClient (via getVpProxyUrl) can throw on a
        // misconfigured proxy URL, and that must fail closed for this one VP
        // rather than rejecting Promise.all and erroring the whole tab.
        const rpcClient = createVpClient(providerAddress, {
          timeout: CLAIM_TX_RPC_TIMEOUT_MS,
          retries: 0,
        });
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
            // Don't trust the VP's txid shape — a malformed value would link to
            // mempool.space/tx/<garbage> and 404.
            const claimTxid = claimer.claim_txid;
            if (
              typeof claimTxid === "string" &&
              BTC_TXID_REGEX.test(claimTxid)
            ) {
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
          `[claimTxResolver] VP ${providerAddress} claim-txid lookup failed; leaving its rows pending`,
          { data: { error: String(error) } },
        );
      }
    }),
  );

  return out;
}
