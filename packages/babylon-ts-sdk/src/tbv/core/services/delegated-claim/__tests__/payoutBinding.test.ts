import { describe, expect, it } from "vitest";

import {
  PayoutDestinationError,
  assertPayoutPaysRegisteredScript,
} from "../payoutBinding";
import {
  DEPOSITOR_XONLY_PUBKEY,
  REGISTERED_PAYOUT_SCRIPT,
  buildDelegatedClaimFixture,
} from "./fixtures/delegatedClaimPsbts";

const fx = buildDelegatedClaimFixture();

describe("assertPayoutPaysRegisteredScript", () => {
  it("refuses a registered script with trailing non-hex rather than truncating it", () => {
    // Compared as strings: a Buffer round-trip would drop the "zz" and let
    // the malformed script pass as the Payout's destination.
    expect(() =>
      assertPayoutPaysRegisteredScript({
        payoutPsbtBase64: fx.payoutClaimerPsbt,
        registeredPayoutScriptPubKey: `${REGISTERED_PAYOUT_SCRIPT}zz`,
        depositorBtcPubkey: DEPOSITOR_XONLY_PUBKEY,
      }),
    ).toThrow(PayoutDestinationError);
  });
});
