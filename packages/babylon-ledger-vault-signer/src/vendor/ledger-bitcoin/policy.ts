/**
 * Vendored from the Ledger Bitcoin JS client (Apache-2.0).
 *
 * Upstream:        https://github.com/LedgerHQ/app-bitcoin (formerly app-bitcoin-new)
 * File:            bitcoin_client_js/src/lib/policy.ts
 * Version:         ledger-bitcoin@0.3.0 (npm gitHead 0a9e9e141f3340d29e7c6181177d4e5e9483a9f7)
 * Upstream sha256: 20b9b09faef4b5902efe182bf47f29d9aad711df15dc570581b348bb7e8a62fb
 * Vendored:        2026-08-14
 * License:         Apache-2.0 — see ./LICENSE (verbatim upstream copy)
 * Modifications:   explicit `import { Buffer } from "buffer"` (no implicit Node
 *                  global — this package ships to the browser); fixed the
 *                  "Bitcon" typo; formatting.
 * Known upstream behaviour (kept): `serialize()` writes the template length in
 *                  UTF-16 code units but hashes UTF-8 bytes; the Python oracle
 *                  (wallet.py:70) counts UTF-8 for both, and encodes name/keys
 *                  as UTF-8 where this file uses "ascii". Identical for the
 *                  ASCII-only templates every flow uses — never construct a
 *                  WalletPolicy with non-ASCII strings; if that ever changes,
 *                  encode once as UTF-8 to match the oracle.
 */

import { crypto } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { BufferWriter } from "./buffertools";
import { hashLeaf, Merkle } from "./merkle";

const WALLET_POLICY_V2 = 2;

/**
 * The Bitcoin hardware app uses a descriptors-like thing to describe
 * how to construct output scripts from keys. A "Wallet Policy" consists
 * of a "Descriptor Template" and a list of "keys". A key is basically
 * a serialized BIP32 extended public key with some added derivation path
 * information. This is documented at
 * https://github.com/LedgerHQ/app-bitcoin-new/blob/master/doc/wallet.md
 */
export class WalletPolicy {
  readonly name: string;
  readonly descriptorTemplate: string;
  readonly keys: readonly string[];
  /**
   * Creates and instance of a wallet policy.
   * @param name an ascii string, up to 16 bytes long; it must be an empty string for default wallet policies
   * @param descriptorTemplate the wallet policy template
   * @param keys and array of the keys, with the key derivation information
   */
  constructor(name: string, descriptorTemplate: string, keys: readonly string[]) {
    this.name = name;
    this.descriptorTemplate = descriptorTemplate;
    this.keys = keys;
  }

  /**
   * Returns the unique 32-bytes id of this wallet policy.
   */
  getId(): Buffer {
    return crypto.sha256(this.serialize());
  }

  /**
   * Serializes the wallet policy for transmission via the hardware wallet protocol.
   * @returns the serialized wallet policy
   */
  serialize(): Buffer {
    const keyBuffers = this.keys.map((k) => {
      return Buffer.from(k, "ascii");
    });
    const m = new Merkle(keyBuffers.map((k) => hashLeaf(k)));

    const buf = new BufferWriter();
    buf.writeUInt8(WALLET_POLICY_V2); // wallet version

    // length of wallet name, and wallet name
    buf.writeVarSlice(Buffer.from(this.name, "ascii"));

    // length of descriptor template
    buf.writeVarInt(this.descriptorTemplate.length);
    // sha256 hash of descriptor template
    buf.writeSlice(crypto.sha256(Buffer.from(this.descriptorTemplate)));

    // number of keys
    buf.writeVarInt(this.keys.length);
    // root of Merkle tree of keys
    buf.writeSlice(m.getRoot());
    return buf.buffer();
  }
}

export type DefaultDescriptorTemplate = "pkh(@0/**)" | "sh(wpkh(@0/**))" | "wpkh(@0/**)" | "tr(@0/**)";

/**
 * Simplified class to handle default wallet policies that can be used without policy registration.
 */
export class DefaultWalletPolicy extends WalletPolicy {
  constructor(descriptorTemplate: DefaultDescriptorTemplate, key: string) {
    super("", descriptorTemplate, [key]);
  }
}
