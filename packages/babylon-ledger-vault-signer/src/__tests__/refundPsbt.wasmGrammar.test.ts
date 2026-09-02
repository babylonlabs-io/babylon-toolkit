/**
 * Binds the refund-leaf grammar to the REAL WASM builder (PR #2378 review).
 *
 * Every other accept-vector is hand-rolled; this is the one place the repo
 * asserts that the leaf `buildRefundPsbt` actually attaches — WASM's
 * `getRefundScript()` — parses under the host grammar. If the WASM shape ever
 * drifts, `classifyRefundPsbt` would silently stop recognising refunds and
 * every Ledger refund would fail as "no approved intent"; this test makes that
 * drift a red build instead.
 *
 * Imports the WASM package's dist lazily (same boundary as the e2e fixtures);
 * `@babylonlabs-io/babylon-tbv-rust-wasm` must be built first — already a
 * prerequisite of this package's test target.
 */

// @vitest-environment node

import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { parseRefundLeafScript } from "../refundPsbt";

const DEPOSITOR_XONLY = "dc8d2f9eff0c4f4dbde070a48e330efc908b62a766568d91e658f284b324b878";
const VP_XONLY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const KEEPER_XONLY = "25d1dff95105f5253c4022f628a996ad3a0d95fbf21d468a1b33f8c160d8f517";
const CHALLENGER_XONLY = "2f01e5e15cca351daff3843fb70f3c2f0a1bdd05e5af888a67784ef3e10a2a01";
const TIMELOCK_REFUND = 144;
const TX_GRAPH_VERSION = 2;

describe("refund-leaf grammar ↔ WASM builder contract", () => {
  it("parses the WASM-built refund leaf byte-for-byte", async () => {
    const { getPrePeginHtlcConnectorInfo } = await import("@babylonlabs-io/babylon-tbv-rust-wasm");
    const info = await getPrePeginHtlcConnectorInfo({
      txGraphVersion: TX_GRAPH_VERSION,
      depositorPubkey: DEPOSITOR_XONLY,
      vaultProviderPubkey: VP_XONLY,
      vaultKeeperPubkeys: [KEEPER_XONLY],
      universalChallengerPubkeys: [CHALLENGER_XONLY],
      hashlock: "ab".repeat(32),
      timelockRefund: TIMELOCK_REFUND,
      network: "signet",
    });
    const script = Buffer.from(info.refundScript.replace(/^0x/, ""), "hex");
    expect(parseRefundLeafScript(script)).toEqual({ leafKeyHex: DEPOSITOR_XONLY, csv: TIMELOCK_REFUND });
  });
});
