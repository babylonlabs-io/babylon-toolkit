/**
 * Depositor-claim output descriptor
 *
 * The PegIn transaction's vout 1 carries `depositorClaimValue` — the reserve
 * that funds the depositor's own `claim_tx`, their recourse if the vault
 * provider fails during peg-out.
 *
 * It is btc-vault's `SingleKeyConnector` (`crates/vault/src/connectors/mod.rs`):
 * a Taproot output with the NUMS internal key (key path provably unspendable)
 * and exactly one tapleaf at depth 0, `<depositor> OP_CHECKSIG`. No timelock,
 * no counterparty key — the depositor's Schnorr signature alone spends it.
 *
 * Two call sites need this, and they must not drift:
 *  - `assertPeginTxShape` (./pegin) validates the encoded PegIn output against
 *    the scriptPubKey before the depositor signs the peg-in.
 *  - `buildReclaimPsbt` (./reclaim) spends that same output, and needs the leaf
 *    script and control block to populate the PSBT's `tapLeafScript`.
 *
 * Keeping one definition here is what makes the reclaim's script binding
 * meaningful: the bytes the reclaim signs against are the same bytes the
 * peg-in validated.
 *
 * @module primitives/psbt/depositorClaim
 */

import { tapInternalPubkey } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Buffer } from "buffer";
import { payments, script as bscript, opcodes } from "bitcoinjs-lib";

import {
  TAPSCRIPT_LEAF_VERSION,
  hexToUint8Array,
  stripHexPrefix,
} from "../utils/bitcoin";

/**
 * Vout of the depositor-claim output in every PegIn version (btc-vault: vault
 * at 0, depositor claim at 1, optional P2A anchor appended after).
 *
 * Version-invariant: the graph version dispatches only the trailing P2A anchor
 * (absent in v1, 240 sats at vout 2 in v2/v3). Nothing touches vout 1.
 */
export const PEGIN_DEPOSITOR_CLAIM_VOUT = 1;

/** The single-leaf taptree's spend material for one depositor key. */
export interface DepositorClaimDescriptor {
  /** P2TR scriptPubKey the PegIn pays at {@link PEGIN_DEPOSITOR_CLAIM_VOUT}. */
  scriptPubKey: Buffer;
  /** The one tapleaf: `<depositor> OP_CHECKSIG`, 34 bytes. */
  leafScript: Buffer;
  /**
   * Control block for that leaf: `[leafVersion | outputKeyParity] || NUMS`,
   * 33 bytes. The tree has a single leaf at depth 0, so it carries no sibling
   * hashes.
   */
  controlBlock: Buffer;
  /**
   * The NUMS internal key the taptree commits to — the PSBT's `tapInternalKey`.
   * Carried here so an input's internal key and control block provably come
   * from the same derivation.
   */
  internalKey: Buffer;
}

/**
 * Derive the depositor-claim output's spend material in JS, independently of
 * WASM — the Rust `SingleKeyConnector` has no WASM wrapper, so this is the
 * only derivation available on the JS side.
 *
 * Takes no graph version: the connector is identical across v1/v2/v3. A future
 * `VAULT_WASM_COMMIT` bump that changed it would break `assertPeginTxShape` at
 * peg-in build time, which is where that regression should surface.
 *
 * @param depositorPubkey - x-only depositor pubkey, 64-char hex (no 0x prefix)
 * @throws If bitcoinjs cannot derive the P2TR output or its control block
 */
export function deriveDepositorClaimDescriptor(
  depositorPubkey: string,
): DepositorClaimDescriptor {
  // Validate before compiling: `bscript.compile` happily emits a shorter push
  // for a truncated key, yielding a well-formed script that is not the claim
  // leaf. Downstream that becomes a scriptPubKey nobody can spend, so reject
  // here rather than deriving something plausible. Mirrors the same check in
  // `deriveBip86ScriptPubKeyHex`.
  const cleanPubkey = stripHexPrefix(depositorPubkey);
  if (!/^[0-9a-fA-F]{64}$/.test(cleanPubkey)) {
    throw new Error(
      "Invalid depositor pubkey for the depositor-claim script: must be an " +
        "x-only key of 64 hex characters (32 bytes).",
    );
  }

  const leafScript = bscript.compile([
    Buffer.from(hexToUint8Array(cleanPubkey)),
    opcodes.OP_CHECKSIG,
  ]);

  const internalKey = Buffer.from(tapInternalPubkey);
  const redeem = { output: leafScript, redeemVersion: TAPSCRIPT_LEAF_VERSION };
  const { output, witness } = payments.p2tr({
    internalPubkey: internalKey,
    scriptTree: { output: leafScript },
    redeem,
  });

  if (!output) {
    throw new Error(
      "Failed to derive the depositor-claim P2TR scriptPubKey for PegIn output validation",
    );
  }
  // bitcoinjs appends the control block last in the script-path witness stack
  // ([...redeemWitness, script, controlBlock]); with `redeem` supplied it is
  // always present, but a missing entry must fail rather than sign unspendably.
  const controlBlock = witness?.[witness.length - 1];
  if (!controlBlock) {
    throw new Error(
      "Failed to derive the depositor-claim tapleaf control block; refusing to build an unspendable input",
    );
  }

  return { scriptPubKey: output, leafScript, controlBlock, internalKey };
}

/**
 * The depositor-claim output's scriptPubKey alone — the peg-in validation path,
 * which has no need of the spend material.
 */
export function deriveDepositorClaimScriptPubKey(
  depositorPubkey: string,
): Buffer {
  return deriveDepositorClaimDescriptor(depositorPubkey).scriptPubKey;
}
