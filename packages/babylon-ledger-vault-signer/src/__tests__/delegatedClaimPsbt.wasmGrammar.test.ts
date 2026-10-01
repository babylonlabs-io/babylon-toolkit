/**
 * Binds the payout-leaf grammar to the REAL WASM builder, as
 * `refundPsbt.wasmGrammar.test.ts` does for the refund leaf. The claimer
 * Payout PSBT the SDK hands the provider carries this leaf on input 1; if the
 * WASM shape drifts, `classifyDelegatedClaimPsbt` would silently stop
 * recognising it and every Ledger self-claim would fail as "no approved
 * intent" — this makes that drift a red build.
 *
 * The Claim, WronglyChallenged and Assert builders take a v3 graph JSON,
 * which no repo fixture provides, and the facade exposes no graph-free
 * builder for the claim-assert leaf (`getChallengeAssertScriptInfo` is the
 * Assert→Challenge connector and needs VP WOTS keys); their full-PSBT
 * contracts are proven on Speculos against the fixture VP's graph (P3).
 *
 * `@babylonlabs-io/babylon-tbv-rust-wasm` must be built first — already a
 * prerequisite of this package's test target.
 */

// @vitest-environment node

import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { parsePayoutLeafScript } from "../delegatedClaimPsbt";
import { CHALLENGER_XONLY, DEPOSITOR_XONLY, KEEPER_XONLY, PAYOUT_TIMELOCK } from "./fixtures/delegatedClaimShapes";

/** BIP-340 test-vector pubkey 1 — the e2e fixture's council member (depositorGraphFixture.ts). */
const COUNCIL_XONLY = "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";
const COUNCIL_QUORUM = 1;
/** Delegated claim is graph v3 only (`delegatedClaim.ts` module doc). */
const TX_GRAPH_VERSION = 3;

describe("payout-leaf grammar ↔ WASM builder contract", () => {
  it("accepts the WASM-built Assert:0 payout leaf and reads D out of it", async () => {
    const { getAssertPayoutScriptInfo } = await import("@babylonlabs-io/babylon-tbv-rust-wasm");

    const info = await getAssertPayoutScriptInfo({
      txGraphVersion: TX_GRAPH_VERSION,
      claimer: DEPOSITOR_XONLY,
      localChallengers: [KEEPER_XONLY],
      universalChallengers: [CHALLENGER_XONLY],
      timelockAssert: PAYOUT_TIMELOCK,
      councilMembers: [COUNCIL_XONLY],
      councilQuorum: COUNCIL_QUORUM,
    });

    const script = Buffer.from(info.payoutScript.replace(/^0x/, ""), "hex");
    expect(parsePayoutLeafScript(script)).toEqual({
      leafKeyHex: DEPOSITOR_XONLY,
    });
  });
});
