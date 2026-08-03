/**
 * Pins the two-source contract in BtcConfirmationDetailContainer: the shared
 * polling cache is authoritative once the deposit is indexed, and the direct
 * mempool poll runs only until then. Both branches are load-bearing for the
 * single-provider work — the fallback is what keeps a just-broadcast deposit
 * showing a count before the dashboard's poll has seen it.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BtcConfirmationDetailContainer } from "../BtcConfirmationDetailContainer";

const useFirstIndexedDepositPollingResult = vi.fn();
const useBtcConfirmations = vi.fn();

vi.mock("@/context/deposit/PeginPollingContext", () => ({
  useFirstIndexedDepositPollingResult: (ids: readonly string[]) =>
    useFirstIndexedDepositPollingResult(ids),
}));

vi.mock("@/hooks/deposit/useBtcConfirmations", () => ({
  useBtcConfirmations: (txid: string | null) => useBtcConfirmations(txid),
}));

vi.mock("../BtcConfirmationDetail", () => ({
  BtcConfirmationDetail: ({
    confirmations,
    requiredDepth,
  }: {
    confirmations: number | null;
    requiredDepth: number;
  }) => (
    <div data-testid="detail">
      {String(confirmations)}/{requiredDepth}
    </div>
  ),
}));

const PREPEGIN_TXID = "ab".repeat(32);
const DEPOSIT_ID = `0x${"11".repeat(32)}`;

beforeEach(() => {
  useFirstIndexedDepositPollingResult.mockReset();
  useBtcConfirmations.mockReset();
});

describe("BtcConfirmationDetailContainer", () => {
  it("falls back to the direct mempool poll when no candidate id is indexed", () => {
    useFirstIndexedDepositPollingResult.mockReturnValue(undefined);
    useBtcConfirmations.mockReturnValue({ confirmations: 2 });

    render(
      <BtcConfirmationDetailContainer
        prePeginTxid={PREPEGIN_TXID}
        requiredDepth={6}
        depositIds={[DEPOSIT_ID]}
      />,
    );

    expect(screen.getByTestId("detail")).toHaveTextContent("2/6");
    // The direct poll must be armed with the txid, not disabled.
    expect(useBtcConfirmations).toHaveBeenCalledWith(PREPEGIN_TXID);
  });

  it("uses the shared polling count once a candidate id is indexed", () => {
    useFirstIndexedDepositPollingResult.mockReturnValue({
      prePeginConfirmations: 4,
    });
    useBtcConfirmations.mockReturnValue({ confirmations: 99 });

    render(
      <BtcConfirmationDetailContainer
        prePeginTxid={PREPEGIN_TXID}
        requiredDepth={6}
        depositIds={[DEPOSIT_ID]}
      />,
    );

    expect(screen.getByTestId("detail")).toHaveTextContent("4/6");
  });

  it("disables the direct poll once the shared cache is authoritative", () => {
    useFirstIndexedDepositPollingResult.mockReturnValue({
      prePeginConfirmations: 4,
    });
    useBtcConfirmations.mockReturnValue({ confirmations: null });

    render(
      <BtcConfirmationDetailContainer
        prePeginTxid={PREPEGIN_TXID}
        requiredDepth={6}
        depositIds={[DEPOSIT_ID]}
      />,
    );

    // Passing null is what stops the second mempool poll — otherwise the modal
    // and the card poll the same txid at different intervals and disagree.
    expect(useBtcConfirmations).toHaveBeenCalledWith(null);
  });

  it("shows no count while the indexed deposit's first poll is still pending", () => {
    useFirstIndexedDepositPollingResult.mockReturnValue({
      prePeginConfirmations: null,
    });
    useBtcConfirmations.mockReturnValue({ confirmations: 3 });

    render(
      <BtcConfirmationDetailContainer
        prePeginTxid={PREPEGIN_TXID}
        requiredDepth={6}
        depositIds={[DEPOSIT_ID]}
      />,
    );

    // Indexed-but-unpolled must not silently borrow the fallback's count.
    expect(screen.getByTestId("detail")).toHaveTextContent("null/6");
  });
});
