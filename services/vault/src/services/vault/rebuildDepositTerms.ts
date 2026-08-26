/**
 * Rebuild a {@link DepositTerms} on the resume paths (#2220 Part 2 + #2110).
 *
 * On resume (any browser) the in-memory terms from `preparePegin` are gone, so
 * an intent (Ledger) wallet has nothing to approve. Reconstructs them from
 * chain + WASM only — never browser storage — at the vault's STAMPED versions;
 * the one non-chain-derivable field is the commission ceiling (interim proxy,
 * see {@link resolveResumeCommissionCeilingBps} + #2252). This orchestrator does
 * the chain reads + sibling discovery (mirrors `discoverBatch` /
 * `prepareSigningContext` — shared-helper dedupe deferred); the WASM recompute +
 * Gate 0/1 byte-checks live in ts-sdk `rebuildDepositTermsCore`.
 *
 * Two lifecycle modes, differing only in the status gate:
 * - `"broadcast"` (resume Pre-PegIn broadcast): every batch member must still
 *   be PENDING — a non-PENDING member would be silently funded by the shared tx.
 * - `"presign"` (resume payout presigning): only the TARGET must be PENDING;
 *   siblings advance independently and no presigned byte depends on their
 *   status. Additionally refuses once the target's on-chain ack window has
 *   elapsed (see {@link assertAckWindowOpen}).
 */

import {
  processPublicKeyToXOnly,
  rebuildDepositTermsCore,
  resolveParticipantKeysAtEpochs,
  stripHexPrefix,
  type DepositTerms,
  type RebuildSibling,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { Address, Hex } from "viem";

import {
  DepositorWalletMismatchError,
  VaultLifecycleStateError,
  type VaultLifecycleStage,
} from "@/utils/errors";
import { assertVaultCoreVersionSupported } from "@/utils/vaultCoreVersionSupport";

import {
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

import { fetchVaultIdsByDepositor } from "./fetchVaults";
import { resolveResumeCommissionCeilingBps } from "./resolveResumeCommissionCeilingBps";
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
}

interface OrderedSibling extends RebuildSibling {
  htlcVout: number;
}

/**
 * Fields that must be uniform across the batch: each sibling is stamped by its
 * own `submitPeginRequest`, so governance/VP changes between registrations can
 * stamp them differently — and Gate 1 cannot see fields not encoded in the
 * HTLC outputs (timelockPegin, timelockAssert, commission). Fail closed.
 */
const SIBLING_HOMOGENEOUS_FIELDS = [
  "vaultCoreVersion",
  "offchainParamsVersion",
  "appVaultKeepersVersion",
  "universalChallengersVersion",
  "vaultProviderCommissionBps",
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
      // The broadcast message is load-bearing: mapDepositError buckets on the
      // word "broadcast" — keep it byte-identical.
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

/** Exported for tests — pure, fail-closed. */
export function assertSiblingBatchHomogeneous(
  target: OnChainVaultData,
  siblings: readonly OnChainVaultData[],
): void {
  for (const sib of siblings) {
    for (const field of SIBLING_HOMOGENEOUS_FIELDS) {
      if (sib[field] !== target[field]) {
        throw new Error(
          `Sibling vaults of this Pre-PegIn disagree on ${field} ` +
            `(${String(sib[field])} vs ${String(target[field])}); the batch ` +
            `cannot be described by one set of deposit terms. Resume refused.`,
        );
      }
    }
    for (const field of ["applicationEntryPoint", "vaultProvider"] as const) {
      if (sib[field].toLowerCase() !== target[field].toLowerCase()) {
        throw new Error(
          `Sibling vaults of this Pre-PegIn disagree on ${field} ` +
            `(${sib[field]} vs ${target[field]}); the batch cannot be ` +
            `described by one set of deposit terms. Resume refused.`,
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

/**
 * Discover the complete sibling set sharing this Pre-PegIn tx, ordered by
 * htlcVout. Membership is on-chain `prePeginTxHash` equality (a stale indexer
 * can only enumerate ids); completeness is backstopped by the core's OP_RETURN
 * anchor check.
 */
async function discoverSiblings(
  lifecycle: VaultLifecycleStage,
  targetVaultId: Hex,
  connectedDepositor: Address,
  target: OnChainVaultData,
): Promise<OrderedSibling[]> {
  if (target.depositor.toLowerCase() !== connectedDepositor.toLowerCase()) {
    throw new DepositorWalletMismatchError({
      vaultId: targetVaultId,
      expectedDepositor: target.depositor,
      connectedDepositor,
    });
  }

  const txHashLower = target.prePeginTxHash.toLowerCase();
  const targetIdLower = targetVaultId.toLowerCase();
  const depositorVaultIds = await fetchVaultIdsByDepositor(target.depositor);
  const candidateIds = depositorVaultIds.filter(
    (id) => id.toLowerCase() !== targetIdLower,
  );

  // Lean hash-only multicall first; the fully-validated read runs only for
  // actual siblings.
  const candidateInfos =
    await getVaultRegistryReader().getProtocolInfoBatch(candidateIds);
  const siblingIds = candidateIds.filter(
    (_, i) => candidateInfos[i].prePeginTxHash.toLowerCase() === txHashLower,
  );
  const siblingMembers = (
    await Promise.all(
      siblingIds.map(async (id) => ({
        vaultId: id,
        vault: await getVaultFromChain(id),
      })),
    )
  ).filter(({ vault }) => vault.prePeginTxHash.toLowerCase() === txHashLower);
  const siblingOnChain = siblingMembers.map(({ vault }) => vault);

  assertBatchLifecycleStatus(
    lifecycle,
    { vaultId: targetVaultId, vault: target },
    siblingMembers,
  );
  assertSiblingBatchHomogeneous(target, siblingOnChain);

  const siblings: OrderedSibling[] = [target, ...siblingOnChain].map((v) => ({
    hashlock: v.hashlock,
    amount: v.amount,
    htlcVout: v.htlcVout,
  }));
  siblings.sort((a, b) => a.htlcVout - b.htlcVout);
  assertContiguousHtlcVector(siblings);

  return siblings;
}

/**
 * Presign only: refuse before the device ceremony when the target's ack window
 * has elapsed — report-lag can leave an ack-expired deposit reading PENDING for
 * hours, and past the window `submitACK` reverts, so signing is futile.
 * Any read failure propagates (fail closed).
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

  const participantKeys = await resolveParticipantKeysAtEpochs({
    operationKeyReader,
    query: {
      vaultProviderEthAddress: target.vaultProvider,
      vaultProviderGenesisBtcPubkey: `0x${registrationVpBtcPubkey}` as Hex,
      applicationEntryPoint: target.applicationEntryPoint,
      vaultKeepers,
      universalChallengers,
    },
    epochs,
  });

  return { offchainParams, timelockPegin, participantKeys };
}

/**
 * Presign preflight: the two target-only gates `submitACK` itself enforces, in
 * the contract's order — `status == Pending`, then the ack window
 * (PeginLogic.submitACK, vault-contracts-aave-v4 @ 2e87a85a). Cheap (one block
 * read + one params read) and decidable from the target alone, so callers run
 * it BEFORE the mempool/indexer/sibling reads that precede the full rebuild:
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

export async function rebuildDepositTerms(
  params: RebuildDepositTermsParams,
): Promise<DepositTerms> {
  const { target } = params;

  // Fail closed before any wallet popup if this build's WASM cannot construct
  // the stamped version. Vendor-neutral, mirrors the refund flow.
  await assertVaultCoreVersionSupported(target.vaultCoreVersion);

  const siblings = await discoverSiblings(
    params.lifecycle,
    params.vaultId,
    params.connectedDepositorAddress,
    target,
  );
  // Runs after the status gate, so the refusal reports the still-PENDING
  // status — the same order as submitACK's two preconditions.
  if (params.lifecycle === "presign") {
    await assertAckWindowOpen(params.vaultId, target);
  }
  const { offchainParams, timelockPegin, participantKeys } =
    await readStampedVaultContext(params.vaultId, target);

  return rebuildDepositTermsCore({
    vaultCoreVersion: target.vaultCoreVersion,
    siblings: siblings.map((s) => ({ hashlock: s.hashlock, amount: s.amount })),
    fundedPrePeginTxHex: params.fundedPrePeginTxHex,
    depositorBtcPubkey: processPublicKeyToXOnly(
      params.depositorBtcPubkey,
    ).toLowerCase(),
    vaultProviderBtcPubkey: participantKeys.vaultProvider.operationBtcPubkey,
    vaultKeeperBtcPubkeys: participantKeys.vaultKeeperOperationKeysSorted,
    universalChallengerBtcPubkeys:
      participantKeys.universalChallengerOperationKeysSorted,
    protocolFeeRate: offchainParams.feeRate,
    minPeginFeeRate: offchainParams.minPeginFeeRate,
    councilQuorum: offchainParams.councilQuorum,
    councilSize: offchainParams.securityCouncilKeys.length,
    timelockPegin,
    timelockAssert: Number(offchainParams.timelockAssert),
    timelockRefund: offchainParams.tRefund,
    prepeginTxid: stripHexPrefix(target.prePeginTxHash).toLowerCase(),
    prepeginMaxFee: params.fundedTxFee,
    maxAcceptableCommissionBps: resolveResumeCommissionCeilingBps(
      target,
      offchainParams.minVpCommissionBps,
    ),
    network: getBTCNetworkForWASM(),
  });
}
