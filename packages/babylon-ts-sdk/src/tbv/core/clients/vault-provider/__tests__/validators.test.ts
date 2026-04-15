import { describe, expect, it } from "vitest";

import { DaemonStatus } from "../types";
import {
  VpResponseValidationError,
  validateGetPeginStatusResponse,
  validateGetPegoutStatusResponse,
  validateRequestDepositorClaimerArtifactsResponse,
  validateRequestDepositorPresignTransactionsResponse,
} from "../validators";

const VALID_TXID = "a".repeat(64);
const VALID_PUBKEY = "b".repeat(64);
const VALID_COMPRESSED_PUBKEY = "02" + "c".repeat(64);

describe("VP Response Validators", () => {
  describe("validateGetPeginStatusResponse", () => {
    const validResponse = {
      pegin_txid: VALID_TXID,
      status: DaemonStatus.ACTIVATED,
      progress: {},
      health_info: "ok",
    };

    it("accepts a valid response", () => {
      expect(() => validateGetPeginStatusResponse(validResponse)).not.toThrow();
    });

    it("accepts response with optional last_error", () => {
      expect(() =>
        validateGetPeginStatusResponse({
          ...validResponse,
          last_error: "some error",
        }),
      ).not.toThrow();
    });

    it("accepts response with presigning progress fields", () => {
      expect(() =>
        validateGetPeginStatusResponse({
          ...validResponse,
          progress: {
            presigning: {
              depositor_graph_created: true,
              vk_challenger_presigning_completed: 2,
              vk_challenger_presigning_total: 5,
            },
          },
        }),
      ).not.toThrow();
    });

    it("rejects null response", () => {
      expect(() => validateGetPeginStatusResponse(null)).toThrow(
        VpResponseValidationError,
      );
    });

    it("rejects non-object response", () => {
      expect(() => validateGetPeginStatusResponse("string")).toThrow(
        VpResponseValidationError,
      );
    });

    it("rejects invalid pegin_txid length", () => {
      expect(() =>
        validateGetPeginStatusResponse({
          ...validResponse,
          pegin_txid: "abc",
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects non-hex pegin_txid", () => {
      expect(() =>
        validateGetPeginStatusResponse({
          ...validResponse,
          pegin_txid: "z".repeat(64),
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects non-string status", () => {
      expect(() =>
        validateGetPeginStatusResponse({
          ...validResponse,
          status: 42,
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects unrecognized status", () => {
      expect(() =>
        validateGetPeginStatusResponse({
          ...validResponse,
          status: "UnknownStatus",
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects non-object progress", () => {
      expect(() =>
        validateGetPeginStatusResponse({
          ...validResponse,
          progress: "not an object",
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects null progress", () => {
      expect(() =>
        validateGetPeginStatusResponse({
          ...validResponse,
          progress: null,
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects array progress", () => {
      expect(() =>
        validateGetPeginStatusResponse({
          ...validResponse,
          progress: [],
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects non-string health_info", () => {
      expect(() =>
        validateGetPeginStatusResponse({
          ...validResponse,
          health_info: 42,
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects non-string last_error", () => {
      expect(() =>
        validateGetPeginStatusResponse({
          ...validResponse,
          last_error: 42,
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects non-boolean depositor_graph_created in presigning", () => {
      expect(() =>
        validateGetPeginStatusResponse({
          ...validResponse,
          progress: {
            presigning: { depositor_graph_created: "yes" },
          },
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects non-number vk_challenger_presigning_completed", () => {
      expect(() =>
        validateGetPeginStatusResponse({
          ...validResponse,
          progress: {
            presigning: { vk_challenger_presigning_completed: "2" },
          },
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects non-number vk_challenger_presigning_total", () => {
      expect(() =>
        validateGetPeginStatusResponse({
          ...validResponse,
          progress: {
            presigning: { vk_challenger_presigning_total: true },
          },
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects non-object presigning", () => {
      expect(() =>
        validateGetPeginStatusResponse({
          ...validResponse,
          progress: { presigning: "invalid" },
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("provides a user-facing message with a technical detail", () => {
      try {
        validateGetPeginStatusResponse(null);
      } catch (err) {
        expect(err).toBeInstanceOf(VpResponseValidationError);
        const validationErr = err as VpResponseValidationError;
        expect(validationErr.message).toContain("unexpected response");
        expect(validationErr.detail).toContain("not an object");
      }
    });
  });

  describe("validateRequestDepositorPresignTransactionsResponse", () => {
    const validClaimerTx = {
      claimer_pubkey: VALID_PUBKEY,
      claim_tx: { tx_hex: "aabb" },
      assert_tx: { tx_hex: "ccdd" },
      payout_tx: { tx_hex: "eeff" },
      payout_psbt: "cHNidA==",
    };

    const validChallengerPresignData = {
      challenger_pubkey: VALID_PUBKEY,
      challenge_assert_x_tx: { tx_hex: "7788" },
      challenge_assert_y_tx: { tx_hex: "99aa" },
      nopayout_tx: { tx_hex: "bbcc" },
      nopayout_psbt: "cHNidA==",
      challenge_assert_connectors: [
        { wots_pks_json: "{}", gc_wots_keys_json: "{}" },
      ],
      output_label_hashes: ["aabb"],
    };

    const validDepositorGraph = {
      claim_tx: { tx_hex: "1122" },
      assert_tx: { tx_hex: "3344" },
      payout_tx: { tx_hex: "5566" },
      payout_psbt: "cHNidA==",
      challenger_presign_data: [validChallengerPresignData],
      offchain_params_version: 1,
    };

    it("accepts a valid response", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          txs: [validClaimerTx],
          depositor_graph: validDepositorGraph,
        }),
      ).not.toThrow();
    });

    it("accepts response with empty txs array", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          txs: [],
          depositor_graph: validDepositorGraph,
        }),
      ).not.toThrow();
    });

    it("rejects null response", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse(null),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects missing txs array", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          txs: "not an array",
          depositor_graph: validDepositorGraph,
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("accepts compressed (66-char) pubkeys", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          txs: [
            {
              ...validClaimerTx,
              claimer_pubkey: VALID_COMPRESSED_PUBKEY,
            },
          ],
          depositor_graph: {
            ...validDepositorGraph,
            challenger_presign_data: [
              {
                ...validChallengerPresignData,
                challenger_pubkey: VALID_COMPRESSED_PUBKEY,
              },
            ],
          },
        }),
      ).not.toThrow();
    });

    it("rejects invalid claimer_pubkey length", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          txs: [{ ...validClaimerTx, claimer_pubkey: "short" }],
          depositor_graph: validDepositorGraph,
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects missing tx_hex in claimer transaction", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          txs: [{ ...validClaimerTx, claim_tx: { tx_hex: "" } }],
          depositor_graph: validDepositorGraph,
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects missing payout_psbt in claimer transaction", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          txs: [{ ...validClaimerTx, payout_psbt: "" }],
          depositor_graph: validDepositorGraph,
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects null depositor_graph", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          txs: [],
          depositor_graph: null,
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects non-number offchain_params_version", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          txs: [],
          depositor_graph: {
            ...validDepositorGraph,
            offchain_params_version: "1",
          },
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects non-array challenger_presign_data", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          txs: [],
          depositor_graph: {
            ...validDepositorGraph,
            challenger_presign_data: "invalid",
          },
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects invalid challenger_pubkey in presign data", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          txs: [],
          depositor_graph: {
            ...validDepositorGraph,
            challenger_presign_data: [
              { ...validChallengerPresignData, challenger_pubkey: "short" },
            ],
          },
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects non-array challenge_assert_connectors", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          txs: [],
          depositor_graph: {
            ...validDepositorGraph,
            challenger_presign_data: [
              {
                ...validChallengerPresignData,
                challenge_assert_connectors: "invalid",
              },
            ],
          },
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects non-array output_label_hashes", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          txs: [],
          depositor_graph: {
            ...validDepositorGraph,
            challenger_presign_data: [
              {
                ...validChallengerPresignData,
                output_label_hashes: "invalid",
              },
            ],
          },
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects non-hex output_label_hashes entry", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          txs: [],
          depositor_graph: {
            ...validDepositorGraph,
            challenger_presign_data: [
              {
                ...validChallengerPresignData,
                output_label_hashes: ["not-hex!"],
              },
            ],
          },
        }),
      ).toThrow(VpResponseValidationError);
    });
  });

  describe("validateGetPegoutStatusResponse", () => {
    it("accepts a valid response with no claimer/challenger", () => {
      expect(() =>
        validateGetPegoutStatusResponse({
          pegin_txid: VALID_TXID,
          found: false,
        }),
      ).not.toThrow();
    });

    it("accepts a valid response with claimer and challenger", () => {
      expect(() =>
        validateGetPegoutStatusResponse({
          pegin_txid: VALID_TXID,
          found: true,
          claimer: { status: "pending", failed: false },
          challenger: { status: "active" },
        }),
      ).not.toThrow();
    });

    it("rejects null response", () => {
      expect(() => validateGetPegoutStatusResponse(null)).toThrow(
        VpResponseValidationError,
      );
    });

    it("rejects invalid pegin_txid", () => {
      expect(() =>
        validateGetPegoutStatusResponse({
          pegin_txid: "short",
          found: false,
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects non-boolean found field", () => {
      expect(() =>
        validateGetPegoutStatusResponse({
          pegin_txid: VALID_TXID,
          found: "yes",
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects claimer with missing status", () => {
      expect(() =>
        validateGetPegoutStatusResponse({
          pegin_txid: VALID_TXID,
          found: true,
          claimer: { failed: false },
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects claimer with missing failed field", () => {
      expect(() =>
        validateGetPegoutStatusResponse({
          pegin_txid: VALID_TXID,
          found: true,
          claimer: { status: "pending" },
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects null claimer", () => {
      expect(() =>
        validateGetPegoutStatusResponse({
          pegin_txid: VALID_TXID,
          found: true,
          claimer: null,
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects challenger with missing status", () => {
      expect(() =>
        validateGetPegoutStatusResponse({
          pegin_txid: VALID_TXID,
          found: true,
          challenger: {},
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects null challenger", () => {
      expect(() =>
        validateGetPegoutStatusResponse({
          pegin_txid: VALID_TXID,
          found: true,
          challenger: null,
        }),
      ).toThrow(VpResponseValidationError);
    });
  });

  describe("validateRequestDepositorClaimerArtifactsResponse", () => {
    const validResponse = {
      tx_graph_json: "{ }",
      verifying_key_hex: "aabb",
      babe_sessions: {
        challenger1: { decryptor_artifacts_hex: "ccdd" },
      },
    };

    it("accepts a valid response", () => {
      expect(() =>
        validateRequestDepositorClaimerArtifactsResponse(validResponse),
      ).not.toThrow();
    });

    it("accepts response with empty babe_sessions", () => {
      expect(() =>
        validateRequestDepositorClaimerArtifactsResponse({
          ...validResponse,
          babe_sessions: {},
        }),
      ).not.toThrow();
    });

    it("rejects null response", () => {
      expect(() =>
        validateRequestDepositorClaimerArtifactsResponse(null),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects non-object response", () => {
      expect(() =>
        validateRequestDepositorClaimerArtifactsResponse("string"),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects empty tx_graph_json", () => {
      expect(() =>
        validateRequestDepositorClaimerArtifactsResponse({
          ...validResponse,
          tx_graph_json: "",
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects empty verifying_key_hex", () => {
      expect(() =>
        validateRequestDepositorClaimerArtifactsResponse({
          ...validResponse,
          verifying_key_hex: "",
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects non-hex verifying_key_hex", () => {
      expect(() =>
        validateRequestDepositorClaimerArtifactsResponse({
          ...validResponse,
          verifying_key_hex: "not-hex!",
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects null babe_sessions", () => {
      expect(() =>
        validateRequestDepositorClaimerArtifactsResponse({
          ...validResponse,
          babe_sessions: null,
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects null babe_sessions entry", () => {
      expect(() =>
        validateRequestDepositorClaimerArtifactsResponse({
          ...validResponse,
          babe_sessions: { challenger1: null },
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects non-hex decryptor_artifacts_hex", () => {
      expect(() =>
        validateRequestDepositorClaimerArtifactsResponse({
          ...validResponse,
          babe_sessions: {
            challenger1: { decryptor_artifacts_hex: "xyz" },
          },
        }),
      ).toThrow(VpResponseValidationError);
    });
  });
});
