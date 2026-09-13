import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { BtcActionGate } from "../BtcActionGate";

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useBTCWallet: () => ({ connected: false, loading: true }),
  useWalletConnect: () => ({ connected: false, open: vi.fn() }),
}));

describe("BtcActionGate", () => {
  it("shows the resolving loader and mounts nothing while the wallet is still loading", () => {
    const { getByText, queryByText, queryByTestId, queryAllByRole } = render(
      <BtcActionGate onClose={vi.fn()}>
        <div data-testid="gated-child" />
      </BtcActionGate>,
    );

    expect(getByText(COPY.wallet.btcAction.resolving)).toBeInTheDocument();
    expect(queryByTestId("gated-child")).not.toBeInTheDocument();
    expect(queryByText(COPY.wallet.btcAction.heading)).not.toBeInTheDocument();
    expect(queryAllByRole("button")).toHaveLength(0);
  });
});
