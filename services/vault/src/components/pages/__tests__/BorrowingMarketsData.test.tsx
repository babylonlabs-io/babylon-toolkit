/**
 * BorrowingMarketsData — reserve resolution and header labelling.
 *
 * The page is addressed by the reserve's on-chain id and labelled from the
 * proven identity, so a spoofed indexer symbol can neither steer which market
 * opens nor name the one that does (audit F7).
 */

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import BorrowingMarketsData from "../BorrowingMarketsData";

const mockParams = vi.fn<() => Record<string, string>>();

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ key: "default" }),
  useParams: () => mockParams(),
}));

vi.mock("@babylonlabs-io/core-ui", () => ({
  Avatar: ({ alt }: { alt: string }) => <img alt={alt} />,
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
  default: { isV3UiEnabled: true },
}));

vi.mock("@/services/token/tokenService", () => ({
  getCurrencyIconWithFallback: () => "icon.png",
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
vi.mock("@/applications/aave/hooks", () => ({
  useVerifiedReserveIdentity: (args: unknown) =>
    mockUseVerifiedReserveIdentity(args),
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
    mockParams.mockReturnValue({ reserveId: "2" });
    mockUseVerifiedReserveIdentity.mockReturnValue(resolved());
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

    expect(screen.getByText("Wrapped Ether")).toBeInTheDocument();
    expect(screen.getByText("WETH")).toBeInTheDocument();
    expect(screen.queryByText("USD Coin")).not.toBeInTheDocument();
  });

  it("blocks a legacy symbol URL instead of resolving it", () => {
    mockParams.mockReturnValue({ reserveId: "usdc" });
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
    mockParams.mockReturnValue({ reserveId: "99999" });
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
