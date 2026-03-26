import { extractPayoutSignature } from "@babylonlabs-io/ts-sdk/tbv/core";
import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DepositorGraphTransactions } from "../../../clients/vault-provider-rpc/types";
import {
  signDepositorGraph,
  type SignDepositorGraphParams,
} from "../depositorGraphSigningService";

// Mock extractPayoutSignature (vitest hoists vi.mock calls)
vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  extractPayoutSignature: vi.fn().mockReturnValue("default_sig_hex"),
}));

// Mock Psbt.fromBase64 for PSBT integrity verification
vi.mock("bitcoinjs-lib", () => ({
  Psbt: {
    fromBase64: vi.fn(),
  },
}));

const DEPOSITOR_PUBKEY =
  "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const WALLET_COMPRESSED_PUBKEY = "02" + DEPOSITOR_PUBKEY; // 66-char compressed pubkey

/** Helper to create a base64-encoded mock PSBT (content doesn't matter since extractPayoutSignature is mocked). */
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
      challenge_assert_connectors: [
        {
          lamport_hashes_json: `lamport_${i}_0`,
          gc_input_label_hashes_json: `gc_${i}_0`,
        },
        {
          lamport_hashes_json: `lamport_${i}_1`,
          gc_input_label_hashes_json: `gc_${i}_1`,
        },
        {
          lamport_hashes_json: `lamport_${i}_2`,
          gc_input_label_hashes_json: `gc_${i}_2`,
        },
      ] as [
        { lamport_hashes_json: string; gc_input_label_hashes_json: string },
        { lamport_hashes_json: string; gc_input_label_hashes_json: string },
        { lamport_hashes_json: string; gc_input_label_hashes_json: string },
      ],
      output_label_hashes: [],
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
    depositorBtcPubkey: DEPOSITOR_PUBKEY,
    btcWallet: {
      signPsbts: vi.fn(),
      signPsbt: vi.fn(),
      getPublicKeyHex: vi.fn().mockResolvedValue(WALLET_COMPRESSED_PUBKEY),
    } as any,
    ...overrides,
  };
}

/**
 * Configure Psbt.fromBase64 mock to return a fake PSBT whose getTransaction()
 * returns the matching tx_hex for verification to pass.
 */
function setupPsbtVerificationMock(
  depositorGraph: DepositorGraphTransactions,
): void {
  const txHexByPsbt = new Map<string, string>();
  txHexByPsbt.set(depositorGraph.payout_psbt, depositorGraph.payout_tx.tx_hex);
  for (const c of depositorGraph.challenger_presign_data) {
    txHexByPsbt.set(c.nopayout_psbt, c.nopayout_tx.tx_hex);
    txHexByPsbt.set(c.challenge_assert_psbt, c.challenge_assert_tx.tx_hex);
  }

  vi.mocked(Psbt.fromBase64).mockImplementation((b64: string) => {
    const expectedHex = txHexByPsbt.get(b64);
    return {
      data: {
        getTransaction: () => ({
          toString: (encoding: string) =>
            encoding === "hex" ? (expectedHex ?? "mismatch") : "",
        }),
      },
    } as any;
  });
}

describe("depositorGraphSigningService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("signDepositorGraph", () => {
    it("should sign correct number of PSBTs for 1 challenger", async () => {
      // 1 payout + 1 nopayout + 1 challenge_assert = 3 total PSBTs
      const mockExtract = vi.mocked(extractPayoutSignature);
      mockExtract.mockReturnValue("deadbeef".repeat(16)); // 128-char hex sig

      const params = createMockParams();
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue([
        "signed_payout",
        "signed_nopayout",
        "signed_ca",
      ]);

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
      const mockExtract = vi.mocked(extractPayoutSignature);
      mockExtract.mockReturnValue("deadbeef".repeat(16));

      const graph = createMockDepositorGraph(2);
      const params = createMockParams({ depositorGraph: graph });
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(Array(5).fill("signed_hex"));

      await signDepositorGraph(params);

      // 5 PSBTs total
      expect(wallet.signPsbts).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Array),
      );
      const [psbts] = wallet.signPsbts.mock.calls[0];
      expect(psbts).toHaveLength(5);
    });

    it("should return correct presignature structure", async () => {
      const mockExtract = vi.mocked(extractPayoutSignature);
      let callCount = 0;
      mockExtract.mockImplementation(() => {
        callCount++;
        return `sig_${callCount}`;
      });

      const params = createMockParams();
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(Array(3).fill("signed_hex"));

      const result = await signDepositorGraph(params);

      // Payout signature (extracted first, index 0)
      expect(result.payout_signatures.payout_signature).toBe("sig_1");

      // Per-challenger: 3 CA sigs extracted from inputs 0,1,2, then NoPayout
      const challengerPubkey = "a".repeat(64);
      const perChallenger = result.per_challenger[challengerPubkey];
      expect(perChallenger).toBeDefined();
      expect(perChallenger.challenge_assert_signatures).toEqual([
        "sig_2",
        "sig_3",
        "sig_4",
      ]);
      expect(perChallenger.nopayout_signature).toBe("sig_5");
    });

    it("should fall back to sequential signing when signPsbts is not available", async () => {
      const mockExtract = vi.mocked(extractPayoutSignature);
      mockExtract.mockReturnValue("deadbeef".repeat(16));

      const params = createMockParams();
      const wallet = params.btcWallet as any;
      // Remove signPsbts to force sequential fallback
      delete wallet.signPsbts;
      wallet.signPsbt.mockResolvedValue("signed_hex");

      await signDepositorGraph(params);

      // 3 PSBTs signed sequentially with per-PSBT sign options
      expect(wallet.signPsbt).toHaveBeenCalledTimes(3);
    });

    it("should convert base64 PSBTs from VP to hex for wallet signing", async () => {
      const mockExtract = vi.mocked(extractPayoutSignature);
      mockExtract.mockReturnValue("deadbeef".repeat(16));

      const params = createMockParams();
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(Array(3).fill("signed_hex"));

      await signDepositorGraph(params);

      // Verify PSBTs passed to wallet are hex (converted from base64)
      const [psbts] = wallet.signPsbts.mock.calls[0];
      const expectedPayoutHex = Buffer.from(
        mockPsbtBase64("payout_psbt"),
        "base64",
      ).toString("hex");
      expect(psbts[0]).toBe(expectedPayoutHex);
    });

    it("should extract 3 sigs from ChallengeAssert PSBT using input indices", async () => {
      const mockExtract = vi.mocked(extractPayoutSignature);
      mockExtract.mockReturnValue("sig_hex");

      const params = createMockParams();
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue([
        "signed_payout",
        "signed_nopayout",
        "signed_ca",
      ]);

      await signDepositorGraph(params);

      // extractPayoutSignature should be called 5 times:
      // 1 payout + 3 CA (input 0,1,2) + 1 nopayout
      expect(mockExtract).toHaveBeenCalledTimes(5);

      // Payout sig from signed_payout, input 0 (default)
      expect(mockExtract).toHaveBeenCalledWith(
        "signed_payout",
        DEPOSITOR_PUBKEY,
      );
      // CA sigs from signed_ca, inputs 0, 1, 2
      expect(mockExtract).toHaveBeenCalledWith(
        "signed_ca",
        DEPOSITOR_PUBKEY,
        0,
      );
      expect(mockExtract).toHaveBeenCalledWith(
        "signed_ca",
        DEPOSITOR_PUBKEY,
        1,
      );
      expect(mockExtract).toHaveBeenCalledWith(
        "signed_ca",
        DEPOSITOR_PUBKEY,
        2,
      );
      // NoPayout sig from signed_nopayout, input 0 (default)
      expect(mockExtract).toHaveBeenCalledWith(
        "signed_nopayout",
        DEPOSITOR_PUBKEY,
      );
    });

    it("should handle 0 challengers (payout only)", async () => {
      const mockExtract = vi.mocked(extractPayoutSignature);
      mockExtract.mockReturnValue("payout_only_sig");

      const graph = createMockDepositorGraph(0);
      const params = createMockParams({ depositorGraph: graph });
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(["signed_payout"]);

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

      // Result should have payout signature set
      expect(result.payout_signatures.payout_signature).toBe("payout_only_sig");

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
        /payout_psbt is missing/,
      );
    });

    it("should throw when challenger nopayout_psbt is missing", async () => {
      const graph = createMockDepositorGraph(1);
      (graph.challenger_presign_data[0] as any).nopayout_psbt = undefined;

      const params = createMockParams({ depositorGraph: graph });
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(Array(3).fill("signed_hex"));

      await expect(signDepositorGraph(params)).rejects.toThrow(
        /Missing nopayout_psbt/,
      );
    });

    it("should throw when PSBT does not match tx_hex", async () => {
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

    it("should throw when wallet returns wrong number of signed PSBTs", async () => {
      const params = createMockParams();
      const wallet = params.btcWallet as any;
      // Return 2 signed PSBTs when 3 are expected
      wallet.signPsbts.mockResolvedValue(["signed_a", "signed_b"]);

      await expect(signDepositorGraph(params)).rejects.toThrow(
        /Wallet returned 2 signed PSBTs, expected 3/,
      );
    });

    it("should strip 0x prefix from depositor pubkey", async () => {
      const mockExtract = vi.mocked(extractPayoutSignature);
      mockExtract.mockReturnValue("deadbeef".repeat(16));

      const params = createMockParams({
        depositorBtcPubkey: "0x" + DEPOSITOR_PUBKEY,
      });
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(Array(3).fill("signed_hex"));

      await signDepositorGraph(params);

      // extractPayoutSignature should receive stripped pubkey
      expect(mockExtract).toHaveBeenCalledWith(
        expect.any(String),
        DEPOSITOR_PUBKEY,
      );
    });
  });
});
