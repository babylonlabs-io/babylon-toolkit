/**
 * Vault Refund Service
 *
 * Builds and broadcasts the HTLC refund transaction for expired vaults.
 *
 * When a vault expires (ack_timeout, proof_timeout, or activation_timeout),
 * the depositor can reclaim their BTC from the Pre-PegIn HTLC output after
 * timelockRefund Bitcoin blocks have passed, using the refund script (leaf 1).
 */

import {
  buildRefundPsbt,
  getNetworkFees,
  pushTx,
  stripHexPrefix,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { Psbt } from "bitcoinjs-lib";
import type { Hex } from "viem";

import { getMempoolApiUrl } from "../../clients/btc/config";
import { getOffchainParamsByVersion } from "../../clients/eth-contract/protocol-params";
import { getBTCNetworkForWASM } from "../../config/pegin";
import { fetchAllUniversalChallengers } from "../providers";
import { fetchVaultKeepersByVersion } from "../providers/fetchProviders";

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
 */
const REFUND_TX_VSIZE_ESTIMATE = 160;

export interface BroadcastRefundParams {
  /** Vault ID (pegin tx hash) */
  vaultId: Hex;
  /** BTC wallet provider for signing */
  btcWalletProvider: {
    signPsbt: (psbtHex: string) => Promise<string>;
  };
}

/**
 * Build, sign, and broadcast a refund transaction for an expired vault.
 *
 * Fetches all required data from the indexer and contract, reconstructs the
 * Pre-PegIn HTLC, builds the refund PSBT using the refund script (leaf 1),
 * signs it via the depositor's BTC wallet, and broadcasts to Bitcoin.
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
  const { vaultId, btcWalletProvider } = params;

  const vault = await fetchVaultById(vaultId);
  if (!vault) {
    throw new Error(`Vault ${vaultId} not found`);
  }
  if (!vault.unsignedPrePeginTx) {
    throw new Error(
      "Pre-PegIn transaction not available for this vault. Cannot build refund transaction.",
    );
  }
  if (!vault.hashlock) {
    throw new Error(
      "Vault hashlock not found. Cannot reconstruct the HTLC for the refund transaction.",
    );
  }

  const offchainParams = await getOffchainParamsByVersion(
    vault.offchainParamsVersion,
  );

  const vaultProvider = await fetchVaultProviderById(vault.vaultProvider);
  if (!vaultProvider) {
    throw new Error(
      `Vault provider ${vault.vaultProvider} not found. Cannot build refund transaction.`,
    );
  }

  const vaultKeepers = await fetchVaultKeepersByVersion(
    vault.applicationEntryPoint,
    vault.appVaultKeepersVersion,
  );
  if (vaultKeepers.length === 0) {
    throw new Error(
      `No vault keepers found for version ${vault.appVaultKeepersVersion}`,
    );
  }

  const ucData = await fetchAllUniversalChallengers();
  const universalChallengersList =
    ucData.byVersion.get(vault.universalChallengersVersion) ?? [];
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
  const numLocalChallengers = vaultKeeperPubkeys.length;

  const mempoolApiUrl = getMempoolApiUrl();
  const networkFees = await getNetworkFees(mempoolApiUrl);
  const refundFee = BigInt(
    Math.ceil(networkFees.halfHourFee * REFUND_TX_VSIZE_ESTIMATE),
  );

  const { psbtHex } = await buildRefundPsbt({
    prePeginParams: {
      depositorPubkey: stripHexPrefix(vault.depositorBtcPubkey),
      vaultProviderPubkey: stripHexPrefix(vaultProvider.btcPubKey),
      vaultKeeperPubkeys,
      universalChallengerPubkeys,
      hashlocks: [stripHexPrefix(vault.hashlock)],
      timelockRefund: offchainParams.tRefund,
      pegInAmount: vault.amount,
      feeRate: offchainParams.feeRate,
      numLocalChallengers,
      councilQuorum: offchainParams.councilQuorum,
      councilSize: offchainParams.securityCouncilKeys.length,
      network: getBTCNetworkForWASM(),
    },
    fundedPrePeginTxHex: stripHexPrefix(vault.unsignedPrePeginTx),
    htlcVout: vault.htlcVout,
    refundFee,
    hashlock: stripHexPrefix(vault.hashlock),
  });

  const signedPsbtHex = await btcWalletProvider.signPsbt(psbtHex);
  const signedPsbt = Psbt.fromHex(signedPsbtHex);

  try {
    signedPsbt.finalizeAllInputs();
  } catch {
    // Some wallets finalize automatically
  }

  const signedTxHex = signedPsbt.extractTransaction().toHex();

  return pushTx(signedTxHex, mempoolApiUrl);
}
