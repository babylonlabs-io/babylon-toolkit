/**
 * The inline callout shown when the entered amount exceeds what one
 * Pre-PegIn's 20-UTXO funding cap can fund, even though the wallet's full
 * balance could cover it.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import {
  DepositForm,
  type DepositAmountState,
  type DepositFeeState,
  type DepositGatingState,
  type DepositProviderState,
  type DepositWalletState,
} from "../DepositForm";

vi.mock("@/config", () => ({
  getNetworkConfigBTC: () => ({
    coinSymbol: "BTC",
    name: "Bitcoin",
    icon: "bitcoin.svg",
  }),
}));

vi.mock("@/services/deposit", async () => {
  const actual =
    await vi.importActual<typeof import("@/services/deposit")>(
      "@/services/deposit",
    );
  return {
    ...actual,
    depositService: {
      ...actual.depositService,
      getDepositCtaState: () => ({ disabled: false, label: "Deposit" }),
    },
  };
});

vi.mock("../DepositFeesBreakdown", () => ({
  DepositFeesBreakdown: () => null,
}));
vi.mock("../VaultProviderSelectorV3", () => ({
  VaultProviderSelectorV3: () => null,
}));
vi.mock("@/components/shared", () => ({
  DepositButton: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

const amountState: DepositAmountState = {
  amount: "",
  amountSats: 0n,
  btcBalance: 100_000_000n,
  unconfirmedBalance: 0n,
  minDeposit: 10_000n,
  maxDeposit: 100_000_000n,
  maxDepositSats: 100_000_000n,
  effectiveRemaining: null,
  capUnavailable: false,
  suggestedAmountSats: null,
};

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
  commissionBaseValues: undefined,
  appVersionUnsupported: false,
  p2aAnchorValueSats: 0n,
  depositorClaimValueError: null,
  protocolFeeAmount: "--",
  protocolFeePrice: "",
  protocolFeeIsError: false,
  feeRows: [],
};

const providerState: DepositProviderState = {
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

function renderForm(fundingInputCapExceeded?: boolean) {
  render(
    <DepositForm
      amountState={amountState}
      feeState={feeState}
      providerState={providerState}
      walletState={walletState}
      gatingState={gatingState}
      collateralFactor={null}
      twoVaultSplit={undefined}
      fundingInputCapExceeded={fundingInputCapExceeded}
      onAmountChange={vi.fn()}
      onMaxClick={vi.fn()}
      onDeposit={vi.fn()}
    />,
  );
}

describe("DepositForm funding-input-cap callout", () => {
  it("does not render the callout when the cap is not exceeded", () => {
    renderForm(false);
    expect(
      screen.queryByText(COPY.deposit.fundingInputCap.notice),
    ).not.toBeInTheDocument();
  });

  it("does not render the callout when the prop is omitted", () => {
    renderForm(undefined);
    expect(
      screen.queryByText(COPY.deposit.fundingInputCap.notice),
    ).not.toBeInTheDocument();
  });

  it("renders the callout when the funding-input cap is exceeded", () => {
    renderForm(true);
    expect(
      screen.getByText(COPY.deposit.fundingInputCap.notice),
    ).toBeInTheDocument();
  });
});
