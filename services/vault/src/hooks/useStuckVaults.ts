// Finds the depositor's stuck vaults from the registry and Bitcoin alone: vaults
// the chain still reports Verified, inside their activation window, whose HTLC
// their PegIn has spent. A stuck vault's only exit is activate-and-redeem, and it
// has a deadline, so no indexer answer may stand between the depositor and that
// offer: a row left out, or a wrong status, key, vout, PegIn hash or Pre-PegIn
// would otherwise hide it until the contract rejects it for good. Nothing here
// reads the indexer; `useVaultDeposits` builds the row from what this returns.
//
// The stuck state needs a POSITIVE on-chain confirmation. Bitcoin evidence alone
// is equally consistent with a healthy deposit, because the VP's sweep is what
// activation looks like on the BTC side. So the registry must still report
// Verified, read at the latest block once everything else is known: the other
// reads are pinned behind the head so they agree with each other, and a pinned
// read can see Verified for a vault whose activation has already landed.
//
// The Bitcoin side is also only the mempool API's word. An API that names the
// vault's public PegIn txid as the HTLC's spender would turn a healthy vault
// stuck: normal activation disappears and the only action offered is the
// irreversible activate-and-redeem. So the spend is proven from the PegIn itself,
// fetched by the txid of the on-chain signed PegIn: its witness must be one
// Bitcoin accepts, with the preimage of the on-chain hashlock and every
// participant's signature (`provePeginSpendsHtlc`). The signatures are public,
// so no API can produce one before the secret is public. Once it is (a reverted
// activation's calldata), anyone can build that PegIn, and broadcast it while the
// HTLC is unspent: the proof shows a valid spend of the HTLC, not that one was
// broadcast.
//
// Fails OPEN: an absent id means "not known stuck", so an RPC failure, a vault
// the chain reports Active, or a PegIn that cannot be proven all leave the
// deposit rendering normally. Failing the other way would raise a false alarm
// and a signing prompt on a healthy deposit. Failing open grants the mempool API
// nothing either: answering "unspent" hides the stuck state anyway.

import {
  OnChainBtcVaultStatus,
  type VaultBasicInfo,
  type VaultProtocolInfo,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { isActivationDeadlinePassedOnChain } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import { type QueryClient, useQuery } from "@tanstack/react-query";
import { type Address, type Hex, zeroAddress } from "viem";

import { getMempoolApiUrl } from "@/clients/btc/config";
import {
  fetchHtlcSpend,
  isHtlcSpentByPegin,
  provePeginSpendsHtlc,
} from "@/clients/btc/outspend";
import { getDepositorVaultIdsFromChain } from "@/clients/eth-contract/btc-vault-registry/depositorVaultIds";
import { resolvePinnedReadBlock } from "@/clients/eth-contract/pinnedReadBlock";
import {
  getProtocolParamsReader,
  getVaultRegistryReader,
} from "@/clients/eth-contract/sdk-readers";
import { logger } from "@/infrastructure";
import { shortId, TELEMETRY_EVENT } from "@/infrastructure/telemetryEvents";
import { mapWithConcurrency } from "@/utils/concurrency";

export const STUCK_VAULTS_QUERY_KEY = "stuckVaults";
// The stuck state is rare and its deadline is days of blocks away, so it does
// not need a fast cadence. Matches the other chain gates.
const POLL_INTERVAL_MS = 60 * 1000;
// Reads of one walk step coalesce into one Multicall3 round-trip (client batch).
const VAULT_WALK_CHUNK_SIZE = 25;
// Cap concurrency: the public mempool.space endpoint rate-limits (429s).
const MAX_CONCURRENT_SPEND_READS = 4;
// Each proof fetches the PegIn and the Pre-PegIn at once, so two proofs keep four
// requests in flight, the same budget as the spend reads.
const MAX_CONCURRENT_PROOFS = 2;

/** A vault the chain and Bitcoin prove stuck; every field comes from them. */
export interface StuckVault {
  /** Lowercased, as the chain returns it. */
  id: Hex;
  basic: VaultBasicInfo;
  protocol: VaultProtocolInfo;
  /** Txid of the on-chain signed PegIn. */
  peginTxHash: Hex;
  /** The registered Pre-PegIn, authenticated by the PegIn proof. */
  prePeginTxHex: Hex;
}

type StuckVaults = ReadonlyMap<string, StuckVault>;

/** Shared so an unchanged empty answer keeps its identity across polls. */
const EMPTY_STUCK_VAULTS: StuckVaults = new Map();

interface VerifiedVault {
  id: Hex;
  basic: VaultBasicInfo;
}

interface StuckCandidate extends VerifiedVault {
  protocol: VaultProtocolInfo;
  peginTxHash: Hex;
}

function stuckVaultsQueryKey(depositor: Address | undefined) {
  return [STUCK_VAULTS_QUERY_KEY, depositor?.toLowerCase()] as const;
}

/**
 * Vaults whose refusal was already reported: the poll repeats it every minute,
 * and one event per vault is the signal. One set per query client, so per app.
 */
const reportedRefusals = new WeakMap<QueryClient, Set<string>>();

/**
 * Failing open must not fail silently: a refusal hides the escape hatch, and a
 * wrong one would hide the only exit of a stuck vault, so it is sent as an event,
 * once per vault. Nothing reported is secret: the PegIn is public data.
 */
function reportRefusal(
  client: QueryClient,
  id: Hex,
  detail: Record<string, string>,
): void {
  const reported = reportedRefusals.get(client) ?? new Set<string>();
  reportedRefusals.set(client, reported);
  const key = id.toLowerCase();
  if (reported.has(key)) return;
  reported.add(key);
  logger.event(TELEMETRY_EVENT.ACTIVATION_STUCK_PROOF_REFUSED, {
    level: "warning",
    category: "activation",
    tags: { vaultId: shortId(id) },
    ...detail,
  });
}

function warnBitcoinReadFailed(id: Hex, cause: unknown): void {
  // A failed fetch is routine (a rate limit): a breadcrumb, not an event.
  logger.warn("Stuck-state Bitcoin read unavailable", {
    category: "activation",
    vaultId: shortId(id),
    cause: String(cause),
  });
}

/**
 * The Verified vaults still inside their activation window, newest first.
 *
 * Walks from the newest id and stops at the first vault past its deadline. The
 * registry only ever appends to this list and stamps `createdAt` with the block
 * of the append, so every older vault is past its deadline too. The deadline
 * moves with the live timeout, so a raised timeout widens the walk by itself. An
 * empty or unreadable record says nothing about its deadline, so it does not stop
 * the walk: a node that has not caught up must not cut off the older vaults.
 */
async function readOpenVerifiedVaults(
  ids: readonly Hex[],
  block: bigint,
  pegInActivationTimeout: bigint,
): Promise<VerifiedVault[]> {
  const reader = getVaultRegistryReader();
  const verified: VerifiedVault[] = [];
  for (let end = ids.length; end > 0; end -= VAULT_WALK_CHUNK_SIZE) {
    const chunk = ids.slice(Math.max(0, end - VAULT_WALK_CHUNK_SIZE), end);
    const records = await Promise.all(
      chunk.map(async (id) => {
        try {
          return { id, basic: await reader.getVaultBasicInfo(id, block) };
        } catch (error) {
          logger.warn("Stuck-state registry read failed", {
            category: "activation",
            vaultId: shortId(id),
            cause: String(error),
          });
          return null;
        }
      }),
    );

    let reachedClosedWindow = false;
    for (const record of records) {
      if (
        !record ||
        record.basic.depositor === zeroAddress ||
        record.basic.createdAt === 0n
      ) {
        continue;
      }
      const deadlinePassed = isActivationDeadlinePassedOnChain({
        currentBlock: block,
        createdAtBlock: record.basic.createdAt,
        pegInActivationTimeout,
      });
      if (deadlinePassed) {
        reachedClosedWindow = true;
      } else if (record.basic.status === OnChainBtcVaultStatus.VERIFIED) {
        verified.push(record);
      }
    }
    if (reachedClosedWindow) break;
  }
  return verified;
}

/**
 * One read of the depositor's stuck vaults. Never rejects: this query is mounted
 * app-wide, and a rejection reaches the global `QueryCache.onError` ->
 * `logger.error` -> `captureException` on every poll of an outage.
 *
 * One carry-forward: a vault an earlier poll proved keeps its result through a
 * poll where a Bitcoin read fails, while every chain read of this poll still
 * reports it Verified. A valid witness cannot stop being valid, and the row would
 * otherwise flip between Withdraw and Activate on every rate limit. A failed
 * chain read drops it instead: nothing then says the vault is still unactivated.
 */
async function readStuckVaults(
  depositor: Address,
  client: QueryClient,
): Promise<StuckVaults> {
  const prior = client.getQueryData<StuckVaults>(
    stuckVaultsQueryKey(depositor),
  );
  try {
    // At the latest block and ahead of the pinned reads: a wallet with no vaults
    // costs this one call a minute, for every connected session.
    const ids = await getDepositorVaultIdsFromChain(depositor);
    if (ids.length === 0) return EMPTY_STUCK_VAULTS;

    const reader = getVaultRegistryReader();
    const paramsReader = await getProtocolParamsReader();
    const block = await resolvePinnedReadBlock();
    const { pegInActivationTimeout } =
      await paramsReader.getPegInConfiguration(block);
    const verified = await readOpenVerifiedVaults(
      ids,
      block,
      pegInActivationTimeout,
    );
    if (verified.length === 0) return EMPTY_STUCK_VAULTS;

    const protocols = await reader.getProtocolInfoBatch(
      verified.map((vault) => vault.id),
      block,
    );
    const apiUrl = getMempoolApiUrl();

    // A malformed record costs its own vault, never the others'.
    const candidates = verified.flatMap((vault, index): StuckCandidate[] => {
      const protocol = protocols[index];
      try {
        const peginTxHash = calculateBtcTxHash(protocol.depositorSignedPeginTx);
        return [{ ...vault, protocol, peginTxHash }];
      } catch (error) {
        reportRefusal(client, vault.id, { error: String(error) });
        return [];
      }
    });

    const carried = new Map<string, StuckVault>();
    const carryForward = (candidate: StuckCandidate, cause: unknown): void => {
      warnBitcoinReadFailed(candidate.id, cause);
      const key = candidate.id.toLowerCase();
      const earlier = prior?.get(key);
      if (!earlier) return;
      carried.set(key, {
        ...candidate,
        prePeginTxHex: earlier.prePeginTxHex,
      });
    };

    const spends = await mapWithConcurrency(
      candidates,
      MAX_CONCURRENT_SPEND_READS,
      async (candidate): Promise<StuckCandidate | null> => {
        try {
          const spend = await fetchHtlcSpend(
            candidate.protocol.prePeginTxHash,
            candidate.protocol.htlcVout,
            apiUrl,
          );
          return isHtlcSpentByPegin(spend, candidate.peginTxHash)
            ? candidate
            : null;
        } catch (error) {
          carryForward(candidate, error);
          return null;
        }
      },
    );

    const proven = await mapWithConcurrency(
      spends.filter((c): c is StuckCandidate => c !== null),
      MAX_CONCURRENT_PROOFS,
      async (candidate): Promise<StuckVault | null> => {
        try {
          const proof = await provePeginSpendsHtlc(candidate.protocol, apiUrl);
          if (proof.status === "proven") {
            return { ...candidate, prePeginTxHex: proof.prePeginTxHex };
          }
          if (proof.status === "unproven") {
            reportRefusal(client, candidate.id, { reason: proof.reason });
            return null;
          }
          carryForward(candidate, proof.cause);
          return null;
        } catch (error) {
          // A malformed on-chain record proves nothing.
          reportRefusal(client, candidate.id, { error: String(error) });
          return null;
        }
      },
    );

    const results = [
      ...proven.filter((vault): vault is StuckVault => vault !== null),
      ...carried.values(),
    ];
    const stillVerified = await Promise.all(
      results.map(async (vault) => {
        try {
          const latest = await reader.getVaultBasicInfo(vault.id);
          return latest.status === OnChainBtcVaultStatus.VERIFIED;
        } catch (error) {
          logger.warn("Stuck-state latest status read failed", {
            category: "activation",
            vaultId: shortId(vault.id),
            cause: String(error),
          });
          return false;
        }
      }),
    );

    const stuck = results.filter((_, index) => stillVerified[index]);
    return stuck.length === 0
      ? EMPTY_STUCK_VAULTS
      : new Map(
          stuck.map((vault) => [
            vault.id.toLowerCase(),
            { ...vault, id: vault.id.toLowerCase() as Hex },
          ]),
        );
  } catch (error) {
    logger.warn("Stuck-vault chain read failed", {
      category: "activation",
      cause: String(error),
    });
    return EMPTY_STUCK_VAULTS;
  }
}

/**
 * What the poll and its passive readers share. Every observer of one query must
 * pass the same function: the last to render sets the one an invalidation runs.
 */
function stuckVaultsQueryOptions(depositor: Address | undefined) {
  return {
    queryKey: stuckVaultsQueryKey(depositor),
    queryFn: ({ client }: { client: QueryClient }): Promise<StuckVaults> =>
      readStuckVaults(depositor as Address, client),
    // Keep no read of an address nothing is watching. Back on that address it
    // would be served as current, and it may predate an activation.
    gcTime: 0,
  };
}

/**
 * Runs the discovery poll. Mounted once, app-wide: React Query runs one interval
 * timer per observer, and `useVaultDeposits` has several mounts, so each would
 * otherwise repeat these chain and Bitcoin reads every minute.
 */
export function useStuckVaultsPoll(depositor: Address | undefined): void {
  useQuery({
    ...stuckVaultsQueryOptions(depositor),
    enabled: !!depositor,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/**
 * The depositor's stuck vaults keyed by lowercased id, as `useStuckVaultsPoll`
 * last read them. Reads the shared query without starting any fetch of its own.
 */
export function useStuckVaults(depositor: Address | undefined): StuckVaults {
  const { data } = useQuery({
    ...stuckVaultsQueryOptions(depositor),
    enabled: false,
  });
  return data ?? EMPTY_STUCK_VAULTS;
}
