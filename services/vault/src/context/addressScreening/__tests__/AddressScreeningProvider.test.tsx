import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AddressScreeningProvider,
  useAddressScreening,
} from "../AddressScreeningProvider";

const mockVerifyAddress = vi.fn();
const mockGetAddressScreeningResult = vi.fn();
const mockSetAddressScreeningResult = vi.fn();
const mockRemoveAddressScreeningResult = vi.fn();

vi.mock("@/clients/address-screening", () => ({
  verifyAddress: (...args: unknown[]) => mockVerifyAddress(...args),
  AddressScreeningNetworkError: class AddressScreeningNetworkError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AddressScreeningNetworkError";
    }
  },
}));

vi.mock("@/storage/addressScreeningStorage", () => ({
  getAddressScreeningResult: (...args: unknown[]) =>
    mockGetAddressScreeningResult(...args),
  setAddressScreeningResult: (...args: unknown[]) =>
    mockSetAddressScreeningResult(...args),
  removeAddressScreeningResult: (...args: unknown[]) =>
    mockRemoveAddressScreeningResult(...args),
}));

let mockBtcAddress: string | undefined;
let mockEthAddress: string | undefined;

vi.mock("../../wallet", () => ({
  useBTCWallet: () => ({ address: mockBtcAddress }),
  useETHWallet: () => ({ address: mockEthAddress }),
}));

function Observer({
  onState,
}: {
  onState: (state: { isBlocked: boolean; isLoading: boolean }) => void;
}) {
  const state = useAddressScreening();
  onState(state);
  return null;
}

type ScreeningState = { isBlocked: boolean; isLoading: boolean };

function renderProvider(onState: (s: ScreeningState) => void) {
  return render(
    <AddressScreeningProvider>
      <Observer onState={onState} />
    </AddressScreeningProvider>,
  );
}

describe("AddressScreeningProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBtcAddress = undefined;
    mockEthAddress = undefined;
    mockGetAddressScreeningResult.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("is not blocked and not loading when no addresses are connected", async () => {
    const onState = vi.fn();
    renderProvider(onState);

    await waitFor(() => {
      expect(onState).toHaveBeenLastCalledWith({
        isBlocked: false,
        isLoading: false,
      });
    });
    expect(mockVerifyAddress).not.toHaveBeenCalled();
  });

  it("allows deposit when both addresses pass screening", async () => {
    mockBtcAddress = "btc1";
    mockEthAddress = "0xeth";
    // true = allowed; provider stores !allowed = false (not blocked)
    mockVerifyAddress.mockResolvedValue(true);

    const onState = vi.fn();
    renderProvider(onState);

    await waitFor(() => {
      expect(onState).toHaveBeenLastCalledWith({
        isBlocked: false,
        isLoading: false,
      });
    });
    expect(mockVerifyAddress).toHaveBeenCalledWith("btc1");
    expect(mockVerifyAddress).toHaveBeenCalledWith("0xeth");
    expect(mockSetAddressScreeningResult).toHaveBeenCalledWith("btc1", false);
    expect(mockSetAddressScreeningResult).toHaveBeenCalledWith("0xeth", false);
  });

  it("blocks when BTC address fails screening", async () => {
    mockBtcAddress = "btc1";
    mockEthAddress = "0xeth";
    mockVerifyAddress.mockImplementation(async (addr: string) =>
      addr === "btc1" ? false : true,
    );

    const onState = vi.fn();
    renderProvider(onState);

    await waitFor(() => {
      expect(onState).toHaveBeenLastCalledWith({
        isBlocked: true,
        isLoading: false,
      });
    });
  });

  it("blocks when ETH address fails screening", async () => {
    mockBtcAddress = "btc1";
    mockEthAddress = "0xeth";
    mockVerifyAddress.mockImplementation(async (addr: string) =>
      addr === "0xeth" ? false : true,
    );

    const onState = vi.fn();
    renderProvider(onState);

    await waitFor(() => {
      expect(onState).toHaveBeenLastCalledWith({
        isBlocked: true,
        isLoading: false,
      });
    });
  });

  it("hard-blocks on network error and does not cache the result", async () => {
    mockBtcAddress = "btc1";
    mockEthAddress = "0xeth";
    mockVerifyAddress.mockRejectedValue(new Error("boom"));

    const onState = vi.fn();
    renderProvider(onState);

    await waitFor(() => {
      expect(onState).toHaveBeenLastCalledWith({
        isBlocked: true,
        isLoading: false,
      });
    });
    expect(mockSetAddressScreeningResult).not.toHaveBeenCalled();
  });

  it("reuses cached screening result and does not re-call the API", async () => {
    mockBtcAddress = "btc1";
    mockEthAddress = "0xeth";
    mockGetAddressScreeningResult.mockImplementation((addr: string) =>
      addr === "btc1" ? true : false,
    );

    const onState = vi.fn();
    renderProvider(onState);

    await waitFor(() => {
      expect(onState).toHaveBeenLastCalledWith({
        isBlocked: true,
        isLoading: false,
      });
    });
    expect(mockVerifyAddress).not.toHaveBeenCalled();
  });

  it("evicts only the BTC cache entry when the BTC wallet disconnects", async () => {
    mockBtcAddress = "btc1";
    mockEthAddress = "0xeth";
    mockVerifyAddress.mockResolvedValue(true);

    const onState = vi.fn();
    const { rerender } = renderProvider(onState);

    await waitFor(() => {
      expect(onState).toHaveBeenLastCalledWith({
        isBlocked: false,
        isLoading: false,
      });
    });

    mockBtcAddress = undefined;
    rerender(
      <AddressScreeningProvider>
        <Observer onState={onState} />
      </AddressScreeningProvider>,
    );

    await waitFor(() => {
      expect(mockRemoveAddressScreeningResult).toHaveBeenCalledWith("btc1");
    });
    expect(mockRemoveAddressScreeningResult).not.toHaveBeenCalledWith("0xeth");
  });

  it("evicts only the ETH cache entry when the ETH wallet disconnects", async () => {
    mockBtcAddress = "btc1";
    mockEthAddress = "0xeth";
    mockVerifyAddress.mockResolvedValue(true);

    const onState = vi.fn();
    const { rerender } = renderProvider(onState);

    await waitFor(() => {
      expect(onState).toHaveBeenLastCalledWith({
        isBlocked: false,
        isLoading: false,
      });
    });

    mockEthAddress = undefined;
    rerender(
      <AddressScreeningProvider>
        <Observer onState={onState} />
      </AddressScreeningProvider>,
    );

    await waitFor(() => {
      expect(mockRemoveAddressScreeningResult).toHaveBeenCalledWith("0xeth");
    });
    expect(mockRemoveAddressScreeningResult).not.toHaveBeenCalledWith("btc1");
  });

  it("evicts the previous address when the BTC address changes to a new one", async () => {
    mockBtcAddress = "btc1";
    mockEthAddress = undefined;
    mockVerifyAddress.mockResolvedValue(true);

    const onState = vi.fn();
    const { rerender } = renderProvider(onState);

    await waitFor(() => {
      expect(mockVerifyAddress).toHaveBeenCalledWith("btc1");
    });

    mockBtcAddress = "btc2";
    rerender(
      <AddressScreeningProvider>
        <Observer onState={onState} />
      </AddressScreeningProvider>,
    );

    await waitFor(() => {
      expect(mockRemoveAddressScreeningResult).toHaveBeenCalledWith("btc1");
    });
    expect(mockRemoveAddressScreeningResult).not.toHaveBeenCalledWith("btc2");
  });
});
