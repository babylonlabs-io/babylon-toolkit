import { describe, expect, it } from "vitest";

import { DaemonStatus } from "../../../models/peginStateMachine";
import {
  validateGetPeginStatusResponse,
  validateRequestDepositorPresignTransactionsResponse,
} from "../validators";

// ============================================================================
// Test fixtures
// ============================================================================

const VALID_PUBKEY = "a".repeat(64); // 32-byte x-only pubkey as hex
const VALID_TX_HEX = "deadbeef".repeat(20);
const VALID_PSBT = "cHNidP8BAH0CAAAAAc"; // base64-ish non-empty string

const validClaimerTransaction = {
  claimer_pubkey: VALID_PUBKEY,
  claim_tx: { tx_hex: VALID_TX_HEX },
  assert_tx: { tx_hex: VALID_TX_HEX },
  payout_tx: { tx_hex: VALID_TX_HEX },
  payout_psbt: VALID_PSBT,
};

const validChallengerPresignData = {
  challenger_pubkey: VALID_PUBKEY,
  challenge_assert_tx: { tx_hex: VALID_TX_HEX },
  nopayout_tx: { tx_hex: VALID_TX_HEX },
  challenge_assert_psbt: VALID_PSBT,
  nopayout_psbt: VALID_PSBT,
};

const validDepositorGraph = {
  claim_tx: { tx_hex: VALID_TX_HEX },
  assert_tx: { tx_hex: VALID_TX_HEX },
  payout_tx: { tx_hex: VALID_TX_HEX },
  payout_psbt: VALID_PSBT,
  challenger_presign_data: [validChallengerPresignData],
  offchain_params_version: 1,
};

const validPresignResponse = {
  txs: [validClaimerTransaction],
  depositor_graph: validDepositorGraph,
};

const validPeginStatusResponse = {
  pegin_txid: "a".repeat(64),
  status: DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
  progress: {},
  health_info: "ok",
};

// ============================================================================
// validateGetPeginStatusResponse
// ============================================================================

describe("validateGetPeginStatusResponse", () => {
  it("accepts a valid response with a known status", () => {
    expect(() =>
      validateGetPeginStatusResponse(validPeginStatusResponse),
    ).not.toThrow();
  });

  it("accepts every known DaemonStatus value", () => {
    for (const status of Object.values(DaemonStatus)) {
      expect(() =>
        validateGetPeginStatusResponse({ ...validPeginStatusResponse, status }),
      ).not.toThrow();
    }
  });

  it("throws for an unrecognized status string", () => {
    expect(() =>
      validateGetPeginStatusResponse({
        ...validPeginStatusResponse,
        status: "MaliciousStatus",
      }),
    ).toThrow('unrecognized status "MaliciousStatus"');
  });

  it("throws for an empty status string", () => {
    expect(() =>
      validateGetPeginStatusResponse({
        ...validPeginStatusResponse,
        status: "",
      }),
    ).toThrow("unrecognized status");
  });

  it("throws when status is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { status, ...withoutStatus } = validPeginStatusResponse;
    expect(() => validateGetPeginStatusResponse(withoutStatus)).toThrow(
      '"status" must be a string',
    );
  });

  it("throws when pegin_txid is not a string", () => {
    expect(() =>
      validateGetPeginStatusResponse({
        ...validPeginStatusResponse,
        pegin_txid: 42,
      }),
    ).toThrow('"pegin_txid" must be a string');
  });

  it("throws when health_info is not a string", () => {
    expect(() =>
      validateGetPeginStatusResponse({
        ...validPeginStatusResponse,
        health_info: null,
      }),
    ).toThrow('"health_info" must be a string');
  });

  it("throws when response is null", () => {
    expect(() => validateGetPeginStatusResponse(null)).toThrow(
      "response is not an object",
    );
  });

  it("throws when response is not an object", () => {
    expect(() => validateGetPeginStatusResponse("string")).toThrow(
      "response is not an object",
    );
  });
});

// ============================================================================
// validateRequestDepositorPresignTransactionsResponse
// ============================================================================

describe("validateRequestDepositorPresignTransactionsResponse", () => {
  it("accepts a valid response", () => {
    expect(() =>
      validateRequestDepositorPresignTransactionsResponse(validPresignResponse),
    ).not.toThrow();
  });

  it("accepts an empty txs array", () => {
    expect(() =>
      validateRequestDepositorPresignTransactionsResponse({
        ...validPresignResponse,
        txs: [],
      }),
    ).not.toThrow();
  });

  it("accepts multiple claimer transactions", () => {
    expect(() =>
      validateRequestDepositorPresignTransactionsResponse({
        ...validPresignResponse,
        txs: [validClaimerTransaction, validClaimerTransaction],
      }),
    ).not.toThrow();
  });

  it("throws when response is null", () => {
    expect(() =>
      validateRequestDepositorPresignTransactionsResponse(null),
    ).toThrow("response is not an object");
  });

  it("throws when txs is not an array", () => {
    expect(() =>
      validateRequestDepositorPresignTransactionsResponse({
        ...validPresignResponse,
        txs: "not-an-array",
      }),
    ).toThrow('"txs" must be an array');
  });

  it("throws when depositor_graph is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { depositor_graph, ...withoutGraph } = validPresignResponse;
    expect(() =>
      validateRequestDepositorPresignTransactionsResponse(withoutGraph),
    ).toThrow('"depositor_graph" must be an object');
  });

  describe("claimer transaction validation", () => {
    it("throws when claimer_pubkey has wrong length", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          txs: [
            { ...validClaimerTransaction, claimer_pubkey: "ab".repeat(33) },
          ],
        }),
      ).toThrow("txs[0].claimer_pubkey");
    });

    it("throws when claimer_pubkey contains non-hex characters", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          txs: [{ ...validClaimerTransaction, claimer_pubkey: "z".repeat(64) }],
        }),
      ).toThrow("txs[0].claimer_pubkey");
    });

    it("throws when claim_tx.tx_hex is empty", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          txs: [
            {
              ...validClaimerTransaction,
              claim_tx: { tx_hex: "" },
            },
          ],
        }),
      ).toThrow("txs[0].claim_tx.tx_hex");
    });

    it("throws when assert_tx.tx_hex contains non-hex characters", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          txs: [
            {
              ...validClaimerTransaction,
              assert_tx: { tx_hex: "not-hex!" },
            },
          ],
        }),
      ).toThrow("txs[0].assert_tx.tx_hex");
    });

    it("throws when payout_tx.tx_hex is missing", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          txs: [{ ...validClaimerTransaction, payout_tx: {} }],
        }),
      ).toThrow("txs[0].payout_tx.tx_hex");
    });

    it("throws when payout_psbt is empty", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          txs: [{ ...validClaimerTransaction, payout_psbt: "" }],
        }),
      ).toThrow("txs[0].payout_psbt");
    });
  });

  describe("depositor_graph validation", () => {
    it("throws when depositor_graph.claim_tx.tx_hex is empty", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          depositor_graph: {
            ...validDepositorGraph,
            claim_tx: { tx_hex: "" },
          },
        }),
      ).toThrow("depositor_graph.claim_tx.tx_hex");
    });

    it("throws when depositor_graph.payout_psbt is missing", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          depositor_graph: {
            ...validDepositorGraph,
            payout_psbt: "",
          },
        }),
      ).toThrow("depositor_graph.payout_psbt");
    });

    it("throws when challenger_presign_data is not an array", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          depositor_graph: {
            ...validDepositorGraph,
            challenger_presign_data: null,
          },
        }),
      ).toThrow("depositor_graph.challenger_presign_data");
    });

    it("throws when a challenger_presign_data entry has invalid challenger_pubkey", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          depositor_graph: {
            ...validDepositorGraph,
            challenger_presign_data: [
              { ...validChallengerPresignData, challenger_pubkey: "short" },
            ],
          },
        }),
      ).toThrow("depositor_graph.challenger_presign_data[0].challenger_pubkey");
    });

    it("throws when offchain_params_version is not a number", () => {
      expect(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          depositor_graph: {
            ...validDepositorGraph,
            offchain_params_version: "1",
          },
        }),
      ).toThrow("depositor_graph.offchain_params_version");
    });
  });
});
