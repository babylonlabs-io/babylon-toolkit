/**
 * Tests for the wallet-dependent half of reorg recovery.
 *
 * WASM-backed: the hashlocks are compared against an independent
 * `expandPerVaultSecrets` run over the same root, and the auth-anchor oracle
 * runs against real `expandAuthAnchor` output, so a change to either
 * derivation fails here rather than silently rotating a depositor's secrets.
 */

import { sha256 } from "@noble/hashes/sha2.js";
import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { expandPerVaultSecrets } from "../../managers/pegin/expandPerVaultSecrets";
import { initializeWasmForTests } from "../../primitives/psbt/__tests__/helpers";
import { uint8ArrayToHex } from "../../primitives/utils/bitcoin";
import { VAULT_APP_NAME, expandAuthAnchor } from "../../vault-secrets";
import { deriveHashlocksFromPrePegin } from "../deriveHashlocksFromPrePegin";
import {
  UnanchoredPrePeginError,
  VaultRootMismatchError,
} from "../recoveryErrors";

const DEPOSITOR_PUBKEY =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

/** A funded Pre-PegIn: `htlcCount` outputs, then the anchor OP_RETURN. */
function makeAnchoredTx(htlcCount: number, anchorHashHex: string): string {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, 0x11), 0);
  for (let i = 0; i < htlcCount; i++) {
    tx.addOutput(Buffer.from(`5120${"00".repeat(32)}`, "hex"), 1000);
  }
  tx.addOutput(
    Buffer.concat([
      Buffer.from([0x6a, 0x20]),
      Buffer.from(anchorHashHex, "hex"),
    ]),
    0,
  );
  return tx.toHex();
}

/** A wallet that returns `rootHex` from `deriveContextHash`, recording its args. */
function makeWallet(rootHex: string) {
  return {
    deriveContextHash: vi.fn(
      async (_appName: string, _context: string) => rootHex,
    ),
  };
}

describe("deriveHashlocksFromPrePegin", () => {
  const ROOT = new Uint8Array(32).fill(0x11);
  const ROOT_HEX = uint8ArrayToHex(ROOT);
  const OTHER_ROOT_HEX = uint8ArrayToHex(new Uint8Array(32).fill(0x22));

  let anchorHash: string;

  beforeAll(async () => {
    await initializeWasmForTests();
    const anchorBytes = await expandAuthAnchor(ROOT.slice());
    anchorHash = uint8ArrayToHex(sha256(anchorBytes));
  });

  it("derives one hashlock per HTLC output, matching the deposit-time expansion", async () => {
    const fundedPrePeginTxHex = makeAnchoredTx(2, anchorHash);
    // Independent expansion over a COPY: expandPerVaultSecrets zeroes its root.
    const expected = await expandPerVaultSecrets(ROOT.slice(), 2);

    const result = await deriveHashlocksFromPrePegin({
      wallet: makeWallet(ROOT_HEX),
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      fundedPrePeginTxHex,
    });

    expect(result.vaultCount).toBe(2);
    expect(result.authAnchorHash).toBe(anchorHash);
    expect(result.hashlocks).toEqual(expected.hashlocks);
    expect(result.hashlocks[0]).not.toBe(result.hashlocks[1]);
  });

  it("takes the vault count from the anchor's vout, not from a chain read", async () => {
    const fundedPrePeginTxHex = makeAnchoredTx(3, anchorHash);

    const result = await deriveHashlocksFromPrePegin({
      wallet: makeWallet(ROOT_HEX),
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      fundedPrePeginTxHex,
    });

    expect(result.vaultCount).toBe(3);
    expect(result.hashlocks).toHaveLength(3);
  });

  it("asks the wallet for the vault app name and the canonical 72-byte context", async () => {
    const wallet = makeWallet(ROOT_HEX);

    await deriveHashlocksFromPrePegin({
      wallet,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      fundedPrePeginTxHex: makeAnchoredTx(1, anchorHash),
    });

    expect(wallet.deriveContextHash).toHaveBeenCalledTimes(1);
    const [appName, context] = wallet.deriveContextHash.mock.calls[0];
    expect(appName).toBe(VAULT_APP_NAME);
    expect(context).toMatch(/^[0-9a-f]{144}$/);
  });

  it("rejects a root that does not commit to the transaction's auth anchor", async () => {
    const fundedPrePeginTxHex = makeAnchoredTx(1, anchorHash);

    await expect(
      deriveHashlocksFromPrePegin({
        wallet: makeWallet(OTHER_ROOT_HEX),
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        fundedPrePeginTxHex,
      }),
    ).rejects.toThrow(VaultRootMismatchError);
  });

  it("names the account and network in the mismatch error, so the fix is the user's", async () => {
    await expect(
      deriveHashlocksFromPrePegin({
        wallet: makeWallet(OTHER_ROOT_HEX),
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        fundedPrePeginTxHex: makeAnchoredTx(1, anchorHash),
      }),
    ).rejects.toThrow(/same account and the same network/);
  });

  it("refuses a legacy Pre-PegIn that carries no auth-anchor OP_RETURN", async () => {
    const tx = new Transaction();
    tx.version = 2;
    tx.addInput(Buffer.alloc(32, 0x11), 0);
    tx.addOutput(Buffer.from(`5120${"00".repeat(32)}`, "hex"), 1000);

    await expect(
      deriveHashlocksFromPrePegin({
        wallet: makeWallet(ROOT_HEX),
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        fundedPrePeginTxHex: tx.toHex(),
      }),
    ).rejects.toThrow(UnanchoredPrePeginError);
  });

  it("refuses a transaction with two anchor-shaped OP_RETURNs as ambiguous", async () => {
    const tx = new Transaction();
    tx.version = 2;
    tx.addInput(Buffer.alloc(32, 0x11), 0);
    tx.addOutput(Buffer.from(`5120${"00".repeat(32)}`, "hex"), 1000);
    const opReturn = Buffer.concat([
      Buffer.from([0x6a, 0x20]),
      Buffer.from(anchorHash, "hex"),
    ]);
    tx.addOutput(opReturn, 0);
    tx.addOutput(opReturn, 0);

    await expect(
      deriveHashlocksFromPrePegin({
        wallet: makeWallet(ROOT_HEX),
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        fundedPrePeginTxHex: tx.toHex(),
      }),
    ).rejects.toThrow(UnanchoredPrePeginError);
  });

  it("refuses an anchor at vout 0, which would fund no HTLC at all", async () => {
    await expect(
      deriveHashlocksFromPrePegin({
        wallet: makeWallet(ROOT_HEX),
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        fundedPrePeginTxHex: makeAnchoredTx(0, anchorHash),
      }),
    ).rejects.toThrow(/vout 0/);
  });

  it("does not call the wallet when the transaction has no usable anchor", async () => {
    const wallet = makeWallet(ROOT_HEX);
    const tx = new Transaction();
    tx.version = 2;
    tx.addInput(Buffer.alloc(32, 0x11), 0);
    tx.addOutput(Buffer.from(`5120${"00".repeat(32)}`, "hex"), 1000);

    await expect(
      deriveHashlocksFromPrePegin({
        wallet,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        fundedPrePeginTxHex: tx.toHex(),
      }),
    ).rejects.toThrow(UnanchoredPrePeginError);
    expect(wallet.deriveContextHash).not.toHaveBeenCalled();
  });
});
