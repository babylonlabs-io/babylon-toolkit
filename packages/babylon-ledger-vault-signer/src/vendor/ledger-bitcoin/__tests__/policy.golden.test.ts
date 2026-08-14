/**
 * Golden test for the vendored WalletPolicy serialization.
 *
 * `serialize()` = `0x02 ‖ varint(|name|) ‖ name ‖ varint(|template|) ‖
 * sha256(template) ‖ varint(n_keys) ‖ keysRoot`, and `getId()` (its sha256) is
 * the `wallet_id` field of the SIGN_PSBT header — the Pre-PegIn / #2221/#2222
 * seam. Oracle values were emitted by the Python client the vault firmware's
 * own tests drive (`ledger-bitcoin==0.4.0`, the `scripts/requirements.txt`
 * pin):
 *
 *   from ledger_bitcoin.wallet import WalletPolicy
 *   w = WalletPolicy("", "tr(@0/**)", [KEY_INFO])
 *   w.serialize().hex(); w.id.hex()
 *
 * KEY_INFO is the standard BIP-86 testnet key-info string used across the base
 * app's own test suite (app-bitcoin tests, speculos seed).
 */

import { describe, expect, it } from "vitest";

import { DefaultWalletPolicy } from "../policy";

const KEY_INFO =
  "[f5acc2fd/86'/1'/0']tpubDDKYE6BREvDsSWMazgHoyQWiJwYaDDYPbCFjYxN3HFXJP5fokeiK4hwK5tTLBNEDBwrDXn8cQ4v9b2xdW62Xr5yxoQdMu1v6c7UDXYVH27U";

const ORACLE_SERIALIZED_HEX =
  "0200097c54d8c8cd3bac81abf56463d3d3ed2efa94afd9678707fcd68a4c990a71ea6b01feacb8b161672bffec7b35f4035eceb1d9c918e2507b51d1716324b968856803";

const ORACLE_ID_HEX = "627535418bc03eeee2b62b3a0254dc0624881f8bc6fc20c4d3b2c1c4fc929893";

describe("WalletPolicy golden vectors", () => {
  it("serializes the default tr(@0/**) policy to the oracle bytes", () => {
    const policy = new DefaultWalletPolicy("tr(@0/**)", KEY_INFO);
    expect(policy.serialize().toString("hex")).toBe(ORACLE_SERIALIZED_HEX);
  });

  it("derives the oracle wallet id", () => {
    const policy = new DefaultWalletPolicy("tr(@0/**)", KEY_INFO);
    expect(policy.getId().toString("hex")).toBe(ORACLE_ID_HEX);
  });
});
