/**
 * Rebuild a {@link DepositTerms} on the resume-broadcast path (#2220 Part 2).
 *
 * On a fresh deposit the terms are still in memory from `preparePegin`. On a
 * resume — including a different browser / private mode — they are gone, so an
 * intent (Ledger) wallet has nothing to approve. This reconstructs them from
 * chain + WASM ONLY (never browser storage): every field is chain-derivable at
 * the vault's STAMPED version, except the depositor commission ceiling (interim
 * proxy — see {@link resolveMaxAcceptableCommissionBps} + #2252).
 *
 * This orchestrator does the CHAIN READS + sibling discovery only; the pure
 * WASM-recompute + Gate 1 byte-match + projection live in ts-sdk
 * `rebuildDepositTermsCore` (unit-testable, no chain). btc-vault is the protocol
 * source of truth. Design: `todo/ledger/2220-part2-resume-rebuild-design.md`.
 *
 * NOTE (drift): sibling discovery mirrors `discoverBatch` (vaultRefundService)
 * and the stamped reads mirror `prepareSigningContext` (vaultPayoutSignatureService).
 * A shared helper is the anti-drift move; deferred so this PR does not refactor
 * payout/refund code.
 */

import {
  processPublicKeyToXOnly,
  rebuildDepositTermsCore,
  resolveParticipantKeysAtEpochs,
  stripHexPrefix,
  type DepositTerms,
  type RebuildSibling,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Address, Hex } from "viem";

import { assertVaultCoreVersionSupported } from "@/utils/vaultCoreVersionSupport";

import {
  getVaultFromChain,
  getVaultKeyEpochsFromChain,
} from "../../clients/eth-contract/btc-vault-registry/query";
import {
  getOperationKeyReader,
  getProtocolParamsReader,
  getUniversalChallengerReader,
  getVaultKeeperReader,
  getVaultRegistryReader,
} from "../../clients/eth-contract/sdk-readers";
import { getBTCNetworkForWASM } from "../../config/pegin";

import { fetchVaultIdsByDepositor } from "./fetchVaults";
import { resolveMaxAcceptableCommissionBps } from "./resolveMaxAcceptableCommissionBps";
import { resolveVaultProviderBtcPubkey } from "./vaultPayoutSignatureService";

export interface RebuildDepositTermsParams {
  /** The vault being resumed (any sibling of a batch). */
  vaultId: Hex;
  /** Funded Pre-PegIn tx hex — already hash-verified against on-chain prePeginTxHash by the caller (Gate 0). */
  fundedPrePeginTxHex: string;
  /**
   * Connected wallet's ETH address, when available — a sanity check that it equals
   * the on-chain depositor (defense-in-depth vs a stale wallet switch). Sibling
   * enumeration always uses the authoritative on-chain depositor, so this is optional.
   */
  connectedDepositorAddress?: Address;
  /** Depositor BTC pubkey (from the broadcast context) — the identity the HTLC scripts + PSBT are signed with. */
  depositorBtcPubkey: string;
  /**
   * The funded Pre-PegIn tx fee (Σ input prevout values − Σ outputs), a WALLET-level
   * fee distinct from the per-vault graph `peginMaxFee`. The caller computes it from the
   * prevouts it already resolves for broadcast (Gate 3); it becomes `DepositTerms.prepeginMaxFee`,
   * the bound the device enforces (`fee ≤ prepegin_max_fee`).
   */
  fundedTxFee: bigint;
}

interface OrderedSibling extends RebuildSibling {
  htlcVout: number;
}

/**
 * Discover the complete sibling set sharing this vault's Pre-PegIn tx, ordered by
 * on-chain htlcVout, fail-closed. Mirrors `discoverBatch` (vaultRefundService).
 * Membership is by on-chain `prePeginTxHash` equality, not indexer hex — a stale
 * indexer can only enumerate ids, never fabricate/drop a sibling. The OP_RETURN
 * completeness anchor runs in `rebuildDepositTermsCore` (it holds the funded tx).
 */
async function discoverSiblings(
  targetVaultId: Hex,
  targetPrePeginTxHash: Hex,
  connectedDepositor: Address | undefined,
  onChainDepositor: Address,
  target: OrderedSibling,
): Promise<OrderedSibling[]> {
  if (
    connectedDepositor !== undefined &&
    onChainDepositor.toLowerCase() !== connectedDepositor.toLowerCase()
  ) {
    throw new Error(
      `Vault ${targetVaultId} is owned by ${onChainDepositor}, but the connected ` +
        `wallet is ${connectedDepositor}. Connect with the depositor wallet to resume.`,
    );
  }

  const txHashLower = targetPrePeginTxHash.toLowerCase();
  const targetIdLower = targetVaultId.toLowerCase();
  const depositorVaultIds = await fetchVaultIdsByDepositor(onChainDepositor);
  const candidateIds = depositorVaultIds.filter(
    (id) => id.toLowerCase() !== targetIdLower,
  );

  // Lean prePeginTxHash-only multicall first, so the fully-validated read (which
  // fail-closes on a bad stamped vaultCoreVersion) runs only for actual siblings.
  const candidateInfos =
    await getVaultRegistryReader().getProtocolInfoBatch(candidateIds);
  const siblingIds = candidateIds.filter(
    (_, i) => candidateInfos[i].prePeginTxHash.toLowerCase() === txHashLower,
  );
  const siblingOnChain = await Promise.all(
    siblingIds.map((id) => getVaultFromChain(id)),
  );

  const siblings: OrderedSibling[] = [target];
  for (const sib of siblingOnChain) {
    if (sib.prePeginTxHash.toLowerCase() !== txHashLower) continue;
    siblings.push({
      hashlock: sib.hashlock,
      amount: sib.amount,
      htlcVout: sib.htlcVout,
    });
  }
  siblings.sort((a, b) => a.htlcVout - b.htlcVout);

  // Contiguity: cover [0, N-1] with no gaps/dupes — the core (and buildDepositTerms)
  // derive htlcVout from array position, so a gap would mis-align with the funded tx.
  for (let i = 0; i < siblings.length; i++) {
    if (siblings[i].htlcVout !== i) {
      throw new Error(
        `Sibling discovery produced a non-contiguous HTLC vector ` +
          `(${siblings.map((s) => s.htlcVout).join(", ")}); resume refused.`,
      );
    }
  }

  return siblings;
}

export async function rebuildDepositTerms(
  params: RebuildDepositTermsParams,
): Promise<DepositTerms> {
  const target = await getVaultFromChain(params.vaultId);

  // Fail closed with a friendly "update the app" message BEFORE any wallet popup
  // if this build's WASM cannot construct the vault's stamped version (mirrors the
  // refund flow). Vendor-neutral — not a Ledger-specific guard.
  await assertVaultCoreVersionSupported(target.vaultCoreVersion);

  const siblings = await discoverSiblings(
    params.vaultId,
    target.prePeginTxHash,
    params.connectedDepositorAddress,
    target.depositor,
    {
      hashlock: target.hashlock,
      amount: target.amount,
      htlcVout: target.htlcVout,
    },
  );

  // ---- Shared stamped-version reads (mirror prepareSigningContext) ----
  const protocolParamsReader = await getProtocolParamsReader();
  const offchainParams = await protocolParamsReader.getOffchainParamsByVersion(
    target.offchainParamsVersion,
  );
  const timelockPegin = await protocolParamsReader.getTimelockPeginByVersion(
    target.offchainParamsVersion,
  );

  const vaultKeeperReader = await getVaultKeeperReader();
  const vaultKeepers = await vaultKeeperReader.getVaultKeepersByVersion(
    target.applicationEntryPoint,
    target.appVaultKeepersVersion,
  );
  if (vaultKeepers.length === 0) {
    throw new Error(
      `No vault keepers for version ${target.appVaultKeepersVersion}`,
    );
  }
  const universalChallengerReader = await getUniversalChallengerReader();
  const universalChallengers =
    await universalChallengerReader.getUniversalChallengersByVersion(
      target.universalChallengersVersion,
    );
  if (universalChallengers.length === 0) {
    throw new Error(
      `No universal challengers for version ${target.universalChallengersVersion}`,
    );
  }

  const registrationVpBtcPubkey = await resolveVaultProviderBtcPubkey(
    target.vaultProvider,
    undefined,
  );
  const operationKeyReader = await getOperationKeyReader();
  const epochs = await getVaultKeyEpochsFromChain(params.vaultId);
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
    maxAcceptableCommissionBps: resolveMaxAcceptableCommissionBps(target),
    network: getBTCNetworkForWASM(),
  });
}
