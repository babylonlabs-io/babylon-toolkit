/**
 * Pins the deposit form's balance-load failure surface: a failed UTXO fetch
 * must render an explicit alert. Without it, a mempool API outage or a
 * wrong-network wallet session renders identically to an empty wallet
 * ("Max -- sBTC", $0.00) with no hint that anything failed.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { DepositForm } from "../DepositForm";

// The shared-components barrel pulls in wallet/context import chains that
// vitest cannot load; stub the two members this render tree uses so the test
// stays focused on the form's own rendering. The DepositButton stub forwards
// `disabled` so the CTA-gating assertion can read it.
vi.mock("@/components/shared", () => ({
  DepositButton: ({
    children,
    disabled,
  }: {
    children?: React.ReactNode;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled}>
      {children}
    </button>
  ),
  ExplorerLink: () => null,
}));

vi.mock("@/config", () => ({
  getNetworkConfigBTC: () => ({
    coinName: "Signet BTC",
    coinSymbol: "sBTC",
    networkName: "BTC signet",
    mempoolApiUrl: "https://mempool.space/signet",
    network: "signet",
    icon: "/images/signet_bitcoin.svg",
    name: "Signet Bitcoin",
    displayUSD: false,
  }),
}));

// Default the CTA state to enabled so the utxoError gating can be observed in
// isolation (a failed balance fetch must disable the button on its own, not
// only because the CTA state already blocks it).
vi.mock("@/services/deposit", () => ({
  depositService: {
    formatSatoshisToBtc: (sats: bigint) => (Number(sats) / 1e8).toString(),
    getDepositCtaState: () => ({ disabled: false, label: "Deposit" }),
  },
}));

const baseProps = {
  amountState: {
    amount: "",
    amountSats: 0n,
    btcBalance: 0n,
    unconfirmedBalance: 0n,
    hasUnconfirmedBalanceOnly: false,
    utxoError: null as Error | null,
    minDeposit: 10_000n,
    maxDepositSats: null,
    effectiveRemaining: null,
    capUnavailable: false,
  },
  feeState: {
    minPeginFee: null,
    minPeginFeeError: null,
    btcPrice: 0,
    hasPriceFetchError: false,
    estimatedFeeSats: null,
    estimatedFeeRate: 0,
    isLoadingFee: false,
    feeError: null,
    depositorClaimValueError: null,
  },
  providerState: {
    applications: [],
    selectedApplication: "",
    providers: [],
    isLoadingProviders: false,
    selectedProvider: "",
    onProviderSelect: () => {},
  },
  walletState: {
    isWalletConnected: true,
  },
  gatingState: {
    isDepositDisabled: false,
    isGeoBlocked: false,
    isAddressBlocked: false,
  },
  onAmountChange: () => {},
  onMaxClick: () => {},
  onDeposit: () => {},
};

describe("DepositForm balance-load error surface", () => {
  it("shows the balance load error alert when the UTXO query failed", () => {
    render(
      <DepositForm
        {...baseProps}
        amountState={{
          ...baseProps.amountState,
          utxoError: new Error(
            "Failed to get UTXOs: Mempool API request timed out after 30000ms",
          ),
        }}
      />,
    );

    expect(
      screen.getByText(COPY.deposit.form.balanceLoadError),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      COPY.deposit.form.balanceLoadError,
    );
  });

  it("does not show the balance alert when the UTXO query is healthy", () => {
    render(<DepositForm {...baseProps} />);

    expect(
      screen.queryByText(COPY.deposit.form.balanceLoadError),
    ).not.toBeInTheDocument();
  });

  it("disables the deposit CTA when the UTXO query failed, even if the CTA state is otherwise enabled", () => {
    // getDepositCtaState is mocked to { disabled: false }, so a disabled button
    // here can only come from the utxoError gate — blocking a deposit against a
    // stale/unknown UTXO set.
    render(
      <DepositForm
        {...baseProps}
        amountState={{
          ...baseProps.amountState,
          utxoError: new Error("Mempool API request timed out after 30000ms"),
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Deposit" })).toBeDisabled();
  });

  it("leaves the deposit CTA enabled when the balance loaded", () => {
    render(<DepositForm {...baseProps} />);

    expect(screen.getByRole("button", { name: "Deposit" })).toBeEnabled();
  });
});
