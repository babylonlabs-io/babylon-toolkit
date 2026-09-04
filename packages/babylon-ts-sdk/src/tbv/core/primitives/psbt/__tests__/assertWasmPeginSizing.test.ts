/**
 * Tests for assertWasmPeginSizing - the cross-check that guards each
 * value-bearing field WASM returns from createPrePeginTransaction before it
 * feeds a signed transaction or the on-chain PegIn registration.
 */

import type {
  Network,
  PrePeginResult,
  PrePeginParams as WasmPrePeginParams,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Buffer } from "buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  computeMinClaimValueMock,
  computeMinPeginFeeMock,
  createPrePeginTransactionMock,
  peginP2aAnchorOutputMock,
} = vi.hoisted(() => ({
  computeMinClaimValueMock: vi.fn(),
  computeMinPeginFeeMock: vi.fn(),
  createPrePeginTransactionMock: vi.fn(),
  peginP2aAnchorOutputMock: vi.fn(),
}));

vi.mock("../../../wasm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../wasm")>()),
  computeMinClaimValue: computeMinClaimValueMock,
  computeMinPeginFee: computeMinPeginFeeMock,
  createPrePeginTransaction: createPrePeginTransactionMock,
  peginP2aAnchorOutput: peginP2aAnchorOutputMock,
}));

import {
  HtlcOutputMismatchError,
  assertEncodedHtlcOutputsMatch,
  assertWasmPeginSizing,
  deriveExpectedPrePeginHtlc,
} from "../assertWasmPeginSizing";
import { buildPrePeginPsbt, type PrePeginParams } from "../pegin";
import { TEST_KEYS } from "./helpers";

const CLAIM_VALUE = 5_000n;
const PEGIN_AMOUNT = 100_000n;
const PEGIN_FEE = 1_000n;
const DEPOSITOR =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
// v2 and v3 P2A anchor value returned by the mocked WASM facade.
const ANCHOR_VALUE = 240n;
// makeParams uses minPeginFeeRate = 10n. The independent cap is
// 10 x MAX_REASONABLE_PEGIN_VBYTES (100,000), or 1,000,000 sats.
const RESERVE_PLAUSIBILITY_CAP = 1_000_000n;

type EncodedOutput = { value: number; script: Buffer };
type OutputMutation = (
  outputs: readonly EncodedOutput[],
) => readonly EncodedOutput[];

let outputMutation: OutputMutation | undefined;
let htlcScriptOverride: string | undefined;
let unfundedTxVersion = 2;
let unfundedTxLocktime = 0;
let declaredOutputCount: number | undefined;

function makeParams(overrides?: Partial<PrePeginParams>): PrePeginParams {
  return {
    vaultCoreVersion: 1,
    depositorPubkey: DEPOSITOR,
    vaultProviderPubkey: TEST_KEYS.VAULT_PROVIDER,
    vaultKeeperPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
    universalChallengerPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
    hashlocks: ["ab".repeat(32)],
    timelockRefund: 50,
    pegInAmounts: [PEGIN_AMOUNT],
    feeRate: 10n,
    minPeginFeeRate: 10n,
    numLocalChallengers: 1,
    councilQuorum: 2,
    councilSize: 3,
    network: "signet" as Network,
    ...overrides,
  };
}

function makeResult(overrides?: Partial<PrePeginResult>): PrePeginResult {
  return {
    txHex: "00",
    txid: "ff".repeat(32),
    htlcValues: [PEGIN_AMOUNT + CLAIM_VALUE + PEGIN_FEE],
    htlcScriptPubKeys: ["5120" + "11".repeat(32)],
    htlcAddresses: ["tb1pexampleaddress"],
    peginAmounts: [PEGIN_AMOUNT],
    depositorClaimValue: CLAIM_VALUE,
    ...overrides,
  };
}

beforeEach(() => {
  computeMinClaimValueMock.mockReset();
  computeMinClaimValueMock.mockResolvedValue(CLAIM_VALUE);
  computeMinPeginFeeMock.mockReset();
  computeMinPeginFeeMock.mockResolvedValue(PEGIN_FEE);
  createPrePeginTransactionMock.mockReset();
  createPrePeginTransactionMock.mockImplementation(
    async (params: WasmPrePeginParams) => makeWasmResult(params),
  );
  peginP2aAnchorOutputMock.mockReset();
  peginP2aAnchorOutputMock.mockImplementation(async (version: number) =>
    version === 1
      ? null
      : { value: ANCHOR_VALUE, vout: 2, scriptPubKey: "51024e73" },
  );
  outputMutation = undefined;
  htlcScriptOverride = undefined;
  unfundedTxVersion = 2;
  unfundedTxLocktime = 0;
  declaredOutputCount = undefined;
});

describe("assertWasmPeginSizing", () => {
  it("resolves with the asserted minPeginFee for a valid single-vault result", async () => {
    await expect(
      assertWasmPeginSizing(makeResult(), makeParams()),
    ).resolves.toBe(PEGIN_FEE);
  });

  it("throws when htlcValues length does not match the request", async () => {
    await expect(
      assertWasmPeginSizing(
        makeResult({
          htlcValues: [
            PEGIN_AMOUNT + CLAIM_VALUE + PEGIN_FEE,
            PEGIN_AMOUNT + CLAIM_VALUE + PEGIN_FEE,
          ],
        }),
        makeParams(),
      ),
    ).rejects.toThrow(/expected 1 .one per requested deposit/);
  });

  it("throws when parallel array lengths disagree", async () => {
    await expect(
      assertWasmPeginSizing(makeResult({ peginAmounts: [] }), makeParams()),
    ).rejects.toThrow(/mismatched array lengths/);
  });

  it("throws when the hashlock count does not match the amount count", async () => {
    await expect(
      assertWasmPeginSizing(
        makeResult(),
        makeParams({ hashlocks: ["ab".repeat(32), "cd".repeat(32)] }),
      ),
    ).rejects.toThrow(/2 hashlock\(s\), expected 1/);
  });

  it("throws when depositorClaimValue is non-positive", async () => {
    await expect(
      assertWasmPeginSizing(
        makeResult({ depositorClaimValue: 0n }),
        makeParams(),
      ),
    ).rejects.toThrow(/non-positive depositorClaimValue/);
  });

  it("throws when depositorClaimValue disagrees with computeMinClaimValue", async () => {
    computeMinClaimValueMock.mockResolvedValue(CLAIM_VALUE + 1n);
    await expect(
      assertWasmPeginSizing(makeResult(), makeParams()),
    ).rejects.toThrow(/does not match the independently computed/);
  });

  it("throws when peginAmount does not echo the requested amount", async () => {
    await expect(
      assertWasmPeginSizing(
        makeResult({
          peginAmounts: [PEGIN_AMOUNT - 1n],
          // keep htlcValue consistent so the amount check is what trips
          htlcValues: [PEGIN_AMOUNT - 1n + CLAIM_VALUE + PEGIN_FEE],
        }),
        makeParams(),
      ),
    ).rejects.toThrow(/does not match the requested amount/);
  });

  it("throws the independent strict-cover bound when the reserve is zero", async () => {
    await expect(
      assertWasmPeginSizing(
        // implied reserve == 0: fee/anchor budget missing entirely. This
        // must trip the binary-independent floor, not just the
        // WASM-vs-WASM identity.
        makeResult({ htlcValues: [PEGIN_AMOUNT + CLAIM_VALUE] }),
        makeParams(),
      ),
    ).rejects.toThrow(/does not strictly cover/);
  });

  it("throws the independent plausibility cap even when the WASM reference agrees", async () => {
    // A consistently doctored binary: the builder AND computeMinPeginFee
    // both report the same grossly inflated reserve, so the exact identity
    // holds — only the pure-JS cap can reject it.
    computeMinPeginFeeMock.mockResolvedValue(RESERVE_PLAUSIBILITY_CAP + 1n);
    await expect(
      assertWasmPeginSizing(
        makeResult({
          htlcValues: [
            PEGIN_AMOUNT + CLAIM_VALUE + RESERVE_PLAUSIBILITY_CAP + 1n,
          ],
        }),
        makeParams(),
      ),
    ).rejects.toThrow(/exceeds the plausibility cap/);
  });

  it("throws when the reserve exceeds the exact minPeginFee (inflated htlcValue)", async () => {
    await expect(
      assertWasmPeginSizing(
        makeResult({
          htlcValues: [PEGIN_AMOUNT + CLAIM_VALUE + PEGIN_FEE + 1n],
        }),
        makeParams(),
      ),
    ).rejects.toThrow(/expected exactly/);
  });

  it("v2: accepts a reserve of exactly minPeginFee + anchor value", async () => {
    peginP2aAnchorOutputMock.mockResolvedValue({
      value: ANCHOR_VALUE,
      vout: 2,
      scriptPubKey: "51024e73",
    });
    await expect(
      assertWasmPeginSizing(
        makeResult({
          htlcValues: [PEGIN_AMOUNT + CLAIM_VALUE + PEGIN_FEE + ANCHOR_VALUE],
        }),
        makeParams({ vaultCoreVersion: 2 }),
      ),
    ).resolves.toBe(PEGIN_FEE);
  });

  it("v2: throws when the htlcValue omits the anchor value (v1 formula)", async () => {
    peginP2aAnchorOutputMock.mockResolvedValue({
      value: ANCHOR_VALUE,
      vout: 2,
      scriptPubKey: "51024e73",
    });
    await expect(
      assertWasmPeginSizing(
        makeResult({
          htlcValues: [PEGIN_AMOUNT + CLAIM_VALUE + PEGIN_FEE],
        }),
        makeParams({ vaultCoreVersion: 2 }),
      ),
    ).rejects.toThrow(/expected exactly/);
  });

  describe("two-vault batch (overlapping inputs, distinct keys)", () => {
    const PEGIN_A = 100_000n;
    const PEGIN_B = 250_000n;

    function makeTwoVaultParams(): PrePeginParams {
      return makeParams({
        hashlocks: ["ab".repeat(32), "cd".repeat(32)],
        pegInAmounts: [PEGIN_A, PEGIN_B],
      });
    }

    function makeTwoVaultResult(
      overrides?: Partial<PrePeginResult>,
    ): PrePeginResult {
      return makeResult({
        htlcValues: [
          PEGIN_A + CLAIM_VALUE + PEGIN_FEE,
          PEGIN_B + CLAIM_VALUE + PEGIN_FEE,
        ],
        htlcScriptPubKeys: ["5120" + "11".repeat(32), "5120" + "22".repeat(32)],
        htlcAddresses: ["tb1pvaulta", "tb1pvaultb"],
        peginAmounts: [PEGIN_A, PEGIN_B],
        ...overrides,
      });
    }

    it("resolves for a valid two-vault result", async () => {
      await expect(
        assertWasmPeginSizing(makeTwoVaultResult(), makeTwoVaultParams()),
      ).resolves.toBe(PEGIN_FEE);
    });

    it("catches a tampered second-vault peginAmount", async () => {
      await expect(
        assertWasmPeginSizing(
          makeTwoVaultResult({
            peginAmounts: [PEGIN_A, PEGIN_B - 10_000n],
          }),
          makeTwoVaultParams(),
        ),
      ).rejects.toThrow(
        /peginAmount\[1\].*does not match the requested amount/,
      );
    });

    it("catches an inflated second-vault htlcValue", async () => {
      await expect(
        assertWasmPeginSizing(
          makeTwoVaultResult({
            htlcValues: [
              PEGIN_A + CLAIM_VALUE + PEGIN_FEE,
              PEGIN_B + CLAIM_VALUE + PEGIN_FEE + 1n,
            ],
          }),
          makeTwoVaultParams(),
        ),
      ).rejects.toThrow(/htlcValue\[1\].*expected exactly/);
    });
  });
});

const SCRIPT_A = "5120" + "11".repeat(32);
const SCRIPT_B = "5120" + "22".repeat(32);
const AUTH_HASH = "ab".repeat(32);
const AUTH_SCRIPT = `6a20${AUTH_HASH}`;
const CPFP_SCRIPT =
  "5120da4710964f7852695de2da025290e24af6d8c281de5a0b902b7135fd9fd74d21";

function output(value: number, script: string): EncodedOutput {
  return { value, script: Buffer.from(script, "hex") };
}

function encodeUnfundedTransaction(outputs: readonly EncodedOutput[]): string {
  const encodedVersion = Buffer.alloc(4);
  encodedVersion.writeInt32LE(unfundedTxVersion);
  const encodedLocktime = Buffer.alloc(4);
  encodedLocktime.writeUInt32LE(unfundedTxLocktime);
  const encodedOutputs = outputs.map(({ value, script }) => {
    const encodedValue = Buffer.alloc(8);
    encodedValue.writeBigUInt64LE(BigInt(value));
    return Buffer.concat([
      encodedValue,
      Buffer.from([script.length]),
      script,
    ]).toString("hex");
  });
  const encodedOutputCount = (declaredOutputCount ?? outputs.length)
    .toString(16)
    .padStart(2, "0");

  return `${encodedVersion.toString("hex")}000100${encodedOutputCount}${encodedOutputs.join("")}${encodedLocktime.toString("hex")}`;
}

function makeWasmResult(params: WasmPrePeginParams): PrePeginResult {
  const graphAnchorValue = params.txGraphVersion === 1 ? 0n : ANCHOR_VALUE;
  const htlcValues = params.pegInAmounts.map(
    (amount) => amount + CLAIM_VALUE + PEGIN_FEE + graphAnchorValue,
  );
  const htlcScriptPubKeys = params.hashlocks.map(
    (hashlock) =>
      htlcScriptOverride ??
      deriveExpectedPrePeginHtlc(params, hashlock).scriptPubKey.toString("hex"),
  );
  const validOutputs = htlcValues.map((value, index) =>
    output(Number(value), htlcScriptPubKeys[index]),
  );
  if (params.authAnchorHash !== undefined) {
    validOutputs.push(output(0, `6a20${params.authAnchorHash}`));
  }
  validOutputs.push(output(546, CPFP_SCRIPT));
  const encodedOutputs = outputMutation?.(validOutputs) ?? validOutputs;

  return {
    txHex: encodeUnfundedTransaction(encodedOutputs),
    txid: "ff".repeat(32),
    htlcValues,
    htlcScriptPubKeys,
    htlcAddresses: params.pegInAmounts.map(
      (_amount, index) => `tb1pfixture${index}`,
    ),
    peginAmounts: params.pegInAmounts,
    depositorClaimValue: CLAIM_VALUE,
  };
}

function replaceOutput(
  index: number,
  replacement: EncodedOutput,
): OutputMutation {
  return (outputs) =>
    outputs.map((item, itemIndex) =>
      itemIndex === index ? replacement : item,
    );
}

function makeTwoVaultBuildParams(vaultCoreVersion = 1): PrePeginParams {
  return makeParams({
    vaultCoreVersion,
    hashlocks: ["ab".repeat(32), "cd".repeat(32)],
    pegInAmounts: [100_000n, 250_000n],
    authAnchorHash: AUTH_HASH,
  });
}

describe("buildPrePeginPsbt encoded output checks", () => {
  it("accepts exact layouts with and without an auth output", async () => {
    await expect(buildPrePeginPsbt(makeParams())).resolves.toMatchObject({
      authAnchorVout: null,
    });
    await expect(
      buildPrePeginPsbt(makeTwoVaultBuildParams()),
    ).resolves.toMatchObject({ authAnchorVout: 2 });
  });

  it.each([1, 2, 3])(
    "rejects matching forged transaction and metadata scripts for Vault Core %i",
    async (vaultCoreVersion) => {
      htlcScriptOverride = SCRIPT_A;

      await expect(
        buildPrePeginPsbt(makeParams({ vaultCoreVersion })),
      ).rejects.toThrow(
        /does not match the independently derived scriptPubKey/,
      );
    },
  );

  it.each([1, 3])(
    "rejects transaction version %i with otherwise valid outputs",
    async (version) => {
      unfundedTxVersion = version;

      await expect(buildPrePeginPsbt(makeParams())).rejects.toThrow(
        `transaction version ${version}; expected 2`,
      );
    },
  );

  it("rejects a non-zero locktime with otherwise valid outputs", async () => {
    unfundedTxLocktime = 1;

    await expect(buildPrePeginPsbt(makeParams())).rejects.toThrow(
      /transaction locktime 1; expected 0/,
    );
  });

  it("rejects a layout with no HTLC outputs", async () => {
    await expect(
      buildPrePeginPsbt(makeParams({ hashlocks: [], pegInAmounts: [] })),
    ).rejects.toThrow(/expected at least 1/);
  });

  it("rejects an extra output with an auth output", async () => {
    outputMutation = (outputs) => [...outputs, output(1, SCRIPT_A)];

    await expect(buildPrePeginPsbt(makeTwoVaultBuildParams())).rejects.toThrow(
      "WASM Pre-PegIn output layout has 5 output(s); expected exactly 4.",
    );
  });

  it("rejects an extra output without an auth output", async () => {
    outputMutation = (outputs) => [...outputs, output(1, SCRIPT_A)];

    await expect(buildPrePeginPsbt(makeParams())).rejects.toThrow(
      "WASM Pre-PegIn output layout has 3 output(s); expected exactly 2.",
    );
  });

  it("rejects output bytes after the declared output set", async () => {
    outputMutation = (outputs) => [...outputs, output(1, SCRIPT_A)];
    declaredOutputCount = 2;

    await expect(buildPrePeginPsbt(makeParams())).rejects.toThrow(
      "WASM transaction outputs do not end immediately before locktime",
    );
  });

  it.each<[name: string, mutate: OutputMutation, expectedMessage: RegExp]>([
    [
      "a missing CPFP output",
      (outputs) => outputs.slice(0, -1),
      /output layout has 3 output\(s\); expected exactly 4/,
    ],
    [
      "a wrong HTLC value",
      replaceOutput(1, output(255_999, SCRIPT_B)),
      /HTLC output\[1\] value 255999 does not match.*256000/s,
    ],
    [
      "a wrong HTLC script",
      replaceOutput(0, output(106_000, SCRIPT_B)),
      /HTLC output\[0\] scriptPubKey .* does not match/s,
    ],
    [
      "reordered auth and CPFP outputs",
      (outputs) => [outputs[0], outputs[1], outputs[3], outputs[2]],
      /auth output\[2\] value 546 sat; expected exactly 0 sat/,
    ],
    [
      "a non-zero auth value",
      replaceOutput(2, output(1, AUTH_SCRIPT)),
      /auth output\[2\] value 1 sat; expected exactly 0 sat/,
    ],
    [
      "a wrong auth payload",
      replaceOutput(2, output(0, `6a20${"cd".repeat(32)}`)),
      /auth output\[2\] scriptPubKey .*; expected 6a20abab/s,
    ],
    [
      "a wrong CPFP value",
      replaceOutput(3, output(545, CPFP_SCRIPT)),
      /CPFP output\[3\] value 545 sat; expected exactly 546 sat/,
    ],
    [
      "a wrong CPFP script",
      replaceOutput(3, output(546, SCRIPT_A)),
      /CPFP output\[3\] scriptPubKey .*; expected depositor BIP-86 script/s,
    ],
  ])(
    "rejects %s through the public builder",
    async (_name, mutate, message) => {
      outputMutation = mutate;

      await expect(
        buildPrePeginPsbt(makeTwoVaultBuildParams()),
      ).rejects.toThrow(message);
    },
  );

  it("returns HtlcOutputMismatchError for a short funded HTLC prefix", () => {
    let error: unknown;
    try {
      assertEncodedHtlcOutputsMatch(
        [output(105_000, SCRIPT_A)],
        [105_000n, 255_000n],
        [SCRIPT_A, SCRIPT_B],
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(HtlcOutputMismatchError);
    expect(error).toHaveProperty(
      "message",
      "Encoded Pre-PegIn tx has 1 output(s), fewer than the 2 HTLC " +
        "output(s) the cross-check validated.",
    );
  });

  it("permits outputs after the funded recovery HTLC prefix", () => {
    expect(() =>
      assertEncodedHtlcOutputsMatch(
        [
          output(105_000, SCRIPT_A),
          output(255_000, SCRIPT_B),
          output(0, AUTH_SCRIPT),
          output(546, CPFP_SCRIPT),
        ],
        [105_000n, 255_000n],
        [SCRIPT_A, SCRIPT_B],
      ),
    ).not.toThrow();
  });
});
