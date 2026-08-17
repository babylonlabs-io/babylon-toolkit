/**
 * Golden test for the vendored WalletPolicy serialization.
 *
 * `serialize()` = `0x02 ‖ varint(|name|) ‖ name ‖ varint(|template|) ‖
 * sha256(template) ‖ varint(n_keys) ‖ keysRoot`. In the vault SIGN_PSBT flows
 * this package pins, the header's `wallet_id` is 32 zero bytes — the no-policy
 * routing switch (vendor README) — NOT `getId()`; there `serialize()` is only
 * preimage material for `addKnownWalletPolicy`, and no committed trace queries
 * it. `getId()` becomes the header's `wallet_id` once a real policy is in
 * play: #2221 PoP / #2222 Pre-PegIn need the wallet-policy path (cross-check:
 * PoP is not a no-policy flow), which is why this vendor-fidelity gate exists.
 * Oracle values were emitted by the Python client the vault firmware's own
 * tests drive (`ledger-bitcoin==0.4.0`, the `scripts/requirements.txt` pin):
 *
 *   from ledger_bitcoin.wallet import WalletPolicy
 *   w = WalletPolicy("", "tr(@0/**)", [KEY_INFO])
 *   w = WalletPolicy("Cold storage", "wsh(sortedmulti(2,@0/**,@1/**))", [KEY_INFO, KEY_INFO_2])
 *   w.serialize().hex(); w.id.hex()
 *
 * KEY_INFO is the standard BIP-86 testnet key-info string used across the base
 * app's own test suite (app-bitcoin tests, speculos seed); KEY_INFO_2 is the
 * pathless tpub the trace generators' NoWalletPolicy uses.
 */

import { describe, expect, it } from "vitest";

import { DefaultWalletPolicy, WalletPolicy } from "../policy";

const KEY_INFO =
  "[f5acc2fd/86'/1'/0']tpubDDKYE6BREvDsSWMazgHoyQWiJwYaDDYPbCFjYxN3HFXJP5fokeiK4hwK5tTLBNEDBwrDXn8cQ4v9b2xdW62Xr5yxoQdMu1v6c7UDXYVH27U";

const KEY_INFO_2 =
  "tpubD6NzVbkrYhZ4XgiXtGrdW5XDAPFCL9h7we1vwNCpn8tGbBcgfVYjXyhWo4E1xkh56hjod1RhGjxbaTLV3X4FyWuejifB9jusQ46QzG87VKp";

const ORACLE_SERIALIZED_HEX =
  "0200097c54d8c8cd3bac81abf56463d3d3ed2efa94afd9678707fcd68a4c990a71ea6b01feacb8b161672bffec7b35f4035eceb1d9c918e2507b51d1716324b968856803";

const ORACLE_ID_HEX = "627535418bc03eeee2b62b3a0254dc0624881f8bc6fc20c4d3b2c1c4fc929893";

// A named 2-key policy covers the name-bytes field and the 2-leaf keys tree
// that the single-key default vector leaves untouched.
const ORACLE_MULTISIG_SERIALIZED_HEX =
  "020c436f6c642073746f726167651fb56c3d5542fa09b3956834a9ff6a1df5c36a38e5b02c63c54b41a9a04403b82602e1cbca84517d75b7502cf8fdb52e143bd08d77f622264181af2ad55468b356e1";

const ORACLE_MULTISIG_ID_HEX = "44a54f2728473890f5843a1f9ce4f2faeb14df0e83a059218e16726b330e7de6";

describe("WalletPolicy golden vectors", () => {
  it("serializes the default tr(@0/**) policy to the oracle bytes", () => {
    const policy = new DefaultWalletPolicy("tr(@0/**)", KEY_INFO);
    expect(policy.serialize().toString("hex")).toBe(ORACLE_SERIALIZED_HEX);
  });

  it("derives the oracle wallet id", () => {
    const policy = new DefaultWalletPolicy("tr(@0/**)", KEY_INFO);
    expect(policy.getId().toString("hex")).toBe(ORACLE_ID_HEX);
  });

  it("serializes a named 2-key wsh(sortedmulti) policy and derives its oracle id", () => {
    const policy = new WalletPolicy("Cold storage", "wsh(sortedmulti(2,@0/**,@1/**))", [KEY_INFO, KEY_INFO_2]);
    expect(policy.serialize().toString("hex")).toBe(ORACLE_MULTISIG_SERIALIZED_HEX);
    expect(policy.getId().toString("hex")).toBe(ORACLE_MULTISIG_ID_HEX);
  });
});
