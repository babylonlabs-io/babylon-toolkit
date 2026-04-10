import { describe, expect, it } from "vitest";

import { DaemonStatus } from "../../../models/peginStateMachine";
import {
  validateGetPeginStatusResponse,
  validateGetPegoutStatusResponse,
  validateRequestDepositorClaimerArtifactsResponse,
  validateRequestDepositorPresignTransactionsResponse,
  VpResponseValidationError,
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

/**
 * Calls fn(), expects it to throw a VpResponseValidationError, and returns
 * the error's `.detail` string for further assertion.
 */
function getVpValidationDetail(fn: () => void): string {
  try {
    fn();
    throw new Error(
      "Expected VpResponseValidationError but no error was thrown",
    );
  } catch (e) {
    expect(e).toBeInstanceOf(VpResponseValidationError);
    return (e as VpResponseValidationError).detail;
  }
}

// ============================================================================
// VpResponseValidationError
// ============================================================================

describe("VpResponseValidationError", () => {
  it("has a user-friendly message and preserves technical detail", () => {
    const err = new VpResponseValidationError("internal: bad field");
    expect(err.message).toBe(
      "The vault provider returned an unexpected response. Please try again or contact support.",
    );
    expect(err.detail).toBe("internal: bad field");
    expect(err.name).toBe("VpResponseValidationError");
  });
});

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
    const detail = getVpValidationDetail(() =>
      validateGetPeginStatusResponse({
        ...validPeginStatusResponse,
        status: "MaliciousStatus",
      }),
    );
    expect(detail).toContain('unrecognized status "MaliciousStatus"');
  });

  it("throws for an empty status string", () => {
    const detail = getVpValidationDetail(() =>
      validateGetPeginStatusResponse({
        ...validPeginStatusResponse,
        status: "",
      }),
    );
    expect(detail).toContain("unrecognized status");
  });

  it("throws when status is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { status, ...withoutStatus } = validPeginStatusResponse;
    const detail = getVpValidationDetail(() =>
      validateGetPeginStatusResponse(withoutStatus),
    );
    expect(detail).toContain('"status" must be a string');
  });

  it("throws when pegin_txid is not a string", () => {
    const detail = getVpValidationDetail(() =>
      validateGetPeginStatusResponse({
        ...validPeginStatusResponse,
        pegin_txid: 42,
      }),
    );
    expect(detail).toContain('"pegin_txid" must be a 64-char hex string');
  });

  it("throws when pegin_txid is not valid hex", () => {
    const detail = getVpValidationDetail(() =>
      validateGetPeginStatusResponse({
        ...validPeginStatusResponse,
        pegin_txid: "z".repeat(64),
      }),
    );
    expect(detail).toContain('"pegin_txid" must be a 64-char hex string');
  });

  it("throws when pegin_txid is not 64 chars", () => {
    const detail = getVpValidationDetail(() =>
      validateGetPeginStatusResponse({
        ...validPeginStatusResponse,
        pegin_txid: "a".repeat(32),
      }),
    );
    expect(detail).toContain('"pegin_txid" must be a 64-char hex string');
  });

  it("throws when progress is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { progress, ...withoutProgress } = validPeginStatusResponse;
    const detail = getVpValidationDetail(() =>
      validateGetPeginStatusResponse(withoutProgress),
    );
    expect(detail).toContain('"progress" must be an object');
  });

  it("throws when progress is not an object", () => {
    const detail = getVpValidationDetail(() =>
      validateGetPeginStatusResponse({
        ...validPeginStatusResponse,
        progress: "invalid",
      }),
    );
    expect(detail).toContain('"progress" must be an object');
  });

  it("throws when health_info is not a string", () => {
    const detail = getVpValidationDetail(() =>
      validateGetPeginStatusResponse({
        ...validPeginStatusResponse,
        health_info: null,
      }),
    );
    expect(detail).toContain('"health_info" must be a string');
  });

  it("accepts a valid response with last_error as a string", () => {
    expect(() =>
      validateGetPeginStatusResponse({
        ...validPeginStatusResponse,
        last_error: "something went wrong",
      }),
    ).not.toThrow();
  });

  it("accepts a valid response without last_error", () => {
    expect(() =>
      validateGetPeginStatusResponse(validPeginStatusResponse),
    ).not.toThrow();
  });

  it("throws when last_error is a number", () => {
    const detail = getVpValidationDetail(() =>
      validateGetPeginStatusResponse({
        ...validPeginStatusResponse,
        last_error: 42,
      }),
    );
    expect(detail).toContain('"last_error" must be a string if present');
  });

  it("throws when last_error is an object", () => {
    const detail = getVpValidationDetail(() =>
      validateGetPeginStatusResponse({
        ...validPeginStatusResponse,
        last_error: { code: 1 },
      }),
    );
    expect(detail).toContain('"last_error" must be a string if present');
  });

  it("throws when response is null", () => {
    const detail = getVpValidationDetail(() =>
      validateGetPeginStatusResponse(null),
    );
    expect(detail).toContain("response is not an object");
  });

  it("throws when response is not an object", () => {
    const detail = getVpValidationDetail(() =>
      validateGetPeginStatusResponse("string"),
    );
    expect(detail).toContain("response is not an object");
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
    const detail = getVpValidationDetail(() =>
      validateRequestDepositorPresignTransactionsResponse(null),
    );
    expect(detail).toContain("response is not an object");
  });

  it("throws when txs is not an array", () => {
    const detail = getVpValidationDetail(() =>
      validateRequestDepositorPresignTransactionsResponse({
        ...validPresignResponse,
        txs: "not-an-array",
      }),
    );
    expect(detail).toContain('"txs" must be an array');
  });

  it("throws when depositor_graph is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { depositor_graph, ...withoutGraph } = validPresignResponse;
    const detail = getVpValidationDetail(() =>
      validateRequestDepositorPresignTransactionsResponse(withoutGraph),
    );
    expect(detail).toContain('"depositor_graph" must be an object');
  });

  describe("claimer transaction validation", () => {
    it("throws when claimer_pubkey has wrong length", () => {
      const detail = getVpValidationDetail(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          txs: [
            { ...validClaimerTransaction, claimer_pubkey: "ab".repeat(33) },
          ],
        }),
      );
      expect(detail).toContain("txs[0].claimer_pubkey");
    });

    it("throws when claimer_pubkey contains non-hex characters", () => {
      const detail = getVpValidationDetail(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          txs: [{ ...validClaimerTransaction, claimer_pubkey: "z".repeat(64) }],
        }),
      );
      expect(detail).toContain("txs[0].claimer_pubkey");
    });

    it("throws when claim_tx.tx_hex is empty", () => {
      const detail = getVpValidationDetail(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          txs: [
            {
              ...validClaimerTransaction,
              claim_tx: { tx_hex: "" },
            },
          ],
        }),
      );
      expect(detail).toContain("txs[0].claim_tx.tx_hex");
    });

    it("throws when assert_tx.tx_hex contains non-hex characters", () => {
      const detail = getVpValidationDetail(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          txs: [
            {
              ...validClaimerTransaction,
              assert_tx: { tx_hex: "not-hex!" },
            },
          ],
        }),
      );
      expect(detail).toContain("txs[0].assert_tx.tx_hex");
    });

    it("throws when payout_tx.tx_hex is missing", () => {
      const detail = getVpValidationDetail(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          txs: [{ ...validClaimerTransaction, payout_tx: {} }],
        }),
      );
      expect(detail).toContain("txs[0].payout_tx.tx_hex");
    });

    it("throws when payout_psbt is empty", () => {
      const detail = getVpValidationDetail(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          txs: [{ ...validClaimerTransaction, payout_psbt: "" }],
        }),
      );
      expect(detail).toContain("txs[0].payout_psbt");
    });
  });

  describe("depositor_graph validation", () => {
    it("throws when depositor_graph.claim_tx.tx_hex is empty", () => {
      const detail = getVpValidationDetail(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          depositor_graph: {
            ...validDepositorGraph,
            claim_tx: { tx_hex: "" },
          },
        }),
      );
      expect(detail).toContain("depositor_graph.claim_tx.tx_hex");
    });

    it("throws when depositor_graph.payout_psbt is missing", () => {
      const detail = getVpValidationDetail(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          depositor_graph: {
            ...validDepositorGraph,
            payout_psbt: "",
          },
        }),
      );
      expect(detail).toContain("depositor_graph.payout_psbt");
    });

    it("throws when challenger_presign_data is not an array", () => {
      const detail = getVpValidationDetail(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          depositor_graph: {
            ...validDepositorGraph,
            challenger_presign_data: null,
          },
        }),
      );
      expect(detail).toContain("depositor_graph.challenger_presign_data");
    });

    it("throws when a challenger_presign_data entry has invalid challenger_pubkey", () => {
      const detail = getVpValidationDetail(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          depositor_graph: {
            ...validDepositorGraph,
            challenger_presign_data: [
              { ...validChallengerPresignData, challenger_pubkey: "short" },
            ],
          },
        }),
      );
      expect(detail).toContain(
        "depositor_graph.challenger_presign_data[0].challenger_pubkey",
      );
    });

    it("throws when offchain_params_version is not a number", () => {
      const detail = getVpValidationDetail(() =>
        validateRequestDepositorPresignTransactionsResponse({
          ...validPresignResponse,
          depositor_graph: {
            ...validDepositorGraph,
            offchain_params_version: "1",
          },
        }),
      );
      expect(detail).toContain("depositor_graph.offchain_params_version");
    });
  });
});

// ============================================================================
// validateRequestDepositorClaimerArtifactsResponse
// ============================================================================

const VALID_ARTIFACTS_HEX = "deadbeef".repeat(10);
const VALID_VERIFYING_KEY_HEX = "cafebabe".repeat(8);

const validClaimerArtifactsResponse = {
  tx_graph_json: '{"nodes":[]}',
  verifying_key_hex: VALID_VERIFYING_KEY_HEX,
  babe_sessions: {
    [VALID_PUBKEY]: { decryptor_artifacts_hex: VALID_ARTIFACTS_HEX },
  },
};

describe("validateRequestDepositorClaimerArtifactsResponse", () => {
  it("accepts a valid response", () => {
    expect(() =>
      validateRequestDepositorClaimerArtifactsResponse(
        validClaimerArtifactsResponse,
      ),
    ).not.toThrow();
  });

  it("accepts a response with empty babe_sessions", () => {
    expect(() =>
      validateRequestDepositorClaimerArtifactsResponse({
        ...validClaimerArtifactsResponse,
        babe_sessions: {},
      }),
    ).not.toThrow();
  });

  it("throws when response is null", () => {
    const detail = getVpValidationDetail(() =>
      validateRequestDepositorClaimerArtifactsResponse(null),
    );
    expect(detail).toContain("response is not an object");
  });

  it("throws when tx_graph_json is empty", () => {
    const detail = getVpValidationDetail(() =>
      validateRequestDepositorClaimerArtifactsResponse({
        ...validClaimerArtifactsResponse,
        tx_graph_json: "",
      }),
    );
    expect(detail).toContain('"tx_graph_json" must be a non-empty string');
  });

  it("throws when tx_graph_json is not a string", () => {
    const detail = getVpValidationDetail(() =>
      validateRequestDepositorClaimerArtifactsResponse({
        ...validClaimerArtifactsResponse,
        tx_graph_json: 42,
      }),
    );
    expect(detail).toContain('"tx_graph_json" must be a non-empty string');
  });

  it("throws when verifying_key_hex is not hex", () => {
    const detail = getVpValidationDetail(() =>
      validateRequestDepositorClaimerArtifactsResponse({
        ...validClaimerArtifactsResponse,
        verifying_key_hex: "not-hex!",
      }),
    );
    expect(detail).toContain(
      '"verifying_key_hex" must be a non-empty hex string',
    );
  });

  it("throws when babe_sessions is not an object", () => {
    const detail = getVpValidationDetail(() =>
      validateRequestDepositorClaimerArtifactsResponse({
        ...validClaimerArtifactsResponse,
        babe_sessions: "not-an-object",
      }),
    );
    expect(detail).toContain('"babe_sessions" must be an object');
  });

  it("throws when a babe_sessions entry is not an object", () => {
    const detail = getVpValidationDetail(() =>
      validateRequestDepositorClaimerArtifactsResponse({
        ...validClaimerArtifactsResponse,
        babe_sessions: { [VALID_PUBKEY]: "invalid" },
      }),
    );
    expect(detail).toContain(
      `"babe_sessions.${VALID_PUBKEY}" must be an object`,
    );
  });

  it("throws when decryptor_artifacts_hex is not hex", () => {
    const detail = getVpValidationDetail(() =>
      validateRequestDepositorClaimerArtifactsResponse({
        ...validClaimerArtifactsResponse,
        babe_sessions: {
          [VALID_PUBKEY]: { decryptor_artifacts_hex: "not-hex!" },
        },
      }),
    );
    expect(detail).toContain("decryptor_artifacts_hex");
  });
});

// ============================================================================
// validateGetPegoutStatusResponse
// ============================================================================

const VALID_PEGIN_TXID = "b".repeat(64);

const validPegoutStatusResponse = {
  pegin_txid: VALID_PEGIN_TXID,
  found: true,
};

describe("validateGetPegoutStatusResponse", () => {
  it("accepts a minimal valid response (no claimer or challenger)", () => {
    expect(() =>
      validateGetPegoutStatusResponse(validPegoutStatusResponse),
    ).not.toThrow();
  });

  it("accepts a response with claimer and challenger", () => {
    expect(() =>
      validateGetPegoutStatusResponse({
        ...validPegoutStatusResponse,
        claimer: { status: "active", failed: false },
        challenger: { status: "idle" },
      }),
    ).not.toThrow();
  });

  it("accepts found: false with no claimer or challenger", () => {
    expect(() =>
      validateGetPegoutStatusResponse({
        ...validPegoutStatusResponse,
        found: false,
      }),
    ).not.toThrow();
  });

  it("throws when response is null", () => {
    const detail = getVpValidationDetail(() =>
      validateGetPegoutStatusResponse(null),
    );
    expect(detail).toContain("response is not an object");
  });

  it("throws when pegin_txid is not a 64-char hex string", () => {
    const detail = getVpValidationDetail(() =>
      validateGetPegoutStatusResponse({
        ...validPegoutStatusResponse,
        pegin_txid: "short",
      }),
    );
    expect(detail).toContain('"pegin_txid" must be a 64-char hex string');
  });

  it("throws when found is not a boolean", () => {
    const detail = getVpValidationDetail(() =>
      validateGetPegoutStatusResponse({
        ...validPegoutStatusResponse,
        found: "yes",
      }),
    );
    expect(detail).toContain('"found" must be a boolean');
  });

  it("throws when claimer is not an object", () => {
    const detail = getVpValidationDetail(() =>
      validateGetPegoutStatusResponse({
        ...validPegoutStatusResponse,
        claimer: "invalid",
      }),
    );
    expect(detail).toContain('"claimer" must be an object if present');
  });

  it("throws when claimer.status is not a string", () => {
    const detail = getVpValidationDetail(() =>
      validateGetPegoutStatusResponse({
        ...validPegoutStatusResponse,
        claimer: { status: 42, failed: false },
      }),
    );
    expect(detail).toContain('"claimer.status" must be a string');
  });

  it("throws when claimer.failed is not a boolean", () => {
    const detail = getVpValidationDetail(() =>
      validateGetPegoutStatusResponse({
        ...validPegoutStatusResponse,
        claimer: { status: "active", failed: "no" },
      }),
    );
    expect(detail).toContain('"claimer.failed" must be a boolean');
  });

  it("throws when challenger is not an object", () => {
    const detail = getVpValidationDetail(() =>
      validateGetPegoutStatusResponse({
        ...validPegoutStatusResponse,
        challenger: 99,
      }),
    );
    expect(detail).toContain('"challenger" must be an object if present');
  });

  it("throws when challenger.status is not a string", () => {
    const detail = getVpValidationDetail(() =>
      validateGetPegoutStatusResponse({
        ...validPegoutStatusResponse,
        challenger: { status: null },
      }),
    );
    expect(detail).toContain('"challenger.status" must be a string');
  });
});
