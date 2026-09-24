import { VpResponseValidationError } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { fingerprintReturnedGraph } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { describe, expect, it } from "vitest";

import {
  assertBundleBoundToVault,
  assertGraphMatchesPresign,
  PresignFingerprintUnavailableError,
  PresignGraphMismatchError,
} from "../artifactBinding";

const PEGIN_TXID =
  "f545b4a379becea9bd3ed30809c6b568e4035217391791d5408150b15023d64c";
const DEPOSITOR_PK =
  "3f8f4496a7367a7c3fe78f95c084578b228e20325697cfe423936b905f7ac062";
const LOCAL_CHALLENGER = "a0".repeat(32);
const UNIVERSAL_CHALLENGER = "47".repeat(32);
const FOREIGN_TXID = "ff".repeat(32);

const BINDING = {
  peginTxid: PEGIN_TXID,
  depositorPk: DEPOSITOR_PK,
  signedGraphFingerprint: undefined,
};
const SESSION_KEYS = [LOCAL_CHALLENGER, UNIVERSAL_CHALLENGER];

/**
 * Mirrors the shape of a real vault-devnet tx graph: claim and payout each
 * spend an output of the pegin transaction, and the challenger set is split
 * into local and universal.
 */
function txGraph(overrides: Record<string, unknown> = {}) {
  const spend = (txid: string, vout: number) => ({
    tx: { input: [{ previous_output: `${txid}:${vout}` }] },
  });
  return {
    claim_tx: spend(PEGIN_TXID, 1),
    payout_tx: spend(PEGIN_TXID, 0),
    depositor_pubkey: DEPOSITOR_PK,
    challenger_pubkeys: {
      local: [LOCAL_CHALLENGER],
      universal: [UNIVERSAL_CHALLENGER],
    },
    ...overrides,
  };
}

describe("assertBundleBoundToVault", () => {
  it("accepts a bundle whose graph matches the requested deposit", () => {
    expect(() =>
      assertBundleBoundToVault(txGraph(), SESSION_KEYS, BINDING),
    ).not.toThrow();
  });

  it("accepts a pegin txid supplied with an 0x prefix and mixed case", () => {
    expect(() =>
      assertBundleBoundToVault(txGraph(), SESSION_KEYS, {
        peginTxid: `0x${PEGIN_TXID.toUpperCase()}`,
        depositorPk: `0x${DEPOSITOR_PK.toUpperCase()}`,
        signedGraphFingerprint: undefined,
      }),
    ).not.toThrow();
  });

  it("rejects a graph whose claim_tx spends a different pegin", () => {
    const graph = txGraph({
      claim_tx: { tx: { input: [{ previous_output: `${FOREIGN_TXID}:1` }] } },
    });

    expect(() =>
      assertBundleBoundToVault(graph, SESSION_KEYS, BINDING),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects a graph whose payout_tx spends a different pegin", () => {
    const graph = txGraph({
      payout_tx: { tx: { input: [{ previous_output: `${FOREIGN_TXID}:0` }] } },
    });

    expect(() =>
      assertBundleBoundToVault(graph, SESSION_KEYS, BINDING),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects a bundle built for a different depositor", () => {
    const graph = txGraph({ depositor_pubkey: "cc".repeat(32) });

    expect(() =>
      assertBundleBoundToVault(graph, SESSION_KEYS, BINDING),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects a session set missing one of the graph's challengers", () => {
    // Undersupply leaves the depositor without recovery material for an
    // active challenger, which is the asymmetric failure that matters.
    expect(() =>
      assertBundleBoundToVault(txGraph(), [LOCAL_CHALLENGER], BINDING),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects a session keyed by a challenger the graph does not name", () => {
    expect(() =>
      assertBundleBoundToVault(
        txGraph(),
        [...SESSION_KEYS, "de".repeat(32)],
        BINDING,
      ),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects a challenger claimed as both local and universal", () => {
    const graph = txGraph({
      challenger_pubkeys: {
        local: [LOCAL_CHALLENGER],
        universal: [LOCAL_CHALLENGER],
      },
    });

    expect(() =>
      assertBundleBoundToVault(graph, [LOCAL_CHALLENGER], BINDING),
    ).toThrow(VpResponseValidationError);
  });

  it.each([
    ["claim_tx", { claim_tx: undefined }],
    ["payout_tx", { payout_tx: undefined }],
    ["depositor_pubkey", { depositor_pubkey: undefined }],
    ["challenger_pubkeys", { challenger_pubkeys: undefined }],
  ])("rejects a graph missing %s", (_field, overrides) => {
    expect(() =>
      assertBundleBoundToVault(txGraph(overrides), SESSION_KEYS, BINDING),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects a transaction with no inputs", () => {
    const graph = txGraph({ claim_tx: { tx: { input: [] } } });

    expect(() =>
      assertBundleBoundToVault(graph, SESSION_KEYS, BINDING),
    ).toThrow(VpResponseValidationError);
  });

  it("matches the pegin on any input, not only the first", () => {
    // Guards against a false reject if input ordering ever changes.
    const graph = txGraph({
      claim_tx: {
        tx: {
          input: [
            { previous_output: `${FOREIGN_TXID}:3` },
            { previous_output: `${PEGIN_TXID}:1` },
          ],
        },
      },
    });

    expect(() =>
      assertBundleBoundToVault(graph, SESSION_KEYS, BINDING),
    ).not.toThrow();
  });
});

describe("assertGraphMatchesPresign", () => {
  /** A graph in the shape `fingerprintReturnedGraph` consumes. */
  const realGraph = () => ({
    pegin_tx: { tx: tx("aa") },
    claim_tx: { tx: tx("bb") },
    assert_tx: { tx: tx("cc") },
    payout_tx: { tx: tx("dd") },
    challenger_subgraphs: {
      [LOCAL_CHALLENGER]: {
        nopayout_tx: { tx: tx("ee") },
        output_label_hashes: ["c2".repeat(32)],
      },
    },
    challenger_pubkeys: { local: [LOCAL_CHALLENGER], universal: [] },
  });

  function tx(marker: string) {
    return {
      version: 2,
      lock_time: 0,
      input: [
        {
          previous_output: `${marker.repeat(32)}:0`,
          script_sig: "",
          sequence: 4294967295,
          witness: [],
        },
      ],
      output: [{ value: 1000, script_pubkey: `0014${"11".repeat(20)}` }],
    };
  }

  const binding = (signedGraphFingerprint: string | undefined) => ({
    ...BINDING,
    signedGraphFingerprint,
  });

  it("accepts a graph that reproduces the persisted fingerprint", () => {
    const graph = realGraph();
    expect(() =>
      assertGraphMatchesPresign(
        graph,
        binding(fingerprintReturnedGraph(graph)),
      ),
    ).not.toThrow();
  });

  it("rejects a graph whose transactions were swapped after presign", () => {
    const graph = realGraph();
    const expected = binding(fingerprintReturnedGraph(graph));
    const swapped = { ...graph, payout_tx: { tx: tx("ff") } };
    expect(() => assertGraphMatchesPresign(swapped, expected)).toThrow(
      PresignGraphMismatchError,
    );
  });

  it("rejects a graph whose challenger roster was swapped after presign", () => {
    const graph = realGraph();
    const expected = binding(fingerprintReturnedGraph(graph));
    const swapped = {
      ...graph,
      challenger_subgraphs: {
        [UNIVERSAL_CHALLENGER]: graph.challenger_subgraphs[LOCAL_CHALLENGER],
      },
    };
    expect(() => assertGraphMatchesPresign(swapped, expected)).toThrow(
      PresignGraphMismatchError,
    );
  });

  it("reports a graph too malformed to fingerprint as a mismatch", () => {
    const graph = realGraph();
    const expected = binding(fingerprintReturnedGraph(graph));
    const withoutAssert: Record<string, unknown> = { ...graph };
    delete withoutAssert.assert_tx;
    expect(() => assertGraphMatchesPresign(withoutAssert, expected)).toThrow(
      PresignGraphMismatchError,
    );
  });

  it("rejects a declared roster that adds a challenger the fingerprint does not cover", () => {
    const graph = realGraph();
    const expected = binding(fingerprintReturnedGraph(graph));
    const widened = {
      ...graph,
      challenger_pubkeys: {
        local: [LOCAL_CHALLENGER],
        universal: [UNIVERSAL_CHALLENGER],
      },
    };
    expect(() => assertGraphMatchesPresign(widened, expected)).toThrow(
      PresignGraphMismatchError,
    );
  });

  it("rejects a declared roster that drops a fingerprinted challenger", () => {
    const graph = realGraph();
    const expected = binding(fingerprintReturnedGraph(graph));
    const narrowed = {
      ...graph,
      challenger_pubkeys: { local: [], universal: [] },
    };
    expect(() => assertGraphMatchesPresign(narrowed, expected)).toThrow(
      PresignGraphMismatchError,
    );
  });

  it("reports absence separately from a mismatch", () => {
    expect(() =>
      assertGraphMatchesPresign(realGraph(), binding(undefined)),
    ).toThrow(PresignFingerprintUnavailableError);
  });
});
