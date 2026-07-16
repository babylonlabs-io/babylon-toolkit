import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import {
  DepositForm,
  type DepositAmountState,
  type DepositFeeState,
  type DepositGatingState,
  type DepositProviderState,
  type DepositWalletState,
} from "../DepositForm";

const featureFlagsMock = vi.hoisted(() => ({
  isV3UiEnabled: true,
}));

vi.mock("@/config", () => ({
  FeatureFlags: featureFlagsMock,
  getNetworkConfigBTC: () => ({
    coinSymbol: "BTC",
    name: "Bitcoin",
    icon: "bitcoin.svg",
  }),
}));

// Format satoshis the same way the real service does for the amounts under test,
// and short-circuit the CTA state machine so the form renders deterministically.
vi.mock("@/services/deposit", () => ({
  depositService: {
    formatSatoshisToBtc: (sats: bigint) => (Number(sats) / 1e8).toString(),
    getDepositCtaState: () => ({ disabled: false, label: "Deposit" }),
  },
}));

vi.mock("../DepositFeesBreakdown", () => ({
  DepositFeesBreakdown: () => null,
}));
vi.mock("../VaultProviderSelector", () => ({
  VaultProviderSelector: () => null,
}));
vi.mock("@/components/ApplicationLogo", () => ({
  ApplicationLogo: () => null,
}));
vi.mock("@/components/shared", () => ({
  DepositButton: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

const SUGGESTED_SATS = 33_300_000n; // 0.333 BTC

function amountState(
  overrides: Partial<DepositAmountState> = {},
): DepositAmountState {
  return {
    amount: "",
    amountSats: 0n,
    btcBalance: 100_000_000n,
    unconfirmedBalance: 0n,
    hasUnconfirmedBalanceOnly: false,
    minDeposit: 10_000n,
    maxDeposit: 100_000_000n,
    maxDepositSats: 100_000_000n,
    effectiveRemaining: null,
    capUnavailable: false,
    suggestedAmountSats: null,
    ...overrides,
  };
}

const feeState: DepositFeeState = {
  minPeginFee: 0n,
  minPeginFeeError: null,
  btcPrice: 60_000,
  hasPriceFetchError: false,
  estimatedFeeSats: 0n,
  estimatedFeeRate: 1,
  isLoadingFee: false,
  feeError: null,
  depositorClaimValue: 0n,
  commissionHtlcValues: undefined,
  depositorClaimValueError: null,
  protocolFeeAmount: "--",
  protocolFeePrice: "",
  protocolFeeIsError: false,
  feeRows: [],
};

const providerState: DepositProviderState = {
  applications: [],
  selectedApplication: "",
  providers: [],
  isLoadingProviders: false,
  selectedProvider: "",
  onProviderSelect: vi.fn(),
};

const walletState: DepositWalletState = {
  isWalletConnected: true,
};

const gatingState: DepositGatingState = {
  isDepositDisabled: false,
  isGeoBlocked: false,
  isAddressBlocked: false,
};

function renderForm(
  amountOverrides: Partial<DepositAmountState>,
  onAmountChange = vi.fn(),
) {
  render(
    <DepositForm
      amountState={amountState(amountOverrides)}
      feeState={feeState}
      providerState={providerState}
      walletState={walletState}
      gatingState={gatingState}
      collateralFactor={null}
      twoVaultSplit={undefined}
      onAmountChange={onAmountChange}
      onMaxClick={vi.fn()}
      onDeposit={vi.fn()}
    />,
  );
  return onAmountChange;
}

beforeEach(() => {
  featureFlagsMock.isV3UiEnabled = true;
});

describe("DepositForm suggested amount", () => {
  it("does not render the suggested container when there is no suggestion", () => {
    renderForm({ suggestedAmountSats: null });
    expect(
      screen.queryByText(COPY.deposit.form.suggestedDepositLabel, {
        exact: false,
      }),
    ).not.toBeInTheDocument();
  });

  it("offers the suggested amount and applies it through onAmountChange", () => {
    const onAmountChange = renderForm({
      suggestedAmountSats: SUGGESTED_SATS,
      amountSats: 0n,
    });

    const offer = screen.getByRole("button", {
      name: new RegExp(
        `${COPY.deposit.form.suggestedDepositLabel}.*0\\.333 BTC`,
      ),
    });
    expect(offer).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(offer);
    expect(onAmountChange).toHaveBeenCalledWith("0.333");
  });

  it("marks the offer as selected when the entered amount equals the suggestion", () => {
    renderForm({
      suggestedAmountSats: SUGGESTED_SATS,
      amountSats: SUGGESTED_SATS,
    });

    const offer = screen.getByRole("button", {
      name: new RegExp(
        `${COPY.deposit.form.suggestedDepositLabel}.*0\\.333 BTC`,
      ),
    });
    expect(offer).toHaveAttribute("aria-pressed", "true");
  });
});
