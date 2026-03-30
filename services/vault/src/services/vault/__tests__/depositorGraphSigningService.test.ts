import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DepositorGraphTransactions } from "../../../clients/vault-provider-rpc/types";
import {
  signDepositorGraph,
  type SignDepositorGraphParams,
} from "../depositorGraphSigningService";

// Mock bitcoinjs-lib Psbt for both verification (fromBase64) and extraction (fromHex)
vi.mock("bitcoinjs-lib", () => ({
  Psbt: {
    fromBase64: vi.fn(),
    fromHex: vi.fn(),
  },
}));

const WALLET_COMPRESSED_PUBKEY =
  "021234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

/** A 64-byte Schnorr signature (128 hex chars). */
const MOCK_SIG_BYTES = Buffer.alloc(64, 0xab);

/** Helper to create a base64-encoded mock PSBT. */
function mockPsbtBase64(label: string): string {
  return Buffer.from(label).toString("base64");
}

function createMockDepositorGraph(
  numChallengers = 1,
): DepositorGraphTransactions {
  const challengers = Array.from({ length: numChallengers }, (_, i) => {
    const pubkey = String.fromCharCode(97 + i).repeat(64); // a..a, b..b, ...
    return {
      challenger_pubkey: pubkey,
      nopayout_tx: { tx_hex: `nopayout_tx_${i}` },
      challenge_assert_tx: { tx_hex: `ca_tx_${i}` },
      challenge_assert_psbt: mockPsbtBase64(`ca_psbt_${i}`),
      nopayout_psbt: mockPsbtBase64(`nopayout_psbt_${i}`),
    };
  });

  return {
    claim_tx: { tx_hex: "claim_tx_hex" },
    payout_tx: { tx_hex: "payout_tx_hex" },
    assert_tx: { tx_hex: "assert_tx_hex" },
    payout_psbt: mockPsbtBase64("payout_psbt"),
    offchain_params_version: 1,
    challenger_presign_data: challengers,
  };
}

function createMockParams(
  overrides?: Partial<SignDepositorGraphParams>,
): SignDepositorGraphParams {
  const depositorGraph =
    overrides?.depositorGraph ?? createMockDepositorGraph(1);

  // Set up PSBT verification mock for the graph being used
  setupPsbtVerificationMock(depositorGraph);

  return {
    depositorGraph,
    btcWallet: {
      signPsbts: vi.fn(),
      signPsbt: vi.fn(),
      getPublicKeyHex: vi.fn().mockResolvedValue(WALLET_COMPRESSED_PUBKEY),
    } as any,
    ...overrides,
  };
}

/** Number of ChallengeAssert inputs used in test fixtures. */
const TEST_CHALLENGE_ASSERT_INPUT_COUNT = 3;

/**
 * Configure Psbt.fromBase64 mock to return a fake PSBT whose getTransaction()
 * returns the matching tx_hex for verification to pass.
 */
function setupPsbtVerificationMock(
  depositorGraph: DepositorGraphTransactions,
): void {
  const txHexByPsbt = new Map<string, string>();
  const challengeAssertPsbts = new Set<string>();
  txHexByPsbt.set(depositorGraph.payout_psbt, depositorGraph.payout_tx.tx_hex);
  for (const c of depositorGraph.challenger_presign_data) {
    txHexByPsbt.set(c.nopayout_psbt, c.nopayout_tx.tx_hex);
    txHexByPsbt.set(c.challenge_assert_psbt, c.challenge_assert_tx.tx_hex);
    challengeAssertPsbts.add(c.challenge_assert_psbt);
  }

  vi.mocked(Psbt.fromBase64).mockImplementation((b64: string) => {
    const expectedHex = txHexByPsbt.get(b64);
    return {
      data: {
        getTransaction: () => ({
          toString: (encoding: string) =>
            encoding === "hex" ? (expectedHex ?? "mismatch") : "",
        }),
        inputs: challengeAssertPsbts.has(b64)
          ? Array(TEST_CHALLENGE_ASSERT_INPUT_COUNT).fill({})
          : [{}],
      },
    } as any;
  });
}

/** Create a mock signed PSBT with tapScriptSig containing a 64-byte signature per input. */
function mockSignedPsbt(inputCount: number, sigBytes = MOCK_SIG_BYTES) {
  return {
    data: {
      inputs: Array.from({ length: inputCount }, () => ({
        tapScriptSig: [
          {
            pubkey: Buffer.alloc(32, 0xff),
            signature: sigBytes,
          },
        ],
      })),
    },
  };
}

/**
 * Set up Psbt.fromHex to return mock signed PSBTs.
 * Each call returns a PSBT with tapScriptSig entries.
 */
function setupFromHexMock(signedHexes: string[], inputCounts: number[]): void {
  const hexToMock = new Map<string, ReturnType<typeof mockSignedPsbt>>();
  for (let i = 0; i < signedHexes.length; i++) {
    hexToMock.set(signedHexes[i], mockSignedPsbt(inputCounts[i]));
  }

  vi.mocked(Psbt.fromHex).mockImplementation(
    (hex: string) => (hexToMock.get(hex) ?? mockSignedPsbt(1)) as any,
  );
}

describe("depositorGraphSigningService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("signDepositorGraph", () => {
    it("should sign correct number of PSBTs for 1 challenger", async () => {
      // 1 payout + 1 nopayout + 1 challenge_assert = 3 total PSBTs
      const signedHexes = ["signed_payout", "signed_nopayout", "signed_ca"];
      const params = createMockParams();
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(signedHexes);
      // CA has 3 inputs, others have 1
      setupFromHexMock(signedHexes, [1, 1, TEST_CHALLENGE_ASSERT_INPUT_COUNT]);

      await signDepositorGraph(params);

      // Batch sign should be called with 3 PSBTs and sign options
      expect(wallet.signPsbts).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.any(String), // payout PSBT hex
          expect.any(String), // nopayout PSBT hex
          expect.any(String), // challenge_assert PSBT hex
        ]),
        [
          // Payout: sign input 0
          {
            autoFinalized: false,
            signInputs: [
              {
                index: 0,
                publicKey: WALLET_COMPRESSED_PUBKEY,
                disableTweakSigner: true,
              },
            ],
          },
          // NoPayout: sign input 0
          {
            autoFinalized: false,
            signInputs: [
              {
                index: 0,
                publicKey: WALLET_COMPRESSED_PUBKEY,
                disableTweakSigner: true,
              },
            ],
          },
          // ChallengeAssert: sign inputs 0, 1, 2
          {
            autoFinalized: false,
            signInputs: [
              {
                index: 0,
                publicKey: WALLET_COMPRESSED_PUBKEY,
                disableTweakSigner: true,
              },
              {
                index: 1,
                publicKey: WALLET_COMPRESSED_PUBKEY,
                disableTweakSigner: true,
              },
              {
                index: 2,
                publicKey: WALLET_COMPRESSED_PUBKEY,
                disableTweakSigner: true,
              },
            ],
          },
        ],
      );
    });

    it("should sign correct number of PSBTs for 2 challengers", async () => {
      // 1 payout + 2 nopayout + 2 challenge_assert = 5 total
      const graph = createMockDepositorGraph(2);
      const params = createMockParams({ depositorGraph: graph });
      const wallet = params.btcWallet as any;
      const signedHexes = Array(5).fill("signed_hex");
      wallet.signPsbts.mockResolvedValue(signedHexes);
      setupFromHexMock(["signed_hex"], [TEST_CHALLENGE_ASSERT_INPUT_COUNT]);

      await signDepositorGraph(params);

      const [psbts] = wallet.signPsbts.mock.calls[0];
      expect(psbts).toHaveLength(5);
    });

    it("should return correct presignature structure", async () => {
      // Use distinct signed hex values so fromHex can return different sigs
      const signedHexes = ["signed_payout", "signed_nopayout", "signed_ca"];
      let callIdx = 0;
      const sigs = [
        Buffer.alloc(64, 0x01),
        Buffer.alloc(64, 0x02),
        Buffer.alloc(64, 0x03),
        Buffer.alloc(64, 0x04),
        Buffer.alloc(64, 0x05),
      ];

      vi.mocked(Psbt.fromHex).mockImplementation(() => {
        const sig = sigs[callIdx] ?? Buffer.alloc(64, 0xff);
        callIdx++;
        return {
          data: {
            inputs: [
              {
                tapScriptSig: [
                  { pubkey: Buffer.alloc(32, 0xff), signature: sig },
                ],
              },
              {
                tapScriptSig: [
                  {
                    pubkey: Buffer.alloc(32, 0xff),
                    signature: sigs[callIdx] ?? Buffer.alloc(64, 0xff),
                  },
                ],
              },
              {
                tapScriptSig: [
                  {
                    pubkey: Buffer.alloc(32, 0xff),
                    signature: sigs[callIdx + 1] ?? Buffer.alloc(64, 0xff),
                  },
                ],
              },
            ],
          },
        } as any;
      });

      const params = createMockParams();
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(signedHexes);

      const result = await signDepositorGraph(params);

      // Payout signature should be a 128-char hex string
      expect(result.payout_signatures.payout_signature).toHaveLength(128);

      // Per-challenger should have correct structure
      const challengerPubkey = "a".repeat(64);
      const perChallenger = result.per_challenger[challengerPubkey];
      expect(perChallenger).toBeDefined();
      expect(perChallenger.challenge_assert_signatures).toHaveLength(
        TEST_CHALLENGE_ASSERT_INPUT_COUNT,
      );
      expect(perChallenger.nopayout_signature).toHaveLength(128);
    });

    it("should fall back to sequential signing when signPsbts is not available", async () => {
      const params = createMockParams();
      const wallet = params.btcWallet as any;
      // Remove signPsbts to force sequential fallback
      delete wallet.signPsbts;
      wallet.signPsbt.mockResolvedValue("signed_hex");
      setupFromHexMock(["signed_hex"], [TEST_CHALLENGE_ASSERT_INPUT_COUNT]);

      await signDepositorGraph(params);

      // 3 PSBTs signed sequentially with per-PSBT sign options
      expect(wallet.signPsbt).toHaveBeenCalledTimes(3);
    });

    it("should convert base64 PSBTs from VP to hex for wallet signing", async () => {
      const signedHexes = Array(3).fill("signed_hex");
      const params = createMockParams();
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(signedHexes);
      setupFromHexMock(["signed_hex"], [TEST_CHALLENGE_ASSERT_INPUT_COUNT]);

      await signDepositorGraph(params);

      // Verify PSBTs passed to wallet are hex (converted from base64)
      const [psbts] = wallet.signPsbts.mock.calls[0];
      const expectedPayoutHex = Buffer.from(
        mockPsbtBase64("payout_psbt"),
        "base64",
      ).toString("hex");
      expect(psbts[0]).toBe(expectedPayoutHex);
    });

    it("should handle 0 challengers (payout only)", async () => {
      const graph = createMockDepositorGraph(0);
      const params = createMockParams({ depositorGraph: graph });
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(["signed_payout"]);
      setupFromHexMock(["signed_payout"], [1]);

      const result = await signDepositorGraph(params);

      // Wallet should be called with exactly 1 PSBT and sign options
      expect(wallet.signPsbts).toHaveBeenCalledWith(
        [expect.any(String)],
        [
          {
            autoFinalized: false,
            signInputs: [
              {
                index: 0,
                publicKey: WALLET_COMPRESSED_PUBKEY,
                disableTweakSigner: true,
              },
            ],
          },
        ],
      );

      // Result should have payout signature (128-char hex)
      expect(result.payout_signatures.payout_signature).toHaveLength(128);

      // Result should have empty per_challenger
      expect(result.per_challenger).toEqual({});
    });

    it("should throw descriptive error when wallet rejects signing", async () => {
      const params = createMockParams();
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockRejectedValue(new Error("User rejected"));

      await expect(signDepositorGraph(params)).rejects.toThrow(
        /Failed to sign depositor graph transactions/,
      );
    });

    it("should throw when payout_psbt is missing", async () => {
      const graph = createMockDepositorGraph(0);
      (graph as any).payout_psbt = undefined;

      const params = createMockParams({ depositorGraph: graph });
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue([]);

      await expect(signDepositorGraph(params)).rejects.toThrow(
        /Missing depositor payout PSBT/,
      );
    });

    it("should throw when challenger nopayout_psbt is missing", async () => {
      const graph = createMockDepositorGraph(1);
      (graph.challenger_presign_data[0] as any).nopayout_psbt = undefined;

      const params = createMockParams({ depositorGraph: graph });
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(Array(3).fill("signed_hex"));

      await expect(signDepositorGraph(params)).rejects.toThrow(
        /Missing nopayout.*PSBT/,
      );
    });

    it("should throw when challenger challenge_assert_psbt is missing", async () => {
      const graph = createMockDepositorGraph(1);
      (graph.challenger_presign_data[0] as any).challenge_assert_psbt =
        undefined;

      const params = createMockParams({ depositorGraph: graph });
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(Array(3).fill("signed_hex"));

      await expect(signDepositorGraph(params)).rejects.toThrow(
        /Missing challenge_assert.*PSBT/,
      );
    });

    it("should throw when payout PSBT does not match tx_hex", async () => {
      const params = createMockParams();

      // Override the mock AFTER createMockParams so payout PSBT verification fails
      vi.mocked(Psbt.fromBase64).mockImplementation(
        () =>
          ({
            data: {
              getTransaction: () => ({
                toString: (encoding: string) =>
                  encoding === "hex" ? "wrong_tx_hex" : "",
              }),
            },
          }) as any,
      );

      await expect(signDepositorGraph(params)).rejects.toThrow(
        /PSBT integrity check failed for depositor payout/,
      );
    });

    it("should throw when nopayout PSBT does not match tx_hex", async () => {
      const graph = createMockDepositorGraph(1);
      const params = createMockParams({ depositorGraph: graph });

      // Override mock to pass payout but fail nopayout verification
      const payoutPsbt = graph.payout_psbt;
      vi.mocked(Psbt.fromBase64).mockImplementation(
        (b64: string) =>
          ({
            data: {
              getTransaction: () => ({
                toString: (encoding: string) =>
                  encoding === "hex"
                    ? b64 === payoutPsbt
                      ? graph.payout_tx.tx_hex
                      : "wrong_tx_hex"
                    : "",
              }),
              inputs: [{}],
            },
          }) as any,
      );

      await expect(signDepositorGraph(params)).rejects.toThrow(
        /PSBT integrity check failed for nopayout/,
      );
    });

    it("should throw when challenge_assert PSBT does not match tx_hex", async () => {
      const graph = createMockDepositorGraph(1);
      const params = createMockParams({ depositorGraph: graph });

      // Override mock to pass payout and nopayout but fail challenge_assert
      const passingPsbts = new Set([
        graph.payout_psbt,
        graph.challenger_presign_data[0].nopayout_psbt,
      ]);
      const txHexMap = new Map<string, string>([
        [graph.payout_psbt, graph.payout_tx.tx_hex],
        [
          graph.challenger_presign_data[0].nopayout_psbt,
          graph.challenger_presign_data[0].nopayout_tx.tx_hex,
        ],
      ]);
      vi.mocked(Psbt.fromBase64).mockImplementation(
        (b64: string) =>
          ({
            data: {
              getTransaction: () => ({
                toString: (encoding: string) =>
                  encoding === "hex"
                    ? passingPsbts.has(b64)
                      ? (txHexMap.get(b64) ?? "wrong")
                      : "wrong_tx_hex"
                    : "",
              }),
              inputs: Array(TEST_CHALLENGE_ASSERT_INPUT_COUNT).fill({}),
            },
          }) as any,
      );

      await expect(signDepositorGraph(params)).rejects.toThrow(
        /PSBT integrity check failed for challenge_assert/,
      );
    });

    it("should throw when wallet returns wrong number of signed PSBTs", async () => {
      const params = createMockParams();
      const wallet = params.btcWallet as any;
      // Return 2 signed PSBTs when 3 are expected
      wallet.signPsbts.mockResolvedValue(["signed_a", "signed_b"]);

      await expect(signDepositorGraph(params)).rejects.toThrow(
        /Wallet returned 2 signed PSBTs, expected 3/,
      );
    });

    it("should strip sighash byte from 65-byte signatures", async () => {
      const sigWithSighash = Buffer.alloc(65, 0xcd);
      sigWithSighash[64] = 0x01; // SIGHASH_ALL

      vi.mocked(Psbt.fromHex).mockImplementation(
        () =>
          ({
            data: {
              inputs: [
                {
                  tapScriptSig: [
                    {
                      pubkey: Buffer.alloc(32, 0xff),
                      signature: sigWithSighash,
                    },
                  ],
                },
              ],
            },
          }) as any,
      );

      const graph = createMockDepositorGraph(0);
      const params = createMockParams({ depositorGraph: graph });
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(["signed_payout"]);

      const result = await signDepositorGraph(params);

      // Should be 128-char hex (64 bytes, sighash stripped)
      expect(result.payout_signatures.payout_signature).toHaveLength(128);
      expect(result.payout_signatures.payout_signature).toBe(
        Buffer.alloc(64, 0xcd).toString("hex"),
      );
    });

    it("should throw on unexpected sighash type", async () => {
      const sigBadSighash = Buffer.alloc(65, 0xab);
      sigBadSighash[64] = 0x83; // SIGHASH_SINGLE | ANYONECANPAY

      vi.mocked(Psbt.fromHex).mockImplementation(
        () =>
          ({
            data: {
              inputs: [
                {
                  tapScriptSig: [
                    {
                      pubkey: Buffer.alloc(32, 0xff),
                      signature: sigBadSighash,
                    },
                  ],
                },
              ],
            },
          }) as any,
      );

      const graph = createMockDepositorGraph(0);
      const params = createMockParams({ depositorGraph: graph });
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(["signed_payout"]);

      await expect(signDepositorGraph(params)).rejects.toThrow(
        /Unexpected sighash type 0x83/,
      );
    });
  });
});
