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
// A vault the registry records Redeemed is reported too. The redeem of an expired
// vault can land while the indexer lags, and without this the row would fall back
// to the indexer's PENDING or VERIFIED and offer an activation that cannot happen.
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
 * A vault the chain has taken past what the indexer reports.
 *
 * - `unreported`: past its deadline, but nobody has called
 *   `reportExpiredPegins`, so the registry still reports it PENDING or VERIFIED.
 * - `reported`: the registry records it Expired.
 * - `redeemed`: the registry records it Redeemed, which is final.
 *
 * The reason of the last two comes from a second read, so it is undefined while
 * no read has settled it. It stays undefined for a vault redeemed without having
 * expired.
 */
export type ChainExpiry =
  | { state: "unreported"; reason: ExpirationReason }
  | { state: "reported" | "redeemed"; reason: ExpirationReason | undefined };

type RecordedState = Exclude<ChainExpiry["state"], "unreported">;

const EMPTY_EXPIRIES: ReadonlyMap<string, ChainExpiry> = new Map();

/**
 * The status does not say why a vault expired, and neither does an indexer that
 * lags, but the protocol record does (vault-contracts-aave-v4@d240ec03:
 * src/protocol/lib/PeginLogic.sol).
 *
 * - Expired: only a vault that reached Verified has a `verifiedAt` (:778), and
 *   that vault can expire only on the activation timeout (:973,989).
 * - Redeemed: only an expiry report writes `claimExpiredUntil` (:1003), and only
 *   a vault that reached Verified can be redeemed after one (:1055). A vault
 *   without one was redeemed without expiring, so it has no reason.
 */
function reasonFromRecord(
  state: RecordedState,
  record: { verifiedAt: bigint; claimExpiredUntil: bigint },
): ExpirationReason | undefined {
  if (state === "reported") {
    return record.verifiedAt > 0n ? "activation_timeout" : "ack_timeout";
  }
  return record.claimExpiredUntil > 0n ? "activation_timeout" : undefined;
}

/**
 * The reasons of vaults the registry records Expired or Redeemed, keyed by
 * lowercased id. Empty if the read fails: the batch fails whole, and the reason
 * decides only a message and the artifact download, so it must not undo the
 * conclusion.
 */
async function readRecordedReasons(
  vaults: readonly { id: Hex; state: RecordedState }[],
  block: bigint,
): Promise<ReadonlyMap<string, ExpirationReason | undefined>> {
  const reasons = new Map<string, ExpirationReason | undefined>();
  if (vaults.length === 0) return reasons;
  try {
    const infos = await getVaultRegistryReader().getProtocolInfoBatch(
      vaults.map((vault) => vault.id),
      block,
    );
    infos.forEach((info, index) => {
      const { id, state } = vaults[index];
      reasons.set(id.toLowerCase(), reasonFromRecord(state, info));
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
 * `undefined` for a vault still in its window, or one the chain reports Active.
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
    return { state: "reported", reason: undefined };
  }
  if (status === OnChainBtcVaultStatus.REDEEMED) {
    return { state: "redeemed", reason: undefined };
  }
  if (
    status === OnChainBtcVaultStatus.PENDING &&
    isAckDeadlinePassedOnChain({
      currentBlock: block,
      createdAtBlock: createdAt,
      pegInAckTimeout,
    })
  ) {
    return { state: "unreported", reason: "ack_timeout" };
  }
  if (
    status === OnChainBtcVaultStatus.VERIFIED &&
    isActivationDeadlinePassedOnChain({
      currentBlock: block,
      createdAtBlock: createdAt,
      pegInActivationTimeout,
    })
  ) {
    return { state: "unreported", reason: "activation_timeout" };
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

        const recorded: { id: Hex; state: RecordedState }[] = [];
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
          if (expiry && expiry.state !== "unreported") {
            recorded.push({ id, state: expiry.state });
          }
        }

        const reasons = await readRecordedReasons(recorded, block);
        for (const { id, state } of recorded) {
          const key = id.toLowerCase();
          expiries.set(key, {
            state,
            reason: reasons.has(key)
              ? reasons.get(key)
              : lastKnownRef.current.get(key)?.reason,
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
