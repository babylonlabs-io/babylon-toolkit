import { describe, expect, it } from "vitest";

import { placeholderBabeSessionsJson } from "../babeSessionsPlaceholder";

describe("placeholderBabeSessionsJson", () => {
  it('names every keeper and universal challenger once, each with the "00" marker the join script replaces', () => {
    const json = placeholderBabeSessionsJson({
      vaultKeeperBtcPubkeys: ["aa".repeat(32)],
      universalChallengerBtcPubkeys: ["bb".repeat(32)],
    });
    expect(JSON.parse(json)).toEqual({
      ["aa".repeat(32)]: { decryptor_artifacts_hex: "00" },
      ["bb".repeat(32)]: { decryptor_artifacts_hex: "00" },
    });
  });
});
