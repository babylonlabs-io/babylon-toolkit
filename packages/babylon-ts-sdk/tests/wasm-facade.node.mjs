import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
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

test("pins the built public WASM facade", async () => {
  assert.equal(
    await deriveVaultId(
      "ab".repeat(32),
      "1234567890abcdef1234567890abcdef12345678",
    ),
    "f8d22e64c72a84a3dacdedb7d8b42e285bf06bd25850da911398c51d5a6c2dba",
  );

  const assertConnectorParams = {
    txGraphVersion: 3,
    claimer: CLAIMER,
    localChallengers: [LOCAL_CHALLENGER],
    universalChallengers: [UNIVERSAL_CHALLENGER],
    timelockAssert: 100,
    councilMembers: COUNCIL,
    councilQuorum: 1,
  };

  const noPayout = await getAssertNoPayoutScriptInfo(
    assertConnectorParams,
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

  const payout = await getAssertPayoutScriptInfo(assertConnectorParams);

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
