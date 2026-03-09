import {
  buildChallengeAssertPsbt,
  buildDepositorPayoutPsbt,
  buildNoPayoutPsbt,
  extractPayoutSignature,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DepositorGraphTransactions } from "../../../clients/vault-provider-rpc/types";
import {
  signDepositorGraph,
  type SignDepositorGraphParams,
} from "../depositorGraphSigningService";

// Mock the PSBT builders (vitest hoists vi.mock calls)
vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  buildDepositorPayoutPsbt: vi.fn().mockResolvedValue("psbt_payout_hex"),
  buildNoPayoutPsbt: vi.fn().mockResolvedValue("psbt_nopayout_hex"),
  buildChallengeAssertPsbt: vi.fn().mockResolvedValue("psbt_ca_hex"),
  extractPayoutSignature: vi.fn().mockReturnValue("default_sig_hex"),
}));

const DEPOSITOR_PUBKEY =
  "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const VP_PUBKEY =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const VK_PUBKEY =
  "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const CHALLENGER_PUBKEY_1 =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WALLET_COMPRESSED_PUBKEY = "02" + DEPOSITOR_PUBKEY; // 66-char compressed pubkey

function createMockDepositorGraph(
  numChallengers = 1,
): DepositorGraphTransactions {
  const challengers = Array.from({ length: numChallengers }, (_, i) => {
    const pubkey = String.fromCharCode(97 + i).repeat(64); // a..a, b..b, ...
    return {
      challenger_pubkey: pubkey,
      nopayout_tx: { tx_hex: `nopayout_tx_${i}` },
      nopayout_sighash: `nopayout_sighash_${i}`,
      challenge_assert_tx: { tx_hex: `ca_tx_${i}` },
      challenge_assert_sighashes: [
        `ca_sh_${i}_0`,
        `ca_sh_${i}_1`,
        `ca_sh_${i}_2`,
      ] as [string, string, string],
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
      // Flat prevouts array (one per input, matching VP response)
      challenge_assert_prevouts: [
        { script_pubkey: "sp0", value: 1000 },
        { script_pubkey: "sp1", value: 1000 },
        { script_pubkey: "sp2", value: 1000 },
      ],
      nopayout_prevouts: [{ script_pubkey: "sp_np", value: 2000 }],
      output_label_hashes: [],
    };
  });

  return {
    claim_tx: { tx_hex: "claim_tx_hex" },
    payout_tx: { tx_hex: "payout_tx_hex" },
    assert_tx: { tx_hex: "assert_tx_hex" },
    payout_sighash: "payout_sighash",
    payout_prevouts: [{ script_pubkey: "sp_payout", value: 5000 }],
    offchain_params_version: 1,
    challenger_presign_data: challengers,
  };
}

function createMockParams(
  overrides?: Partial<SignDepositorGraphParams>,
): SignDepositorGraphParams {
  return {
    depositorGraph: createMockDepositorGraph(1),
    depositorBtcPubkey: DEPOSITOR_PUBKEY,
    btcWallet: {
      signPsbts: vi.fn(),
      signPsbt: vi.fn(),
      getPublicKeyHex: vi.fn().mockResolvedValue(WALLET_COMPRESSED_PUBKEY),
    } as any,
    offchainParams: {
      vaultProviderBtcPubkey: VP_PUBKEY,
      vaultKeeperBtcPubkeys: [VK_PUBKEY],
      timelockPegin: 50,
      localChallengers: [],
      universalChallengers: [CHALLENGER_PUBKEY_1],
      timelockAssert: 100,
      councilMembers: ["council1"],
      councilQuorum: 1,
    },
    ...overrides,
  };
}

describe("depositorGraphSigningService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("signDepositorGraph", () => {
    it("should build correct number of PSBTs for 1 challenger", async () => {
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

      expect(buildDepositorPayoutPsbt).toHaveBeenCalledTimes(1);
      expect(buildNoPayoutPsbt).toHaveBeenCalledTimes(1);
      // 1 ChallengeAssert PSBT per challenger (not 3)
      expect(buildChallengeAssertPsbt).toHaveBeenCalledTimes(1);

      // Batch sign should be called with 3 PSBTs and sign options (including publicKey)
      expect(wallet.signPsbts).toHaveBeenCalledWith(
        ["psbt_payout_hex", "psbt_nopayout_hex", "psbt_ca_hex"],
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

    it("should build correct number of PSBTs for 2 challengers", async () => {
      // 1 payout + 2 nopayout + 2 challenge_assert = 5 total
      const mockExtract = vi.mocked(extractPayoutSignature);
      mockExtract.mockReturnValue("deadbeef".repeat(16));

      const graph = createMockDepositorGraph(2);
      const params = createMockParams({ depositorGraph: graph });
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(Array(5).fill("signed_hex"));

      await signDepositorGraph(params);

      expect(buildDepositorPayoutPsbt).toHaveBeenCalledTimes(1);
      expect(buildNoPayoutPsbt).toHaveBeenCalledTimes(2);
      expect(buildChallengeAssertPsbt).toHaveBeenCalledTimes(2);
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
      expect(wallet.signPsbt).toHaveBeenCalledWith("psbt_payout_hex", {
        autoFinalized: false,
        signInputs: [
          {
            index: 0,
            publicKey: WALLET_COMPRESSED_PUBKEY,
            disableTweakSigner: true,
          },
        ],
      });
      expect(wallet.signPsbt).toHaveBeenCalledWith("psbt_ca_hex", {
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
      });
    });

    it("should pass correct connector params to payout builder", async () => {
      const mockExtract = vi.mocked(extractPayoutSignature);
      mockExtract.mockReturnValue("deadbeef".repeat(16));

      const params = createMockParams();
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(Array(3).fill("signed_hex"));

      await signDepositorGraph(params);

      expect(buildDepositorPayoutPsbt).toHaveBeenCalledWith({
        payoutTxHex: "payout_tx_hex",
        prevouts: [{ script_pubkey: "sp_payout", value: 5000 }],
        connectorParams: {
          depositor: DEPOSITOR_PUBKEY,
          vaultProvider: VP_PUBKEY,
          vaultKeepers: [VK_PUBKEY],
          universalChallengers: [CHALLENGER_PUBKEY_1],
          timelockPegin: 50,
        },
      });
    });

    it("should pass correct params to nopayout builder", async () => {
      const mockExtract = vi.mocked(extractPayoutSignature);
      mockExtract.mockReturnValue("deadbeef".repeat(16));

      const params = createMockParams();
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(Array(3).fill("signed_hex"));

      await signDepositorGraph(params);

      expect(buildNoPayoutPsbt).toHaveBeenCalledWith({
        noPayoutTxHex: "nopayout_tx_0",
        challengerPubkey: "a".repeat(64),
        prevouts: [{ script_pubkey: "sp_np", value: 2000 }],
        connectorParams: {
          claimer: DEPOSITOR_PUBKEY,
          localChallengers: [],
          universalChallengers: [CHALLENGER_PUBKEY_1],
          timelockAssert: 100,
          councilMembers: ["council1"],
          councilQuorum: 1,
        },
      });
    });

    it("should pass all connector params per input to challenge assert builder", async () => {
      const mockExtract = vi.mocked(extractPayoutSignature);
      mockExtract.mockReturnValue("deadbeef".repeat(16));

      const params = createMockParams();
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(Array(3).fill("signed_hex"));

      await signDepositorGraph(params);

      // Called once per challenger (1 PSBT with all 3 inputs)
      expect(buildChallengeAssertPsbt).toHaveBeenCalledTimes(1);

      expect(buildChallengeAssertPsbt).toHaveBeenCalledWith({
        challengeAssertTxHex: "ca_tx_0",
        prevouts: [
          { script_pubkey: "sp0", value: 1000 },
          { script_pubkey: "sp1", value: 1000 },
          { script_pubkey: "sp2", value: 1000 },
        ],
        connectorParamsPerInput: [
          {
            claimer: DEPOSITOR_PUBKEY,
            challenger: "a".repeat(64),
            lamportHashesJson: "lamport_0_0",
            gcInputLabelHashesJson: "gc_0_0",
          },
          {
            claimer: DEPOSITOR_PUBKEY,
            challenger: "a".repeat(64),
            lamportHashesJson: "lamport_0_1",
            gcInputLabelHashesJson: "gc_0_1",
          },
          {
            claimer: DEPOSITOR_PUBKEY,
            challenger: "a".repeat(64),
            lamportHashesJson: "lamport_0_2",
            gcInputLabelHashesJson: "gc_0_2",
          },
        ],
      });
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

    it("should throw when challenge_assert_connector data is missing", async () => {
      const graph = createMockDepositorGraph(1);
      // Remove one connector entry to trigger the error
      graph.challenger_presign_data[0].challenge_assert_connectors = [
        graph.challenger_presign_data[0].challenge_assert_connectors[0],
        graph.challenger_presign_data[0].challenge_assert_connectors[1],
        // Missing third connector
      ] as any;

      const params = createMockParams({ depositorGraph: graph });
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(Array(3).fill("signed_hex"));

      await expect(signDepositorGraph(params)).rejects.toThrow(
        /Missing challenge_assert_connector data/,
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

      expect(buildDepositorPayoutPsbt).toHaveBeenCalledTimes(1);
      expect(buildNoPayoutPsbt).toHaveBeenCalledTimes(0);
      expect(buildChallengeAssertPsbt).toHaveBeenCalledTimes(0);

      // Wallet should be called with exactly 1 PSBT and sign options
      expect(wallet.signPsbts).toHaveBeenCalledWith(
        ["psbt_payout_hex"],
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

    it("should strip 0x prefix from vault provider and vault keeper pubkeys", async () => {
      const mockExtract = vi.mocked(extractPayoutSignature);
      mockExtract.mockReturnValue("deadbeef".repeat(16));

      const params = createMockParams({
        depositorBtcPubkey: "0x" + DEPOSITOR_PUBKEY,
        offchainParams: {
          vaultProviderBtcPubkey: "0x" + VP_PUBKEY,
          vaultKeeperBtcPubkeys: ["0x" + VK_PUBKEY],
          timelockPegin: 50,
          localChallengers: [],
          universalChallengers: [CHALLENGER_PUBKEY_1],
          timelockAssert: 100,
          councilMembers: ["council1"],
          councilQuorum: 1,
        },
      });
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(Array(3).fill("signed_hex"));

      await signDepositorGraph(params);

      // Payout builder should receive stripped pubkeys
      expect(buildDepositorPayoutPsbt).toHaveBeenCalledWith(
        expect.objectContaining({
          connectorParams: {
            depositor: DEPOSITOR_PUBKEY,
            vaultProvider: VP_PUBKEY,
            vaultKeepers: [VK_PUBKEY],
            universalChallengers: [CHALLENGER_PUBKEY_1],
            timelockPegin: 50,
          },
        }),
      );

      // NoPayout builder should also receive stripped claimer pubkey
      expect(buildNoPayoutPsbt).toHaveBeenCalledWith(
        expect.objectContaining({
          connectorParams: expect.objectContaining({
            claimer: DEPOSITOR_PUBKEY,
          }),
        }),
      );
    });

    it("should handle empty vault keepers array", async () => {
      const mockExtract = vi.mocked(extractPayoutSignature);
      mockExtract.mockReturnValue("deadbeef".repeat(16));

      const params = createMockParams({
        offchainParams: {
          vaultProviderBtcPubkey: VP_PUBKEY,
          vaultKeeperBtcPubkeys: [],
          timelockPegin: 50,
          localChallengers: [],
          universalChallengers: [CHALLENGER_PUBKEY_1],
          timelockAssert: 100,
          councilMembers: ["council1"],
          councilQuorum: 1,
        },
      });
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(Array(3).fill("signed_hex"));

      await signDepositorGraph(params);

      expect(buildDepositorPayoutPsbt).toHaveBeenCalledWith(
        expect.objectContaining({
          connectorParams: expect.objectContaining({
            vaultKeepers: [],
          }),
        }),
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

    it("should throw when challenge_assert_prevouts is empty", async () => {
      const graph = createMockDepositorGraph(1);
      graph.challenger_presign_data[0].challenge_assert_prevouts = [];

      const params = createMockParams({ depositorGraph: graph });
      const wallet = params.btcWallet as any;
      wallet.signPsbts.mockResolvedValue(Array(3).fill("signed_hex"));

      await expect(signDepositorGraph(params)).rejects.toThrow(
        /Missing challenge_assert_prevouts/,
      );
    });
  });
});
