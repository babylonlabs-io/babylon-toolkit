import { describe, expect, it } from "vitest";

import { getChallengeAssertOutputScriptPubKey } from "..";

// The vector vault-wasm pins natively (`script_pubkey_matches_golden`) and in
// its Node test, where a builder differential ties it to btc-vault's
// ChallengeAssert output 0. The testnet reset kept the value the pre-reset
// graphs produced.
const CLAIMER =
  "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";
const CHALLENGER =
  "dd308afec5777e13121fa72b9cc1b7cc0139715309b086c960e18fd969774eb8";
const TIMELOCK_CHALLENGE_ASSERT = 144;
const LABEL_HASHES = [1, 2, 3, 4, 5, 6].map((i) =>
  i.toString(16).padStart(2, "0").repeat(32),
);
const GOLDEN_SCRIPT_PUBKEY =
  "5120bac2d1b7e76ee82f76e51584a20bc4a92edc7936b7929025c5c13cb900b36106";

function params(overrides: {
  timelockChallengeAssert?: number;
  outputLabelHashes?: string[];
}) {
  return {
    txGraphVersion: 1,
    claimer: CLAIMER,
    challenger: CHALLENGER,
    timelockChallengeAssert: TIMELOCK_CHALLENGE_ASSERT,
    outputLabelHashes: LABEL_HASHES,
    network: "regtest" as const,
    ...overrides,
  };
}

describe("getChallengeAssertOutputScriptPubKey", () => {
  it("returns the scriptPubKey vault-wasm pins for tx graph version 1", async () => {
    await expect(
      getChallengeAssertOutputScriptPubKey(params({})),
    ).resolves.toBe(GOLDEN_SCRIPT_PUBKEY);
  });

  it("rejects a timelock above the u16 range before calling WASM", async () => {
    await expect(
      getChallengeAssertOutputScriptPubKey(
        params({ timelockChallengeAssert: 70_000 }),
      ),
    ).rejects.toThrow("timelockChallengeAssert must be an integer in 1..65535");
  });

  it("rejects label hashes that are not one per finalized GC instance", async () => {
    await expect(
      getChallengeAssertOutputScriptPubKey(
        params({ outputLabelHashes: LABEL_HASHES.slice(0, 5) }),
      ),
    ).rejects.toThrow("outputLabelHashes must hold exactly 6 hashes, got 5");
  });

  it("rejects a label hash that is not 64 lowercase hex characters", async () => {
    const upper = [...LABEL_HASHES];
    upper[2] = "AB".repeat(32);

    await expect(
      getChallengeAssertOutputScriptPubKey(
        params({ outputLabelHashes: upper }),
      ),
    ).rejects.toThrow(
      "outputLabelHashes[2] must be 64 lowercase hex characters",
    );
  });
});
