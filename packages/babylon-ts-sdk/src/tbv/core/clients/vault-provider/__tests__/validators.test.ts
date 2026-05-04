import { describe, expect, it } from "vitest";

import { DaemonStatus } from "../types";
import {
  VpResponseValidationError,
  validateBatchGetPeginStatusResponse,
  validateBatchGetPegoutStatusResponse,
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
    const VALID_PUBKEY = "a".repeat(64);
    const ANOTHER_TXID = "b".repeat(64);
    const VALID_CLAIMER = {
      status: "pending",
      failed: false,
      claim_txid: ANOTHER_TXID,
      claimer_pubkey: VALID_PUBKEY,
      assert_txid: ANOTHER_TXID,
      challenger_pubkey: null,
      created_at: 1700000000,
      updated_at: 1700000001,
    };
    const VALID_CHALLENGER = {
      status: "active",
      claim_txid: ANOTHER_TXID,
      claimer_pubkey: VALID_PUBKEY,
      assert_txid: null,
      challenge_assert_x_txid: null,
      challenge_assert_y_txid: null,
      nopayout_txid: null,
      created_at: 1700000000,
      updated_at: 1700000001,
    };

    it("accepts a valid not-found response (null claimer, empty challengers)", () => {
      expect(() =>
        validateGetPegoutStatusResponse({
          pegin_txid: VALID_TXID,
          found: false,
          claimer: null,
          challengers: [],
        }),
      ).not.toThrow();
    });

    it("accepts a valid response with claimer and one challenger", () => {
      expect(() =>
        validateGetPegoutStatusResponse({
          pegin_txid: VALID_TXID,
          found: true,
          claimer: VALID_CLAIMER,
          challengers: [VALID_CHALLENGER],
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
          claimer: null,
          challengers: [],
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects non-boolean found field", () => {
      expect(() =>
        validateGetPegoutStatusResponse({
          pegin_txid: VALID_TXID,
          found: "yes",
          claimer: null,
          challengers: [],
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects claimer with missing mandatory fields", () => {
      expect(() =>
        validateGetPegoutStatusResponse({
          pegin_txid: VALID_TXID,
          found: true,
          claimer: { ...VALID_CLAIMER, claim_txid: undefined },
          challengers: [],
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects claimer with non-numeric created_at (Rust returns i64)", () => {
      expect(() =>
        validateGetPegoutStatusResponse({
          pegin_txid: VALID_TXID,
          found: true,
          claimer: { ...VALID_CLAIMER, created_at: "1700000000" },
          challengers: [],
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects challengers when not an array", () => {
      expect(() =>
        validateGetPegoutStatusResponse({
          pegin_txid: VALID_TXID,
          found: true,
          claimer: null,
          challengers: { status: "active" },
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects challenger entry with missing mandatory status", () => {
      const bad = { ...VALID_CHALLENGER, status: undefined };
      expect(() =>
        validateGetPegoutStatusResponse({
          pegin_txid: VALID_TXID,
          found: true,
          claimer: null,
          challengers: [bad],
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("accepts the optional split-assert txid fields when present", () => {
      expect(() =>
        validateGetPegoutStatusResponse({
          pegin_txid: VALID_TXID,
          found: true,
          claimer: null,
          challengers: [
            {
              ...VALID_CHALLENGER,
              challenge_assert_x_txid: ANOTHER_TXID,
              challenge_assert_y_txid: ANOTHER_TXID,
            },
          ],
        }),
      ).not.toThrow();
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

  describe("validateBatchGetPeginStatusResponse", () => {
    const validInner = {
      pegin_txid: VALID_TXID,
      status: DaemonStatus.ACTIVATED,
      progress: {},
      health_info: "ok",
    };

    it("accepts an empty results array", () => {
      expect(() =>
        validateBatchGetPeginStatusResponse({ results: [] }),
      ).not.toThrow();
    });

    it("accepts a result entry with only `result` populated", () => {
      expect(() =>
        validateBatchGetPeginStatusResponse({
          results: [
            { pegin_txid: VALID_TXID, result: validInner, error: null },
          ],
        }),
      ).not.toThrow();
    });

    it("accepts a result entry with only `error` populated", () => {
      expect(() =>
        validateBatchGetPeginStatusResponse({
          results: [
            { pegin_txid: VALID_TXID, result: null, error: "PegIn not found" },
          ],
        }),
      ).not.toThrow();
    });

    it("rejects when response is not an object", () => {
      expect(() => validateBatchGetPeginStatusResponse(null)).toThrow(
        VpResponseValidationError,
      );
    });

    it("rejects when results is not an array", () => {
      expect(() =>
        validateBatchGetPeginStatusResponse({ results: { foo: 1 } }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects entry that is not an object", () => {
      expect(() =>
        validateBatchGetPeginStatusResponse({ results: ["not-an-object"] }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects entry with missing pegin_txid", () => {
      expect(() =>
        validateBatchGetPeginStatusResponse({
          results: [{ result: null, error: "boom" }],
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects entry with wrong-length pegin_txid", () => {
      expect(() =>
        validateBatchGetPeginStatusResponse({
          results: [{ pegin_txid: "abcd", result: null, error: "boom" }],
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects entry where both result and error are populated", () => {
      expect(() =>
        validateBatchGetPeginStatusResponse({
          results: [
            { pegin_txid: VALID_TXID, result: validInner, error: "boom" },
          ],
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects entry where neither result nor error is populated", () => {
      expect(() =>
        validateBatchGetPeginStatusResponse({
          results: [{ pegin_txid: VALID_TXID, result: null, error: null }],
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("rejects entry where error is not a string-or-null", () => {
      expect(() =>
        validateBatchGetPeginStatusResponse({
          results: [{ pegin_txid: VALID_TXID, result: null, error: 42 }],
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("propagates inner result validation failures", () => {
      expect(() =>
        validateBatchGetPeginStatusResponse({
          results: [
            {
              pegin_txid: VALID_TXID,
              result: {
                pegin_txid: VALID_TXID,
                status: "BogusStatus",
                progress: {},
                health_info: "ok",
              },
              error: null,
            },
          ],
        }),
      ).toThrow(VpResponseValidationError);
    });
  });

  describe("validateBatchGetPegoutStatusResponse", () => {
    const validInner = {
      pegin_txid: VALID_TXID,
      found: false,
      claimer: null,
      challengers: [],
    };

    it("accepts a happy-path batch", () => {
      expect(() =>
        validateBatchGetPegoutStatusResponse({
          results: [
            { pegin_txid: VALID_TXID, result: validInner, error: null },
          ],
        }),
      ).not.toThrow();
    });

    it("rejects entry where both result and error are null", () => {
      expect(() =>
        validateBatchGetPegoutStatusResponse({
          results: [{ pegin_txid: VALID_TXID, result: null, error: null }],
        }),
      ).toThrow(VpResponseValidationError);
    });

    it("propagates inner result validation failures (missing challengers array)", () => {
      expect(() =>
        validateBatchGetPegoutStatusResponse({
          results: [
            {
              pegin_txid: VALID_TXID,
              result: { ...validInner, challengers: undefined },
              error: null,
            },
          ],
        }),
      ).toThrow(VpResponseValidationError);
    });
  });
});
