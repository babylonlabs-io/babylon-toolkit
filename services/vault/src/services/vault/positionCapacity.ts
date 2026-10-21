/**
 * Position-capacity gate before a deposit's Ethereum registration and before
 * its Pre-PegIn broadcast (fresh and resumed).
 *
 * Activation runs the adapter's size check once per vault
 * (vault-contracts-aave-v4@99a4e3e7:src/applications/aave/AaveAdapter.sol:148-150)
 * and, on failure, the registry redeems the vault instead of activating it
 * (vault-contracts-aave-v4@99a4e3e7:src/protocol/BTCVaultRegistry.sol:754-764)
 * — after the BTC is locked, with the peg-in fee and the gas spent. The deposit
 * form's cap check reads a cached limit and an indexer count, so a position
 * that filled up, or whose limits governance lowered, since the form loaded
 * would hit exactly that. This asks the vault's own application, fresh, at
 * three points: before a new deposit's chain switch and every signing prompt
 * (only the BTC wallet's liveness probe, which can ask a locked wallet to
 * unlock, runs earlier), before each of its registration attempts, and before
 * any new or resumed Pre-PegIn broadcast.
 *
 * One `allowedToDeposit(depositor, n, amount)` read stands in for every
 * per-vault activation check. The adapter counts only collateralized vaults
 * (vault-contracts-aave-v4@99a4e3e7:src/applications/aave/AaveAdapter.sol:667-685)
 * and says so: vaults pegged in but not yet activated are not counted
 * (`:628-629`). So `n` and `amount` are this deposit's vaults plus the
 * depositor's other registered, unactivated vaults in the same application,
 * read from the registry's own list of the depositor's vaults
 * (`getDepositorVaultIds`) and each vault's on-chain status — never from the
 * indexer, which can omit a vault. This deposit's own vaults are counted once,
 * as the batch. The receiver is the on-chain depositor because this app
 * activates with empty metadata, which the adapter resolves to
 * `vault.depositor` (`AaveAdapter.sol:136`; `vaultActivationService.ts`).
 *
 * Every chain read of one check — the depositor's vault list, their statuses,
 * the later vaults' Pre-PegIn hashes and `allowedToDeposit` — is pinned to one
 * block (`resolvePinnedReadBlock`: the head less a small lag, so a node behind
 * a load-balanced RPC can still serve it). They describe one chain state, so a
 * vault that activates around the check is counted either in flight or by the
 * adapter, never by neither; reads that each took their own `latest` could
 * miss it when the RPC answers from nodes at different heights. The newest
 * registrations, at most that lag old, are not yet visible, which widens the
 * concurrent-registration window by the lag. A node that has not seen the
 * pinned block fails the read, which refuses as unavailable.
 *
 * In-flight means Pending or Verified on chain. A Pending vault past its
 * acknowledgment window
 * (vault-contracts-aave-v4@99a4e3e7:src/protocol/lib/PeginLogic.sol:637-640)
 * and a Verified vault past its activation window (`BTCVaultRegistry.sol:698`)
 * can never activate, but each keeps its status until someone reports it
 * expired (`BTCVaultRegistry.sol:1265`), which the universal challengers do on
 * their own for both
 * (btc-vault@bfd7a9eb:crates/vaultd/src/workers/expiry_reporter.rs:1-7).
 * Until then it is over-counted, as the form's indexer count over-counts it,
 * so an abandoned deposit holds its room against a new one until it expires.
 *
 * At broadcast, another Pending vault the registry lists after this deposit's
 * own (the list grows in registration order, `BTCVaultRegistry.sol:1028`) is
 * left out when Bitcoin does not know its Pre-PegIn: that later deposit has
 * locked nothing, and its own broadcast check counts this one, if its client
 * runs this check. Of two
 * unbroadcast deposits that both registered but fit only one at a time — the
 * later one's registration check ran before the earlier was mined, or the
 * limit dropped after both — the earlier is broadcast and the later refused.
 * Counting each other, both would be refused until the earlier expired, and
 * the later's acknowledgment window, which opened only its registration gap
 * later, would by then be too short to broadcast, so both peg-in fees would be
 * lost. A vault stays Pending after its Pre-PegIn is broadcast, until every
 * acknowledgment is in (`PeginLogic.sol`, `PeginRequestVerified`), so a later
 * one whose Pre-PegIn the mempool API knows, or whose lookup fails, still
 * counts: it may have passed its own check before the limit dropped. Only the
 * API's explicit "not found" leaves a vault out, so the untrusted API can
 * relax the check only by denying a transaction it has. When the application
 * says no with vaults counted for a failed lookup, it is asked again without
 * them: still no means the position is full whatever they are; yes means they
 * are what fills it, and the check reports that it could not decide. A Verified vault
 * counts wherever it is listed; so does every vault when this deposit's own
 * are not listed yet.
 *
 * The transaction's HTLC outputs define the resumed batch. Each listed vault
 * must hold one output and be registered to this Pre-PegIn, depositor and
 * application. Refuse an incomplete batch or a mismatched vault. Otherwise,
 * success could mark an unfunded vault as confirmed. A new deposit passes
 * `assertPositionAcceptsBatch` the batch it built and registered itself.
 *
 * Advisory, and fail closed. The reads are a snapshot that reserves nothing: a
 * concurrent activation or broadcast, a later parameter change, a later
 * deposit whose client does not run this check and broadcasts after this
 * one's check, or a mempool API that denies a later deposit's broadcast
 * Pre-PegIn can still fail activation. It does not cover the registry's CapPolicy or Aave's own supply
 * caps either. What it does guarantee is that a position already known to be
 * full never gets a registration or a broadcast, and that an unreadable or
 * incomplete answer refuses rather than allowing.
 *
 * Import this by its own path, never through the `@/services/vault` barrel:
 * that barrel is factory-mocked with a fixed export list in the deposit hook
 * tests (see `ethConfirmationGate.ts`).
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  getTxInfo,
  MempoolNotFoundError,
  OnChainBtcVaultStatus,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import type { Address, Hex } from "viem";

import { getMempoolApiUrl } from "@/clients/btc/config";
import { readAllowedToDeposit } from "@/clients/eth-contract/application-entry-point/query";
import { getDepositorVaultIdsFromChain } from "@/clients/eth-contract/btc-vault-registry/depositorVaultIds";
import {
  getBtcVaultBasicInfoFromChain,
  getVaultFromChain,
  type OnChainVaultData,
} from "@/clients/eth-contract/btc-vault-registry/query";
import { resolvePinnedReadBlock } from "@/clients/eth-contract/pinnedReadBlock";
import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";
import { COPY } from "@/copy";
import { countPrePeginHtlcOutputs } from "@/utils/btc/prePeginHtlcOutputCount";
import { mapWithConcurrency } from "@/utils/concurrency";
import {
  BatchSiblingMismatchError,
  PositionCapacityExceededError,
  PositionCapacityUnavailableError,
  type PositionCapacityCheckpoint,
} from "@/utils/errors";
import { sameHex } from "@/utils/hex";

/** The resumed vault's on-chain record, from the post-finality reads. */
export interface ResumePositionCapacityTarget {
  /** Position account the batch activates into. */
  depositor: Address;
  /** The vault's amount, in satoshis. */
  amount: bigint;
  /** The vault's application entry point — the adapter that is asked. */
  applicationEntryPoint: Address;
  /** The registered hash `unsignedTxHex` must match. */
  prePeginTxHash: Hex;
  /** The vault's HTLC output index in the Pre-PegIn. */
  htlcVout: number;
}

export interface AssertResumePositionCapacityParams {
  vaultId: Hex;
  target: ResumePositionCapacityTarget;
  /**
   * The Pre-PegIn about to be broadcast. Its HTLC outputs define the batch,
   * and it is re-checked against `target.prePeginTxHash` before it is counted.
   */
  unsignedTxHex: string;
  /**
   * Every vault the indexer groups under this Pre-PegIn, including `vaultId`.
   * The listing is untrusted and is verified, not filtered: each listed vault
   * must be registered on chain to `target`'s Pre-PegIn, depositor and
   * application, or the broadcast is refused, and the vaults found must hold
   * every HTLC output of the transaction.
   */
  batchVaultIds: readonly Hex[];
}

export type AssertPositionAcceptsBatchParams = {
  /** The application the deposit's vaults are registered to — the adapter that is asked. */
  applicationEntryPoint: Address;
  /** Position account the vaults activate into. */
  depositor: Address;
  /** Vaults this deposit adds (the whole batch). */
  vaultCount: number;
  /** Their total amount, in satoshis. */
  amount: bigint;
} & (
  | { stage: "registration" }
  | {
      stage: "broadcast";
      /** The vault the refusal names. */
      vaultId: Hex;
      /**
       * Every registered vault of this deposit, `vaultId` included. Counted
       * once, as the batch, and never again as in-flight.
       */
      batchVaultIds: readonly Hex[];
    }
);

/** A vault holding one HTLC output of the Pre-PegIn being broadcast. */
interface BatchMember {
  vaultId: Hex;
  htlcVout: number;
  amount: bigint;
}

/** The depositor's other registered, not yet activated vaults in one application. */
interface InFlightOccupancy {
  vaultCount: number;
  amount: bigint;
  /**
   * The part of the totals above counted only because a mempool lookup could
   * not say whether a later vault's Pre-PegIn is on Bitcoin, with the errors of
   * those lookups.
   */
  unconfirmed: {
    vaultCount: number;
    amount: bigint;
    lookupFailures: readonly unknown[];
  };
}

const NOTHING_UNCONFIRMED: InFlightOccupancy["unconfirmed"] = {
  vaultCount: 0,
  amount: 0n,
  lookupFailures: [],
};

/** What the mempool API says about a Pre-PegIn. */
type PrePeginLookup =
  | { result: "absent" }
  | { result: "present" }
  | { result: "failed"; error: unknown };

/** The public mempool.space endpoint rate-limits (429s); as in `useBtcMempoolConfirmations`. */
const MEMPOOL_LOOKUP_CONCURRENCY = 4;

/**
 * The check has no verdict. Keeps the chain's own error on `cause` for the log
 * and refuses, never defaulting to "allowed".
 */
function capacityUnavailable(
  checkpoint: PositionCapacityCheckpoint,
  failedStep: string,
) {
  const subject =
    checkpoint.stage === "broadcast" ? ` for vault ${checkpoint.vaultId}` : "";
  return (cause: unknown): never => {
    throw new PositionCapacityUnavailableError(
      `Could not ${failedStep}${subject}, so the position's capacity is ` +
        `unknown.`,
      { checkpoint, cause },
    );
  };
}

/**
 * On-chain records of the listed siblings, each required to be registered to
 * the target's Pre-PegIn, depositor and application. The cheap hash-only read
 * runs first, so a vault of another Pre-PegIn is refused before any full
 * record is read; `prePeginTxHash` is immutable per vault ID, so that read
 * decides it. Only the two chain reads are wrapped as "unavailable", so the
 * typed refusal escapes as itself.
 *
 * @throws {BatchSiblingMismatchError} a listed sibling is registered to
 *   another Pre-PegIn, depositor or application.
 * @throws {PositionCapacityUnavailableError} a chain read failed.
 */
async function readBatchSiblings(
  vaultId: Hex,
  target: ResumePositionCapacityTarget,
  listedSiblingIds: readonly Hex[],
): Promise<Array<{ vaultId: Hex; vault: OnChainVaultData }>> {
  if (listedSiblingIds.length === 0) return [];

  const checkpoint: PositionCapacityCheckpoint = {
    stage: "broadcast",
    vaultId,
  };
  const protocolInfos = await getVaultRegistryReader()
    .getProtocolInfoBatch(listedSiblingIds)
    .catch(
      capacityUnavailable(
        checkpoint,
        "read the batch's Pre-PegIn hashes from chain",
      ),
    );
  for (const [i, siblingId] of listedSiblingIds.entries()) {
    if (!sameHex(protocolInfos[i].prePeginTxHash, target.prePeginTxHash)) {
      throw new BatchSiblingMismatchError({
        vaultId,
        siblingId,
        field: "prePeginTxHash",
      });
    }
  }

  const records = await Promise.all(
    listedSiblingIds.map(async (siblingId) => ({
      vaultId: siblingId,
      vault: await getVaultFromChain(siblingId),
    })),
  ).catch(
    capacityUnavailable(checkpoint, "read the batch's vaults from chain"),
  );
  for (const { vaultId: siblingId, vault } of records) {
    if (!sameHex(vault.depositor, target.depositor)) {
      throw new BatchSiblingMismatchError({
        vaultId,
        siblingId,
        field: "depositor",
      });
    }
    if (!sameHex(vault.applicationEntryPoint, target.applicationEntryPoint)) {
      throw new BatchSiblingMismatchError({
        vaultId,
        siblingId,
        field: "applicationEntryPoint",
      });
    }
  }
  return records;
}

/**
 * Require the members to hold HTLC outputs 0..htlcCount-1 exactly, one vault
 * per output. Anything else means the batch this check would size is not the
 * batch the broadcast funds.
 */
function assertBatchCoversEveryHtlc(
  vaultId: Hex,
  htlcCount: number,
  members: readonly BatchMember[],
): void {
  const checkpoint: PositionCapacityCheckpoint = {
    stage: "broadcast",
    vaultId,
  };
  const holders = new Map<number, Hex>();
  for (const member of members) {
    if (
      !Number.isInteger(member.htlcVout) ||
      member.htlcVout < 0 ||
      member.htlcVout >= htlcCount
    ) {
      throw new PositionCapacityUnavailableError(
        `Vault ${member.vaultId} is registered at HTLC output ` +
          `${member.htlcVout}, but vault ${vaultId}'s Pre-PegIn has only ` +
          `${htlcCount} HTLC output(s).`,
        { checkpoint },
      );
    }
    const holder = holders.get(member.htlcVout);
    if (holder) {
      throw new PositionCapacityUnavailableError(
        `Vaults ${holder} and ${member.vaultId} are both registered at HTLC ` +
          `output ${member.htlcVout} of vault ${vaultId}'s Pre-PegIn.`,
        { checkpoint },
      );
    }
    holders.set(member.htlcVout, member.vaultId);
  }

  const missing = Array.from({ length: htlcCount }, (_, i) => i).filter(
    (index) => !holders.has(index),
  );
  if (missing.length > 0) {
    throw new PositionCapacityUnavailableError(
      `Vault ${vaultId}'s Pre-PegIn funds ${htlcCount} HTLC output(s), but no ` +
        `vault of this depositor was found on chain for output(s) ` +
        `${missing.join(", ")}. The batch list may still be catching up ` +
        `(indexer lag); try again later.`,
      { checkpoint },
    );
  }
}

/**
 * Ask the mempool API about a Pre-PegIn. Only its explicit "not found" is
 * `absent`; any other failure is kept with its error, never read as absent.
 */
async function lookUpPrePegin(
  prePeginTxHash: string,
  mempoolApiUrl: string,
): Promise<PrePeginLookup> {
  try {
    await getTxInfo(stripHexPrefix(prePeginTxHash), mempoolApiUrl);
    return { result: "present" };
  } catch (error) {
    return error instanceof MempoolNotFoundError
      ? { result: "absent" }
      : { result: "failed", error };
  }
}

/**
 * Of the depositor's Pending vaults registered after this deposit, the ones
 * the check counts: those whose Pre-PegIn Bitcoin may already have (see the
 * module header). One lookup per Pre-PegIn, so a split deposit asks once.
 *
 * @throws {PositionCapacityUnavailableError} their Pre-PegIn hashes could not
 *   be read from chain.
 */
async function laterVaultsPossiblyBroadcast(
  checkpoint: PositionCapacityCheckpoint,
  laterPending: ReadonlyArray<{ vaultId: Hex; amount: bigint }>,
  blockNumber: bigint,
): Promise<InFlightOccupancy> {
  if (laterPending.length === 0)
    return { vaultCount: 0, amount: 0n, unconfirmed: NOTHING_UNCONFIRMED };
  const protocolInfos = await getVaultRegistryReader()
    .getProtocolInfoBatch(
      laterPending.map(({ vaultId }) => vaultId),
      blockNumber,
    )
    .catch(
      capacityUnavailable(
        checkpoint,
        "read the Pre-PegIn hashes of the depositor's later vaults from chain",
      ),
    );
  const txHashes = protocolInfos.map(({ prePeginTxHash }) =>
    prePeginTxHash.toLowerCase(),
  );
  const uniqueTxHashes = [...new Set(txHashes)];
  const mempoolApiUrl = getMempoolApiUrl();
  const lookups = await mapWithConcurrency(
    uniqueTxHashes,
    MEMPOOL_LOOKUP_CONCURRENCY,
    (txHash) => lookUpPrePegin(txHash, mempoolApiUrl),
  );
  const lookupByTxHash = new Map(
    uniqueTxHashes.map((txHash, i) => [txHash, lookups[i]]),
  );

  let vaultCount = 0;
  let amount = 0n;
  let unconfirmedVaultCount = 0;
  let unconfirmedAmount = 0n;
  for (const [i, vault] of laterPending.entries()) {
    const lookup = lookupByTxHash.get(txHashes[i]);
    if (lookup?.result === "absent") continue;
    vaultCount += 1;
    amount += vault.amount;
    if (lookup?.result === "failed") {
      unconfirmedVaultCount += 1;
      unconfirmedAmount += vault.amount;
    }
  }
  const lookupFailures = lookups.flatMap((lookup) =>
    lookup.result === "failed" ? [lookup.error] : [],
  );
  return {
    vaultCount,
    amount,
    unconfirmed: {
      vaultCount: unconfirmedVaultCount,
      amount: unconfirmedAmount,
      lookupFailures,
    },
  };
}

/**
 * The depositor's registered vaults in `applicationEntryPoint` that are not
 * activated yet, read from chain: the registry's list of the depositor's
 * vaults, minus `ownVaultIds`, then each vault's status. Pending and Verified
 * vaults are in flight, except a Pending vault listed after the first of
 * `ownVaultIds` whose Pre-PegIn Bitcoin does not know (registered later and
 * unbroadcast; see the module header). An Active vault is already in the
 * adapter's own count, and a Redeemed or Expired one will never activate. Any
 * other status refuses, so a status this build does not model is never read
 * as "free".
 *
 * @throws {PositionCapacityUnavailableError} a chain read failed, or a vault
 *   is in a status this check does not model.
 */
async function readInFlightOccupancy(
  checkpoint: PositionCapacityCheckpoint,
  {
    depositor,
    applicationEntryPoint,
    ownVaultIds,
    blockNumber,
  }: {
    depositor: Address;
    applicationEntryPoint: Address;
    /** This deposit's registered vaults; empty before its registration. */
    ownVaultIds: readonly Hex[];
    /** The block every read of this check is pinned to. */
    blockNumber: bigint;
  },
): Promise<InFlightOccupancy> {
  const own = new Set(ownVaultIds.map((id) => id.toLowerCase()));
  const registered = (
    await getDepositorVaultIdsFromChain(depositor, blockNumber).catch(
      capacityUnavailable(
        checkpoint,
        "read the depositor's registered vaults from chain",
      ),
    )
  ).map((id) => id.toLowerCase() as Hex);
  const firstOwnIndex = registered.findIndex((id) => own.has(id));
  const registeredLater = new Set(
    firstOwnIndex === -1 ? [] : registered.slice(firstOwnIndex + 1),
  );
  const others = registered.filter((id) => !own.has(id));
  const records = await getBtcVaultBasicInfoFromChain(
    others,
    blockNumber,
  ).catch(
    capacityUnavailable(
      checkpoint,
      "read the status of the depositor's registered vaults from chain",
    ),
  );

  let vaultCount = 0;
  let amount = 0n;
  const laterPending: Array<{ vaultId: Hex; amount: bigint }> = [];
  for (const [vaultId, vault] of records) {
    if (!sameHex(vault.applicationEntryPoint, applicationEntryPoint)) continue;
    switch (vault.status) {
      case OnChainBtcVaultStatus.PENDING:
        if (registeredLater.has(vaultId)) {
          laterPending.push({ vaultId, amount: vault.amount });
          break;
        }
        vaultCount += 1;
        amount += vault.amount;
        break;
      case OnChainBtcVaultStatus.VERIFIED:
        vaultCount += 1;
        amount += vault.amount;
        break;
      case OnChainBtcVaultStatus.ACTIVE:
      case OnChainBtcVaultStatus.REDEEMED:
      case OnChainBtcVaultStatus.EXPIRED:
        break;
      default:
        throw new PositionCapacityUnavailableError(
          `The depositor's vault ${vaultId} is in on-chain status ` +
            `${vault.status}, which this check does not model, so the ` +
            `position's capacity is unknown.`,
          { checkpoint },
        );
    }
  }
  const later = await laterVaultsPossiblyBroadcast(
    checkpoint,
    laterPending,
    blockNumber,
  );
  return {
    vaultCount: vaultCount + later.vaultCount,
    amount: amount + later.amount,
    unconfirmed: later.unconfirmed,
  };
}

/**
 * Refuse unless the application would accept this deposit's vaults on top of
 * the depositor's other registered, unactivated vaults in the same
 * application. Fails closed.
 *
 * @throws {PositionCapacityExceededError} the application says the position
 *   would exceed its BTCVault count or BTC limit.
 * @throws {PositionCapacityUnavailableError} a read failed, a registered
 *   vault is in a status this check does not model, or the application says
 *   no only once a later vault whose mempool lookup failed is counted.
 * @throws {Error} at broadcast, `batchVaultIds` does not hold `vaultCount`
 *   distinct vaults including `vaultId` (a caller bug).
 */
export async function assertPositionAcceptsBatch(
  params: AssertPositionAcceptsBatchParams,
): Promise<void> {
  const { applicationEntryPoint, depositor, vaultCount, amount } = params;
  let checkpoint: PositionCapacityCheckpoint;
  let ownVaultIds: readonly Hex[];
  if (params.stage === "broadcast") {
    const distinct = new Set(
      params.batchVaultIds.map((id) => id.toLowerCase()),
    );
    if (
      distinct.size !== vaultCount ||
      !distinct.has(params.vaultId.toLowerCase())
    ) {
      throw new Error(
        `Position-capacity check for vault ${params.vaultId} was given ` +
          `${distinct.size} distinct batch vault(s) for a batch of ` +
          `${vaultCount}, or a list without the vault itself; the caller ` +
          `must pass every vault in the batch.`,
      );
    }
    checkpoint = { stage: "broadcast", vaultId: params.vaultId };
    ownVaultIds = params.batchVaultIds;
  } else {
    checkpoint = { stage: "registration" };
    ownVaultIds = [];
  }

  const blockNumber = await resolvePinnedReadBlock().catch(
    capacityUnavailable(checkpoint, "read the chain head"),
  );
  const inFlight = await readInFlightOccupancy(checkpoint, {
    depositor,
    applicationEntryPoint,
    ownVaultIds,
    blockNumber,
  });
  const askApplication = (extraVaults: number, extraAmount: bigint) =>
    readAllowedToDeposit({
      applicationEntryPoint,
      vaultReceiver: depositor,
      nVaultsToDeposit: BigInt(vaultCount + extraVaults),
      amountToDeposit: amount + extraAmount,
      blockNumber,
    }).catch(
      capacityUnavailable(
        checkpoint,
        "read allowedToDeposit from the application",
      ),
    );
  if (await askApplication(inFlight.vaultCount, inFlight.amount)) return;

  // Later vaults counted for want of a mempool answer may be what fills the
  // position. Ask without them: still no, and the position is full whatever
  // they are; yes, and the refusal rests on them, so the depositor is told to
  // try again rather than that the position is full.
  const { unconfirmed } = inFlight;
  if (
    unconfirmed.vaultCount > 0 &&
    (await askApplication(
      inFlight.vaultCount - unconfirmed.vaultCount,
      inFlight.amount - unconfirmed.amount,
    ))
  ) {
    const [lookupFailure] = unconfirmed.lookupFailures;
    throw new PositionCapacityUnavailableError(
      `The position has no room once the depositor's later deposits are ` +
        `counted, but the mempool API could not say whether their ` +
        `Pre-PegIns are on Bitcoin, so the position's capacity is unknown.`,
      { checkpoint, cause: lookupFailure },
    );
  }
  throw new PositionCapacityExceededError({
    checkpoint,
    vaultCount,
    amount,
    inFlightVaultCount: inFlight.vaultCount,
    inFlightAmount: inFlight.amount,
  });
}

/**
 * Refuse unless the vault's application would accept the whole batch into the
 * depositor's position, on top of the depositor's other registered,
 * unactivated vaults.
 *
 * Every member is counted whatever its status. While the Pre-PegIn is
 * unbroadcast they are all PENDING; a member that has moved on means the
 * transaction already reached Bitcoin from elsewhere, where over-counting can
 * only refuse a redundant rebroadcast.
 *
 * @returns The ids of every vault this Pre-PegIn funds (the selected vault
 *   first), as proven against the chain, the same set the broadcast funds.
 * @throws {PositionCapacityExceededError} the application says the position
 *   would exceed its BTCVault count or BTC limit.
 * @throws {BatchSiblingMismatchError} a listed vault is registered on chain
 *   to a different Pre-PegIn, depositor or application than `vaultId`.
 * @throws {PositionCapacityUnavailableError} a chain read failed; the
 *   transaction cannot be parsed or has no HTLC output; the vaults found do
 *   not hold every HTLC output exactly once; or another registered vault of
 *   the depositor is in a status this check does not model.
 * @throws {Error} `batchVaultIds` does not include `vaultId`, or
 *   `unsignedTxHex` is not the registered Pre-PegIn (caller bugs: the resume
 *   broadcast checks the hash first).
 */
export async function assertResumePositionCapacity(
  params: AssertResumePositionCapacityParams,
): Promise<readonly Hex[]> {
  const { vaultId, target, unsignedTxHex, batchVaultIds } = params;
  const checkpoint: PositionCapacityCheckpoint = {
    stage: "broadcast",
    vaultId,
  };

  // Keyed by lowercase id so a listing that repeats a vault in another case
  // cannot count it twice.
  const listedById = new Map<string, Hex>();
  for (const id of batchVaultIds) {
    const key = id.toLowerCase();
    if (!listedById.has(key)) listedById.set(key, id);
  }
  if (!listedById.delete(vaultId.toLowerCase())) {
    throw new Error(
      `Position-capacity check for vault ${vaultId} was given a batch that ` +
        `does not include it; the caller must pass every vault in the batch.`,
    );
  }

  let htlcCount: number;
  try {
    htlcCount = countPrePeginHtlcOutputs(unsignedTxHex);
  } catch (cause) {
    throw new PositionCapacityUnavailableError(
      `Could not parse vault ${vaultId}'s Pre-PegIn transaction, so the ` +
        `batch it funds is unknown.`,
      { checkpoint, cause },
    );
  }
  if (htlcCount === 0) {
    throw new PositionCapacityUnavailableError(
      `Vault ${vaultId}'s Pre-PegIn has no HTLC output, so the batch it ` +
        `funds is unknown.`,
      { checkpoint },
    );
  }
  if (!sameHex(calculateBtcTxHash(unsignedTxHex), target.prePeginTxHash)) {
    throw new Error(COPY.deposit.errors.prePeginIntegrityMismatch);
  }

  const siblings = await readBatchSiblings(vaultId, target, [
    ...listedById.values(),
  ]);

  const members: BatchMember[] = [
    { vaultId, htlcVout: target.htlcVout, amount: target.amount },
    ...siblings.map(({ vaultId: siblingId, vault }) => ({
      vaultId: siblingId,
      htlcVout: vault.htlcVout,
      amount: vault.amount,
    })),
  ];
  assertBatchCoversEveryHtlc(vaultId, htlcCount, members);

  const fundedVaultIds = members.map((member) => member.vaultId);
  const amount = members.reduce((sum, member) => sum + member.amount, 0n);
  await assertPositionAcceptsBatch({
    stage: "broadcast",
    vaultId,
    batchVaultIds: fundedVaultIds,
    applicationEntryPoint: target.applicationEntryPoint,
    depositor: target.depositor,
    vaultCount: htlcCount,
    amount,
  });
  return fundedVaultIds;
}
