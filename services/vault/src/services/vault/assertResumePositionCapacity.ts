/**
 * Position-capacity gate for a resumed Pre-PegIn broadcast.
 *
 * Activation runs the adapter's size check once per vault and, on failure, the
 * registry redeems the vault instead of activating it
 * (vault-contracts-aave-v4@06f46477:src/protocol/BTCVaultRegistry.sol:751-760)
 * — after the BTC is locked, with the fees spent. A position that filled up,
 * or whose limits governance lowered, between registration and the resume
 * broadcast would hit exactly that. This asks the vault's own application
 * before this attempt broadcasts anything.
 *
 * One `allowedToDeposit(depositor, batchSize, batchAmount)` read stands in for
 * every per-vault activation check
 * (vault-contracts-aave-v4@06f46477:src/applications/aave/AaveAdapter.sol:149):
 * the adapter counts only collateralized vaults
 * (vault-contracts-aave-v4@06f46477:src/applications/aave/AaveAdapter.sol:667-685),
 * so the batch's still-unactivated members are not in the position yet and
 * adding them all at once is what activating them one by one adds up to. The
 * receiver is the on-chain depositor because this app activates with empty
 * metadata, which the adapter resolves to `vault.depositor`
 * (vault-contracts-aave-v4@06f46477:src/applications/aave/AaveAdapter.sol:137;
 * `vaultActivationService.ts`).
 *
 * The batch is whatever the broadcast funds, so it comes from the transaction,
 * not from the listing: the hash-bound Pre-PegIn's HTLC outputs, each of which
 * must be held by exactly one of this depositor's vaults on chain. An
 * under-listed batch would otherwise ask about too few vaults and pass.
 *
 * Advisory, and fail closed. The read is a snapshot that reserves nothing: a
 * concurrent activation or a later parameter change can still fail activation,
 * and the depositor's other unactivated vaults are not counted. It does not
 * cover the registry's CapPolicy or Aave's own supply caps either. What it
 * does guarantee is that a position already known to be full never gets a
 * broadcast, and that an unreadable or incomplete answer refuses rather than
 * allowing.
 *
 * Import this by its own path, never through the `@/services/vault` barrel:
 * that barrel is factory-mocked with a fixed export list in the deposit hook
 * tests (see `ethConfirmationGate.ts`).
 */

import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import type { Address, Hex } from "viem";

import { readAllowedToDeposit } from "@/clients/eth-contract/application-entry-point/query";
import {
  getVaultFromChain,
  type OnChainVaultData,
} from "@/clients/eth-contract/btc-vault-registry/query";
import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";
import { COPY } from "@/copy";
import { countPrePeginHtlcOutputs } from "@/utils/btc/prePeginHtlcOutputCount";
import {
  PositionCapacityExceededError,
  PositionCapacityUnavailableError,
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
   * Discovery input only: a listed vault counts when its on-chain hash and
   * depositor match the target, and the result must cover every HTLC output.
   */
  batchVaultIds: readonly Hex[];
}

/** A vault holding one HTLC output of the Pre-PegIn being broadcast. */
interface BatchMember {
  vaultId: Hex;
  htlcVout: number;
  amount: bigint;
}

/**
 * The check has no verdict. Keeps the chain's own error on `cause` for the log
 * and refuses, never defaulting to "allowed".
 */
function capacityUnavailable(vaultId: Hex, failedStep: string) {
  return (cause: unknown): never => {
    throw new PositionCapacityUnavailableError(
      `Could not ${failedStep} for vault ${vaultId}, so the position's ` +
        `capacity is unknown. Broadcast refused.`,
      { vaultId, cause },
    );
  };
}

/**
 * On-chain records of the listed vaults that belong to this deposit: same
 * registered Pre-PegIn hash and same depositor. A cheap hash-only read filters
 * first; full records are read only for the matches. A same-hash vault of
 * another depositor is dropped: the registry reserves each output per
 * depositor (vault-contracts-aave-v4@06f46477:src/protocol/lib/PeginLogic.sol:130-139),
 * so such a vault is not in this position.
 */
async function readSameDepositorSiblings(
  target: ResumePositionCapacityTarget,
  listedSiblingIds: readonly Hex[],
): Promise<Array<{ vaultId: Hex; vault: OnChainVaultData }>> {
  if (listedSiblingIds.length === 0) return [];

  const protocolInfos =
    await getVaultRegistryReader().getProtocolInfoBatch(listedSiblingIds);
  const hashMatchedIds = listedSiblingIds.filter((_, i) =>
    sameHex(protocolInfos[i].prePeginTxHash, target.prePeginTxHash),
  );
  const records = await Promise.all(
    hashMatchedIds.map(async (vaultId) => ({
      vaultId,
      vault: await getVaultFromChain(vaultId),
    })),
  );
  return records.filter(
    ({ vault }) =>
      sameHex(vault.prePeginTxHash, target.prePeginTxHash) &&
      sameHex(vault.depositor, target.depositor),
  );
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
          `${htlcCount} HTLC output(s). Broadcast refused.`,
        { vaultId },
      );
    }
    const holder = holders.get(member.htlcVout);
    if (holder) {
      throw new PositionCapacityUnavailableError(
        `Vaults ${holder} and ${member.vaultId} are both registered at HTLC ` +
          `output ${member.htlcVout} of vault ${vaultId}'s Pre-PegIn. ` +
          `Broadcast refused.`,
        { vaultId },
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
        `(indexer lag); try again later. Broadcast refused.`,
      { vaultId },
    );
  }
}

/**
 * Refuse unless the vault's application would accept the whole batch into the
 * depositor's position.
 *
 * Every member is counted whatever its status. While the Pre-PegIn is
 * unbroadcast they are all PENDING; a member that has moved on means the
 * transaction already reached Bitcoin from elsewhere, where over-counting can
 * only refuse a redundant rebroadcast.
 *
 * @throws {PositionCapacityExceededError} the application says the position
 *   would exceed its BTCVault count or BTC limit.
 * @throws {PositionCapacityUnavailableError} a chain read failed; the
 *   transaction cannot be parsed or has no HTLC output; the vaults found do
 *   not hold every HTLC output exactly once; or a member is bound to a
 *   different application than the target.
 * @throws {Error} `batchVaultIds` does not include `vaultId`, or
 *   `unsignedTxHex` is not the registered Pre-PegIn (caller bugs: the resume
 *   broadcast checks both first).
 */
export async function assertResumePositionCapacity(
  params: AssertResumePositionCapacityParams,
): Promise<void> {
  const { vaultId, target, unsignedTxHex, batchVaultIds } = params;

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
        `batch it funds is unknown. Broadcast refused.`,
      { vaultId, cause },
    );
  }
  if (htlcCount === 0) {
    throw new PositionCapacityUnavailableError(
      `Vault ${vaultId}'s Pre-PegIn has no HTLC output, so the batch it ` +
        `funds is unknown. Broadcast refused.`,
      { vaultId },
    );
  }
  if (!sameHex(calculateBtcTxHash(unsignedTxHex), target.prePeginTxHash)) {
    throw new Error(COPY.deposit.errors.prePeginIntegrityMismatch);
  }

  const siblings = await readSameDepositorSiblings(target, [
    ...listedById.values(),
  ]).catch(capacityUnavailable(vaultId, "read the batch's vaults from chain"));

  for (const { vaultId: siblingId, vault } of siblings) {
    if (!sameHex(vault.applicationEntryPoint, target.applicationEntryPoint)) {
      throw new PositionCapacityUnavailableError(
        `Vault ${siblingId} shares vault ${vaultId}'s Pre-PegIn but is bound ` +
          `to application ${vault.applicationEntryPoint}, not ` +
          `${target.applicationEntryPoint}, so there is no single position ` +
          `limit to check. Broadcast refused.`,
        { vaultId },
      );
    }
  }

  const members: BatchMember[] = [
    { vaultId, htlcVout: target.htlcVout, amount: target.amount },
    ...siblings.map(({ vaultId: siblingId, vault }) => ({
      vaultId: siblingId,
      htlcVout: vault.htlcVout,
      amount: vault.amount,
    })),
  ];
  assertBatchCoversEveryHtlc(vaultId, htlcCount, members);

  const amount = members.reduce((sum, member) => sum + member.amount, 0n);
  const allowed = await readAllowedToDeposit({
    applicationEntryPoint: target.applicationEntryPoint,
    vaultReceiver: target.depositor,
    nVaultsToDeposit: BigInt(htlcCount),
    amountToDeposit: amount,
  }).catch(
    capacityUnavailable(vaultId, "read allowedToDeposit from the application"),
  );
  if (!allowed) {
    throw new PositionCapacityExceededError({
      vaultId,
      vaultCount: htlcCount,
      amount,
    });
  }
}
