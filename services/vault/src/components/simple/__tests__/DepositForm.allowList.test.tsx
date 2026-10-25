/**
 * The deposit CTA for an Ethereum account that is not on the allow-list.
 *
 * The vault-cap labels are applied on the button itself, after the CTA state
 * is resolved, so they would otherwise replace the allow-list reason with a
 * capacity one — telling a depositor to free a slot when no slot can help.
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

vi.mock("../DepositFeesBreakdown", () => ({
  DepositFeesBreakdown: () => null,
}));
vi.mock("../VaultProviderSelectorV3", () => ({
  VaultProviderSelectorV3: () => null,
}));
vi.mock("@/components/shared", () => ({
  DepositButton: ({
    children,
    disabled,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled}>
      {children}
    </button>
  ),
}));

const amountState: DepositAmountState = {
  amount: "0.01",
  amountSats: 1_000_000n,
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
  btcPriceUsd: 60_000,
  estimatedFeeSats: 0n,
  estimatedFeeRate: 1,
  isLoadingFee: false,
  feeError: null,
  depositorClaimValue: 0n,
  commissionBaseValues: undefined,
  appVersionUnsupported: false,
  p2aAnchorValueSats: 0n,
  depositorClaimValueError: null,
  protocolFeeWei: 0n,
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

function renderForm(gatingOverrides: Partial<DepositGatingState>) {
  const gatingState: DepositGatingState = {
    isDepositDisabled: false,
    isGeoBlocked: false,
    isAddressBlocked: false,
    isAddressScreeningUnavailable: false,
    ...gatingOverrides,
  };
  render(
    <DepositForm
      amountState={amountState}
      feeState={feeState}
      providerState={providerState}
      walletState={walletState}
      gatingState={gatingState}
      collateralFactor={null}
      twoVaultSplit={undefined}
      maxFundingInputCount={20}
      onAmountChange={vi.fn()}
      onMaxClick={vi.fn()}
      onDeposit={vi.fn()}
    />,
  );
}

describe("DepositForm CTA for an account off the allow-list", () => {
  it("keeps the allow-list reason on a disabled button when the vault count cannot be verified", () => {
    renderForm({
      isDepositorNotAllowListed: true,
      vaultCountCapUnavailable: true,
    });

    const button = screen.getByRole("button", {
      name: COPY.deposit.allowList.cta,
    });
    expect(button).toBeDisabled();
  });

  it("keeps the allow-list reason on a disabled button when the position is at its vault cap", () => {
    renderForm({ isDepositorNotAllowListed: true, isVaultCapReached: true });

    const button = screen.getByRole("button", {
      name: COPY.deposit.allowList.cta,
    });
    expect(button).toBeDisabled();
  });

  it("still shows the vault-count reason for an account on the allow-list", () => {
    renderForm({
      isDepositorNotAllowListed: false,
      vaultCountCapUnavailable: true,
    });

    expect(
      screen.getByRole("button", {
        name: COPY.deposit.maxVaultsReached.unavailableCta,
      }),
    ).toBeDisabled();
  });
});
