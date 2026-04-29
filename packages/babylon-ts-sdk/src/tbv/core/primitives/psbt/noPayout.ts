/**
 * NoPayout PSBT Builder
 *
 * Builds unsigned PSBTs for the depositor's NoPayout transaction
 * (depositor-as-claimer path, per challenger). The depositor signs input 0
 * using the NoPayout taproot script from WasmAssertPayoutNoPayoutConnector.
 *
 * @module primitives/psbt/noPayout
 * @see btc-vault crates/vault/docs/btc-transactions-spec.md — Assert output 0 NoPayout connector
 */

import {
  type AssertPayoutNoPayoutConnectorParams,
  type Network,
  getAssertNoPayoutScriptInfo,
  tapInternalPubkey,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Buffer } from "buffer";
import { Psbt, Transaction, payments } from "bitcoinjs-lib";

import {
  TAPSCRIPT_LEAF_VERSION,
  getNetwork,
  hexToUint8Array,
  processPublicKeyToXOnly,
  stripHexPrefix,
} from "../utils/bitcoin";

/**
 * Parameters for building a NoPayout PSBT
 */
export interface NoPayoutParams {
  /** NoPayout transaction hex (unsigned) from VP */
  noPayoutTxHex: string;
  /** Challenger's x-only public key (hex encoded) */
  challengerPubkey: string;
  /** Prevouts for all inputs [{script_pubkey, value}] from VP */
  prevouts: Array<{ script_pubkey: string; value: number }>;
  /** Parameters for the Assert Payout/NoPayout connector */
  connectorParams: AssertPayoutNoPayoutConnectorParams;
}

/**
 * Build unsigned NoPayout PSBT.
 *
 * The NoPayout transaction is specific to each challenger.
 * Input 0 is the one the depositor signs using the NoPayout taproot script path.
 *
 * @param params - NoPayout parameters
 * @returns Unsigned PSBT hex ready for signing
 */
export async function buildNoPayoutPsbt(
  params: NoPayoutParams,
): Promise<string> {
  const noPayoutTxHex = stripHexPrefix(params.noPayoutTxHex);
  const noPayoutTx = Transaction.fromHex(noPayoutTxHex);

  // Get NoPayout script and control block for this challenger
  const { noPayoutScript, noPayoutControlBlock } =
    await getAssertNoPayoutScriptInfo(
      params.connectorParams,
      params.challengerPubkey,
    );

  const scriptBytes = hexToUint8Array(noPayoutScript);
  const controlBlockBytes = hexToUint8Array(noPayoutControlBlock);

  const psbt = new Psbt();
  psbt.setVersion(noPayoutTx.version);
  psbt.setLocktime(noPayoutTx.locktime);

  // Add all inputs - depositor signs input 0 only
  for (let i = 0; i < noPayoutTx.ins.length; i++) {
    const input = noPayoutTx.ins[i];
    const prevout = params.prevouts[i];

    if (!prevout) {
      throw new Error(`Missing prevout data for input ${i}`);
    }

    const inputData: Parameters<typeof psbt.addInput>[0] = {
      hash: input.hash,
      index: input.index,
      sequence: input.sequence,
      witnessUtxo: {
        script: Buffer.from(hexToUint8Array(stripHexPrefix(prevout.script_pubkey))),
        value: prevout.value,
      },
    };

    // Input 0: depositor signs using taproot script path
    if (i === 0) {
      inputData.tapLeafScript = [
        {
          leafVersion: TAPSCRIPT_LEAF_VERSION,
          script: Buffer.from(scriptBytes),
          controlBlock: Buffer.from(controlBlockBytes),
        },
      ];
      inputData.tapInternalKey = Buffer.from(tapInternalPubkey);
    }

    psbt.addInput(inputData);
  }

  // Add outputs
  for (const output of noPayoutTx.outs) {
    psbt.addOutput({
      script: output.script,
      value: output.value,
    });
  }

  return psbt.toHex();
}

/**
 * Validate that a NoPayout transaction pays to the challenger via the
 * protocol-defined output structure: a single BIP-86 P2TR output derived from
 * the challenger's x-only pubkey.
 *
 * Mirrors `assertPayoutOutputMatchesRegistered` for the NoPayout path, where
 * the sink is fixed by the protocol rather than read from on-chain registration
 * (see `crates/vault/src/transactions/nopayout.rs::NoPayoutTx::new`).
 *
 * @param noPayoutTxHex - Raw NoPayout transaction hex
 * @param challengerPubkey - Challenger's x-only public key (hex)
 * @param network - Bitcoin network used to derive the P2TR scriptPubKey
 * @throws If the transaction does not have exactly one output
 * @throws If the single output's scriptPubKey does not equal the BIP-86 P2TR
 *         scriptPubKey for the challenger
 */
export function assertNoPayoutOutputMatchesChallenger(
  noPayoutTxHex: string,
  challengerPubkey: string,
  network: Network,
): void {
  const tx = Transaction.fromHex(stripHexPrefix(noPayoutTxHex));

  if (tx.outs.length !== 1) {
    throw new Error(
      `NoPayout transaction must have exactly 1 output, got ${tx.outs.length}`,
    );
  }

  const xOnly = hexToUint8Array(processPublicKeyToXOnly(challengerPubkey));
  const { output: expectedScript } = payments.p2tr({
    internalPubkey: Buffer.from(xOnly),
    network: getNetwork(network),
  });
  if (!expectedScript) {
    throw new Error(
      "Failed to derive challenger BIP-86 P2TR scriptPubKey for NoPayout output validation",
    );
  }

  if (!tx.outs[0].script.equals(expectedScript)) {
    throw new Error(
      "NoPayout transaction does not pay to the expected challenger BIP-86 P2TR address",
    );
  }
}
