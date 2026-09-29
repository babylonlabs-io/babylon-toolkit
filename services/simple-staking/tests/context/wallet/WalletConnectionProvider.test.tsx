import { WalletProvider } from "@babylonlabs-io/wallet-connector";
import { render } from "@testing-library/react";
import { useTheme } from "next-themes";
import { useLocation } from "react-router";

import { useError } from "@/ui/common/context/Error/ErrorProvider";
import { WalletConnectionProvider } from "@/ui/common/context/wallet/WalletConnectionProvider";
import { useHealthCheck } from "@/ui/common/hooks/useHealthCheck";
import { useLogger } from "@/ui/common/hooks/useLogger";
import FeatureFlagService from "@/ui/common/utils/FeatureFlagService";

jest.mock("@babylonlabs-io/wallet-connector", () => ({
  APPKIT_BTC_CONNECTOR_ID: "appkit_btc",
  WalletProvider: jest.fn(({ children }) => children),
  createWalletConfig: jest.fn((options) => options),
  useChainConnector: jest.fn(),
}));
jest.mock("next-themes", () => ({ useTheme: jest.fn() }));
jest.mock("react-router", () => ({ useLocation: jest.fn() }));
jest.mock("@/ui/common/context/Error/ErrorProvider", () => ({
  useError: jest.fn(),
}));
jest.mock("@/ui/common/hooks/useLogger", () => ({ useLogger: jest.fn() }));
jest.mock("@/ui/common/hooks/useHealthCheck", () => ({
  useHealthCheck: jest.fn(),
}));
jest.mock("@/ui/common/utils/FeatureFlagService", () => ({
  __esModule: true,
  default: { IsLedgerEnabled: false, IsV2LedgerEnabled: false },
}));

const handleError = jest.fn();
const logger = { error: jest.fn() };
const renderProvider = () => render(<WalletConnectionProvider />);
const providerProps = () => (WalletProvider as jest.Mock).mock.calls.at(-1)[0];

beforeEach(() => {
  jest.clearAllMocks();
  (useTheme as jest.Mock).mockReturnValue({ theme: "light" });
  (useLocation as jest.Mock).mockReturnValue({ pathname: "/" });
  (useError as jest.Mock).mockReturnValue({ handleError });
  (useLogger as jest.Mock).mockReturnValue(logger);
  (useHealthCheck as jest.Mock).mockReturnValue({
    isGeoBlocked: false,
    isLoading: false,
  });
  (FeatureFlagService.IsLedgerEnabled as boolean) = false;
});

describe("WalletConnectionProvider consent contract (#2354)", () => {
  it.each([
    ["/", ["BTC", "BBN"]],
    ["/baby", ["BBN"]],
  ])(
    "uses shared consent and saved approval on %s",
    (pathname, requiredChains) => {
      (useLocation as jest.Mock).mockReturnValue({ pathname });
      renderProvider();
      expect(providerProps()).toMatchObject({
        persistent: true,
        requiredChains,
      });
      expect(providerProps().lifecycleHooks).toBeUndefined();
    },
  );

  it.each([false, true])(
    "keeps the Ledger choice when enabled=%s",
    (enabled) => {
      (FeatureFlagService.IsLedgerEnabled as boolean) = enabled;
      renderProvider();
      expect(providerProps().disabledWallets.includes("ledger_btc")).toBe(
        !enabled,
      );
      expect(providerProps().disabledWallets).toContain("ledger_btc_v2");
    },
  );

  it("reports connection errors", () => {
    renderProvider();
    providerProps().onError(new Error("Connection failed"));
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(handleError).toHaveBeenCalledWith({ error: expect.any(Error) });
  });

  it("does not report a rejected connection", () => {
    renderProvider();
    providerProps().onError(new Error("User rejected the request"));
    expect(logger.error).not.toHaveBeenCalled();
    expect(handleError).not.toHaveBeenCalled();
  });
});
