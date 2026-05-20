/**
 * Vault Refund Service — thin adapter over the SDK's `buildAndBroadcastRefund`.
 *
 * When a vault expires (ack_timeout, proof_timeout, or activation_timeout),
 * the depositor can reclaim their BTC from the Pre-PegIn HTLC output after
 * timelockRefund Bitcoin blocks have passed, using the refund script (leaf 1).
 *
 * Protocol logic (fee math, PSBT build, sign options, finalize, BIP68 error
 * mapping) lives in the SDK. This adapter pre-fetches the mempool fee rate
 * and provides the transport-specific callbacks for reads (on-chain +
 * indexer), signing, and broadcast.
 */

import type { SignPsbtOptions } from "@babylonlabs-io/ts-sdk/shared";
import {
  getNetworkFees,
  getSortedXOnlyPubkeys,
  processPublicKeyToXOnly,
  pushTx,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  buildAndBroadcastRefund,
  type RefundPrePeginContext,
  type VaultBatchEntry,
  type VaultRefundData,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import type { Address, Hex } from "viem";

import { getMempoolApiUrl } from "../../clients/btc/config";
import { getVaultFromChain } from "../../clients/eth-contract/btc-vault-registry/query";
import {
  getProtocolParamsReader,
  getUniversalChallengerReader,
  getVaultKeeperReader,
  getVaultRegistryReader,
} from "../../clients/eth-contract/sdk-readers";
import { getBTCNetworkForWASM } from "../../config/pegin";

import { fetchVaultProviderById } from "./fetchVaultProviders";
import { fetchVaultRefundData, fetchVaultsByDepositor } from "./fetchVaults";

export interface BroadcastRefundParams {
  vaultId: Hex;
  /**
   * Depositor's Ethereum address. Used to discover sibling vaults that
   * share a batched Pre-PegIn transaction (Aave-split deposits, etc.)
   * so the WASM refund template is reconstructed against the full HTLC
   * vector rather than just the target vault's single hashlock.
   */
  depositorAddress: Address;
  btcWalletProvider: {
    signPsbt: (psbtHex: string, options?: SignPsbtOptions) => Promise<string>;
  };
  depositorBtcPubkey: string;
  feeRate: number;
  signal?: AbortSignal;
}

export interface RefundPreview {
  amountSats: bigint;
  /**
   * Mempool's halfHourFee, or null if the fee endpoint failed. Vault data
   * loads independently — a fee fetch failure must not block the refund.
   */
  halfHourFeeSatsVb: number | null;
}

export async function getRefundPreview(vaultId: Hex): Promise<RefundPreview> {
  const mempoolApiUrl = getMempoolApiUrl();
  const [target, feeRecommendation] = await Promise.all([
    readTargetVault(vaultId),
    getNetworkFees(mempoolApiUrl).catch(() => null),
  ]);
  return {
    amountSats: target.onChainVault.amount,
    halfHourFeeSatsVb:
      feeRecommendation && feeRecommendation.halfHourFee > 0
        ? feeRecommendation.halfHourFee
        : null,
  };
}

interface TargetVaultData {
  onChainVault: Awaited<ReturnType<typeof getVaultFromChain>>;
  unsignedPrePeginTx: Hex;
  depositorBtcPubkey: Hex;
}

/**
 * Read the target vault's on-chain + indexer data without doing sibling
 * discovery. Shared by the refund-preview path (which only needs amount)
 * and the broadcast path (which then derives the full sibling batch).
 */
async function readTargetVault(vaultId: Hex): Promise<TargetVaultData> {
  // Signing-critical fields come from the on-chain contract — a compromised
  // indexer could otherwise substitute a different signer set, amount, or
  // transaction. From the indexer we pull only the Pre-PegIn tx hex (not
  // stored on-chain) and the depositor's BTC pubkey (overridden by the
  // caller's wallet key before signing). The amount comes from the contract.
  // The Pre-PegIn tx hex is validated against the on-chain prePeginTxHash.
  const [onChainVault, indexerRefundData] = await Promise.all([
    getVaultFromChain(vaultId),
    fetchVaultRefundData(vaultId),
  ]);
  if (!indexerRefundData) {
    throw new Error(`Vault ${vaultId} not found`);
  }

  // Validate that the indexer-provided Pre-PegIn tx matches the on-chain hash.
  // The tx hash commits to all inputs and outputs, so a substituted transaction
  // would produce a different hash. SegWit txid excludes witness data, so
  // hash(unsignedTx) === hash(signedTx) === prePeginTxHash.
  const computedTxHash = calculateBtcTxHash(
    indexerRefundData.unsignedPrePeginTx,
  );
  if (
    computedTxHash.toLowerCase() !== onChainVault.prePeginTxHash.toLowerCase()
  ) {
    throw new Error(
      `Pre-PegIn transaction hash mismatch: computed ${computedTxHash} from indexer tx, ` +
        `but on-chain contract has ${onChainVault.prePeginTxHash}. ` +
        `Aborting refund to prevent potential attack.`,
    );
  }

  return {
    onChainVault,
    unsignedPrePeginTx: indexerRefundData.unsignedPrePeginTx,
    depositorBtcPubkey: indexerRefundData.depositorBtcPubkey,
  };
}

/**
 * Discover and validate the full vout-ordered HTLC vector for the
 * funded Pre-PegIn that this vault belongs to.
 *
 * For a single-vault deposit the returned batch is length 1. For a
 * batched deposit (e.g. an Aave split that committed two vaults to one
 * Pre-PegIn) every sibling sharing the target's `prePeginTxHash` is
 * pulled from chain so the WASM refund template can be reconstructed
 * with the exact (hashlocks, amounts) vector the funded tx commits to.
 *
 * Sibling membership is decided by on-chain `prePeginTxHash` equality,
 * not by indexer hex comparison — that way a stale or compromised
 * indexer cannot fabricate or drop siblings. The indexer is only used
 * to enumerate the depositor's vault IDs; each candidate's authoritative
 * hashlock / htlcVout / amount comes from the contract.
 */
async function discoverBatch(
  target: TargetVaultData,
  targetVaultId: Hex,
  depositorAddress: Address,
): Promise<ReadonlyArray<VaultBatchEntry>> {
  const targetPrePeginTxHash = target.onChainVault.prePeginTxHash.toLowerCase();
  const depositorVaults = await fetchVaultsByDepositor(depositorAddress);

  const targetIdLower = targetVaultId.toLowerCase();
  const candidateIds = depositorVaults
    .map((v) => v.id)
    .filter((id) => id.toLowerCase() !== targetIdLower);

  const candidateOnChain = await Promise.all(
    candidateIds.map((id) => getVaultFromChain(id)),
  );

  const siblings: VaultBatchEntry[] = [
    {
      hashlock: target.onChainVault.hashlock,
      amount: target.onChainVault.amount,
      htlcVout: target.onChainVault.htlcVout,
    },
  ];
  for (let i = 0; i < candidateIds.length; i++) {
    const sib = candidateOnChain[i];
    if (sib.prePeginTxHash.toLowerCase() !== targetPrePeginTxHash) continue;
    siblings.push({
      hashlock: sib.hashlock,
      amount: sib.amount,
      htlcVout: sib.htlcVout,
    });
  }

  siblings.sort((a, b) => a.htlcVout - b.htlcVout);

  // Strict invariant: the vector must cover [0, N-1] without gaps or
  // duplicates. The WASM template uses these positions directly; a gap
  // would silently mis-align with the funded tx's outputs.
  for (let i = 0; i < siblings.length; i++) {
    if (siblings[i].htlcVout !== i) {
      const observed = siblings.map((s) => s.htlcVout).join(", ");
      throw new Error(
        `Sibling vault discovery produced a non-contiguous HTLC vector ` +
          `for prePeginTxHash ${targetPrePeginTxHash}: expected vouts ` +
          `[0..${siblings.length - 1}], observed [${observed}]. ` +
          `Refund refused — sibling set incomplete or indexer out of sync.`,
      );
    }
  }
  return siblings;
}

async function readVaultForRefund(
  vaultId: Hex,
  depositorAddress: Address,
): Promise<VaultRefundData> {
  const target = await readTargetVault(vaultId);
  const batch = await discoverBatch(target, vaultId, depositorAddress);

  return {
    hashlock: target.onChainVault.hashlock,
    htlcVout: target.onChainVault.htlcVout,
    offchainParamsVersion: target.onChainVault.offchainParamsVersion,
    appVaultKeepersVersion: target.onChainVault.appVaultKeepersVersion,
    universalChallengersVersion:
      target.onChainVault.universalChallengersVersion,
    vaultProvider: target.onChainVault.vaultProvider,
    applicationEntryPoint: target.onChainVault.applicationEntryPoint,
    amount: target.onChainVault.amount,
    unsignedPrePeginTxHex: target.unsignedPrePeginTx,
    depositorBtcPubkey: target.depositorBtcPubkey,
    batch,
  };
}

async function readPrePeginContext(
  vault: VaultRefundData,
): Promise<RefundPrePeginContext> {
  const [protocolReader, keeperReader, challengerReader] = await Promise.all([
    getProtocolParamsReader(),
    getVaultKeeperReader(),
    getUniversalChallengerReader(),
  ]);

  const [
    offchainParams,
    vaultProvider,
    vaultProviderOnChainPubkey,
    vaultKeepers,
    universalChallengersList,
  ] = await Promise.all([
    protocolReader.getOffchainParamsByVersion(vault.offchainParamsVersion),
    fetchVaultProviderById(vault.vaultProvider),
    getVaultRegistryReader().getVaultProviderBtcPubKey(
      vault.vaultProvider as Address,
    ),
    keeperReader.getVaultKeepersByVersion(
      vault.applicationEntryPoint,
      vault.appVaultKeepersVersion,
    ),
    challengerReader.getUniversalChallengersByVersion(
      vault.universalChallengersVersion,
    ),
  ]);

  if (!vaultProvider) {
    throw new Error(
      `Vault provider ${vault.vaultProvider} not found. Cannot build refund transaction.`,
    );
  }
  if (vaultKeepers.length === 0) {
    throw new Error(
      `No vault keepers found for version ${vault.appVaultKeepersVersion}`,
    );
  }
  if (universalChallengersList.length === 0) {
    throw new Error(
      `Universal challengers not found for version ${vault.universalChallengersVersion}`,
    );
  }

  // Cross-check the GraphQL-supplied VP pubkey against the chain-registered
  // value. A stale or compromised indexer could otherwise substitute a
  // different key and produce a refund signed against a Taproot script tree
  // that doesn't match the actual vault.
  const indexerXOnly = processPublicKeyToXOnly(
    vaultProvider.btcPubKey,
  ).toLowerCase();
  if (indexerXOnly !== vaultProviderOnChainPubkey.toLowerCase()) {
    throw new Error(
      `Indexer vault provider key for ${vault.vaultProvider} does not match on-chain registry. Aborting refund.`,
    );
  }

  const vaultKeeperPubkeys = getSortedXOnlyPubkeys(
    vaultKeepers.map((vk) => vk.btcPubKey),
  );
  const universalChallengerPubkeys = getSortedXOnlyPubkeys(
    universalChallengersList.map((uc) => uc.btcPubKey),
  );

  return {
    vaultProviderPubkey: vaultProviderOnChainPubkey,
    vaultKeeperPubkeys,
    universalChallengerPubkeys,
    timelockRefund: offchainParams.tRefund,
    feeRate: offchainParams.feeRate,
    numLocalChallengers: vaultKeeperPubkeys.length,
    councilQuorum: offchainParams.councilQuorum,
    councilSize: offchainParams.securityCouncilKeys.length,
    network: getBTCNetworkForWASM(),
  };
}

/**
 * Build, sign, and broadcast a refund transaction for an expired vault.
 *
 * The broadcast will be rejected by the Bitcoin network if timelockRefund
 * blocks have not yet passed since the Pre-PegIn transaction was confirmed;
 * in that case the SDK throws {@link BIP68NotMatureError}.
 *
 * @returns The broadcasted refund transaction ID
 * @throws If vault data is missing or the broadcast fails
 */
export async function buildAndBroadcastRefundTransaction(
  params: BroadcastRefundParams,
): Promise<string> {
  const {
    vaultId,
    depositorAddress,
    btcWalletProvider,
    depositorBtcPubkey,
    feeRate,
    signal,
  } = params;
  const mempoolApiUrl = getMempoolApiUrl();

  // Override indexer-provided depositor pubkey with the caller's wallet key —
  // the wallet is the authoritative source for the depositor's signing key.
  const { txId } = await buildAndBroadcastRefund({
    vaultId,
    readVault: async () => {
      const data = await readVaultForRefund(vaultId, depositorAddress);
      return { ...data, depositorBtcPubkey };
    },
    readPrePeginContext: (vault) => readPrePeginContext(vault),
    feeRate,
    signPsbt: (psbtHex, options) =>
      btcWalletProvider.signPsbt(psbtHex, options),
    broadcastTx: async (signedTxHex) => ({
      txId: await pushTx(signedTxHex, mempoolApiUrl),
    }),
    signal,
  });

  return txId;
}
