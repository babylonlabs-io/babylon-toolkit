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
  /**
   * sat/vB fee rate to use for the refund tx. Caller chooses (defaults to
   * mempool's `halfHourFee` in the UI; user can edit it before confirming).
   */
  feeRate: number;
}

/**
 * Conservative upper bound on the refund tx vsize. Mirrors `REFUND_VSIZE = 160`
 * in `@babylonlabs-io/ts-sdk/.../buildAndBroadcastRefund.ts`. Kept here so the
 * UI can compute the network fee for the review card without invoking the
 * broadcast path. Keep these two constants in lock-step.
 */
const REFUND_VSIZE_BYTES = 160;

/**
 * Network fee (sats) for the refund tx at the given sat/vB rate.
 * Pure helper used by the review card to derive `BTC Network Fee` and
 * `You'll receive` from a user-edited fee rate.
 */
export function getRefundNetworkFeeSats(feeRateSatsVb: number): bigint {
  if (!Number.isFinite(feeRateSatsVb) || feeRateSatsVb <= 0) {
    throw new Error(
      `feeRateSatsVb must be a positive finite number, got ${feeRateSatsVb}`,
    );
  }
  return BigInt(Math.ceil(feeRateSatsVb * REFUND_VSIZE_BYTES));
}

export interface RefundPreview {
  /** Pre-PegIn HTLC output value being refunded, in sats. */
  amountSats: bigint;
  /** Mempool's recommended sat/vB rate for ~30-min confirmation. */
  halfHourFeeSatsVb: number;
}

/**
 * Fetch the data needed to render the Review Refund card: the HTLC output
 * value (refund amount) and the current mempool half-hour fee rate.
 */
export async function getRefundPreview(vaultId: Hex): Promise<RefundPreview> {
  const mempoolApiUrl = getMempoolApiUrl();
  const [vault, { halfHourFee }] = await Promise.all([
    readVault(vaultId),
    getNetworkFees(mempoolApiUrl),
  ]);
  return {
    amountSats: vault.amount,
    halfHourFeeSatsVb: halfHourFee,
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
