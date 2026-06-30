import { describe, expect, it } from "vitest";

import {
  ContractStatus,
  PEGIN_DISPLAY_LABELS,
} from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";

import { getActivationDeadlineSuspects } from "../useActivationDeadlineGate";

const TIMEOUT = 100n; // blocks
// 12s slots → 100 blocks ≈ 1200s. Anchor "now" 2000s after creation so the
// cheap estimate is well past the window; 60s after creation so it is well
// within it.
const CREATED_MS = 1_000_000;
const NOW_PAST_MS = CREATED_MS + 2_000_000;
const NOW_WITHIN_MS = CREATED_MS + 60_000;

function makeActivity(overrides: Partial<VaultActivity> = {}): VaultActivity {
  return {
    id: `0x${"11".repeat(32)}`,
    collateral: { amount: "1", symbol: "BTC" },
    providers: [],
    displayLabel: PEGIN_DISPLAY_LABELS.READY_TO_ACTIVATE,
    unsignedPrePeginTx: "00",
    depositorWotsPkHash: `0x${"00".repeat(32)}`,
    contractStatus: ContractStatus.VERIFIED,
    timestamp: CREATED_MS,
    ...overrides,
  };
}

describe("getActivationDeadlineSuspects", () => {
  it("flags a VERIFIED vault whose estimate is past the window", () => {
    const suspects = getActivationDeadlineSuspects(
      [makeActivity()],
      TIMEOUT,
      NOW_PAST_MS,
    );
    expect(suspects).toEqual([makeActivity().id]);
  });

  it("does not flag a VERIFIED vault still well within the window", () => {
    expect(
      getActivationDeadlineSuspects([makeActivity()], TIMEOUT, NOW_WITHIN_MS),
    ).toEqual([]);
  });

  it("ignores non-VERIFIED vaults even if the estimate is past the window", () => {
    expect(
      getActivationDeadlineSuspects(
        [makeActivity({ contractStatus: ContractStatus.ACTIVE })],
        TIMEOUT,
        NOW_PAST_MS,
      ),
    ).toEqual([]);
  });

  it("does not flag a vault with no indexer timestamp (fail-safe)", () => {
    expect(
      getActivationDeadlineSuspects(
        [makeActivity({ timestamp: undefined })],
        TIMEOUT,
        NOW_PAST_MS,
      ),
    ).toEqual([]);
  });
});
