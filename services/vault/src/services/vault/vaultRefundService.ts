/**
 * Vault Refund Service
 *
 * Builds and broadcasts the HTLC refund transaction for expired vaults.
 *
 * When a vault expires (ack_timeout, proof_timeout, or activation_timeout),
 * the depositor can reclaim their BTC from the Pre-PegIn HTLC output after
 * timelockRefund Bitcoin blocks have passed, using the refund script (leaf 1).
 */

import type { SignPsbtOptions } from "@babylonlabs-io/ts-sdk/shared";
import {
  buildRefundPsbt,
  createTaprootScriptPathSignOptions,
  getNetworkFees,
  pushTx,
  stripHexPrefix,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { Psbt } from "bitcoinjs-lib";
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
import { fetchVaultById } from "./fetchVaults";
import {
  getSortedUniversalChallengerPubkeys,
  getSortedVaultKeeperPubkeys,
} from "./vaultPayoutSignatureService";

/**
 * Estimated vsize in virtual bytes for a refund transaction:
 * 1 Taproot script-path input (refund leaf) + 1 P2TR output.
 *
 * Breakdown:
 * - Non-witness: version(4) + segwit(2) + inputCount(1) + input(41) + outputCount(1) + P2TR output(43) + locktime(4) = 96 bytes
 * - Witness: stackCount(1) + sig(65) + scriptLen(1) + refundScript(~39) + controlBlockLen(1) + controlBlock(33) = ~140 bytes
 * - vsize = (96 * 4 + 140) / 4 ≈ 131 vbytes — using 160 as a safe margin
 *
 * TODO: Replace with WASM SDK vsize calculation when available.
 */
const REFUND_TX_VSIZE_ESTIMATE = 160;

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

/**
 * Build, sign, and broadcast a refund transaction for an expired vault.
 *
 * Versioning fields (appVaultKeepersVersion, universalChallengersVersion,
 * offchainParamsVersion, vaultProvider, applicationEntryPoint) are fetched
 * from the on-chain BTCVaultRegistry contract — never from the GraphQL indexer —
 * following the same security policy as prepareSigningContext in
 * vaultPayoutSignatureService.ts.
 *
 * Fields not stored on-chain (unsignedPrePeginTx, depositorBtcPubkey) are read
 * from the indexer. hashlock and htlcVout are read from the on-chain contract.
 *
 * The broadcast will be rejected by the network if timelockRefund blocks
 * have not yet passed since the Pre-PegIn transaction was confirmed.
 *
 * @returns The broadcasted refund transaction ID
 * @throws If vault data is missing or the broadcast fails
 */
export async function buildAndBroadcastRefundTransaction(
  params: BroadcastRefundParams,
): Promise<string> {
  const { vaultId, btcWalletProvider, depositorBtcPubkey } = params;

  // Fetch signing-critical versioning fields from the on-chain contract.
  // A compromised indexer could substitute different version numbers and
  // trick the depositor into signing over an attacker-chosen signer set.
  const [onChainVault, indexerVault] = await Promise.all([
    getVaultFromChain(vaultId),
    fetchVaultById(vaultId),
  ]);

  if (!indexerVault) {
    throw new Error(`Vault ${vaultId} not found`);
  }
  // Fetch transaction-critical data from contracts (authoritative source)
  const [protocolReader, keeperReader, challengerReader] = await Promise.all([
    getProtocolParamsReader(),
    getVaultKeeperReader(),
    getUniversalChallengerReader(),
  ]);

  const offchainParams = await protocolReader.getOffchainParamsByVersion(
    onChainVault.offchainParamsVersion,
  );

  const vaultProvider = await fetchVaultProviderById(
    onChainVault.vaultProvider,
  );
  if (!vaultProvider) {
    throw new Error(
      `Vault provider ${onChainVault.vaultProvider} not found. Cannot build refund transaction.`,
    );
  }

  const vaultKeepers = await keeperReader.getVaultKeepersByVersion(
    onChainVault.applicationEntryPoint,
    onChainVault.appVaultKeepersVersion,
  );
  if (vaultKeepers.length === 0) {
    throw new Error(
      `No vault keepers found for version ${onChainVault.appVaultKeepersVersion}`,
    );
  }

  const universalChallengersList =
    await challengerReader.getUniversalChallengersByVersion(
      onChainVault.universalChallengersVersion,
    );
  if (universalChallengersList.length === 0) {
    throw new Error(
      `Universal challengers not found for version ${onChainVault.universalChallengersVersion}`,
    );
  }

  const vaultKeeperPubkeys = getSortedVaultKeeperPubkeys(
    vaultKeepers.map((vk) => ({ btcPubKey: vk.btcPubKey })),
  );
  const universalChallengerPubkeys = getSortedUniversalChallengerPubkeys(
    universalChallengersList.map((uc) => ({ btcPubKey: uc.btcPubKey })),
  );
  const numLocalChallengers = vaultKeeperPubkeys.length;

  const mempoolApiUrl = getMempoolApiUrl();
  const networkFees = await getNetworkFees(mempoolApiUrl);
  const refundFee = BigInt(
    Math.ceil(networkFees.halfHourFee * REFUND_TX_VSIZE_ESTIMATE),
  );

  const { psbtHex } = await buildRefundPsbt({
    prePeginParams: {
      depositorPubkey: stripHexPrefix(depositorBtcPubkey),
      vaultProviderPubkey: stripHexPrefix(vaultProvider.btcPubKey),
      vaultKeeperPubkeys,
      universalChallengerPubkeys,
      hashlocks: [stripHexPrefix(onChainVault.hashlock)],
      timelockRefund: offchainParams.tRefund,
      pegInAmounts: [indexerVault.amount],
      feeRate: offchainParams.feeRate,
      numLocalChallengers,
      councilQuorum: offchainParams.councilQuorum,
      councilSize: offchainParams.securityCouncilKeys.length,
      network: getBTCNetworkForWASM(),
    },
    fundedPrePeginTxHex: stripHexPrefix(indexerVault.unsignedPrePeginTx),
    htlcVout: onChainVault.htlcVout,
    refundFee,
    hashlock: stripHexPrefix(onChainVault.hashlock),
  });

  /** Leaf index of the refund script in the taproot script tree */
  const REFUND_SCRIPT_LEAF_INDEX = 1;
  const signOptions = createTaprootScriptPathSignOptions(
    depositorBtcPubkey,
    REFUND_SCRIPT_LEAF_INDEX,
  );
  const signedPsbtHex = await btcWalletProvider.signPsbt(psbtHex, signOptions);
  const signedPsbt = Psbt.fromHex(signedPsbtHex);

  try {
    signedPsbt.finalizeAllInputs();
  } catch (e: unknown) {
    // Some wallets (e.g. Keystone) finalize inputs during signPsbt.
    // If already finalized, bitcoinjs throws "Input is already finalized".
    // Any other finalization error is a real problem — surface it.
    const message = e instanceof Error ? e.message : String(e);
    if (!message.includes("already finalized")) {
      throw new Error(`Failed to finalize refund PSBT: ${message}`);
    }
  }

  const signedTxHex = signedPsbt.extractTransaction().toHex();

  return pushTx(signedTxHex, mempoolApiUrl);
}
