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
import { getNetworkFees, pushTx } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  buildAndBroadcastRefund,
  estimateRefundFeeSats,
  type RefundPrePeginContext,
  type VaultRefundData,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";
import type { Hex } from "viem";

import { getMempoolApiUrl } from "../../clients/btc/config";
import { getVaultFromChain } from "../../clients/eth-contract/btc-vault-registry/query";
import {
  getProtocolParamsReader,
  getUniversalChallengerReader,
  getVaultKeeperReader,
} from "../../clients/eth-contract/sdk-readers";
import { getBTCNetworkForWASM } from "../../config/pegin";

import { fetchVaultProviderById } from "./fetchVaultProviders";
import { fetchVaultRefundData } from "./fetchVaults";
import {
  getSortedUniversalChallengerPubkeys,
  getSortedVaultKeeperPubkeys,
} from "./vaultPayoutSignatureService";

export interface BroadcastRefundParams {
  vaultId: Hex;
  btcWalletProvider: {
    signPsbt: (psbtHex: string, options?: SignPsbtOptions) => Promise<string>;
  };
  depositorBtcPubkey: string;
  feeRate: number;
}

// Re-export the SDK helper so the UI can compute the same fee the SDK will
// charge without duplicating the protocol-owned vsize constant.
export const getRefundNetworkFeeSats = estimateRefundFeeSats;

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
  const [vault, feeRecommendation] = await Promise.all([
    readVault(vaultId),
    getNetworkFees(mempoolApiUrl).catch(() => null),
  ]);
  return {
    amountSats: vault.amount,
    halfHourFeeSatsVb:
      feeRecommendation && feeRecommendation.halfHourFee > 0
        ? feeRecommendation.halfHourFee
        : null,
  };
}

async function readVault(vaultId: Hex): Promise<VaultRefundData> {
  // Versioning fields, hashlock, and htlcVout come from the on-chain contract
  // — a compromised indexer could otherwise substitute a different signer set.
  // From the indexer we pull only what refund actually needs: amount + the
  // funded Pre-PegIn tx hex + the depositor's BTC pubkey. Using a minimal
  // query (not the full Vault projection) avoids refund being blocked by
  // indexer schema drift on unrelated fields such as `depositorWotsPkHash`.
  const [onChainVault, indexerRefundData] = await Promise.all([
    getVaultFromChain(vaultId),
    fetchVaultRefundData(vaultId),
  ]);
  if (!indexerRefundData) {
    throw new Error(`Vault ${vaultId} not found`);
  }
  return {
    hashlock: onChainVault.hashlock,
    htlcVout: onChainVault.htlcVout,
    offchainParamsVersion: onChainVault.offchainParamsVersion,
    appVaultKeepersVersion: onChainVault.appVaultKeepersVersion,
    universalChallengersVersion: onChainVault.universalChallengersVersion,
    vaultProvider: onChainVault.vaultProvider,
    applicationEntryPoint: onChainVault.applicationEntryPoint,
    amount: indexerRefundData.amount,
    unsignedPrePeginTxHex: indexerRefundData.unsignedPrePeginTx,
    depositorBtcPubkey: indexerRefundData.depositorBtcPubkey,
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
    vaultKeepers,
    universalChallengersList,
  ] = await Promise.all([
    protocolReader.getOffchainParamsByVersion(vault.offchainParamsVersion),
    fetchVaultProviderById(vault.vaultProvider),
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

  const vaultKeeperPubkeys = getSortedVaultKeeperPubkeys(
    vaultKeepers.map((vk) => ({ btcPubKey: vk.btcPubKey })),
  );
  const universalChallengerPubkeys = getSortedUniversalChallengerPubkeys(
    universalChallengersList.map((uc) => ({ btcPubKey: uc.btcPubKey })),
  );

  return {
    vaultProviderPubkey: vaultProvider.btcPubKey,
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
  const { vaultId, btcWalletProvider, depositorBtcPubkey, feeRate } = params;
  const mempoolApiUrl = getMempoolApiUrl();

  // Override indexer-provided depositor pubkey with the caller's wallet key —
  // the wallet is the authoritative source for the depositor's signing key.
  const { txId } = await buildAndBroadcastRefund({
    vaultId,
    readVault: async () => {
      const data = await readVault(vaultId);
      return { ...data, depositorBtcPubkey };
    },
    readPrePeginContext: (vault) => readPrePeginContext(vault),
    feeRate,
    signPsbt: (psbtHex, options) =>
      btcWalletProvider.signPsbt(psbtHex, options),
    broadcastTx: async (signedTxHex) => ({
      txId: await pushTx(signedTxHex, mempoolApiUrl),
    }),
  });

  return txId;
}
