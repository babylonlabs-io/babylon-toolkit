import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  createPayoutConnector,
  deriveVaultId,
  getAssertNoPayoutScriptInfo,
  getAssertPayoutScriptInfo,
  getChallengeAssertScriptInfo,
} from "@babylonlabs-io/ts-sdk/tbv/core/wasm";

const [CLAIMER, LOCAL_CHALLENGER, UNIVERSAL_CHALLENGER, ...COUNCIL] = [
  "2fa2104d6b38d11b0230010559879124e42ab8dfeff5ff29dc9cdadd4ecacc3f",
  "352bbf4a4cdd12564f93fa332ce333301d9ad40271f8107181340aef25be59d5",
  "421f5fc9a21065445c96fdb91c0c1e2f2431741c72713b4b99ddcb316f31e9fc",
  "4ce119c96e2fa357200b559b2f7dd5a5f02d5290aff74b03f3e471b273211c97",
  "fe72c435413d33d48ac09c9161ba8b09683215439d62b7940502bda8b202e6ce",
];

const [DEPOSITOR, VAULT_PROVIDER, VAULT_KEEPER, PAYOUT_UNIVERSAL_CHALLENGER] = [
  "2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4",
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
  "e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13",
];

function wotsPublicKey(n, domain) {
  const terminal = (index) =>
    Array.from({ length: 20 }, (_, byte) => (domain + index + byte) % 256);

  return {
    config: {
      d: 4,
      n,
      checksum_radix: Math.ceil(Math.sqrt(n * 15 + 1)),
    },
    message_terminals: Array.from({ length: n }, (_, index) =>
      terminal(index + 2),
    ),
    checksum_major_terminal: terminal(1),
    checksum_minor_terminal: terminal(0),
  };
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

test("pins deriveVaultId through the built WASM facade", async () => {
  assert.equal(
    await deriveVaultId(
      "ab".repeat(32),
      "1234567890abcdef1234567890abcdef12345678",
    ),
    "f8d22e64c72a84a3dacdedb7d8b42e285bf06bd25850da911398c51d5a6c2dba",
  );
});

test("pins getAssertNoPayoutScriptInfo through the built WASM facade", async () => {
  const noPayout = await getAssertNoPayoutScriptInfo(
    {
      txGraphVersion: 3,
      claimer: CLAIMER,
      localChallengers: [LOCAL_CHALLENGER],
      universalChallengers: [UNIVERSAL_CHALLENGER],
      timelockAssert: 100,
      councilMembers: COUNCIL,
      councilQuorum: 1,
    },
    LOCAL_CHALLENGER,
  );

  assert.deepEqual(
    {
      script: sha256Text(noPayout.noPayoutScript),
      controlBlock: sha256Text(noPayout.noPayoutControlBlock),
    },
    {
      script:
        "7476f487ae7d44694bfb9165d6731001e2002e75d49186f67391951a82593367",
      controlBlock:
        "ab1667d20d7072fb5ff5377bb965ed1232e5f0478f7c19064cf554a6e03c3bf0",
    },
  );
});

test("pins getAssertPayoutScriptInfo through the built WASM facade", async () => {
  const payout = await getAssertPayoutScriptInfo({
    txGraphVersion: 3,
    claimer: CLAIMER,
    localChallengers: [LOCAL_CHALLENGER],
    universalChallengers: [UNIVERSAL_CHALLENGER],
    timelockAssert: 100,
    councilMembers: COUNCIL,
    councilQuorum: 1,
  });

  assert.deepEqual(
    {
      script: sha256Text(payout.payoutScript),
      controlBlock: sha256Text(payout.payoutControlBlock),
    },
    {
      script:
        "24e978f39a1df9a00d6b6780269461c926e44332793f91a0be68e712b8ccf904",
      controlBlock:
        "30478926dc4893bbbb405de4d225bdaa8d1942c3bcafb5c4644ae31ef63dc177",
    },
  );
});

test("getAssertPayoutScriptInfo ignores the tx-graph version", async () => {
  const scriptInfo = (txGraphVersion) =>
    getAssertPayoutScriptInfo({
      txGraphVersion,
      claimer: CLAIMER,
      localChallengers: [LOCAL_CHALLENGER],
      universalChallengers: [UNIVERSAL_CHALLENGER],
      timelockAssert: 100,
      councilMembers: COUNCIL,
      councilQuorum: 1,
    });

  const v1 = await scriptInfo(1);
  assert.deepEqual(await scriptInfo(2), v1);
  assert.deepEqual(await scriptInfo(3), v1);
});

test("pins getChallengeAssertScriptInfo through the built WASM facade", async () => {
  const firstSmallKeys = Array.from({ length: 6 }, (_, index) =>
    wotsPublicKey(32, 20 + index),
  );
  const secondSmallKeys = Array.from({ length: 6 }, (_, index) =>
    wotsPublicKey(32, 40 + index),
  );
  const challengeAssert = await getChallengeAssertScriptInfo({
    txGraphVersion: 3,
    claimer: CLAIMER,
    challenger: LOCAL_CHALLENGER,
    claimerWotsKeysJson: JSON.stringify(wotsPublicKey(64, 1)),
    gcWotsKeysJson: JSON.stringify([firstSmallKeys, secondSmallKeys]),
  });

  assert.deepEqual(
    {
      script: sha256Text(challengeAssert.script),
      controlBlock: sha256Text(challengeAssert.controlBlock),
    },
    {
      script:
        "f6b35e486f5611a3956e3fbe23b36144ca64c200618f0b29f93c91cb74180f08",
      controlBlock:
        "7ece40ba5cd9386d50ae395585c102cb123776238e8d6bd17e6ea1359a294f1a",
    },
  );
});

test("pins createPayoutConnector through the built WASM facade", async () => {
  const result = await createPayoutConnector(
    {
      txGraphVersion: 1,
      depositor: DEPOSITOR,
      vaultProvider: VAULT_PROVIDER,
      vaultKeepers: [VAULT_KEEPER],
      universalChallengers: [PAYOUT_UNIVERSAL_CHALLENGER],
      timelockPegin: 1008,
    },
    "signet",
  );

  assert.deepEqual(
    {
      script: sha256Text(result.payoutScript),
      controlBlock: result.payoutControlBlock,
      taprootScriptHash: result.taprootScriptHash,
      scriptPubKey: result.scriptPubKey,
      address: result.address,
    },
    {
      script:
        "d851c37a211d3e4c55b2bae8a2a3262e2960de9f1015e43986f76ce5c8628991",
      controlBlock:
        "c050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0",
      taprootScriptHash:
        "82c0e27be3e706b67c07953fa18ed9b9854ea1cebbc1040f535b130f38f72c73",
      scriptPubKey:
        "5120f168b9531c9ace8d638245e004e2550756b996300391337e169c7fb5c354d61d",
      address: "tb1p795tj5cunt8g6cuzghsqfcj4qattn93sqwgnxlskn3lmts656cwsk4p9uy",
    },
  );
});

test("createPayoutConnector forwards the network to the address through the built WASM facade", async () => {
  const result = await createPayoutConnector(
    {
      txGraphVersion: 1,
      depositor: DEPOSITOR,
      vaultProvider: VAULT_PROVIDER,
      vaultKeepers: [VAULT_KEEPER],
      universalChallengers: [PAYOUT_UNIVERSAL_CHALLENGER],
      timelockPegin: 1008,
    },
    "bitcoin",
  );

  assert.equal(
    result.address,
    "bc1p795tj5cunt8g6cuzghsqfcj4qattn93sqwgnxlskn3lmts656cwspah2xt",
  );
});
