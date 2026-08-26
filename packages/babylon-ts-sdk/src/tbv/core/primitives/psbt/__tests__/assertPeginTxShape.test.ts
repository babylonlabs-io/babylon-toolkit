/**
 * Negative-path tests for the PegIn shape assertion inside
 * `buildPeginTxFromFundedPrePegin`: every bind (input outpoint, output
 * count, vault value/script, txid, depositor-claim value/script, anchor
 * validation) must reject a doctored WASM result. The WASM boundary is
 * mocked so each dimension can be corrupted independently; the happy path
 * against the real binary is covered by the golden vectors in
 * `pegin.test.ts`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { Buffer } from "buffer";
import * as bitcoin from "bitcoinjs-lib";

const {
  buildPeginTxFromPrePeginMock,
  computeMinClaimValueMock,
  peginP2aAnchorOutputMock,
  validatePeginP2aAnchorMock,
} = vi.hoisted(() => ({
  buildPeginTxFromPrePeginMock: vi.fn(),
  computeMinClaimValueMock: vi.fn(),
  peginP2aAnchorOutputMock: vi.fn(),
  validatePeginP2aAnchorMock: vi.fn(),
}));

vi.mock("@babylonlabs-io/babylon-tbv-rust-wasm", () => ({
  buildPeginTxFromPrePegin: buildPeginTxFromPrePeginMock,
  computeMinClaimValue: computeMinClaimValueMock,
  createPrePeginTransaction: vi.fn(),
  peginP2aAnchorOutput: peginP2aAnchorOutputMock,
  validatePeginP2aAnchor: validatePeginP2aAnchorMock,
  // Real NUMS constant (BIP-341 lift_x example) — the claim-script
  // derivation under test must use the byte-identical internal key.
  tapInternalPubkey: new Uint8Array(
    Buffer.from(
      "50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0",
      "hex",
    ),
  ),
}));

import { buildPeginTxFromFundedPrePegin, type PrePeginParams } from "../pegin";
import { TEST_AMOUNTS, TEST_KEYS } from "./helpers";

const CLAIM_VALUE = 20_000n;
const VAULT_SCRIPT = "5120" + "ee".repeat(32);

function makePrePeginParams(): PrePeginParams {
  return {
    vaultCoreVersion: 1,
    depositorPubkey: TEST_KEYS.DEPOSITOR,
    vaultProviderPubkey: TEST_KEYS.VAULT_PROVIDER,
    vaultKeeperPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
    universalChallengerPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
    hashlocks: ["ab".repeat(32)],
    timelockRefund: 50,
    pegInAmounts: [TEST_AMOUNTS.PEGIN],
    feeRate: 10n,
    minPeginFeeRate: 10n,
    numLocalChallengers: 1,
    councilQuorum: 2,
    councilSize: 3,
    network: "signet" as const,
  };
}

/** Depositor-claim SPK exactly as production derives it (SingleKeyConnector). */
function claimScript(depositorPubkey: string): Buffer {
  const leaf = bitcoin.script.compile([
    Buffer.from(depositorPubkey, "hex"),
    bitcoin.opcodes.OP_CHECKSIG,
  ]);
  const { output } = bitcoin.payments.p2tr({
    internalPubkey: Buffer.from(
      "50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0",
      "hex",
    ),
    scriptTree: { output: leaf },
  });
  return output!;
}

/** A minimal parseable "funded Pre-PegIn" whose txid the PegIn must spend. */
function makeFundedPrePeginHex(): string {
  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, 0xaa), 0);
  tx.addOutput(Buffer.from(VAULT_SCRIPT, "hex"), 150_000);
  return tx.toHex();
}

interface DoctorOptions {
  metadataVaultValue?: bigint;
  metadataTxidByte?: string;
  extraInput?: boolean;
  prevoutTxidByte?: number;
  inputVout?: number;
  extraOutput?: boolean;
  encodedVaultValue?: number;
  encodedVaultScript?: string;
  claimValue?: number;
  claimScriptOverride?: Buffer;
}

/** Build the PegIn tx bytes + WASM-reported metadata, honest by default. */
function makeWasmResult(fundedHex: string, doctor: DoctorOptions = {}) {
  const params = makePrePeginParams();
  const fundedTxid = bitcoin.Transaction.fromHex(fundedHex).getId();
  const prevoutHash = Buffer.from(fundedTxid, "hex").reverse();
  if (doctor.prevoutTxidByte !== undefined) {
    prevoutHash[0] = doctor.prevoutTxidByte;
  }

  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.addInput(prevoutHash, doctor.inputVout ?? 0);
  if (doctor.extraInput) tx.addInput(Buffer.alloc(32, 0xbb), 1);

  tx.addOutput(
    Buffer.from(doctor.encodedVaultScript ?? VAULT_SCRIPT, "hex"),
    doctor.encodedVaultValue ?? Number(TEST_AMOUNTS.PEGIN),
  );
  tx.addOutput(
    doctor.claimScriptOverride ?? claimScript(params.depositorPubkey),
    doctor.claimValue ?? Number(CLAIM_VALUE),
  );
  if (doctor.extraOutput) {
    tx.addOutput(Buffer.from(VAULT_SCRIPT, "hex"), 330);
  }

  const txid = doctor.metadataTxidByte
    ? doctor.metadataTxidByte + tx.getId().slice(2)
    : tx.getId();
  return {
    txHex: tx.toHex(),
    txid,
    vaultScriptPubKey: VAULT_SCRIPT,
    vaultValue: doctor.metadataVaultValue ?? TEST_AMOUNTS.PEGIN,
  };
}

async function buildWith(fundedHex: string, doctor: DoctorOptions = {}) {
  buildPeginTxFromPrePeginMock.mockResolvedValue(
    makeWasmResult(fundedHex, doctor),
  );
  return buildPeginTxFromFundedPrePegin({
    prePeginParams: makePrePeginParams(),
    timelockPegin: 100,
    fundedPrePeginTxHex: fundedHex,
    htlcVout: 0,
  });
}

describe("assertPeginTxShape (via buildPeginTxFromFundedPrePegin)", () => {
  const fundedHex = makeFundedPrePeginHex();

  beforeEach(() => {
    vi.clearAllMocks();
    computeMinClaimValueMock.mockResolvedValue(CLAIM_VALUE);
    peginP2aAnchorOutputMock.mockResolvedValue(null); // v1: no anchor
    validatePeginP2aAnchorMock.mockResolvedValue(undefined);
  });

  it("accepts an honest result (harness sanity)", async () => {
    const result = await buildWith(fundedHex);
    expect(result.vaultValue).toBe(TEST_AMOUNTS.PEGIN);
  });

  it("rejects a PegIn with more than one input", async () => {
    await expect(buildWith(fundedHex, { extraInput: true })).rejects.toThrow(
      /expected exactly 1/,
    );
  });

  it("rejects an input spending a different transaction", async () => {
    await expect(
      buildWith(fundedHex, { prevoutTxidByte: 0x00 }),
    ).rejects.toThrow(/expected the funded Pre-PegIn/);
  });

  it("rejects an input spending a different HTLC vout", async () => {
    await expect(buildWith(fundedHex, { inputVout: 1 })).rejects.toThrow(
      /expected the requested HTLC vout 0/,
    );
  });

  it("rejects an unexpected output count for the version", async () => {
    await expect(buildWith(fundedHex, { extraOutput: true })).rejects.toThrow(
      /expected exactly 2 for vaultCoreVersion 1/,
    );
  });

  it("rejects an encoded vault value that differs from the metadata", async () => {
    await expect(
      buildWith(fundedHex, { encodedVaultValue: Number(TEST_AMOUNTS.PEGIN) - 1 }),
    ).rejects.toThrow(/does not match the WASM-reported vaultValue/);
  });

  it("rejects an encoded vault script that differs from the metadata", async () => {
    await expect(
      buildWith(fundedHex, { encodedVaultScript: "5120" + "dd".repeat(32) }),
    ).rejects.toThrow(/does not match the WASM-reported vaultScriptPubKey/);
  });

  it("rejects a depositor-claim value that differs from the WASM reference", async () => {
    await expect(
      buildWith(fundedHex, { claimValue: Number(CLAIM_VALUE) - 1 }),
    ).rejects.toThrow(/independently computed claim value/);
  });

  it("rejects a depositor-claim output redirected to another script", async () => {
    await expect(
      buildWith(fundedHex, {
        claimScriptOverride: claimScript(TEST_KEYS.VAULT_PROVIDER),
      }),
    ).rejects.toThrow(/does not pay to the depositor's claim script/);
  });

  it("rejects a reported vault value that differs from the requested amount", async () => {
    // Both the metadata and the encoded output carry the doctored value, so
    // only the requested-amount echo can catch it.
    await expect(
      buildWith(fundedHex, {
        metadataVaultValue: TEST_AMOUNTS.PEGIN - 1n,
        encodedVaultValue: Number(TEST_AMOUNTS.PEGIN) - 1,
      }),
    ).rejects.toThrow(/does not match the requested peg-in amount/);
  });

  it("rejects a reported txid that differs from the encoded bytes", async () => {
    await expect(
      buildWith(fundedHex, { metadataTxidByte: "00" }),
    ).rejects.toThrow(/does not match the WASM-reported txid/);
  });

  it("propagates the anchor validator's rejection", async () => {
    validatePeginP2aAnchorMock.mockRejectedValue(
      new Error("missing P2A anchor output (output2)"),
    );
    await expect(buildWith(fundedHex)).rejects.toThrow(/missing P2A anchor/);
  });
});
