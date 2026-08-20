/**
 * Close the loop from a verified reconstruction to the ordinary refund path
 * (#2203).
 *
 * `buildAndBroadcastRefund` takes its two reads — the vault row and the
 * version-pinned Pre-PegIn context — as injected callbacks rather than
 * performing them itself. That is the whole seam recovery needs: a stranded
 * deposit has no row to read, but it does have a reconstruction that was
 * byte-verified against the funded transaction, and those are exactly the
 * fields the callbacks are expected to return.
 *
 * So recovery does not need a parallel refund implementation, and must not
 * have one. It supplies the same shapes from a different source and reuses the
 * orchestrator verbatim, which keeps the refund-fee cap, the abort checks, the
 * `htlcVout` contiguity invariant and the bitcoind error classification in one
 * place for both paths.
 *
 * @module recovery/toRefundInputs
 */

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import type { Address, Hex } from "viem";

import { ensureHexPrefix } from "../primitives/utils/bitcoin";
import type {
  RefundPrePeginContext,
  VaultRefundData,
} from "../services/refund/buildAndBroadcastRefund";

import type { ReconstructPeginParamsResult } from "./reconstructPeginParams";

export interface ToRefundInputsOptions {
  /**
   * Which sibling of the Pre-PegIn to refund, as an index into the
   * reconstruction's hashlocks and amounts. Equal to the vault's `htlcVout`
   * by construction — `PeginManager` asserts `perVault[i].htlcVout === i`.
   */
  htlcVout: number;
  /**
   * Depositor x-only BTC pubkey, the same value the reconstruction was run
   * with. Passed through rather than re-derived so the refund is built against
   * the key that was actually verified.
   */
  depositorBtcPubkey: string;
  /**
   * The vault provider's application entry point. Not recoverable from the
   * Bitcoin transaction and not part of the verified parameter set — it is a
   * field of the vault-provider registry row, which is address-keyed and
   * survives the reorg untouched.
   */
  applicationEntryPoint: Address;
  /** Funded Pre-PegIn transaction hex, `0x` optional. */
  fundedPrePeginTxHex: string;
  /** Hashlocks indexed by `htlcVout`, as passed to the reconstruction. */
  hashlocks: readonly string[];
  /**
   * The Bitcoin network the reconstruction was verified against. An input to
   * the search rather than an output of it, so it is restated here; passing a
   * different one would build the refund against a different script tree than
   * the one that was proven to match.
   */
  network: Network;
}

export interface RefundInputsFromRecovery {
  vault: VaultRefundData;
  context: RefundPrePeginContext;
}

/**
 * Project a verified reconstruction into the two shapes
 * `buildAndBroadcastRefund` injects.
 *
 * Every value here comes from a parameter set that has already been
 * byte-matched against the funded transaction's HTLC outputs, so this is a
 * projection and not a second validation pass. The orchestrator re-checks the
 * parts it owns regardless.
 *
 * @throws If `htlcVout` does not index the reconstructed batch, or the
 *   hashlock vector disagrees with the reconstructed amounts.
 */
export function toRefundInputs(
  result: ReconstructPeginParamsResult,
  options: ToRefundInputsOptions,
): RefundInputsFromRecovery {
  const {
    htlcVout,
    depositorBtcPubkey,
    applicationEntryPoint,
    fundedPrePeginTxHex,
    hashlocks,
    network,
  } = options;

  const { candidate, peginAmounts } = result;
  const { offchainParams, participants } = candidate;

  if (hashlocks.length !== peginAmounts.length) {
    throw new Error(
      `toRefundInputs: ${hashlocks.length} hashlock(s) but ` +
        `${peginAmounts.length} reconstructed amount(s); the reconstruction ` +
        `and the hashlock vector describe different transactions.`,
    );
  }
  if (
    !Number.isInteger(htlcVout) ||
    htlcVout < 0 ||
    htlcVout >= peginAmounts.length
  ) {
    throw new Error(
      `toRefundInputs: htlcVout ${htlcVout} is outside the reconstructed ` +
        `batch of ${peginAmounts.length} vault(s).`,
    );
  }

  // The orchestrator requires the complete vout-ordered batch, not just the
  // target: its anchor check is fail-closed, so refunding one sibling of a
  // multi-vault Pre-PegIn without the others is rejected outright.
  const batch = peginAmounts.map((amount, index) => ({
    hashlock: ensureHexPrefix(hashlocks[index]),
    amount,
    htlcVout: index,
  }));

  const vault: VaultRefundData = {
    vaultCoreVersion: candidate.vaultCoreVersion,
    hashlock: batch[htlcVout].hashlock as Hex,
    htlcVout,
    offchainParamsVersion: offchainParams.version,
    appVaultKeepersVersion: participants.appVaultKeepersVersion,
    universalChallengersVersion: participants.universalChallengersVersion,
    vaultProvider: participants.vaultProvider,
    applicationEntryPoint,
    amount: peginAmounts[htlcVout],
    unsignedPrePeginTxHex: fundedPrePeginTxHex,
    depositorBtcPubkey,
    batch,
  };

  const context: RefundPrePeginContext = {
    vaultProviderPubkey: participants.vaultProviderBtcPubkey,
    vaultKeeperPubkeys: participants.vaultKeeperBtcPubkeys,
    universalChallengerPubkeys: participants.universalChallengerBtcPubkeys,
    timelockRefund: offchainParams.timelockRefund,
    feeRate: offchainParams.protocolFeeRate,
    minPeginFeeRate: offchainParams.minPeginFeeRate,
    // Depositor-as-claimer: the local-challenger count is the keeper count,
    // the vault provider excluded — btc-vault graph.rs derive_challengers.
    numLocalChallengers: participants.vaultKeeperBtcPubkeys.length,
    councilQuorum: offchainParams.councilQuorum,
    councilSize: offchainParams.councilSize,
    network,
  };

  return { vault, context };
}
