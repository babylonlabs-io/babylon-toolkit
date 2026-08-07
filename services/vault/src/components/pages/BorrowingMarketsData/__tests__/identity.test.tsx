/**
 * BorrowingMarketsData — reserve resolution and header labelling.
 *
 * The page is addressed by a registry-backed slug (the on-chain id for tokens
 * the registry doesn't know) and labelled from the proven identity, so a
 * spoofed indexer symbol can neither steer which market opens nor name the one
 * that does (audit F7).
 */

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import BorrowingMarketsData from "../index";

const mockParams = vi.fn<() => Record<string, string>>();

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ key: "default" }),
  useParams: () => mockParams(),
}));

vi.mock("@babylonlabs-io/core-ui", () => ({
  Avatar: ({ alt }: { alt: string }) => <img alt={alt} />,
  Hint: () => null,
  Container: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Heading: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
  Text: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

vi.mock("@/config/featureFlags", () => ({
  default: {},
}));

vi.mock("@/services/token/tokenService", () => ({
  getCurrencyIconWithFallback: () => "icon.png",
  getTokenByAddress: () => null,
  // No registry entry for this fixture's underlying, so its slug is the id.
  getRegisteredTokenByAddress: () => null,
}));

// Reserve 2 is genuinely WETH; the indexer labels it "USDC".
const spoofedReserve = {
  reserveId: 2n,
  reserve: { underlying: "0xWETH" as Address },
  token: {
    symbol: "USDC",
    name: "USD Coin",
    address: "0xWETH" as Address,
    decimals: 6,
  },
};

vi.mock("@/applications/aave/context", () => ({
  useAaveConfig: () => ({ borrowableReserves: [spoofedReserve] }),
}));

const mockUseVerifiedReserveIdentity = vi.fn();
const mockUseAaveBorrowAprs = vi.fn();
const mockUseAaveReserveLiquidity = vi.fn();
const mockUseAaveReservesPrices = vi.fn();
const mockUseVaultSplitParams = vi.fn();
vi.mock("@/applications/aave/hooks", () => ({
  useVerifiedReserveIdentity: (args: unknown) =>
    mockUseVerifiedReserveIdentity(args),
  useAaveBorrowAprs: () => mockUseAaveBorrowAprs(),
  useAaveReserveLiquidity: () => mockUseAaveReserveLiquidity(),
  useAaveReservesPrices: () => mockUseAaveReservesPrices(),
  useVaultSplitParams: () => mockUseVaultSplitParams(),
}));

const mockUseDemoMarketData = vi.fn();
vi.mock("@/dev/demoMarketData", () => ({
  useDemoMarketData: () => mockUseDemoMarketData(),
}));

const WETH_IDENTITY = {
  address: "0xWETH" as Address,
  symbol: "WETH",
  name: "Wrapped Ether",
  decimals: 18,
  icon: undefined,
  source: "registry" as const,
};

function resolved(overrides: Record<string, unknown> = {}) {
  return {
    identity: WETH_IDENTITY,
    isLoading: false,
    error: null,
    isIntegrityViolation: false,
    retry: vi.fn(),
    ...overrides,
  };
}

describe("BorrowingMarketsData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams.mockReturnValue({ market: "2" });
    mockUseVerifiedReserveIdentity.mockReturnValue(resolved());
    mockUseAaveBorrowAprs.mockReturnValue({ aprPercentByReserveId: {} });
    mockUseAaveReserveLiquidity.mockReturnValue({ liquidityByReserveId: {} });
    mockUseAaveReservesPrices.mockReturnValue({ pricesByReserveId: {} });
    mockUseVaultSplitParams.mockReturnValue({ params: null });
    mockUseDemoMarketData.mockReturnValue(null);
  });

  it("verifies the reserve the id resolves to, against its on-chain underlying", () => {
    render(<BorrowingMarketsData />);

    expect(mockUseVerifiedReserveIdentity).toHaveBeenCalledWith({
      reserveId: 2n,
      underlying: "0xWETH",
    });
  });

  it("labels the header from the proven identity, not the indexer's symbol", () => {
    render(<BorrowingMarketsData />);

    // Scoped to the heading rather than the whole page: the markets table
    // below legitimately labels this same reserve's row from `token.*` (a row
    // label steers nothing — only the header claims "this is the asset you
    // routed to"), so a page-wide absence check would now fail on the table's
    // own row instead of on a mislabeled header.
    expect(
      screen.getByRole("heading", { name: "Wrapped Ether" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "USD Coin" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("WETH")).toBeInTheDocument();
  });

  it("blocks a symbol URL the registry doesn't back instead of resolving it", () => {
    mockParams.mockReturnValue({ market: "usdc" });
    mockUseVerifiedReserveIdentity.mockReturnValue(
      resolved({ identity: null }),
    );

    render(<BorrowingMarketsData />);

    expect(screen.getByText(COPY.loans.reserveNotFound)).toBeInTheDocument();
    expect(mockUseVerifiedReserveIdentity).toHaveBeenCalledWith({
      reserveId: undefined,
      underlying: undefined,
    });
  });

  it("reports an id matching no reserve as not found", () => {
    mockParams.mockReturnValue({ market: "99999" });
    mockUseVerifiedReserveIdentity.mockReturnValue(
      resolved({ identity: null }),
    );

    render(<BorrowingMarketsData />);

    expect(screen.getByText(COPY.loans.reserveNotFound)).toBeInTheDocument();
  });

  it("blocks with integrity copy when the asset can't be verified", () => {
    mockUseVerifiedReserveIdentity.mockReturnValue(
      resolved({
        identity: null,
        error: new Error("reserve maps to a different token"),
        isIntegrityViolation: true,
      }),
    );

    render(<BorrowingMarketsData />);

    expect(
      screen.getByText(COPY.loans.detail.identityBlockedTitle),
    ).toBeInTheDocument();
    expect(screen.queryByText("Wrapped Ether")).not.toBeInTheDocument();
  });

  it("withholds the header while verification is still in flight", () => {
    mockUseVerifiedReserveIdentity.mockReturnValue(
      resolved({ identity: null, isLoading: true }),
    );

    render(<BorrowingMarketsData />);

    expect(screen.getByText(COPY.common.loading)).toBeInTheDocument();
    expect(screen.queryByText("Wrapped Ether")).not.toBeInTheDocument();
  });
});
