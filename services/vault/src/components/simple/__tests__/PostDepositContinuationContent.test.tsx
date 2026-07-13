import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PostDepositContinuationContent } from "../PostDepositContinuationContent";

const REAL_ID = "0xreal";
const DEMO_ID = "0xdemo";

// Capture the activities each child receives so the test can assert the demo
// activity reaches the view but NOT the polling provider.
let providerActivities: Array<{ id: string }> = [];
let viewActivities: Array<{ id: string }> = [];

vi.mock("@/context/deposit/PeginPollingContext", () => ({
  PeginPollingProvider: ({
    activities,
    children,
  }: {
    activities: Array<{ id: string }>;
    children: React.ReactNode;
  }) => {
    providerActivities = activities;
    return children;
  },
}));

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
    activities: [{ id: REAL_ID }],
    pendingPegins: [],
  }),
}));

vi.mock("@/dev/demoDeposit", () => ({
  useDemoDeposit: () => ({
    pendingActivities: [{ id: DEMO_ID }],
    resultsById: new Map(),
  }),
}));

describe("PostDepositContinuationContent — demo activity isolation", () => {
  it("keeps demo activities out of the polling provider (which drives notifications) but gives them to the view", () => {
    render(
      <PostDepositContinuationContent
        vaultIds={[REAL_ID, DEMO_ID] as unknown as `0x${string}`[]}
        depositorEthAddress={"0xdepositor" as unknown as `0x${string}`}
        onClose={() => {}}
      />,
    );

    const providerIds = providerActivities.map((a) => a.id);
    const viewIds = viewActivities.map((a) => a.id);

    // The provider feeds useSigningRequiredNotifications, so a demo
    // ready-to-activate state must never reach it (would fire a real
    // desktop notification).
    expect(providerIds).toContain(REAL_ID);
    expect(providerIds).not.toContain(DEMO_ID);
    // The view still needs the demo VaultActivity to mount the activation branch.
    expect(viewIds).toContain(REAL_ID);
    expect(viewIds).toContain(DEMO_ID);
  });
});
