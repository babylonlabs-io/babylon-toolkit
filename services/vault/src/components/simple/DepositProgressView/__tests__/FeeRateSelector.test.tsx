import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEstimatedBtcFee } from "@/hooks/deposit/useEstimatedBtcFee";
import { useNetworkFees } from "@/hooks/useNetworkFees";
import { useUTXOs } from "@/hooks/useUTXOs";

import { FeeRateSelector } from "../FeeRateSelector";

vi.mock("@/context/wallet", () => ({
  useBTCWallet: () => ({ address: "bc1qtest" }),
}));

vi.mock("@/hooks/useUTXOs", () => ({
  useUTXOs: vi.fn(() => ({ spendableMempoolUTXOs: [] })),
}));

vi.mock("@/hooks/useNetworkFees", () => ({
  useNetworkFees: vi.fn(),
}));

vi.mock("@/hooks/deposit/useEstimatedBtcFee", () => ({
  useEstimatedBtcFee: vi.fn(),
}));

// Slow=2, Avg=5, Fast=10 — kept low so nextPowerOfTwo(fastest) < 128 and the
// custom-input cap is pinned at the LEAST_MAX_FEE_RATE floor for every test.
const FEE_TIERS = {
  defaultFeeRate: 10,
  halfHourFeeRate: 5,
  hourFeeRate: 2,
  isLoading: false,
  error: null,
};

function buttonFor(text: string): HTMLButtonElement {
  const el = screen.getByText(text).closest("button");
  if (!el) throw new Error(`no button ancestor for "${text}"`);
  return el as HTMLButtonElement;
}

describe("FeeRateSelector", () => {
  beforeEach(() => {
    vi.mocked(useNetworkFees).mockReturnValue(FEE_TIERS);
    vi.mocked(useUTXOs).mockReturnValue({
      spendableMempoolUTXOs: [],
    } as unknown as ReturnType<typeof useUTXOs>);
    vi.mocked(useEstimatedBtcFee).mockReturnValue({
      fee: 1500n,
      feeRate: 10,
      isLoading: false,
      error: null,
      maxDeposit: null,
    });
  });

  it("renders the 4 tiers with rates and hints, Fast selected by default", () => {
    render(
      <FeeRateSelector
        vaultAmounts={[100_000n]}
        feeRate={10}
        onFeeRateChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Slow")).toBeInTheDocument();
    expect(screen.getByText("Avg")).toBeInTheDocument();
    expect(screen.getByText("Fast")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
    expect(screen.getByText("2 sat/vB")).toBeInTheDocument();
    expect(screen.getByText("~1 hour")).toBeInTheDocument();
    expect(screen.getByText("5 sat/vB")).toBeInTheDocument();
    expect(screen.getByText("~30 min")).toBeInTheDocument();
    expect(screen.getByText("10 sat/vB")).toBeInTheDocument();
    expect(screen.getByText("~10 min")).toBeInTheDocument();

    expect(buttonFor("Fast")).toHaveAttribute("aria-pressed", "true");
    expect(buttonFor("Slow")).toHaveAttribute("aria-pressed", "false");
  });

  it("commits the hour fee rate when Slow is clicked", () => {
    const onFeeRateChange = vi.fn();
    render(
      <FeeRateSelector
        vaultAmounts={[100_000n]}
        feeRate={10}
        onFeeRateChange={onFeeRateChange}
      />,
    );

    fireEvent.click(buttonFor("Slow"));

    expect(onFeeRateChange).toHaveBeenCalledWith(2);
    expect(buttonFor("Slow")).toHaveAttribute("aria-pressed", "true");
  });

  it("commits a valid custom rate but not one above the max cap", () => {
    const onFeeRateChange = vi.fn();
    render(
      <FeeRateSelector
        vaultAmounts={[100_000n]}
        feeRate={10}
        onFeeRateChange={onFeeRateChange}
      />,
    );

    fireEvent.click(buttonFor("Custom"));
    const input = screen.getByRole("spinbutton");

    fireEvent.change(input, { target: { value: "15" } });
    expect(onFeeRateChange).toHaveBeenCalledWith(15);

    onFeeRateChange.mockClear();
    // fastest=10 -> nextPowerOfTwo=32, cap floors at 128; 9999 exceeds it.
    fireEvent.change(input, { target: { value: "9999" } });
    expect(onFeeRateChange).not.toHaveBeenCalled();
  });

  it("keeps the custom selection and input value across a mempool refetch", () => {
    const onFeeRateChange = vi.fn();
    const { rerender } = render(
      <FeeRateSelector
        vaultAmounts={[100_000n]}
        feeRate={10}
        onFeeRateChange={onFeeRateChange}
      />,
    );

    fireEvent.click(buttonFor("Custom"));
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "20" },
    });
    onFeeRateChange.mockClear();

    // Mempool refetch changes the mempool tiers mid-edit.
    vi.mocked(useNetworkFees).mockReturnValue({
      ...FEE_TIERS,
      defaultFeeRate: 25,
      halfHourFeeRate: 12,
      hourFeeRate: 6,
    });
    rerender(
      <FeeRateSelector
        vaultAmounts={[100_000n]}
        feeRate={10}
        onFeeRateChange={onFeeRateChange}
      />,
    );

    expect(screen.getByRole("spinbutton")).toHaveValue(20);
    expect(buttonFor("Custom")).toHaveAttribute("aria-pressed", "true");
    expect(onFeeRateChange).not.toHaveBeenCalledWith(25);
  });

  it("live-follows the selected tier's mempool value on refetch", () => {
    const onFeeRateChange = vi.fn();
    const { rerender } = render(
      <FeeRateSelector
        vaultAmounts={[100_000n]}
        feeRate={10}
        onFeeRateChange={onFeeRateChange}
      />,
    );

    vi.mocked(useNetworkFees).mockReturnValue({
      ...FEE_TIERS,
      defaultFeeRate: 25,
    });
    rerender(
      <FeeRateSelector
        vaultAmounts={[100_000n]}
        feeRate={10}
        onFeeRateChange={onFeeRateChange}
      />,
    );

    expect(onFeeRateChange).toHaveBeenCalledWith(25);
  });

  it("resets to Fast and commits the fastest rate when cleared", () => {
    const onFeeRateChange = vi.fn();
    render(
      <FeeRateSelector
        vaultAmounts={[100_000n]}
        feeRate={10}
        onFeeRateChange={onFeeRateChange}
      />,
    );

    fireEvent.click(buttonFor("Custom"));
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "50" },
    });
    onFeeRateChange.mockClear();

    fireEvent.click(
      screen.getByRole("button", { name: "Clear custom fee rate" }),
    );

    expect(onFeeRateChange).toHaveBeenCalledWith(10);
    expect(buttonFor("Fast")).toHaveAttribute("aria-pressed", "true");
  });

  it("reports invalid when the fee estimate errors", () => {
    vi.mocked(useEstimatedBtcFee).mockReturnValue({
      fee: null,
      feeRate: 10,
      isLoading: false,
      error: "Insufficient funds",
      maxDeposit: null,
    });
    const onValidityChange = vi.fn();

    render(
      <FeeRateSelector
        vaultAmounts={[100_000n]}
        feeRate={10}
        onFeeRateChange={vi.fn()}
        onValidityChange={onValidityChange}
      />,
    );

    expect(onValidityChange).toHaveBeenCalledWith(false);
  });
});
