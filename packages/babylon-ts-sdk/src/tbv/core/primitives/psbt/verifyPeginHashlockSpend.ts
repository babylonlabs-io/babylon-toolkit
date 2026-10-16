/**
 * Consensus check of a PegIn's spend of its vault's Pre-PegIn HTLC through the
 * hashlock leaf.
 *
 * A Bitcoin API is not trusted to say that a vault's PegIn swept its HTLC. It
 * can name the PegIn's public txid as the HTLC's spender, and serve back the
 * depositor-signed PegIn the registry publishes: a txid does not commit to the
 * witness. Finding the hashlock preimage in a served witness is not enough
 * either — a secret disclosed in a reverted activation's calldata can be copied
 * into a witness whose signatures are garbage. This check verifies the witness
 * the way Bitcoin would:
 *
 * - the Pre-PegIn is the registered one (its txid), so the HTLC output's script
 *   and value are authentic;
 * - the leaf script and control block commit to that output (BIP-341);
 * - the leaf is the hashlock leaf, its preimage opens the registered hashlock,
 *   and every signature it requires verifies against the PegIn's script-path
 *   sighash (BIP-342).
 *
 * A PegIn that passes is a valid spend of the HTLC: while the HTLC is unspent,
 * its holder can broadcast it to sweep the HTLC. It proves that much — not that
 * it was broadcast, nor that the HTLC is still unspent (the depositor's refund
 * may have taken it). The participants' PegIn input signatures are public —
 * the registry serves them
 * (vault-contracts-aave-v4@f5ef5633:src/protocol/BTCVaultRegistry.sol:918-925,
 * `getPeginInputSignaturesForVault`) and the depositor's is in the signed
 * PegIn — so the secret is the one ingredient that is not. Until it is public
 * no one can produce a passing PegIn; once it is, anyone can.
 *
 * The leaf (btc-vault@1d841f73:crates/vault/src/connectors/prepegin_htlc.rs:88-126,
 * multisig blocks from crates/vault/src/connectors/script_utils.rs:29-78):
 *
 *     OP_SIZE <32> OP_EQUALVERIFY OP_SHA256 <h> OP_EQUALVERIFY
 *     <D> OP_CHECKSIGVERIFY <VP> OP_CHECKSIGVERIFY
 *     <VK_1> OP_CHECKSIG <VK_2..N> OP_CHECKSIGADD <N> OP_NUMEQUALVERIFY
 *     <UC_1> OP_CHECKSIG <UC_2..M> OP_CHECKSIGADD <M> OP_NUMEQUAL
 *
 * With no universal challengers the keeper block ends in `OP_NUMEQUAL`. The
 * witness is the evaluation order reversed:
 * `[UC_M..UC_1, VK_N..VK_1, VP, D, preimage, script, control block]`
 * (btc-vault@1d841f73:crates/vault/src/sign.rs:718-761).
 *
 * @module primitives/psbt/verifyPeginHashlockSpend
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import {
  crypto as bcrypto,
  script as bscript,
  opcodes,
  Transaction,
} from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { stripHexPrefix, TAPSCRIPT_LEAF_VERSION } from "../utils/bitcoin";
import {
  computeTapLeafHash,
  computeTaprootScriptPubKey,
} from "../utils/taproot";

/** The hashlock leaf enforces `OP_SIZE <32> OP_EQUALVERIFY` on the preimage. */
const PREIMAGE_BYTES = 32;
/** BIP-340 x-only public key. */
const X_ONLY_KEY_BYTES = 32;
/** BIP-340 signature; a 65th byte carries an explicit sighash type (BIP-341). */
const SCHNORR_SIG_BYTES = 64;
const SCHNORR_SIG_WITH_HASH_TYPE_BYTES = 65;
/**
 * The explicit sighash types BIP-341 accepts — ALL, NONE, SINGLE, each alone or
 * with ANYONECANPAY (0x80); `SIGHASH_DEFAULT` (0x00) is only implicit. Literal
 * values, so this module reads nothing from bitcoinjs at import time.
 */
const EXPLICIT_TAPROOT_HASH_TYPES = new Set([
  0x01, 0x02, 0x03, 0x81, 0x82, 0x83,
]);
/** BIP-341 `SIGHASH_DEFAULT`: the type of a 64-byte signature. */
const SIGHASH_DEFAULT = 0x00;
/** BIP-341: a last witness item starting with this byte is an annex. */
const ANNEX_TAG = 0x50;
/** Script and control block follow the stack items in a script-path witness. */
const SCRIPT_PATH_TRAILER_ITEMS = 2;
/** The preimage, the depositor's and the vault provider's signatures. */
const FIXED_STACK_ITEMS = 3;
/** Keepers, then — when the vault has any — universal challengers. */
const MAX_MULTISIG_GROUPS = 2;
/** `OP_1`..`OP_16` (0x51..0x60) push 1..16: the value is the opcode less `OP_RESERVED` (0x50). */
const SMALL_INT_OPCODE_BASE = 0x50;
const SMALL_INT_MAX = 16;

/** The on-chain facts a served PegIn and Pre-PegIn are checked against. */
export interface VerifyPeginHashlockSpendParams {
  /** The PegIn as a Bitcoin API served it, witness included. */
  peginTxHex: string;
  /** The vault's Pre-PegIn as a Bitcoin API served it; authenticated by its txid. */
  prePeginTxHex: string;
  /** Txid of the vault's on-chain signed PegIn. */
  peginTxid: string;
  /** The vault's registered Pre-PegIn txid. */
  prePeginTxid: string;
  /** The vault's registered HTLC output index in the Pre-PegIn. */
  htlcVout: number;
  /** The vault's registered hashlock, `sha256(secret)`. */
  hashlock: string;
}

/** Whether the PegIn validly spends the HTLC; a refusal names its reason. */
export type PeginHashlockSpendVerdict =
  | { valid: true }
  | { valid: false; reason: string };

interface MultisigGroup {
  keys: Buffer[];
  threshold: number;
}

interface HashlockLeaf {
  hashlock: Buffer;
  depositorKey: Buffer;
  vaultProviderKey: Buffer;
  /** In evaluation order: keepers, then universal challengers. */
  groups: MultisigGroup[];
}

const canonicalTxid = (txid: string): string =>
  stripHexPrefix(txid).toLowerCase();

const refuse = (reason: string): PeginHashlockSpendVerdict => ({
  valid: false,
  reason,
});

function isPush(
  chunk: number | Buffer | undefined,
  length: number,
): chunk is Buffer {
  return Buffer.isBuffer(chunk) && chunk.length === length;
}

/** A threshold pushed as `OP_1`..`OP_16` or as a minimal script number. */
function decodeThreshold(
  chunk: number | Buffer | undefined,
): number | undefined {
  if (typeof chunk === "number") {
    const value = chunk - SMALL_INT_OPCODE_BASE;
    return value >= 1 && value <= SMALL_INT_MAX ? value : undefined;
  }
  if (!Buffer.isBuffer(chunk)) return undefined;
  try {
    return bscript.number.decode(chunk);
  } catch {
    return undefined;
  }
}

/**
 * Parse the hashlock leaf, or `undefined` for any other script. The script must
 * be minimally encoded — decompiling and recompiling it must give back the same
 * bytes — so the parse describes exactly the bytes that will execute.
 */
function parseHashlockLeaf(leafScript: Buffer): HashlockLeaf | undefined {
  const chunks = bscript.decompile(leafScript);
  if (!chunks || !Buffer.from(bscript.compile(chunks)).equals(leafScript)) {
    return undefined;
  }
  let i = 0;
  const next = () => chunks[i++];

  if (next() !== opcodes.OP_SIZE) return undefined;
  const size = next();
  if (!isPush(size, 1) || size[0] !== PREIMAGE_BYTES) return undefined;
  if (next() !== opcodes.OP_EQUALVERIFY) return undefined;
  if (next() !== opcodes.OP_SHA256) return undefined;
  const hashlock = next();
  if (!isPush(hashlock, PREIMAGE_BYTES)) return undefined;
  if (next() !== opcodes.OP_EQUALVERIFY) return undefined;
  const depositorKey = next();
  if (!isPush(depositorKey, X_ONLY_KEY_BYTES)) return undefined;
  if (next() !== opcodes.OP_CHECKSIGVERIFY) return undefined;
  const vaultProviderKey = next();
  if (!isPush(vaultProviderKey, X_ONLY_KEY_BYTES)) return undefined;
  if (next() !== opcodes.OP_CHECKSIGVERIFY) return undefined;

  const groups: MultisigGroup[] = [];
  for (;;) {
    const firstKey = next();
    if (!isPush(firstKey, X_ONLY_KEY_BYTES)) return undefined;
    if (next() !== opcodes.OP_CHECKSIG) return undefined;
    const keys = [firstKey];
    for (;;) {
      const key = chunks[i];
      if (
        !isPush(key, X_ONLY_KEY_BYTES) ||
        chunks[i + 1] !== opcodes.OP_CHECKSIGADD
      ) {
        break;
      }
      keys.push(key);
      i += 2;
    }
    const threshold = decodeThreshold(next());
    if (threshold === undefined || threshold < 1 || threshold > keys.length) {
      return undefined;
    }
    groups.push({ keys, threshold });
    const close = next();
    if (close === opcodes.OP_NUMEQUAL) break;
    if (close !== opcodes.OP_NUMEQUALVERIFY) return undefined;
    if (groups.length === MAX_MULTISIG_GROUPS) return undefined;
  }
  if (i !== chunks.length) return undefined;

  return { hashlock, depositorKey, vaultProviderKey, groups };
}

/**
 * Verify a served PegIn spends the vault's HTLC through the hashlock leaf with
 * a witness Bitcoin would accept. Never throws on malformed input: anything that
 * is not such a spend is a refusal.
 */
export function verifyPeginHashlockSpend(
  params: VerifyPeginHashlockSpendParams,
): PeginHashlockSpendVerdict {
  let pegin: Transaction;
  let prePegin: Transaction;
  try {
    pegin = Transaction.fromHex(stripHexPrefix(params.peginTxHex));
    prePegin = Transaction.fromHex(stripHexPrefix(params.prePeginTxHex));
  } catch {
    return refuse("a served transaction does not parse");
  }

  if (canonicalTxid(pegin.getId()) !== canonicalTxid(params.peginTxid)) {
    return refuse("the served PegIn is not the on-chain signed PegIn");
  }
  const prePeginTxid = canonicalTxid(params.prePeginTxid);
  if (canonicalTxid(prePegin.getId()) !== prePeginTxid) {
    return refuse("the served Pre-PegIn is not the registered one");
  }

  // The protocol's PegIn has a single input. With more, the sighash would also
  // commit to prevouts this check cannot authenticate.
  if (pegin.ins.length !== 1) {
    return refuse("the PegIn does not have exactly one input");
  }
  const [input] = pegin.ins;
  if (
    input.index !== params.htlcVout ||
    Buffer.from(input.hash).reverse().toString("hex") !== prePeginTxid
  ) {
    return refuse("the PegIn does not spend the vault's HTLC output");
  }
  const htlcOutput = prePegin.outs[params.htlcVout];
  if (!htlcOutput) {
    return refuse("the Pre-PegIn has no output at the HTLC index");
  }

  const witness = input.witness;
  if (witness.length < SCRIPT_PATH_TRAILER_ITEMS) {
    return refuse("the HTLC input has no script-path witness");
  }
  const lastItem = witness[witness.length - 1];
  if (lastItem.length > 0 && lastItem[0] === ANNEX_TAG) {
    return refuse("the HTLC input's witness carries an annex");
  }
  const controlBlock = witness[witness.length - 1];
  const leafScript = witness[witness.length - 2];
  const stack = witness.slice(0, witness.length - SCRIPT_PATH_TRAILER_ITEMS);

  let committedScriptPubKey: Buffer;
  try {
    committedScriptPubKey = computeTaprootScriptPubKey({
      leafVersion: TAPSCRIPT_LEAF_VERSION,
      script: leafScript,
      controlBlock,
    });
  } catch {
    return refuse("the control block is malformed");
  }
  if (!committedScriptPubKey.equals(htlcOutput.script)) {
    return refuse("the leaf is not committed to the vault's HTLC output");
  }

  const leaf = parseHashlockLeaf(leafScript);
  if (!leaf) {
    return refuse("the spent leaf is not the hashlock leaf");
  }
  if (
    !leaf.hashlock.equals(Buffer.from(stripHexPrefix(params.hashlock), "hex"))
  ) {
    return refuse("the leaf's hashlock is not the vault's");
  }

  // Tapscript's clean-stack rule: the leaf consumes every item, so the witness
  // holds exactly one per check.
  const keyCount = leaf.groups.reduce((n, group) => n + group.keys.length, 0);
  if (stack.length !== FIXED_STACK_ITEMS + keyCount) {
    return refuse("the witness does not hold one item per check of the leaf");
  }
  const [preimage, depositorSig, vaultProviderSig, ...groupSigs] = [
    ...stack,
  ].reverse();

  if (
    preimage.length !== PREIMAGE_BYTES ||
    !bcrypto.sha256(preimage).equals(leaf.hashlock)
  ) {
    return refuse("the witness does not open the hashlock");
  }

  const leafHash = computeTapLeafHash(TAPSCRIPT_LEAF_VERSION, leafScript);
  const signatureVerifies = (signature: Buffer, key: Buffer): boolean => {
    let hashType = SIGHASH_DEFAULT;
    if (signature.length === SCHNORR_SIG_WITH_HASH_TYPE_BYTES) {
      hashType = signature[SCHNORR_SIG_BYTES];
      if (!EXPLICIT_TAPROOT_HASH_TYPES.has(hashType)) return false;
    } else if (signature.length !== SCHNORR_SIG_BYTES) {
      return false;
    }
    try {
      const sighash = pegin.hashForWitnessV1(
        0,
        [htlcOutput.script],
        [htlcOutput.value],
        hashType,
        leafHash,
      );
      return ecc.verifySchnorr(
        sighash,
        key,
        signature.subarray(0, SCHNORR_SIG_BYTES),
      );
    } catch {
      return false;
    }
  };

  // `OP_CHECKSIGVERIFY`: the signature must be present and valid.
  if (!signatureVerifies(depositorSig, leaf.depositorKey)) {
    return refuse("the depositor's signature does not verify");
  }
  if (!signatureVerifies(vaultProviderSig, leaf.vaultProviderKey)) {
    return refuse("the vault provider's signature does not verify");
  }

  // `OP_CHECKSIG` / `OP_CHECKSIGADD`: an empty signature counts nothing, and a
  // non-empty one that fails aborts the script (BIP-342).
  let offset = 0;
  for (const group of leaf.groups) {
    let valid = 0;
    for (const key of group.keys) {
      const signature = groupSigs[offset++];
      if (signature.length === 0) continue;
      if (!signatureVerifies(signature, key)) {
        return refuse("a multisig signature does not verify");
      }
      valid += 1;
    }
    if (valid !== group.threshold) {
      return refuse("a multisig block is short of its threshold");
    }
  }

  return { valid: true };
}
