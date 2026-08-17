import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PostDepositContinuationContent } from "../PostDepositContinuationContent";

const REAL_ID = "0xreal";
const DEMO_ID = "0xdemo";
const OTHER_ID = "0xother";

let viewActivities: Array<{ id: string }> = [];

vi.mock("../PostDepositContinuationView", () => ({
  PostDepositContinuationView: ({
    activities,
  }: {
    activities: Array<{ id: string }>;
  }) => {
    viewActivities = activities;
    return null;
  },
}));

vi.mock("../ContinuationWarnings", () => ({
  ContinuationWarnings: () => null,
}));

vi.mock("@/context/wallet", () => ({
  useBTCWallet: () => ({ connected: true }),
}));

vi.mock("@/hooks/useBtcPublicKey", () => ({
  useBtcPublicKey: () => "0xpub",
}));

vi.mock("@/hooks/useVaultDeposits", () => ({
  useVaultDeposits: () => ({
    activities: [{ id: REAL_ID }, { id: OTHER_ID }],
    pendingPegins: [],
  }),
}));

vi.mock("@/overrides/deposits", () => ({
  useDepositOverride: () => ({
    pendingActivities: [{ id: DEMO_ID }],
    resultsById: new Map(),
  }),
}));

function renderContent() {
  render(
    <PostDepositContinuationContent
      vaultIds={[REAL_ID, DEMO_ID] as unknown as `0x${string}`[]}
      depositorEthAddress={"0xdepositor" as unknown as `0x${string}`}
      onClose={() => {}}
    />,
  );
  return viewActivities.map((a) => a.id);
}

describe("PostDepositContinuationContent — view scoping", () => {
  it("gives the view the demo activity for the viewed batch", () => {
    // The view needs the demo VaultActivity to find it and mount the
    // activation branch. Demo activities never reach the polling provider —
    // that is now structural: AppPeginPollingProvider is fed from
    // useVaultDeposits, which never contains them.
    expect(renderContent()).toContain(DEMO_ID);
  });

  it("scopes the view to the viewed batch, excluding unrelated deposits", () => {
    const viewIds = renderContent();
    expect(viewIds).toContain(REAL_ID);
    expect(viewIds).not.toContain(OTHER_ID);
  });
});
