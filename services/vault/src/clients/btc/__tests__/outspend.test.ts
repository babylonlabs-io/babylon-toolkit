// @vitest-environment node
// The curve library needs Node's typed arrays for these non-DOM checks.

/**
 * provePeginSpendsHtlc — proving from the PegIn transaction itself, not the
 * mempool API's word, that the vault's PegIn is a valid spend of its HTLC. The verifier the
 * proof rests on (`verifyPeginHashlockSpend`) is tested on real and synthetic
 * transactions in the SDK. Here it is a seam that pins what the proof fetches,
 * what it checks the result against, and how it reads the verdict — and then
 * the real verifier, on a real signet PegIn, checks that the registry's fields
 * reach it in the form it expects.
 */

import { Transaction } from "bitcoinjs-lib";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { provePeginSpendsHtlc } from "../outspend";

import {
  SIGNET_HASHLOCK,
  SIGNET_HTLC_VOUT,
  SIGNET_PEGIN_TXID,
  SIGNET_PEGIN_TX_HEX,
  SIGNET_PRE_PEGIN_TXID,
  SIGNET_PRE_PEGIN_TX_HEX,
} from "./signetPegin.fixture";

const mockGetTxHex = vi.hoisted(() => vi.fn());
vi.mock("@babylonlabs-io/ts-sdk/tbv/core/clients", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@babylonlabs-io/ts-sdk/tbv/core/clients")
  >()),
  getTxHex: mockGetTxHex,
}));

const mockVerifyPeginHashlockSpend = vi.hoisted(() => vi.fn());
vi.mock(
  "@babylonlabs-io/ts-sdk/tbv/core/primitives",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@babylonlabs-io/ts-sdk/tbv/core/primitives")
    >()),
    verifyPeginHashlockSpend: mockVerifyPeginHashlockSpend,
  }),
);

const API_URL = "https://mempool.test/api";
const HASHLOCK =
  "0xec4916dd28fc4c10d78e287ca5d9cc51ee1ae73cbfde08c6b37324cbfaac8bc5";
const PRE_PEGIN_TXID = "ab".repeat(32);
const PEGIN_HEX = "02000000pegin";
const PRE_PEGIN_HEX = "02000000prepegin";

/** The PegIn as the depositor signed it, which the registry stores. */
const signedPegin = (() => {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.from(PRE_PEGIN_TXID, "hex").reverse(), 1, 0xfffffffe);
  tx.addOutput(Buffer.from(`5120${"11".repeat(32)}`, "hex"), 1_000_000);
  tx.setWitness(0, [Buffer.alloc(64, 7), Buffer.alloc(120, 9)]);
  return tx;
})();

const onChainRecord = {
  depositorSignedPeginTx: `0x${signedPegin.toHex()}` as Hex,
  prePeginTxHash: `0x${PRE_PEGIN_TXID}` as Hex,
  htlcVout: 1,
  hashlock: HASHLOCK as Hex,
};

/** Serves transactions by txid; anything else is a 404. */
function mempoolServes(hexByTxid: Record<string, string>) {
  mockGetTxHex.mockImplementation(async (txid: string) => {
    const hex = hexByTxid[txid];
    if (hex === undefined) throw new Error("Mempool API error (404)");
    return hex;
  });
}

beforeEach(() => {
  mockGetTxHex.mockReset();
  mockVerifyPeginHashlockSpend.mockReset();
});

describe("provePeginSpendsHtlc", () => {
  it("checks the PegIn, fetched by the on-chain signed PegIn's txid, and the registered Pre-PegIn against the registered outpoint and hashlock", async () => {
    mempoolServes({
      [signedPegin.getId()]: PEGIN_HEX,
      [PRE_PEGIN_TXID]: PRE_PEGIN_HEX,
    });
    mockVerifyPeginHashlockSpend.mockReturnValue({ valid: true });

    await expect(provePeginSpendsHtlc(onChainRecord, API_URL)).resolves.toEqual(
      { status: "proven" },
    );
    expect(mockGetTxHex).toHaveBeenCalledWith(signedPegin.getId(), API_URL);
    expect(mockGetTxHex).toHaveBeenCalledWith(PRE_PEGIN_TXID, API_URL);
    expect(mockVerifyPeginHashlockSpend).toHaveBeenCalledWith({
      peginTxHex: PEGIN_HEX,
      prePeginTxHex: PRE_PEGIN_HEX,
      peginTxid: signedPegin.getId(),
      prePeginTxid: PRE_PEGIN_TXID,
      htlcVout: 1,
      hashlock: HASHLOCK,
    });
  });

  it("does not prove the spend, and says why, when the served PegIn is not a valid spend of the HTLC", async () => {
    mempoolServes({
      [signedPegin.getId()]: PEGIN_HEX,
      [PRE_PEGIN_TXID]: PRE_PEGIN_HEX,
    });
    mockVerifyPeginHashlockSpend.mockReturnValue({
      valid: false,
      reason: "the depositor's signature does not verify",
    });

    await expect(provePeginSpendsHtlc(onChainRecord, API_URL)).resolves.toEqual(
      {
        status: "unproven",
        reason: "the depositor's signature does not verify",
      },
    );
  });

  it("reports the proof unavailable, with the cause, when the PegIn cannot be fetched", async () => {
    mempoolServes({ [PRE_PEGIN_TXID]: PRE_PEGIN_HEX });

    const proof = await provePeginSpendsHtlc(onChainRecord, API_URL);

    expect(proof).toEqual({
      status: "unavailable",
      cause: new Error("Mempool API error (404)"),
    });
    expect(mockVerifyPeginHashlockSpend).not.toHaveBeenCalled();
  });

  it("reports the proof unavailable when the Pre-PegIn cannot be fetched", async () => {
    mempoolServes({ [signedPegin.getId()]: PEGIN_HEX });

    await expect(
      provePeginSpendsHtlc(onChainRecord, API_URL),
    ).resolves.toMatchObject({ status: "unavailable" });
    expect(mockVerifyPeginHashlockSpend).not.toHaveBeenCalled();
  });
});

describe("provePeginSpendsHtlc with the real verifier, on a real signet PegIn", () => {
  // The registry's record of that vault: the PegIn as the depositor signed it
  // (`[depositor sig, leaf, control block]`), and its HTLC outpoint and
  // hashlock as `bytes32` hex. In the broadcast witness the depositor's
  // signature sits just under the preimage, after 4 challenger, 4 keeper and
  // the vault provider's signatures.
  const SIGNET_DEPOSITOR_SIG_INDEX = 9;
  const broadcastPegin = Transaction.fromHex(SIGNET_PEGIN_TX_HEX);
  const depositorSigned = Transaction.fromHex(SIGNET_PEGIN_TX_HEX);
  const witness = broadcastPegin.ins[0].witness;
  depositorSigned.setWitness(0, [
    witness[SIGNET_DEPOSITOR_SIG_INDEX],
    witness[witness.length - 2],
    witness[witness.length - 1],
  ]);
  const signetRecord = {
    depositorSignedPeginTx: `0x${depositorSigned.toHex()}` as Hex,
    prePeginTxHash: `0x${SIGNET_PRE_PEGIN_TXID}` as Hex,
    htlcVout: SIGNET_HTLC_VOUT,
    hashlock: SIGNET_HASHLOCK as Hex,
  };

  beforeEach(async () => {
    const { verifyPeginHashlockSpend } = await vi.importActual<
      typeof import("@babylonlabs-io/ts-sdk/tbv/core/primitives")
    >("@babylonlabs-io/ts-sdk/tbv/core/primitives");
    mockVerifyPeginHashlockSpend.mockImplementation(verifyPeginHashlockSpend);
  });

  it("proves the spend from the registry record when the API serves the broadcast PegIn", async () => {
    mempoolServes({
      [SIGNET_PEGIN_TXID]: SIGNET_PEGIN_TX_HEX,
      [SIGNET_PRE_PEGIN_TXID]: SIGNET_PRE_PEGIN_TX_HEX,
    });

    await expect(provePeginSpendsHtlc(signetRecord, API_URL)).resolves.toEqual({
      status: "proven",
    });
  });

  it("does not prove the spend when the API serves back the depositor-signed PegIn", async () => {
    mempoolServes({
      [SIGNET_PEGIN_TXID]: depositorSigned.toHex(),
      [SIGNET_PRE_PEGIN_TXID]: SIGNET_PRE_PEGIN_TX_HEX,
    });

    await expect(provePeginSpendsHtlc(signetRecord, API_URL)).resolves.toEqual({
      status: "unproven",
      reason: "the witness does not hold one item per check of the leaf",
    });
  });
});
