/**
 * Rebuild a {@link DepositTerms} on the resume paths (#2220 Part 2 + #2110).
 *
 * On resume (any browser) the in-memory terms from `preparePegin` are gone, so
 * an intent (Ledger) wallet has nothing to approve. Reconstructs them from
 * chain + WASM only — never browser storage — at the vault's STAMPED versions;
 * the commission ceiling, which the contract discards, comes from each vault's
 * `PegInSubmitted` log (see `getMaxAcceptableCommissionBpsFromChainWithGrace`).
 * This orchestrator does the chain reads + sibling discovery (the candidate read
 * is shared with `discoverBatch`; the rest mirrors it and `prepareSigningContext`
 * — shared-helper dedupe deferred); the WASM recompute + Gate 0/1 byte-checks
 * live in ts-sdk `rebuildDepositTermsCore`.
 *
 * Two lifecycle modes, differing only in the status gate:
 * - `"broadcast"` (resume Pre-PegIn broadcast): every batch member must still
 *   be PENDING — a non-PENDING member would be silently funded by the shared tx.
 * - `"presign"` (resume payout presigning): only the TARGET must be PENDING;
 *   siblings advance independently and no presigned byte depends on their
 *   status. Additionally refuses once the target's on-chain ack window has
 *   elapsed (see {@link assertAckWindowOpen}).
 *
 * A wallet with nothing to approve uses {@link verifyResumeHtlcOutputs}, the same
 * broadcast output check without the terms or their fee and commission reads.
 */

import {
  assertFundedHtlcOutputsMatch,
  canonicalizeBtcPubkey,
  rebuildDepositTermsCore,
  resolveParticipantKeysAtEpochs,
  stripHexPrefix,
  type DepositTerms,
  type FundedHtlcOutputsInput,
  type RebuildSibling,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  OnChainBtcVaultStatus,
  type KeyEpochs,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { Address, Hex } from "viem";

import {
  DepositorBtcKeyMismatchError,
  DepositorWalletMismatchError,
  SiblingKeysMismatchError,
  VaultLifecycleStateError,
  type VaultLifecycleStage,
} from "@/utils/errors";
import { assertVaultCoreVersionSupported } from "@/utils/vaultCoreVersionSupport";

import { getPrePeginSiblingIdsFromChain } from "../../clients/eth-contract/btc-vault-registry/prePeginSiblings";
import {
  getMaxAcceptableCommissionBpsFromChainWithGrace,
  getVaultFromChain,
  getVaultKeyEpochsFromChain,
  type OnChainVaultData,
} from "../../clients/eth-contract/btc-vault-registry/query";
import { ethClient } from "../../clients/eth-contract/client";
import {
  getOperationKeyReader,
  getProtocolParamsReader,
  getUniversalChallengerReader,
  getVaultKeeperReader,
  getVaultRegistryReader,
} from "../../clients/eth-contract/sdk-readers";
import { getBTCNetworkForWASM } from "../../config/pegin";

import { resolveVaultProviderBtcPubkey } from "./vaultPayoutSignatureService";

export interface RebuildDepositTermsParams {
  /** The vault being resumed (any sibling of a batch). */
  vaultId: Hex;
  /** Caller's getVaultFromChain(vaultId) record. Callers need not pre-verify it against fundedPrePeginTxHex — the core self-verifies the hash (Gate 0). */
  target: OnChainVaultData;
  /** Funded Pre-PegIn tx hex — the core re-verifies it against the on-chain hash (Gate 0). */
  fundedPrePeginTxHex: string;
  /** Connected wallet's ETH address — must equal the on-chain depositor (stale wallet-switch guard). */
  connectedDepositorAddress: Address;
  /** Depositor BTC pubkey — the identity the HTLC scripts + PSBT are signed with. */
  depositorBtcPubkey: string;
  /**
   * Funded-tx fee (Σ prevouts − Σ outputs), computed by the caller from the same
   * prevouts the broadcast signs. Becomes the device's `prepegin_max_fee` bound.
   */
  fundedTxFee: bigint;
  /**
   * Which resume flow is running — decides the batch status gate (see module
   * doc). Required so a new caller states its lifecycle explicitly.
   */
  lifecycle: VaultLifecycleStage;
  /**
   * Ends the registration-log read's retry backoff when the caller's modal
   * closes. Callers still re-check `aborted` after the rebuild before any
   * wallet or device interaction.
   */
  signal?: AbortSignal;
}

/** {@link verifyResumeHtlcOutputs} needs no fee, ceiling or lifecycle choice. */
export type VerifyResumeHtlcOutputsParams = Pick<
  RebuildDepositTermsParams,
  | "vaultId"
  | "target"
  | "fundedPrePeginTxHex"
  | "connectedDepositorAddress"
  | "depositorBtcPubkey"
>;

type ResolvedParticipantKeys = Awaited<
  ReturnType<typeof resolveParticipantKeysAtEpochs>
>;

interface OrderedSibling extends RebuildSibling {
  htlcVout: number;
}

/** Chain record plus the registration-event field the terms carry. */
export interface RebuildVaultRecord extends OnChainVaultData {
  /** Depositor's commission ceiling from `PegInSubmitted` at `createdAt`. */
  maxAcceptableCommissionBps: number;
}

/**
 * Fields that must be uniform across the batch: each sibling is stamped by its
 * own `submitPeginRequest`, so governance changes between registrations can
 * stamp them differently — and Gate 1 cannot see fields not encoded in the HTLC
 * outputs (timelockPegin, timelockAssert). Fail closed.
 */
const SIBLING_HOMOGENEOUS_FIELDS = [
  "vaultCoreVersion",
  "offchainParamsVersion",
  "appVaultKeepersVersion",
  "universalChallengersVersion",
] as const;

/** Batch member paired with its registry id so a refusal can name the vault. */
export interface LifecycleBatchMember {
  vaultId: Hex;
  vault: OnChainVaultData;
}

/**
 * Exported for tests — pure, fail-closed. Chain-read PENDING gate: broadcast
 * needs EVERY member PENDING (an expired/liquidated sibling would otherwise be
 * silently funded by the shared tx); presign gates only the TARGET — siblings
 * advance independently and no presigned byte depends on their status.
 */
export function assertBatchLifecycleStatus(
  lifecycle: VaultLifecycleStage,
  target: LifecycleBatchMember,
  siblings: readonly LifecycleBatchMember[],
): void {
  const gated =
    lifecycle === "broadcast"
      ? [
          { member: target, role: "target" as const },
          ...siblings.map((member) => ({ member, role: "sibling" as const })),
        ]
      : [{ member: target, role: "target" as const }];

  for (const { member, role } of gated) {
    if (member.vault.status === OnChainBtcVaultStatus.PENDING) continue;
    throw new VaultLifecycleStateError(
      // mapDepositError buckets on the typed `stage`, not on this wording.
      lifecycle === "broadcast"
        ? `A vault in this Pre-PegIn batch is no longer awaiting broadcast ` +
          `(on-chain status ${member.vault.status}); the batch cannot be broadcast ` +
          `as one transaction. Resume refused.`
        : `Vault ${member.vaultId} is no longer awaiting payout signatures ` +
          `(on-chain status ${member.vault.status}); deposit terms cannot ` +
          `be rebuilt for signing. Resume refused.`,
      {
        reason: "invalid-status",
        stage: lifecycle,
        role,
        status: member.vault.status,
        vaultId: member.vaultId,
      },
    );
  }
}

/**
 * Exported for tests — pure, fail-closed. A separately registered sibling can
 * carry its own commission ceiling, and one set of terms has one ceiling.
 */
export function assertSiblingBatchHomogeneous(
  target: RebuildVaultRecord,
  siblings: readonly RebuildVaultRecord[],
): void {
  assertSiblingStampsHomogeneous(target, siblings);
  for (const sib of siblings) {
    if (sib.maxAcceptableCommissionBps !== target.maxAcceptableCommissionBps) {
      throw new Error(
        `Sibling vaults of this Pre-PegIn disagree on maxAcceptableCommissionBps ` +
          `(${sib.maxAcceptableCommissionBps} vs ${target.maxAcceptableCommissionBps}); ` +
          `the batch cannot be treated as one deposit. Resume refused.`,
      );
    }
  }
}

function assertSiblingStampsHomogeneous(
  target: OnChainVaultData,
  siblings: readonly OnChainVaultData[],
): void {
  for (const sib of siblings) {
    for (const field of SIBLING_HOMOGENEOUS_FIELDS) {
      if (sib[field] !== target[field]) {
        throw new Error(
          `Sibling vaults of this Pre-PegIn disagree on ${field} ` +
            `(${String(sib[field])} vs ${String(target[field])}); the batch ` +
            `cannot be treated as one deposit. Resume refused.`,
        );
      }
    }
    for (const field of ["applicationEntryPoint", "vaultProvider"] as const) {
      if (sib[field].toLowerCase() !== target[field].toLowerCase()) {
        throw new Error(
          `Sibling vaults of this Pre-PegIn disagree on ${field} ` +
            `(${sib[field]} vs ${target[field]}); the batch cannot be ` +
            `treated as one deposit. Resume refused.`,
        );
      }
    }
  }
}

/** Exported for tests — pure, fail-closed. htlcVout is derived from array
 * position downstream, so the sorted vector must cover [0, N-1] exactly. */
export function assertContiguousHtlcVector(
  siblings: readonly OrderedSibling[],
): void {
  for (let i = 0; i < siblings.length; i++) {
    if (siblings[i].htlcVout !== i) {
      throw new Error(
        `Sibling discovery produced a non-contiguous HTLC vector ` +
          `(${siblings.map((s) => s.htlcVout).join(", ")}); resume refused.`,
      );
    }
  }
}

/** The batch's HTLCs by vout, refusing a vector that does not cover every vout. */
function orderSiblings(vaults: readonly OnChainVaultData[]): OrderedSibling[] {
  const siblings: OrderedSibling[] = vaults.map((v) => ({
    hashlock: v.hashlock,
    amount: v.amount,
    htlcVout: v.htlcVout,
  }));
  siblings.sort((a, b) => a.htlcVout - b.htlcVout);
  assertContiguousHtlcVector(siblings);
  return siblings;
}

/**
 * Discover the other vaults sharing this Pre-PegIn tx and gate their status.
 * Candidates come from the registry's list of the depositor's vaults and
 * membership from on-chain `prePeginTxHash` equality; completeness is
 * backstopped by the core's OP_RETURN anchor check.
 */
async function discoverSiblingMembers(
  lifecycle: VaultLifecycleStage,
  targetVaultId: Hex,
  connectedDepositor: Address,
  target: OnChainVaultData,
): Promise<LifecycleBatchMember[]> {
  if (target.depositor.toLowerCase() !== connectedDepositor.toLowerCase()) {
    throw new DepositorWalletMismatchError({
      vaultId: targetVaultId,
      expectedDepositor: target.depositor,
      connectedDepositor,
    });
  }

  const txHashLower = target.prePeginTxHash.toLowerCase();

  // Lean hash-only read first; the fully-validated read runs only for actual
  // siblings.
  const siblingIds = await getPrePeginSiblingIdsFromChain(
    targetVaultId,
    target,
  );
  const siblingMembers = (
    await Promise.all(
      siblingIds.map(async (id) => ({
        vaultId: id,
        vault: await getVaultFromChain(id),
      })),
    )
  ).filter(({ vault }) => vault.prePeginTxHash.toLowerCase() === txHashLower);

  assertBatchLifecycleStatus(
    lifecycle,
    { vaultId: targetVaultId, vault: target },
    siblingMembers,
  );
  return siblingMembers;
}

/** {@link discoverSiblingMembers} plus each member's commission ceiling. */
async function discoverSiblings(
  lifecycle: VaultLifecycleStage,
  targetVaultId: Hex,
  connectedDepositor: Address,
  target: OnChainVaultData,
  signal: AbortSignal | undefined,
): Promise<{
  siblings: OrderedSibling[];
  target: RebuildVaultRecord;
  siblingMembers: LifecycleBatchMember[];
}> {
  const siblingMembers = await discoverSiblingMembers(
    lifecycle,
    targetVaultId,
    connectedDepositor,
    target,
  );

  // The ceiling lives only in registration logs, so it is read per
  // registration block — one query covers every member registered in that
  // block (a batch registration lands all siblings in one tx) — after the
  // status gate, so a refused batch costs no extra RPCs.
  const membersByBlock = new Map<bigint, LifecycleBatchMember[]>();
  for (const member of [
    { vaultId: targetVaultId, vault: target },
    ...siblingMembers,
  ]) {
    const group = membersByBlock.get(member.vault.createdAt) ?? [];
    group.push(member);
    membersByBlock.set(member.vault.createdAt, group);
  }
  const recordGroups = await Promise.all(
    [...membersByBlock].map(async ([createdAt, group]) => {
      const ceilings = await getMaxAcceptableCommissionBpsFromChainWithGrace(
        group.map((member) => member.vaultId),
        createdAt,
        signal,
      );
      return group.map(
        ({ vault }, i): RebuildVaultRecord => ({
          ...vault,
          maxAcceptableCommissionBps: ceilings[i],
        }),
      );
    }),
  );
  // The target was inserted first, so it heads the first group.
  const [targetRecord, ...siblingRecords] = recordGroups.flat();
  assertSiblingBatchHomogeneous(targetRecord, siblingRecords);

  return {
    siblings: orderSiblings([targetRecord, ...siblingRecords]),
    target: targetRecord,
    siblingMembers,
  };
}

/**
 * Presign only: refuse before the device ceremony when the target's ack window
 * has elapsed — report-lag can leave an ack-expired deposit reading PENDING for
 * hours, and past the window `submitACK` reverts, so signing is futile.
 * Any read failure propagates (fail closed). The broadcast paths run their
 * own, margin-bearing gate instead (`prePeginBroadcastAckWindow.ts`).
 */
async function assertAckWindowOpen(
  vaultId: Hex,
  target: OnChainVaultData,
): Promise<void> {
  const paramsReader = await getProtocolParamsReader();
  const [currentBlock, tbvParams] = await Promise.all([
    ethClient.getPublicClient().getBlockNumber(),
    paramsReader.getTBVProtocolParams(),
  ]);
  const ackDeadlineBlock = target.createdAt + tbvParams.pegInAckTimeout;
  // Exact contract mirror, all block numbers: expired iff
  // block.number > createdAt + pegInAckTimeout (PeginLogic.submitACK, and the
  // contrapositive in PeginLogic.reportExpired; vault-contracts-aave-v4 @ 2e87a85a).
  if (currentBlock > ackDeadlineBlock) {
    throw new VaultLifecycleStateError(
      `Vault ${vaultId} passed its acknowledgment deadline at block ` +
        `${ackDeadlineBlock} (current block ${currentBlock}); signing can no ` +
        `longer complete this deposit. Resume refused.`,
      {
        reason: "ack-window-elapsed",
        stage: "presign",
        role: "target",
        // The ACTUAL on-chain status (PENDING here) — never falsified to EXPIRED.
        status: target.status,
        vaultId,
      },
    );
  }
}

/**
 * Read everything version-locked to the vault's stamps (mirrors
 * `prepareSigningContext`): offchain params + timelocks at
 * `offchainParamsVersion`, rosters at their stamped versions, operation keys
 * at the vault's frozen epochs.
 */
async function readStampedVaultContext(vaultId: Hex, target: OnChainVaultData) {
  // Reader factories are TTL-cached with in-flight dedupe, so concurrent
  // acquisition is safe.
  const [
    { offchainParams, timelockPegin },
    vaultKeepers,
    universalChallengers,
    registrationVpBtcPubkey,
    operationKeyReader,
    epochs,
  ] = await Promise.all([
    getProtocolParamsReader().then(async (reader) => {
      const [offchainParams, timelockPegin] = await Promise.all([
        reader.getOffchainParamsByVersion(target.offchainParamsVersion),
        reader.getTimelockPeginByVersion(target.offchainParamsVersion),
      ]);
      return { offchainParams, timelockPegin };
    }),
    getVaultKeeperReader().then((r) =>
      r.getVaultKeepersByVersion(
        target.applicationEntryPoint,
        target.appVaultKeepersVersion,
      ),
    ),
    getUniversalChallengerReader().then((r) =>
      r.getUniversalChallengersByVersion(target.universalChallengersVersion),
    ),
    resolveVaultProviderBtcPubkey(target.vaultProvider, undefined),
    getOperationKeyReader(),
    getVaultKeyEpochsFromChain(vaultId),
  ]);

  if (vaultKeepers.length === 0) {
    throw new Error(
      `No vault keepers for version ${target.appVaultKeepersVersion}`,
    );
  }
  if (universalChallengers.length === 0) {
    throw new Error(
      `No universal challengers for version ${target.universalChallengersVersion}`,
    );
  }

  const resolveKeysAtEpochs = (keyEpochs: KeyEpochs) =>
    resolveParticipantKeysAtEpochs({
      operationKeyReader,
      query: {
        vaultProviderEthAddress: target.vaultProvider,
        vaultProviderGenesisBtcPubkey: `0x${registrationVpBtcPubkey}` as Hex,
        applicationEntryPoint: target.applicationEntryPoint,
        vaultKeepers,
        universalChallengers,
      },
      epochs: keyEpochs,
    });
  const participantKeys = await resolveKeysAtEpochs(epochs);

  return {
    offchainParams,
    timelockPegin,
    participantKeys,
    epochs,
    resolveKeysAtEpochs,
  };
}

/**
 * Broadcast only. One Pre-PegIn's outputs can match one key set, and a refund
 * resolves each vault at its own epochs, so a sibling with different keys would
 * lose its in-app refund. Compares resolved keys, because `vpKeyEpoch` is
 * registry-wide and moves when any provider rotates. Sibling homogeneity already
 * guarantees the same provider, application and rosters. The depositor key is
 * stored per vault, so it is compared too.
 */
async function assertSiblingsShareKeys(params: {
  vaultId: Hex;
  siblingMembers: readonly LifecycleBatchMember[];
  depositorBtcPubkey: string;
  epochs: KeyEpochs;
  participantKeys: ResolvedParticipantKeys;
  resolveKeysAtEpochs: (epochs: KeyEpochs) => Promise<ResolvedParticipantKeys>;
}): Promise<void> {
  const { vaultId, siblingMembers, epochs, participantKeys } = params;
  const { resolveKeysAtEpochs } = params;
  const keySetFingerprint = (keys: ResolvedParticipantKeys) =>
    JSON.stringify([
      keys.vaultProvider.operationBtcPubkey,
      keys.vaultKeeperOperationKeysSorted,
      keys.universalChallengerOperationKeysSorted,
    ]);

  if (siblingMembers.length === 0) return;
  for (const { vaultId: siblingId, vault } of siblingMembers) {
    if (
      canonicalizeBtcPubkey(vault.depositorBtcPubKey) !==
      params.depositorBtcPubkey
    ) {
      throw new SiblingKeysMismatchError({ vaultId, siblingId });
    }
  }
  const siblingVaultIds = siblingMembers.map((member) => member.vaultId);
  const epochsPerSibling =
    await getVaultRegistryReader().getVaultKeyEpochsBatch(siblingVaultIds);

  await Promise.all(
    siblingVaultIds.map(async (siblingId, i) => {
      const siblingEpochs = epochsPerSibling[i];
      if (
        siblingEpochs.vpKeyEpoch === epochs.vpKeyEpoch &&
        siblingEpochs.appKeeperKeyEpoch === epochs.appKeeperKeyEpoch &&
        siblingEpochs.ucKeyEpoch === epochs.ucKeyEpoch
      ) {
        return;
      }
      const siblingKeys = await resolveKeysAtEpochs(siblingEpochs);
      if (
        keySetFingerprint(siblingKeys) !== keySetFingerprint(participantKeys)
      ) {
        throw new SiblingKeysMismatchError({ vaultId, siblingId });
      }
    }),
  );
}

/**
 * Presign preflight: the two target-only gates `submitACK` itself enforces, in
 * the contract's order — `status == Pending`, then the ack window
 * (PeginLogic.submitACK, vault-contracts-aave-v4 @ 2e87a85a). Cheap (one block
 * read + one params read) and decidable from the target alone, so callers run
 * it BEFORE the mempool/sibling reads that precede the full rebuild:
 * for a stalled deposit the refund copy must win over a transient read error.
 * `rebuildDepositTerms` re-runs both gates itself — this is an early exit, not
 * a substitute.
 */
export async function assertPresignTargetSignable(
  vaultId: Hex,
  target: OnChainVaultData,
): Promise<void> {
  assertBatchLifecycleStatus("presign", { vaultId, vault: target }, []);
  await assertAckWindowOpen(vaultId, target);
}

/** Refuse an unbuildable version or a wallet that is not the depositor's. */
async function assertCanRebuildForWallet(
  params: VerifyResumeHtlcOutputsParams,
): Promise<string> {
  const { target } = params;

  // Fail closed before any wallet popup if this build's WASM cannot construct
  // the stamped version. Vendor-neutral, mirrors the refund flow.
  await assertVaultCoreVersionSupported(target.vaultCoreVersion);

  // Refuse a Bitcoin wallet that is not the vault's depositor, before any
  // chain read.
  const expectedDepositorBtcPubkey = canonicalizeBtcPubkey(
    target.depositorBtcPubKey,
  );
  const connectedBtcPubkey = canonicalizeBtcPubkey(params.depositorBtcPubkey);
  if (connectedBtcPubkey !== expectedDepositorBtcPubkey) {
    throw new DepositorBtcKeyMismatchError({
      vaultId: params.vaultId,
      expectedDepositorBtcPubkey,
      connectedBtcPubkey,
    });
  }
  return connectedBtcPubkey;
}

/** The core's output-check input, from the vault's stamps and frozen keys. */
function toFundedHtlcOutputsInput(
  params: VerifyResumeHtlcOutputsParams,
  siblings: readonly OrderedSibling[],
  connectedBtcPubkey: string,
  context: Awaited<ReturnType<typeof readStampedVaultContext>>,
): FundedHtlcOutputsInput {
  const { target } = params;
  const { offchainParams, participantKeys } = context;
  return {
    vaultCoreVersion: target.vaultCoreVersion,
    siblings: siblings.map((s) => ({ hashlock: s.hashlock, amount: s.amount })),
    fundedPrePeginTxHex: params.fundedPrePeginTxHex,
    depositorBtcPubkey: connectedBtcPubkey,
    vaultProviderBtcPubkey: participantKeys.vaultProvider.operationBtcPubkey,
    vaultKeeperBtcPubkeys: participantKeys.vaultKeeperOperationKeysSorted,
    universalChallengerBtcPubkeys:
      participantKeys.universalChallengerOperationKeysSorted,
    protocolFeeRate: offchainParams.feeRate,
    minPeginFeeRate: offchainParams.minPeginFeeRate,
    councilQuorum: offchainParams.councilQuorum,
    councilSize: offchainParams.securityCouncilKeys.length,
    timelockRefund: offchainParams.tRefund,
    prepeginTxid: stripHexPrefix(target.prePeginTxHash).toLowerCase(),
    network: getBTCNetworkForWASM(),
  };
}

/**
 * Before a resumed broadcast by a wallet with nothing to approve, prove the
 * transaction's HTLC outputs use the vault's registered keys and parameters. A
 * mismatch would lock BTC the in-app refund cannot spend. Reads no fee and no
 * commission ceiling: neither reaches an HTLC output, and this wallet gets no
 * terms, so neither may refuse its deposit.
 */
export async function verifyResumeHtlcOutputs(
  params: VerifyResumeHtlcOutputsParams,
): Promise<void> {
  const { vaultId, target } = params;
  const connectedBtcPubkey = await assertCanRebuildForWallet(params);
  const members = await discoverSiblingMembers(
    "broadcast",
    vaultId,
    params.connectedDepositorAddress,
    target,
  );
  const siblingVaults = members.map(({ vault }) => vault);
  assertSiblingStampsHomogeneous(target, siblingVaults);
  const siblings = orderSiblings([target, ...siblingVaults]);
  const context = await readStampedVaultContext(vaultId, target);
  await assertSiblingsShareKeys({
    vaultId,
    siblingMembers: members,
    depositorBtcPubkey: connectedBtcPubkey,
    epochs: context.epochs,
    participantKeys: context.participantKeys,
    resolveKeysAtEpochs: context.resolveKeysAtEpochs,
  });
  await assertFundedHtlcOutputsMatch(
    toFundedHtlcOutputsInput(params, siblings, connectedBtcPubkey, context),
  );
}

export async function rebuildDepositTerms(
  params: RebuildDepositTermsParams,
): Promise<DepositTerms> {
  const { target } = params;
  const connectedBtcPubkey = await assertCanRebuildForWallet(params);

  const {
    siblings,
    target: targetRecord,
    siblingMembers,
  } = await discoverSiblings(
    params.lifecycle,
    params.vaultId,
    params.connectedDepositorAddress,
    target,
    params.signal,
  );
  // Runs after the status gate, so the refusal reports the still-PENDING
  // status — the same order as submitACK's two preconditions.
  if (params.lifecycle === "presign") {
    await assertAckWindowOpen(params.vaultId, target);
  }
  const context = await readStampedVaultContext(params.vaultId, target);

  if (params.lifecycle === "broadcast") {
    await assertSiblingsShareKeys({
      vaultId: params.vaultId,
      siblingMembers,
      depositorBtcPubkey: connectedBtcPubkey,
      epochs: context.epochs,
      participantKeys: context.participantKeys,
      resolveKeysAtEpochs: context.resolveKeysAtEpochs,
    });
  }

  return rebuildDepositTermsCore({
    ...toFundedHtlcOutputsInput(params, siblings, connectedBtcPubkey, context),
    timelockPegin: context.timelockPegin,
    timelockAssert: Number(context.offchainParams.timelockAssert),
    prepeginMaxFee: params.fundedTxFee,
    // The submitted ceiling, verbatim: the device must see the terms the
    // depositor originally approved, so nothing here caps or rewrites it.
    maxAcceptableCommissionBps: targetRecord.maxAcceptableCommissionBps,
  });
}
