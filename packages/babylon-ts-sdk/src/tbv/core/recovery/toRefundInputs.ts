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

import { ensureHexPrefix, stripHexPrefix } from "../primitives/utils/bitcoin";
import type {
  RefundPrePeginContext,
  VaultRefundData,
} from "../services/refund/buildAndBroadcastRefund";

import type { ReconstructPeginParamsResult } from "./reconstructPeginParams";

/** Hex length of a 65-byte SEC1 key: prefix, X and Y. */
const UNCOMPRESSED_PUBKEY_HEX_LEN = 130;
/** SEC1 uncompressed form: `04`, 32-byte X, 32-byte Y. */
const UNCOMPRESSED_PUBKEY_RE = /^04([0-9a-fA-F]{64})[0-9a-fA-F]{63}([0-9a-fA-F])$/;

/**
 * The refund accepts 32 or 33 bytes and hands the key to the wallet, so the
 * `0x` prefix goes and a 65-byte key becomes the compressed form: `02`/`03` by
 * Y parity (SEC1 2.3.3).
 */
function toRefundPubkey(depositorBtcPubkey: string): string {
  const cleanHex = stripHexPrefix(depositorBtcPubkey);
  if (cleanHex.length !== UNCOMPRESSED_PUBKEY_HEX_LEN) {
    return cleanHex;
  }
  const match = UNCOMPRESSED_PUBKEY_RE.exec(cleanHex);
  if (match === null) {
    throw new Error(
      "toRefundInputs: depositorBtcPubkey has 65 bytes but is not an " +
        "uncompressed public key (expected 04, then X and Y in hex).",
    );
  }
  const [, x, lastYDigit] = match;
  const isYOdd = parseInt(lastYDigit, 16) % 2 === 1;
  return `${isYOdd ? "03" : "02"}${x}`;
}

export interface ToRefundInputsOptions {
  /**
   * Which sibling of the Pre-PegIn to refund, as an index into the
   * reconstruction's hashlocks and amounts. Equal to the vault's `htlcVout`
   * by construction — `PeginManager` asserts `perVault[i].htlcVout === i`.
   */
  htlcVout: number;
  /**
   * Depositor BTC pubkey, the same value the reconstruction was run with.
   * Passed through rather than re-derived so the refund is built against the
   * key that was actually verified. Its `0x` prefix is removed and a 65-byte
   * uncompressed key is converted to its compressed form, the only changes
   * made to it.
   *
   * Deliberately NOT narrowed to x-only here. `VaultRefundData.depositorBtcPubkey`
   * accepts "32 or 33 bytes of hex", and `buildAndBroadcastRefund` narrows it
   * with `processPublicKeyToXOnly` before it reaches the PSBT builder — so a
   * wallet's compressed key flows through unchanged, which is what wallets
   * actually return. Narrowing early would discard the parity byte the
   * orchestrator's own validation accepts.
   */
  depositorBtcPubkey: string;
  /**
   * The vault provider's application entry point. Not recoverable from the
   * Bitcoin transaction and not part of the verified parameter set — it is a
   * field of the vault-provider registry row, which is address-keyed and
   * survives the reorg untouched.
   */
  applicationEntryPoint: Address;
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
 * @throws If `htlcVout` does not index the reconstructed batch, the hashlock
 *   vector disagrees with the reconstructed amounts, or a 65-byte
 *   `depositorBtcPubkey` is not a valid uncompressed key encoding.
 */
export function toRefundInputs(
  result: ReconstructPeginParamsResult,
  options: ToRefundInputsOptions,
): RefundInputsFromRecovery {
  const {
    htlcVout,
    depositorBtcPubkey,
    applicationEntryPoint,
    hashlocks,
    network,
  } = options;

  const { candidate, peginAmounts, fundedPrePeginTxHex } = result;
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
    depositorBtcPubkey: toRefundPubkey(depositorBtcPubkey),
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
