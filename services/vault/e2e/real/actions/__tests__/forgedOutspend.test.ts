import { Transaction } from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import {
  ctaIsActivate,
  forgedOutspendBody,
  forgedVaultFromRecord,
  isTxHexRequest,
  matchForgedRequest,
  rowOffersEscapeHatch,
  rowsOfferActivation,
} from "../forgedOutspend";

const VAULT_ID = `0x${"11".repeat(32)}` as const;
const PRE_PEGIN_TXID = "ab".repeat(32);
const API = "https://mempool.space/signet/api";

/** A PegIn as the depositor signed it: one input spending the HTLC, `[sig, leaf, control block]`. */
function signedPegin(): Transaction {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.from(PRE_PEGIN_TXID, "hex").reverse(), 1, 0xfffffffe);
  tx.addOutput(Buffer.from(`5120${"22".repeat(32)}`, "hex"), 1_000_000);
  tx.setWitness(0, [
    Buffer.alloc(64, 7),
    Buffer.alloc(120, 9),
    Buffer.alloc(65, 3),
  ]);
  return tx;
}

describe("forgedVaultFromRecord", () => {
  it("names the txid of the on-chain signed PegIn as the spender and serves that PegIn as its hex", () => {
    const pegin = signedPegin();

    const vault = forgedVaultFromRecord(VAULT_ID, {
      prePeginTxHash: `0x${PRE_PEGIN_TXID.toUpperCase()}`,
      htlcVout: 1,
      depositorSignedPeginTx: `0x${pegin.toHex()}`,
    });

    expect(vault).toEqual({
      vaultId: VAULT_ID,
      prePeginTxid: PRE_PEGIN_TXID,
      htlcVout: 1,
      peginTxid: pegin.getId(),
      signedPeginTxHex: pegin.toHex(),
    });
  });
});

describe("matchForgedRequest", () => {
  const vault = forgedVaultFromRecord(VAULT_ID, {
    prePeginTxHash: PRE_PEGIN_TXID,
    htlcVout: 1,
    depositorSignedPeginTx: signedPegin().toHex(),
  });

  it("forges the outspend of the vault's own HTLC output", () => {
    expect(
      matchForgedRequest([vault], `${API}/tx/${PRE_PEGIN_TXID}/outspend/1`),
    ).toEqual({ kind: "outspend", vault });
  });

  it("leaves the outspend of another output of the same Pre-PegIn to the real API", () => {
    expect(
      matchForgedRequest([vault], `${API}/tx/${PRE_PEGIN_TXID}/outspend/0`),
    ).toBeUndefined();
  });

  it("forges the hex of the vault's PegIn", () => {
    expect(
      matchForgedRequest([vault], `${API}/tx/${vault.peginTxid}/hex`),
    ).toEqual({ kind: "hex", vault });
  });

  it("recognises the real Pre-PegIn's hex fetch, which the forgery leaves to the API", () => {
    expect(
      isTxHexRequest(`${API}/tx/${PRE_PEGIN_TXID}/hex`, PRE_PEGIN_TXID),
    ).toBe(true);
    expect(
      isTxHexRequest(`${API}/tx/${PRE_PEGIN_TXID}/outspend/1`, PRE_PEGIN_TXID),
    ).toBe(false);
    expect(
      isTxHexRequest(`${API}/tx/${vault.peginTxid}/hex`, PRE_PEGIN_TXID),
    ).toBe(false);
  });

  it("leaves every other request to the real API", () => {
    expect(
      matchForgedRequest([vault], `${API}/tx/${vault.peginTxid}`),
    ).toBeUndefined();
    expect(
      matchForgedRequest([vault], `${API}/tx/${"cd".repeat(32)}/hex`),
    ).toBeUndefined();
  });
});

describe("forgedOutspendBody", () => {
  it("reports the HTLC spent by the PegIn, unconfirmed", () => {
    const vault = forgedVaultFromRecord(VAULT_ID, {
      prePeginTxHash: PRE_PEGIN_TXID,
      htlcVout: 1,
      depositorSignedPeginTx: signedPegin().toHex(),
    });

    expect(forgedOutspendBody(vault)).toEqual({
      spent: true,
      txid: vault.peginTxid,
      vin: 0,
      status: { confirmed: false },
    });
  });
});

describe("rowOffersEscapeHatch", () => {
  it("reads the stuck label as the escape hatch on offer", () => {
    expect(
      rowOffersEscapeHatch(
        "0.001 BTC Activation incomplete Your BTC…",
        "Withdraw",
      ),
    ).toBe(true);
  });

  it("reads a Withdraw CTA as the escape hatch on offer, whatever the label", () => {
    expect(rowOffersEscapeHatch("0.001 BTC", " Withdraw ")).toBe(true);
  });

  it("does not read a row ready to activate as the escape hatch", () => {
    expect(
      rowOffersEscapeHatch(
        "0.001 BTC Ready to activate Activation required",
        "Activate",
      ),
    ).toBe(false);
  });
});

describe("ctaIsActivate", () => {
  it("accepts only the normal activation CTA", () => {
    expect(ctaIsActivate("Activate")).toBe(true);
    expect(ctaIsActivate("Withdraw")).toBe(false);
    expect(ctaIsActivate(undefined)).toBe(false);
  });
});

describe("rowsOfferActivation", () => {
  it("accepts a split whose later sibling waits, disabled, for the earlier vault", () => {
    expect(
      rowsOfferActivation([
        { rowText: "0.01 sBTC Ready to activate", ctaText: "Activate" },
        { rowText: "0.01 sBTC Awaiting earlier BTCVault", ctaText: undefined },
      ]),
    ).toBe(true);
  });

  it("does not accept rows of which none offers Activate", () => {
    expect(
      rowsOfferActivation([
        { rowText: "0.01 sBTC Awaiting earlier BTCVault", ctaText: undefined },
      ]),
    ).toBe(false);
    expect(rowsOfferActivation([])).toBe(false);
  });

  it("does not accept a row still waiting for its activation window", () => {
    expect(
      rowsOfferActivation([
        { rowText: "0.01 sBTC Ready to activate", ctaText: "Activate" },
        { rowText: "0.01 sBTC Awaiting activation window", ctaText: undefined },
      ]),
    ).toBe(false);
  });
});
