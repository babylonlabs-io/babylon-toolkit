/**
 * The one check that ties a vault-provider-served graph to a vault.
 *
 * Every other field is self-declared: the graph JSON names no vault, and the
 * artifacts file's `vault_id` is copied in by whoever wrote it. Only the
 * PegIn output the Claim spends is a fact about the chain, and getting its
 * byte order wrong would silently reject correct graphs and accept nothing.
 */

import { Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import {
  VaultIdBindingError,
  assertClaimSpendsVault,
  peginTxidFromClaimPsbt,
  peginTxidFromClaimTx,
} from "../vaultIdBinding";

const PEGIN_TXID = "ab".repeat(32);
const DEPOSITOR_ETH_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const VAULT_ID =
  "0xcbba8595fd78d9d8d75df49378aaa786fc7ef2d78bae0fb924e1da97cb60382a";

function claimPsbt(peginTxid: string): string {
  const psbt = new Psbt();
  psbt.addInput({ hash: peginTxid, index: 1 });
  return psbt.toBase64();
}

function claimTx(peginTxid: string): Transaction {
  const tx = new Transaction();
  tx.addInput(Buffer.from(peginTxid, "hex").reverse(), 1);
  return tx;
}

describe("peginTxidFromClaimPsbt", () => {
  it("reads the first input's prevout txid in display order", () => {
    expect(peginTxidFromClaimPsbt(claimPsbt(PEGIN_TXID))).toBe(PEGIN_TXID);
  });

  it("rejects a PSBT with no input to bind the vault to", () => {
    expect(() => peginTxidFromClaimPsbt(new Psbt().toBase64())).toThrow(
      /no PegIn input/,
    );
  });
});

describe("peginTxidFromClaimTx", () => {
  it("reads the first input's prevout txid in display order", () => {
    expect(peginTxidFromClaimTx(claimTx(PEGIN_TXID))).toBe(PEGIN_TXID);
  });
});

describe("assertClaimSpendsVault", () => {
  it("accepts a Claim whose PegIn derives the expected vault", () => {
    expect(() =>
      assertClaimSpendsVault({
        peginTxid: PEGIN_TXID,
        depositorEthAddress: DEPOSITOR_ETH_ADDRESS,
        expectedVaultId: VAULT_ID,
      }),
    ).not.toThrow();
  });

  it("rejects a Claim that spends another vault's PegIn", () => {
    expect(() =>
      assertClaimSpendsVault({
        peginTxid: "cd".repeat(32),
        depositorEthAddress: DEPOSITOR_ETH_ADDRESS,
        expectedVaultId: VAULT_ID,
      }),
    ).toThrow(VaultIdBindingError);
  });

  it("rejects a Claim registered under another depositor", () => {
    // The id is keccak256(peginTxid, depositor), so the depositor half binds
    // just as hard as the PegIn half.
    expect(() =>
      assertClaimSpendsVault({
        peginTxid: PEGIN_TXID,
        depositorEthAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        expectedVaultId: VAULT_ID,
      }),
    ).toThrow(VaultIdBindingError);
  });
});
