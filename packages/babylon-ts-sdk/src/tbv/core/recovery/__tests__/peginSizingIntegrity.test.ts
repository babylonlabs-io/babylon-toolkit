/**
 * Tests for the WASM sizing boundary checks in the recovery search
 * (CLAUDE.md critical path 1).
 *
 * Deliberately its own file: it is the ONLY recovery test that mocks the WASM
 * oracle, and it has to, because a conformant binary cannot produce the values
 * these guards exist to catch. Keeping it separate leaves
 * `reconstructPeginParams.test.ts` running entirely against the real engine.
 *
 * The behaviour under test is not just "it throws" but "it throws OUT of the
 * search": a malformed sizing output indicts the binary, not the candidate, so
 * counting it as one more rejection would bury a broken engine under a
 * not-found result.
 */

import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildPeginParamsCandidates,
  type OffchainParamsCandidate,
  type ParticipantKeySetCandidate,
} from "../peginParamsCandidates";
import { reconstructPeginParams } from "../reconstructPeginParams";
import {
  PeginParamsNotFoundError,
  PeginSizingIntegrityError,
} from "../recoveryErrors";

const computeMinClaimValue = vi.fn();
const computeMinPeginFee = vi.fn();
const peginP2aAnchorOutput = vi.fn();
const getPrePeginHtlcConnectorInfo = vi.fn();

vi.mock("@babylonlabs-io/babylon-tbv-rust-wasm", () => ({
  computeMinClaimValue: (...args: unknown[]) => computeMinClaimValue(...args),
  computeMinPeginFee: (...args: unknown[]) => computeMinPeginFee(...args),
  peginP2aAnchorOutput: (...args: unknown[]) => peginP2aAnchorOutput(...args),
  getPrePeginHtlcConnectorInfo: (...args: unknown[]) =>
    getPrePeginHtlcConnectorInfo(...args),
}));

const DEPOSITOR =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

const OFFCHAIN: OffchainParamsCandidate = {
  version: 4,
  protocolFeeRate: 3n,
  minPeginFeeRate: 7n,
  councilQuorum: 2,
  councilSize: 3,
  timelockPegin: 684,
  timelockAssert: 700,
  timelockRefund: 2016,
};

const PARTICIPANTS: ParticipantKeySetCandidate = {
  vaultProvider: "0x1111111111111111111111111111111111111111",
  vaultProviderBtcPubkey: "cc".repeat(32),
  appVaultKeepersVersion: 2,
  vaultKeeperBtcPubkeys: ["dd".repeat(32)],
  universalChallengersVersion: 5,
  universalChallengerBtcPubkeys: ["ee".repeat(32)],
};

/** One HTLC output plus the auth-anchor OP_RETURN at vout 1. */
function anchoredTx(): string {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, 0x11), 0);
  tx.addOutput(Buffer.from(`5120${"00".repeat(32)}`, "hex"), 1_000_000);
  tx.addOutput(
    Buffer.concat([Buffer.from([0x6a, 0x20]), Buffer.alloc(32, 0xcd)]),
    0,
  );
  return tx.toHex();
}

function search(candidateCount: number) {
  return reconstructPeginParams({
    hashlocks: ["ab".repeat(32)],
    fundedPrePeginTxHex: anchoredTx(),
    depositorBtcPubkey: DEPOSITOR,
    prepeginMaxFee: 1500n,
    maxAcceptableCommissionBps: 250,
    network: "signet" as never,
    candidates: buildPeginParamsCandidates({
      vaultCoreVersion: 2,
      offchainParams: Array.from({ length: candidateCount }, (_, i) => ({
        ...OFFCHAIN,
        version: i + 1,
      })),
      participantKeySets: [PARTICIPANTS],
    }),
    unresolvedVersions: [],
  });
}

describe("WASM sizing boundary checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    computeMinClaimValue.mockResolvedValue(23_862n);
    computeMinPeginFee.mockResolvedValue(2_177n);
    peginP2aAnchorOutput.mockResolvedValue({ value: 240n });
  });

  it("refuses a non-positive depositorClaimValue", async () => {
    computeMinClaimValue.mockResolvedValue(0n);

    await expect(search(1)).rejects.toThrow(PeginSizingIntegrityError);
    await expect(search(1)).rejects.toThrow(
      /non-positive depositorClaimValue 0/,
    );
  });

  it("refuses a non-positive peginMaxFee", async () => {
    computeMinPeginFee.mockResolvedValue(0n);

    await expect(search(1)).rejects.toThrow(/non-positive peginMaxFee 0/);
  });

  it("refuses a negative P2A anchor value", async () => {
    peginP2aAnchorOutput.mockResolvedValue({ value: -1n });

    await expect(search(1)).rejects.toThrow(/negative P2A anchor value -1/);
  });

  it("escapes the search rather than counting as one more rejected candidate", async () => {
    computeMinClaimValue.mockResolvedValue(0n);

    const error = await search(3).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(PeginSizingIntegrityError);
    expect(error).not.toBeInstanceOf(PeginParamsNotFoundError);
    // Aborted on the first candidate: the verifier was never reached, and the
    // remaining two were never tried.
    expect(getPrePeginHtlcConnectorInfo).not.toHaveBeenCalled();
    expect(computeMinClaimValue).toHaveBeenCalledTimes(1);
  });

  it("reads an absent anchor as zero rather than treating it as malformed", async () => {
    peginP2aAnchorOutput.mockResolvedValue(null);
    getPrePeginHtlcConnectorInfo.mockRejectedValue(new Error("stub"));

    // Reaching the verifier at all proves the sizing guards passed; the stubbed
    // connector then rejects the candidate, which is the not-found path.
    await expect(search(1)).rejects.toThrow(PeginParamsNotFoundError);
    expect(getPrePeginHtlcConnectorInfo).toHaveBeenCalled();
  });
});
