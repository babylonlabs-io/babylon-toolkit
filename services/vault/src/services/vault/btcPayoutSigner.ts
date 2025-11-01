/**
 * BTC Payout Transaction Signer
 *
 * Low-level Bitcoin signing utility for payout transactions using Taproot script path spend.
 * Constructs PSBTs with complete Taproot spend information and extracts Schnorr signatures.
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib, payments, Psbt, Transaction } from "bitcoinjs-lib";

import {
  createPayoutConnector,
  tapInternalPubkey,
  type Network,
} from "../../utils/btc";

// Initialize ECC library for Taproot operations
initEccLib(ecc);

export interface PayoutTransactionInput {
  hash: Buffer;
  index: number;
  sequence: number;
  witnessUtxo: {
    script: Buffer;
    value: number;
  };
}

export interface SignPayoutTransactionParams {
  payoutTxHex: string;
  peginTxHex: string;
  claimTxHex: string;
  depositorBtcPubkey: string;
  vaultProviderBtcPubkey: string;
  liquidatorBtcPubkeys: string[];
  network: Network;
  btcWalletProvider: {
    signPsbt: (psbtHex: string) => Promise<string>;
  };
}

/**
 * Sign a payout transaction using Taproot script path spend
 *
 * @returns 64-byte Schnorr signature (128 hex characters, no sighash flag)
 */
export async function signPayoutTransaction(
  params: SignPayoutTransactionParams,
): Promise<string> {
  const {
    payoutTxHex,
    peginTxHex,
    claimTxHex,
    depositorBtcPubkey,
    vaultProviderBtcPubkey,
    liquidatorBtcPubkeys,
    network,
    btcWalletProvider,
  } = params;

  // Strip 0x prefix if present
  const cleanPayoutHex = payoutTxHex.startsWith("0x")
    ? payoutTxHex.slice(2)
    : payoutTxHex;
  const cleanPeginHex = peginTxHex.startsWith("0x")
    ? peginTxHex.slice(2)
    : peginTxHex;
  const cleanClaimHex = claimTxHex.startsWith("0x")
    ? claimTxHex.slice(2)
    : claimTxHex;

  try {
    const payoutTx = Transaction.fromHex(cleanPayoutHex);
    const peginTx = Transaction.fromHex(cleanPeginHex);
    const claimTx = Transaction.fromHex(cleanClaimHex);

    // Create payout connector to get taproot script information
    const payoutConnector = await createPayoutConnector(
      {
        depositor: depositorBtcPubkey,
        vaultProvider: vaultProviderBtcPubkey,
        liquidators: liquidatorBtcPubkeys,
      },
      network,
    );

    const payoutScriptBuffer = Buffer.from(payoutConnector.payoutScript, "hex");
    const controlBlock = computeControlBlock(
      tapInternalPubkey,
      payoutScriptBuffer,
    );

    const psbt = new Psbt();
    psbt.setVersion(payoutTx.version);
    psbt.setLocktime(payoutTx.locktime);

    // Add inputs - only input 0 (pegin output) needs Taproot script path spend info
    for (let i = 0; i < payoutTx.ins.length; i++) {
      const input = payoutTx.ins[i];

      // Determine which transaction this input spends from
      const inputTxid = Buffer.from(input.hash).reverse().toString("hex");
      const peginTxid = peginTx.getId();
      const prevTx = inputTxid === peginTxid ? peginTx : claimTx;
      const prevOut = prevTx.outs[input.index];

      if (!prevOut) {
        throw new Error(`Previous output not found for input ${i}`);
      }

      if (i === 0) {
        // Input 0: Depositor signs using Taproot script path spend
        psbt.addInput({
          hash: input.hash,
          index: input.index,
          sequence: input.sequence,
          witnessUtxo: {
            script: prevOut.script,
            value: prevOut.value,
          },
          tapLeafScript: [
            {
              leafVersion: 0xc0,
              script: payoutScriptBuffer,
              controlBlock: controlBlock,
            },
          ],
          tapInternalKey: tapInternalPubkey,
          // sighashType omitted - defaults to SIGHASH_DEFAULT (0x00) for Taproot
        });
      } else {
        // Other inputs: Signed by claimer, not depositor
        psbt.addInput({
          hash: input.hash,
          index: input.index,
          sequence: input.sequence,
          witnessUtxo: {
            script: prevOut.script,
            value: prevOut.value,
          },
        });
      }
    }

    // Add outputs
    for (const output of payoutTx.outs) {
      psbt.addOutput({
        script: output.script,
        value: output.value,
      });
    }

    const psbtHex = psbt.toHex();

    // Sign PSBT with user's BTC wallet
    const signedPsbtHex = await btcWalletProvider.signPsbt(psbtHex);
    const signedPsbt = Psbt.fromHex(signedPsbtHex);

    // Extract the Schnorr signature from the first input
    if (signedPsbt.data.inputs.length === 0) {
      throw new Error("No inputs found in signed PSBT");
    }

    const firstInput = signedPsbt.data.inputs[0];

    // Extract from tapScriptSig (preferred for non-finalized PSBT)
    if (firstInput.tapScriptSig && firstInput.tapScriptSig.length > 0) {
      const depositorPubkeyBuffer = Buffer.from(depositorBtcPubkey, "hex");

      for (const sigEntry of firstInput.tapScriptSig) {
        if (sigEntry.pubkey.equals(depositorPubkeyBuffer)) {
          const signature = sigEntry.signature;

          // Remove sighash flag byte if present (Taproot signatures are 64 bytes without flag)
          if (signature.length === 64) {
            return signature.toString("hex");
          } else if (signature.length === 65) {
            return signature.subarray(0, 64).toString("hex");
          } else {
            throw new Error(
              `Unexpected Schnorr signature length: ${signature.length}`,
            );
          }
        }
      }
    }

    // Try to extract from finalized transaction witness (for finalized PSBT)
    const tx = signedPsbt.extractTransaction();
    const witness = tx.ins[0].witness;

    if (!witness || witness.length === 0) {
      throw new Error("No witness data in signed transaction");
    }

    // For Taproot script path spend: [sig1] [sig2] ... [sigN] [script] [control_block]
    const depositorSig = witness[0];

    // Remove sighash flag byte if present
    if (depositorSig.length === 64) {
      return depositorSig.toString("hex");
    } else if (depositorSig.length === 65) {
      const sighashFlag = depositorSig[64];
      if (sighashFlag !== 0x01 && sighashFlag !== 0x00) {
        throw new Error(
          `Unexpected sighash flag: 0x${sighashFlag.toString(16)}`,
        );
      }
      return depositorSig.subarray(0, 64).toString("hex");
    } else {
      throw new Error(`Unexpected signature length: ${depositorSig.length}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to sign payout transaction: ${error.message}`);
    }
    throw new Error("Failed to sign payout transaction: Unknown error");
  }
}

/**
 * Compute control block for Taproot script path spend.
 * For a single script (no tree), format is: [leaf_version | parity] || internal_key
 */
function computeControlBlock(internalKey: Buffer, script: Buffer): Buffer {
  const scriptTree = { output: script };
  const payment = payments.p2tr({
    internalPubkey: internalKey,
    scriptTree,
  });

  const outputKey = payment.pubkey;
  if (!outputKey) {
    throw new Error("Failed to compute output key");
  }

  // Control block: [leaf_version | parity] || [internal_key_x_only]
  const leafVersion = 0xc0;
  const parity = outputKey[0] === 0x03 ? 1 : 0; // 0x02 = even, 0x03 = odd
  const controlByte = leafVersion | parity;

  return Buffer.concat([Buffer.from([controlByte]), internalKey]);
}
