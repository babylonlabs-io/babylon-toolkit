/**
 * PegIn Input PSBT Builder
 *
 * Builds the PSBT for the depositor to sign the PegIn transaction's HTLC input
 * (Pre-PegIn HTLC leaf 0 — the hashlock + all-party script).
 *
 * This is the "Sign Pegin transaction HTLC leaf 0 input" step in the pre-pegin
 * flow. The depositor signs input 0 of the PegIn transaction,
 * which spends output 0 of the funded Pre-PegIn transaction via script-path.
 *
 * @module primitives/psbt/peginInput
 */

import {
  getPrePeginHtlcConnectorInfo,
  tapInternalPubkey,
  type Network,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Buffer } from "buffer";
import { Psbt, Transaction } from "bitcoinjs-lib";
import { TAPSCRIPT_LEAF_VERSION, hexToUint8Array, stripHexPrefix, uint8ArrayToHex } from "../utils/bitcoin";

/**
 * Parameters for building the PegIn input PSBT
 */
export interface BuildPeginInputPsbtParams {
  /**
   * PegIn transaction hex (1 input spending Pre-PegIn HTLC output 0).
   * Returned by buildPeginTxFromFundedPrePegin().
   */
  peginTxHex: string;
  /**
   * Funded Pre-PegIn transaction hex.
   * Used to look up the HTLC output that the PegIn input spends.
   */
  fundedPrePeginTxHex: string;
  /** Depositor's BTC public key (x-only, 64-char hex) */
  depositorPubkey: string;
  /** Vault provider's BTC public key (x-only, 64-char hex) */
  vaultProviderPubkey: string;
  /** Vault keeper BTC public keys (x-only, 64-char hex) */
  vaultKeeperPubkeys: string[];
  /** Universal challenger BTC public keys (x-only, 64-char hex) */
  universalChallengerPubkeys: string[];
  /** SHA256 hash commitment (64 hex chars = 32 bytes) */
  hashlock: string;
  /** CSV timelock in blocks for the HTLC refund path */
  timelockRefund: number;
  /** Bitcoin network */
  network: Network;
}

/**
 * Result of building the PegIn input PSBT
 */
export interface BuildPeginInputPsbtResult {
  /** PSBT hex for the depositor to sign */
  psbtHex: string;
}

/**
 * Build PSBT for depositor to sign the PegIn transaction's HTLC leaf 0 input.
 *
 * The PegIn transaction spends the Pre-PegIn HTLC output (output 0) via the
 * hashlock + all-party script (leaf 0). The depositor provides one of the required
 * signatures; the vault provider and keepers provide theirs separately via the
 * signPeginInput RPC.
 *
 * The PSBT uses Taproot script-path spending:
 * - witnessUtxo: the Pre-PegIn HTLC output
 * - tapLeafScript: hashlock leaf script + control block
 * - tapInternalKey: NUMS unspendable key (BIP-341 nothing-up-my-sleeve)
 *
 * @param params - PegIn input PSBT parameters
 * @returns PSBT hex ready for depositor signing
 * @throws If PegIn tx does not have exactly 1 input
 * @throws If PegIn input does not reference the Pre-PegIn HTLC output
 * @throws If Pre-PegIn tx output 0 is not found
 */
export async function buildPeginInputPsbt(
  params: BuildPeginInputPsbtParams,
): Promise<BuildPeginInputPsbtResult> {
  const peginTxHex = stripHexPrefix(params.peginTxHex);
  const fundedPrePeginTxHex = stripHexPrefix(params.fundedPrePeginTxHex);

  const htlcConnector = await getPrePeginHtlcConnectorInfo({
    depositorPubkey: params.depositorPubkey,
    vaultProviderPubkey: params.vaultProviderPubkey,
    vaultKeeperPubkeys: params.vaultKeeperPubkeys,
    universalChallengerPubkeys: params.universalChallengerPubkeys,
    hashlock: params.hashlock,
    timelockRefund: params.timelockRefund,
    network: params.network,
  });

  const peginTx = Transaction.fromHex(peginTxHex);
  const prePeginTx = Transaction.fromHex(fundedPrePeginTxHex);

  if (peginTx.ins.length !== 1) {
    throw new Error(
      `PegIn transaction must have exactly 1 input, got ${peginTx.ins.length}`,
    );
  }

  const peginInput = peginTx.ins[0];

  // Verify PegIn input 0 spends Pre-PegIn output 0
  const prePeginTxid = prePeginTx.getId();
  const peginInputTxid = uint8ArrayToHex(
    new Uint8Array(peginInput.hash).slice().reverse(),
  );

  if (peginInputTxid !== prePeginTxid) {
    throw new Error(
      `PegIn input does not reference the Pre-PegIn transaction. ` +
        `Expected ${prePeginTxid}, got ${peginInputTxid}`,
    );
  }

  const htlcOutput = prePeginTx.outs[peginInput.index];
  if (!htlcOutput) {
    throw new Error(
      `Pre-PegIn output ${peginInput.index} not found ` +
        `(Pre-PegIn has ${prePeginTx.outs.length} outputs)`,
    );
  }

  const hashlockScript = hexToUint8Array(htlcConnector.hashlockScript);
  const hashlockControlBlock = hexToUint8Array(htlcConnector.hashlockControlBlock);

  const psbt = new Psbt();
  psbt.setVersion(peginTx.version);
  psbt.setLocktime(peginTx.locktime);

  // Input 0: PegIn input spending Pre-PegIn HTLC output 0 via hashlock leaf (leaf 0).
  // The depositor signs using Taproot script-path spending.
  psbt.addInput({
    hash: peginInput.hash,
    index: peginInput.index,
    sequence: peginInput.sequence,
    witnessUtxo: {
      script: htlcOutput.script,
      value: htlcOutput.value,
    },
    tapLeafScript: [
      {
        leafVersion: TAPSCRIPT_LEAF_VERSION,
        script: Buffer.from(hashlockScript),
        controlBlock: Buffer.from(hashlockControlBlock),
      },
    ],
    tapInternalKey: Buffer.from(tapInternalPubkey),
    // sighashType omitted — defaults to SIGHASH_DEFAULT (0x00) for Taproot
  });

  for (const output of peginTx.outs) {
    psbt.addOutput({
      script: output.script,
      value: output.value,
    });
  }

  return { psbtHex: psbt.toHex() };
}

/**
 * Extract the depositor's Schnorr signature from a signed PegIn input PSBT.
 *
 * Supports both non-finalized PSBTs (tapScriptSig) and finalized PSBTs (witness).
 *
 * @param signedPsbtHex - Signed PSBT hex
 * @param depositorPubkey - Depositor's x-only public key (64-char hex)
 * @returns 64-byte Schnorr signature (128 hex chars, no sighash flag)
 * @throws If no signature is found for the depositor's key
 */
export function extractPeginInputSignature(
  signedPsbtHex: string,
  depositorPubkey: string,
): string {
  const signedPsbt = Psbt.fromHex(signedPsbtHex);
  const input = signedPsbt.data.inputs[0];

  if (!input) {
    throw new Error("PegIn PSBT has no inputs");
  }

  // Non-finalized PSBT — extract from tapScriptSig
  if (input.tapScriptSig && input.tapScriptSig.length > 0) {
    const depositorPubkeyBytes = Buffer.from(
      hexToUint8Array(depositorPubkey),
    );

    for (const sigEntry of input.tapScriptSig) {
      if (sigEntry.pubkey.equals(depositorPubkeyBytes)) {
        return extractSchnorrSig(sigEntry.signature);
      }
    }

    throw new Error(
      `No PegIn input signature found for depositor pubkey: ${depositorPubkey}`,
    );
  }

  // Finalized PSBT — the witness stack order depends on the wallet's finalizer,
  // so we cannot reliably pick the depositor's signature by position. Require
  // the non-finalized tapScriptSig path which identifies signatures by pubkey.
  if (input.finalScriptWitness && input.finalScriptWitness.length > 0) {
    throw new Error(
      "PegIn input PSBT is already finalized. Cannot reliably extract the " +
        "depositor signature from the witness stack. Ensure the wallet returns " +
        "a non-finalized PSBT with tapScriptSig entries.",
    );
  }

  throw new Error(
    "No tapScriptSig or finalScriptWitness found in signed PegIn input PSBT",
  );
}

/**
 * Finalize a signed PegIn input PSBT and return the depositor-signed transaction hex.
 *
 * The default tapscript finalizer builds the full witness stack [sig, script, controlBlock]
 * that vaultd requires when verifying the depositor signature on-chain.
 *
 * @param signedPsbtHex - Non-finalized signed PSBT hex (returned by wallet with autoFinalized: false)
 * @returns Depositor-signed PegIn transaction hex with full taproot witness stack
 */
export function finalizePeginInputPsbt(signedPsbtHex: string): string {
  const psbt = Psbt.fromHex(signedPsbtHex);

  // Some wallets (UniSat, OKX) ignore autoFinalized: false and return
  // already-finalized PSBTs. finalizeAllInputs() throws in that case,
  // so fall back to verifying the wallet already finalized all inputs.
  try {
    psbt.finalizeAllInputs();
  } catch (e) {
    const allFinalized = psbt.data.inputs.every(
      (inp) => inp.finalScriptWitness || inp.finalScriptSig,
    );
    if (!allFinalized) {
      throw new Error(
        `PSBT finalization failed and wallet did not auto-finalize: ${e}`,
      );
    }
  }

  return psbt.extractTransaction().toHex();
}

/**
 * Extract and validate a 64-byte Schnorr signature, stripping sighash flag if present.
 * Rejects signatures with sighash types other than SIGHASH_DEFAULT (0x00) or
 * SIGHASH_ALL (0x01) to prevent acceptance of signatures with non-standard
 * sighash types (e.g. SIGHASH_NONE).
 * @internal
 */
function extractSchnorrSig(sig: Uint8Array): string {
  if (sig.length === 64) {
    return uint8ArrayToHex(new Uint8Array(sig));
  }
  if (sig.length === 65) {
    const sighashByte = sig[64];
    if (sighashByte !== 0x00 && sighashByte !== Transaction.SIGHASH_ALL) {
      throw new Error(
        `Unexpected sighash type 0x${sighashByte.toString(16).padStart(2, "0")} in PegIn input signature. ` +
          `Expected SIGHASH_DEFAULT (0x00) or SIGHASH_ALL (0x01).`,
      );
    }
    return uint8ArrayToHex(new Uint8Array(sig.subarray(0, 64)));
  }
  throw new Error(`Unexpected PegIn input signature length: ${sig.length}`);
}

