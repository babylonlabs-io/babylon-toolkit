// On-chain expiry check of the vaults the app holds as PENDING or VERIFIED.
//
// The indexer sets EXPIRED only when it sees `PeginExpired`, which only a
// `reportExpiredPegins` call emits. If nobody reports (a universal challenger
// outage, a full registry pause) or the indexer lags, a vault the chain can no
// longer advance keeps reading PENDING or VERIFIED, and its Bitcoin refund
// stays hidden after Bitcoin would accept it. So this reads the registry and
// says which of those vaults have expired, for `useVaultDeposits` to overlay.
//
// Past its deadline a vault cannot be acknowledged or activated, but the
// timeouts are live: governance can raise one and reopen a vault nobody
// reported. So an unreported expiry is kept distinct from a reported one, and
// a later read that says otherwise clears it.
//
// Fails OPEN: a read that never succeeded concludes nothing, leaving the
// indexer's status. A conclusion already reached survives a failed read, since
// a row flipping back mid-refund would unmount the refund it is running.

import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import {
  type ExpirationReason,
  isActivationDeadlinePassedOnChain,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { type Hex, zeroAddress } from "viem";

import { resolvePinnedReadBlock } from "@/clients/eth-contract/pinnedReadBlock";
import {
  getProtocolParamsReader,
  getVaultRegistryReader,
} from "@/clients/eth-contract/sdk-readers";
import { logger } from "@/infrastructure";
import { shortId } from "@/infrastructure/telemetryEvents";
import { isAckDeadlinePassedOnChain } from "@/utils/ackDeadline";

const CHAIN_EXPIRY_CHECK_QUERY_KEY = "chainExpiryCheck";
// Matches the other chain gates. Deadlines are measured in days of blocks, so a
// once-a-minute read is ample.
const POLL_INTERVAL_MS = 60 * 1000;
// Just under the poll interval so refocus/remount doesn't double-fetch.
const STALE_TIME_MS = 55 * 1000;

/**
 * A vault the chain treats as expired.
 *
 * - `reported: true`: the registry already records it Expired, whatever the
 *   indexer says. Its reason is undefined only while no read has settled it.
 * - `reported: false`: past its deadline, but nobody has called
 *   `reportExpiredPegins`, so the registry still reports it PENDING or VERIFIED.
 */
export type ChainExpiry =
  | { reported: true; reason: ExpirationReason | undefined }
  | { reported: false; reason: ExpirationReason };

const EMPTY_EXPIRIES: ReadonlyMap<string, ChainExpiry> = new Map();

/**
 * The reasons of vaults the registry records Expired, keyed by lowercased id.
 * The status does not say which timeout expired them, and neither does an
 * indexer that lags, but `verifiedAt` does: only a vault that reached Verified
 * has one, and that vault can expire only on the activation timeout
 * (vault-contracts-aave-v4@d240ec03: src/protocol/lib/PeginLogic.sol:778,973,989).
 * Empty if the read fails: the batch fails whole, and the reason decides only a
 * message and the artifact download, so it must not undo the expiry.
 */
async function readReportedReasons(
  ids: readonly Hex[],
  block: bigint,
): Promise<ReadonlyMap<string, ExpirationReason>> {
  const reasons = new Map<string, ExpirationReason>();
  if (ids.length === 0) return reasons;
  try {
    const infos = await getVaultRegistryReader().getProtocolInfoBatch(
      ids,
      block,
    );
    infos.forEach((info, index) => {
      reasons.set(
        ids[index].toLowerCase(),
        info.verifiedAt > 0n ? "activation_timeout" : "ack_timeout",
      );
    });
  } catch (error) {
    logger.warn("Vault expiry reason read failed", {
      category: "activation",
      cause: String(error),
    });
  }
  return reasons;
}

/**
 * Classifies one vault's on-chain record. The status decides which timeout
 * applies, as it does in the registry, so a vault the indexer still reports
 * PENDING but the chain has verified gets the activation timeout. Returns
 * `undefined` for a vault that has not expired.
 */
export function classifyChainExpiry(params: {
  status: number;
  createdAt: bigint;
  block: bigint;
  pegInAckTimeout: bigint;
  pegInActivationTimeout: bigint;
}): ChainExpiry | undefined {
  const { status, createdAt, block, pegInAckTimeout, pegInActivationTimeout } =
    params;
  // Compare against `OnChainBtcVaultStatus`, never the app-side
  // `ContractStatus`, which reassigns the contract's Expired value.
  if (status === OnChainBtcVaultStatus.EXPIRED) {
    return { reported: true, reason: undefined };
  }
  if (
    status === OnChainBtcVaultStatus.PENDING &&
    isAckDeadlinePassedOnChain({
      currentBlock: block,
      createdAtBlock: createdAt,
      pegInAckTimeout,
    })
  ) {
    return { reported: false, reason: "ack_timeout" };
  }
  if (
    status === OnChainBtcVaultStatus.VERIFIED &&
    isActivationDeadlinePassedOnChain({
      currentBlock: block,
      createdAtBlock: createdAt,
      pegInActivationTimeout,
    })
  ) {
    return { reported: false, reason: "activation_timeout" };
  }
  return undefined;
}

/**
 * The expired vaults among `candidateIds`, keyed by lowercased vault id. An
 * absent id means the chain agrees the vault has not expired, or no read has
 * settled it.
 */
export function useChainExpiryCheck(
  candidateIds: readonly Hex[],
): ReadonlyMap<string, ChainExpiry> {
  // Joined so an unchanged id set keeps a stable query key across renders.
  const idsKey = useMemo(
    () => [...candidateIds].sort().join(","),
    [candidateIds],
  );

  // What a failed read falls back to. Fed from the query's data rather than
  // `getQueryData`, which misses as soon as the id set changes the key.
  const lastKnownRef = useRef(EMPTY_EXPIRIES);

  const query = useQuery({
    queryKey: [CHAIN_EXPIRY_CHECK_QUERY_KEY, idsKey] as const,
    enabled: idsKey.length > 0,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    // A changed id set (a new deposit, a vault leaving PENDING) must not flip
    // the other vaults back to their indexer status while the new read loads.
    placeholderData: keepPreviousData,
    // NEVER REJECTS. This query is mounted app-wide, and a rejection reaches
    // the global QueryCache.onError -> logger.error -> captureException on
    // every poll of an outage.
    queryFn: async (): Promise<ReadonlyMap<string, ChainExpiry>> => {
      const ids = idsKey.split(",") as Hex[];
      const expiries = new Map<string, ChainExpiry>();
      const keepLastKnown = (id: Hex) => {
        const key = id.toLowerCase();
        const lastKnown = lastKnownRef.current.get(key);
        if (lastKnown) expiries.set(key, lastKnown);
      };

      try {
        const paramsReader = await getProtocolParamsReader();
        const reader = getVaultRegistryReader();
        // Status, timeouts and head all describe one block, so the conclusion
        // is about a state the chain actually held. Read apart, a head from one
        // node could pair with a lagging node's VERIFIED for a vault that
        // activated in time, or a timeout lowered just after an activation with
        // the VERIFIED from just before it.
        const block = await resolvePinnedReadBlock();
        const [config, records] = await Promise.all([
          // Live, not the cached config: the registry reads these timeouts on
          // every call, and they are governance-mutable.
          paramsReader.getPegInConfiguration(block),
          // Per-vault reads coalesce into one Multicall3 round-trip (client batch).
          Promise.all(
            ids.map(async (id) => {
              try {
                return { id, basic: await reader.getVaultBasicInfo(id, block) };
              } catch (error) {
                logger.warn("Vault expiry registry read failed", {
                  category: "activation",
                  vaultId: shortId(id),
                  cause: String(error),
                });
                return { id, basic: null };
              }
            }),
          ),
        ]);

        const reportedIds: Hex[] = [];
        for (const { id, basic } of records) {
          // An empty record is a node that has not answered, not a vault that
          // has not expired: read as status 0 it would look long past its
          // ack deadline.
          if (
            !basic ||
            basic.depositor === zeroAddress ||
            basic.createdAt === 0n
          ) {
            keepLastKnown(id);
            continue;
          }
          const expiry = classifyChainExpiry({
            status: basic.status,
            createdAt: basic.createdAt,
            block,
            pegInAckTimeout: config.pegInAckTimeout,
            pegInActivationTimeout: config.pegInActivationTimeout,
          });
          if (expiry) expiries.set(id.toLowerCase(), expiry);
          if (expiry?.reported) reportedIds.push(id);
        }

        const reasons = await readReportedReasons(reportedIds, block);
        for (const id of reportedIds) {
          const key = id.toLowerCase();
          expiries.set(key, {
            reported: true,
            reason: reasons.get(key) ?? lastKnownRef.current.get(key)?.reason,
          });
        }
      } catch (error) {
        logger.warn("Vault expiry head or params read failed", {
          category: "activation",
          cause: String(error),
        });
        ids.forEach(keepLastKnown);
      }
      return expiries;
    },
  });

  const { data } = query;
  if (data) lastKnownRef.current = data;

  // Intersect with the current ids: `keepPreviousData` can still hold a vault
  // that has since left the candidate set.
  return useMemo(() => {
    if (!data || data.size === 0) return EMPTY_EXPIRIES;
    const current = new Set(idsKey.toLowerCase().split(","));
    const expiries = new Map<string, ChainExpiry>();
    for (const [id, expiry] of data) {
      if (current.has(id)) expiries.set(id, expiry);
    }
    return expiries.size === 0 ? EMPTY_EXPIRIES : expiries;
  }, [data, idsKey]);
}
