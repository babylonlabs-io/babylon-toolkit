/**
 * Differential tests for deriveExpectedPeginPayoutScriptPubKey (CLAUDE.md
 * critical path #9): the TypeScript derivation must equal the real engine's
 * payout connector scriptPubKey over the golden vectors and seeded random
 * inputs, for every supported graph version.
 */

import { createPayoutConnector } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { Buffer } from "buffer";
import { beforeAll, describe, expect, it } from "vitest";

import { deriveExpectedPeginPayoutScriptPubKey } from "../assertWasmPeginSizing";
import { TEST_KEYS, initializeWasmForTests } from "./helpers";

const GRAPH_VERSIONS = [1, 2, 3] as const;
const DIFFERENTIAL_SEED = 0x2481;
const RANDOM_CASE_COUNT = 40;
// 16 is the largest count that compiles to OP_16, and 17 is the first pushed
// number, so both sides must agree across that boundary.
const EDGE_KEY_COUNTS = [1, 16, 17] as const;
const MAX_RANDOM_KEY_COUNT = 20;
// Timelocks where the minimal script number encoding changes its length or
// its sign-byte handling.
const EDGE_TIMELOCKS = [1, 16, 17, 127, 128, 32767, 32768, 65535] as const;
const MAX_TIMELOCK_PEGIN = 65535;
const PRIVATE_KEY_BYTES = 32;

interface PayoutCase {
  depositorPubkey: string;
  vaultProviderPubkey: string;
  vaultKeeperPubkeys: string[];
  universalChallengerPubkeys: string[];
  timelockPegin: number;
}

function seededU32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
}

function seededXOnlyKey(next: () => number): string {
  const privateKey = Uint8Array.from(
    { length: PRIVATE_KEY_BYTES },
    () => (next() >>> 24) & 0xff,
  );
  return Buffer.from(
    secp256k1.getPublicKey(privateKey, true).subarray(1),
  ).toString("hex");
}

function seededCase(
  next: () => number,
  keeperCount: number,
  challengerCount: number,
  timelockPegin: number,
): PayoutCase {
  return {
    depositorPubkey: seededXOnlyKey(next),
    vaultProviderPubkey: seededXOnlyKey(next),
    vaultKeeperPubkeys: Array.from({ length: keeperCount }, () =>
      seededXOnlyKey(next),
    ),
    universalChallengerPubkeys: Array.from({ length: challengerCount }, () =>
      seededXOnlyKey(next),
    ),
    timelockPegin,
  };
}

function seededCases(): PayoutCase[] {
  const next = seededU32(DIFFERENTIAL_SEED);
  const cases: PayoutCase[] = [];
  for (const keeperCount of EDGE_KEY_COUNTS) {
    for (const challengerCount of EDGE_KEY_COUNTS) {
      const timelockPegin = 1 + (next() % MAX_TIMELOCK_PEGIN);
      cases.push(seededCase(next, keeperCount, challengerCount, timelockPegin));
    }
  }
  for (const timelockPegin of EDGE_TIMELOCKS) {
    const keeperCount = 1 + (next() % MAX_RANDOM_KEY_COUNT);
    const challengerCount = 1 + (next() % MAX_RANDOM_KEY_COUNT);
    cases.push(seededCase(next, keeperCount, challengerCount, timelockPegin));
  }
  for (let index = 0; index < RANDOM_CASE_COUNT; index++) {
    const keeperCount = 1 + (next() % MAX_RANDOM_KEY_COUNT);
    const challengerCount = 1 + (next() % MAX_RANDOM_KEY_COUNT);
    const timelockPegin = 1 + (next() % MAX_TIMELOCK_PEGIN);
    cases.push(seededCase(next, keeperCount, challengerCount, timelockPegin));
  }
  return cases;
}

async function engineScriptPubKey(
  txGraphVersion: number,
  payoutCase: PayoutCase,
): Promise<string> {
  const connector = await createPayoutConnector(
    {
      txGraphVersion,
      depositor: payoutCase.depositorPubkey,
      vaultProvider: payoutCase.vaultProviderPubkey,
      vaultKeepers: payoutCase.vaultKeeperPubkeys,
      universalChallengers: payoutCase.universalChallengerPubkeys,
      timelockPegin: payoutCase.timelockPegin,
    },
    "signet",
  );
  return connector.scriptPubKey;
}

function derivedScriptPubKey(payoutCase: PayoutCase): string {
  return deriveExpectedPeginPayoutScriptPubKey(
    payoutCase,
    payoutCase.timelockPegin,
  ).toString("hex");
}

describe("deriveExpectedPeginPayoutScriptPubKey", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  // The v1 and v2 PegIn golden vectors in pegin.test.ts encode this vault
  // output for these inputs.
  it.each(GRAPH_VERSIONS)(
    "matches the engine and the PegIn golden vault script for graph version %i",
    async (version) => {
      const goldenCase: PayoutCase = {
        depositorPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperPubkeys: [
          TEST_KEYS.VAULT_KEEPER_1,
          TEST_KEYS.VAULT_KEEPER_2,
        ],
        universalChallengerPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        timelockPegin: 100,
      };
      const goldenScript =
        "5120367fb4fcbbe8a43626f4fb89398f47407d7e8e0318985c7a0d8fdb74b718bfc0";

      expect(derivedScriptPubKey(goldenCase)).toBe(goldenScript);
      expect(await engineScriptPubKey(version, goldenCase)).toBe(goldenScript);
    },
  );

  it.each(GRAPH_VERSIONS)(
    "matches the engine for seeded random keys, key counts, and timelocks on graph version %i",
    async (version) => {
      for (const payoutCase of seededCases()) {
        expect(derivedScriptPubKey(payoutCase)).toBe(
          await engineScriptPubKey(version, payoutCase),
        );
      }
    },
  );
});
