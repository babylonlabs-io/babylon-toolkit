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
  type RefundPrePeginContext,
  type VaultRefundData,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
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
  /** Vault ID: keccak256(abi.encode(peginTxHash, depositor)) */
  vaultId: Hex;
  /** BTC wallet provider for signing */
  btcWalletProvider: {
    signPsbt: (psbtHex: string, options?: SignPsbtOptions) => Promise<string>;
  };
  /** Depositor's BTC public key (compressed or x-only hex) for signing options */
  depositorBtcPubkey: string;
}

async function readVault(vaultId: Hex): Promise<VaultRefundData> {
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
    hashlock: onChainVault.hashlock,
    htlcVout: onChainVault.htlcVout,
    offchainParamsVersion: onChainVault.offchainParamsVersion,
    appVaultKeepersVersion: onChainVault.appVaultKeepersVersion,
    universalChallengersVersion: onChainVault.universalChallengersVersion,
    vaultProvider: onChainVault.vaultProvider,
    applicationEntryPoint: onChainVault.applicationEntryPoint,
    amount: onChainVault.amount,
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
  const { vaultId, btcWalletProvider, depositorBtcPubkey } = params;
  const mempoolApiUrl = getMempoolApiUrl();

  // Pre-fetch the mempool fee rate — it doesn't depend on any value the SDK
  // computes, so passing it in keeps the SDK's orchestration honest.
  const { halfHourFee } = await getNetworkFees(mempoolApiUrl);

  // Override indexer-provided depositor pubkey with the caller's wallet key —
  // the wallet is the authoritative source for the depositor's signing key.
  const { txId } = await buildAndBroadcastRefund({
    vaultId,
    readVault: async () => {
      const data = await readVault(vaultId);
      return { ...data, depositorBtcPubkey };
    },
    readPrePeginContext: (vault) => readPrePeginContext(vault),
    feeRate: halfHourFee,
    signPsbt: (psbtHex, options) =>
      btcWalletProvider.signPsbt(psbtHex, options),
    broadcastTx: async (signedTxHex) => ({
      txId: await pushTx(signedTxHex, mempoolApiUrl),
    }),
  });

  return txId;
}
