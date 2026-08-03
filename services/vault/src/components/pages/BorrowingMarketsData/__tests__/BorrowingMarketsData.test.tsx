/**
 * BorrowingMarketsData page — derivation and routing tests.
 *
 * The page turns raw hook data (liquidity, APR, oracle price, on-chain split
 * params) into the display strings shown in the stats bar, the collateral
 * card, and the markets table. Child components are real (only `core-ui` is
 * mocked, matching the sibling tests in this directory) so these tests lock
 * in the page's own formatting/routing logic, not markup.
 *
 * Routing is by on-chain reserve id, not token symbol (audit F7 — a symbol
 * comes from the indexer, so routing by it lets a compromised indexer decide
 * which market a link opens). The header's identity comes from
 * `useVerifiedReserveIdentity`, never from the routed reserve's own
 * `token.*` — the table's row labels, by contrast, are correctly sourced
 * from `token.*` since they are labels only, not routing/trust decisions.
 */

import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

// Component tests mock core-ui (its dist isn't built in the test run) —
// consistent with BorrowMarketsTable.test.tsx / CollateralInfoCard.test.tsx.
vi.mock("@babylonlabs-io/core-ui", () => ({
  Avatar: ({ alt }: { alt: string }) => <img alt={alt} />,
  Hint: () => null,
  Container: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  Heading: ({ children }: { children: ReactNode }) => <>{children}</>,
  // A real element (not a Fragment), matching ReserveDetailPanel.test.tsx's
  // house mock: ReserveIdentityBlock renders two adjacent <Text> siblings, and
  // a Fragment would merge them into one untargetable text run.
  Text: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

vi.mock("@/services/token/tokenService", () => ({
  getCurrencyIconWithFallback: (_icon: string | undefined, symbol: string) =>
    `icon-${symbol}`,
  getTokenByAddress: () => null,
  // Address-keyed, like the real registry: only mainnet USDC is known here, so
  // only that reserve earns a symbol slug. Inlined rather than referencing the
  // fixture below — `vi.mock` factories run before the module body.
  getRegisteredTokenByAddress: (address: string) =>
    address === "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85"
      ? { symbol: "USDC" }
      : null,
}));

vi.mock("@/config", () => ({
  getNetworkConfigBTC: () => ({ icon: "btc-icon.svg" }),
}));

const useDemoMarketDataMock = vi.fn();

vi.mock("@/dev/demoMarketData", () => ({
  useDemoMarketData: () => useDemoMarketDataMock(),
}));

const useAaveConfigMock = vi.fn();
const useAaveBorrowAprsMock = vi.fn();
const useAaveReserveLiquidityMock = vi.fn();
const useAaveReservesPricesMock = vi.fn();
const useVaultSplitParamsMock = vi.fn();
const useVerifiedReserveIdentityMock = vi.fn();

vi.mock("@/applications/aave/context", () => ({
  useAaveConfig: () => useAaveConfigMock(),
}));

vi.mock("@/applications/aave/hooks", () => ({
  useAaveBorrowAprs: () => useAaveBorrowAprsMock(),
  useAaveReserveLiquidity: () => useAaveReserveLiquidityMock(),
  useAaveReservesPrices: () => useAaveReservesPricesMock(),
  useVaultSplitParams: () => useVaultSplitParamsMock(),
  useVerifiedReserveIdentity: () => useVerifiedReserveIdentityMock(),
}));

import type { ReserveLiquidity } from "@/applications/aave/hooks";
import { COPY } from "@/copy";
import { MARKET_PARAM } from "@/routes";

import BorrowingMarketsData from "../index";

const USDC_RESERVE = {
  reserveId: 1n,
  reserve: {
    underlying: "0x1111111111111111111111111111111111111111",
  },
  token: {
    address: "0x1111111111111111111111111111111111111111",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
  },
};

/** Same reserve, but on the mainnet USDC address the token registry knows —
 *  the only thing that earns a reserve a symbol slug. */
const REGISTERED_USDC_RESERVE = {
  ...USDC_RESERVE,
  reserve: {
    underlying: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  },
};

const WBTC_RESERVE = {
  reserveId: 2n,
  reserve: {
    underlying: "0x2222222222222222222222222222222222222222",
  },
  token: {
    address: "0x2222222222222222222222222222222222222222",
    symbol: "WBTC",
    name: "Wrapped BTC",
    decimals: 8,
  },
};

const LIQUIDITY_BY_RESERVE_ID = {
  "1": {
    availableLiquidity: 11_400_000,
    totalBorrowed: 24_100_000,
    suppliedLiquidity: 35_500_000,
    utilizationBps: 6800,
  },
  "2": {
    availableLiquidity: 40,
    totalBorrowed: 10,
    suppliedLiquidity: 50,
    utilizationBps: 2000,
  },
};

const APR_BY_RESERVE_ID = { "1": 3.5, "2": 1.2 };

const PRICES_BY_RESERVE_ID = { "1": 1.0, "2": 90_000 };

const SPLIT_PARAMS = { THF: 1.1, CF: 0.75, LB: 1.05 };

// Deliberately different from `USDC_RESERVE.token.symbol`/`name` — this is
// what "shows the VERIFIED identity, not the indexer symbol" (test 5) proves
// against, and using it as the default keeps every other test an implicit
// regression guard too.
const VERIFIED_USDC_IDENTITY = {
  address: USDC_RESERVE.token.address,
  symbol: "USDC-VERIFIED",
  name: "Verified USD Coin",
  decimals: 6,
  icon: undefined,
  source: "registry" as const,
};

/**
 * Explicit, rather than inferred from the defaults below: the degraded cases
 * these tests exist to cover pass `null` for a price or an identity, and
 * inference from a populated default narrows those fields to non-nullable.
 */
type DemoMarketData = {
  reserves: (typeof USDC_RESERVE)[];
  liquidityByReserveId: Record<string, ReserveLiquidity | null>;
  aprPercentByReserveId: Record<string, number | null>;
  pricesByReserveId: Record<string, number | null>;
  collateralFactor: number;
};

interface HookOverrides {
  demoMarketData?: DemoMarketData | null;
  aprsLoading?: boolean;
  liquidityError?: Error | null;
  borrowableReserves?: (typeof USDC_RESERVE)[];
  liquidityByReserveId?: Record<string, ReserveLiquidity | null>;
  aprPercentByReserveId?: Record<string, number | null>;
  pricesByReserveId?: Record<string, number | null>;
  splitParams?: typeof SPLIT_PARAMS | null;
  identity?: typeof VERIFIED_USDC_IDENTITY | null;
  identityLoading?: boolean;
  identityError?: Error | null;
  isIntegrityViolation?: boolean;
}

function setUpHooks({
  demoMarketData = null as DemoMarketData | null,
  borrowableReserves = [USDC_RESERVE, WBTC_RESERVE],
  liquidityByReserveId = LIQUIDITY_BY_RESERVE_ID,
  aprPercentByReserveId = APR_BY_RESERVE_ID,
  pricesByReserveId = PRICES_BY_RESERVE_ID,
  aprsLoading = false,
  liquidityError = null,
  splitParams = SPLIT_PARAMS,
  identity = VERIFIED_USDC_IDENTITY,
  identityLoading = false,
  identityError = null,
  isIntegrityViolation = false,
}: HookOverrides = {}) {
  useDemoMarketDataMock.mockReturnValue(demoMarketData);
  useAaveConfigMock.mockReturnValue({
    config: { coreSpokeAddress: "0xspoke000000000000000000000000000000000" },
    borrowableReserves,
  });
  useAaveBorrowAprsMock.mockReturnValue({
    aprPercentByReserveId,
    isLoading: aprsLoading,
    error: null,
  });
  useAaveReserveLiquidityMock.mockReturnValue({
    liquidityByReserveId,
    isLoading: false,
    error: liquidityError,
  });
  useAaveReservesPricesMock.mockReturnValue({
    pricesByReserveId,
    isLoading: false,
    error: null,
  });
  useVaultSplitParamsMock.mockReturnValue({ params: splitParams });
  useVerifiedReserveIdentityMock.mockReturnValue({
    identity,
    isLoading: identityLoading,
    error: identityError,
    isIntegrityViolation,
    retry: vi.fn(),
  });
}

function renderPage(reserveIdParam: string) {
  return render(
    <MemoryRouter initialEntries={[`/markets/${reserveIdParam}`]}>
      <Routes>
        <Route
          path={`/markets/:${MARKET_PARAM}`}
          element={<BorrowingMarketsData />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BorrowingMarketsData", () => {
  it("shows the routed reserve's figures in the stats bar, in uppercase compact form", () => {
    setUpHooks();

    renderPage("1");

    const statsBar = within(screen.getByTestId("market-stats-bar"));
    expect(statsBar.getByText("$11.4M")).toBeInTheDocument(); // available liquidity
    expect(statsBar.getByText("3.5%")).toBeInTheDocument(); // borrow APR
    expect(statsBar.getByText("$35.5M")).toBeInTheDocument(); // supplied
    expect(statsBar.getByText("$24.1M")).toBeInTheDocument(); // total borrowed
    expect(statsBar.getByText("68%")).toBeInTheDocument(); // market utilization
  });

  it("shows the on-chain collateral factor as a percentage", () => {
    setUpHooks();

    renderPage("1");

    expect(
      within(screen.getByTestId("collateral-info-card")).getByText("75%"),
    ).toBeInTheDocument();
  });

  it("renders a row per borrowable reserve with its APR, available amount, utilization, and USD + token pairs", () => {
    setUpHooks();

    renderPage("1");

    expect(screen.getByTestId("borrow-market-row-USDC")).toBeInTheDocument();

    const wbtcRow = within(screen.getByTestId("borrow-market-row-WBTC"));
    expect(wbtcRow.getByText("1.2%")).toBeInTheDocument();
    expect(wbtcRow.getByText("40 WBTC")).toBeInTheDocument();
    expect(wbtcRow.getByText("20%")).toBeInTheDocument();
    expect(wbtcRow.getByText("$900K")).toBeInTheDocument();
    expect(wbtcRow.getByText("10 WBTC")).toBeInTheDocument();
    expect(wbtcRow.getByText("$4.5M")).toBeInTheDocument();
    expect(wbtcRow.getByText("50 WBTC")).toBeInTheDocument();
  });

  it("degrades a missing oracle price to the empty placeholder without fabricating a zero USD value", () => {
    setUpHooks({
      pricesByReserveId: { "1": 1.0, "2": null },
    });

    renderPage("1");

    const wbtcRow = within(screen.getByTestId("borrow-market-row-WBTC"));
    expect(wbtcRow.getAllByText(COPY.common.emptyValue)).toHaveLength(2); // borrowed + supplied USD cells
    expect(wbtcRow.getByText("40 WBTC")).toBeInTheDocument();
    expect(wbtcRow.getByText("10 WBTC")).toBeInTheDocument();
    expect(wbtcRow.getByText("50 WBTC")).toBeInTheDocument();
  });

  it("renders the header from the verified identity, not the indexer's reserve symbol", () => {
    setUpHooks();

    renderPage("1");

    // The routed reserve's own token.name/symbol ("USD Coin"/"USDC") also
    // legitimately appear in its own table row (row labels are correctly
    // token-sourced, per test 3), so a page-wide absence check on those
    // strings would be meaningless. Instead, assert the identity's OWN
    // distinct values reached the header: they can only be there if the
    // header reads `identity`, never `token.*`.
    expect(screen.getByText("Verified USD Coin")).toBeInTheDocument();
    expect(screen.getByText("USDC-VERIFIED")).toBeInTheDocument();
    expect(
      screen.getByText(COPY.marketData.subtitle("USDC-VERIFIED")),
    ).toBeInTheDocument();
  });

  it("resolves a token-symbol slug to the reserve whose underlying carries that registry symbol", () => {
    setUpHooks({
      borrowableReserves: [REGISTERED_USDC_RESERVE, WBTC_RESERVE],
    });

    renderPage("usdc");

    const statsBar = within(screen.getByTestId("market-stats-bar"));
    expect(statsBar.getByText("$11.4M")).toBeInTheDocument(); // reserve 1's liquidity
    expect(
      screen.queryByText(COPY.loans.reserveNotFound),
    ).not.toBeInTheDocument();
  });

  // The slug is matched against the address-keyed registry, so the indexer's
  // own `token.symbol` — "USDC" on this fixture — cannot pull a reserve up.
  it("shows the not-found copy for a symbol no registered underlying matches", () => {
    setUpHooks({ identity: null });

    renderPage("usdc");

    expect(screen.getByText(COPY.loans.reserveNotFound)).toBeInTheDocument();
    expect(screen.queryByTestId("market-stats-bar")).not.toBeInTheDocument();
  });

  it("blocks the page with ReserveIdentityBlock when identity verification fails integrity", () => {
    setUpHooks({
      identity: null,
      identityError: new Error("reserve maps to a different token"),
      isIntegrityViolation: true,
    });

    renderPage("1");

    expect(
      screen.getByText(COPY.loans.detail.identityBlockedTitle),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("market-stats-bar")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.loans.detail.retry }),
    ).not.toBeInTheDocument();
  });

  // Review catch (greptile P1): demo fixtures have no on-chain counterpart, so
  // verifying them always failed and the integrity gate hid the very layout the
  // demo exists to show. The gate must not judge a check that never ran.
  it("renders the populated layout for a demo fixture without tripping the identity gate", () => {
    const DEMO_RESERVE = { ...USDC_RESERVE, reserveId: 9001n };
    setUpHooks({
      identity: null,
      demoMarketData: {
        reserves: [DEMO_RESERVE],
        liquidityByReserveId: {
          "9001": {
            availableLiquidity: 11_400_000,
            totalBorrowed: 24_500_000,
            suppliedLiquidity: 38_500_000,
            utilizationBps: 6259,
          },
        },
        aprPercentByReserveId: { "9001": 3.5 },
        pricesByReserveId: { "9001": 1 },
        collateralFactor: 0.75,
      },
    });

    renderPage("9001");

    expect(screen.getByTestId("market-stats-bar")).toBeInTheDocument();
    expect(screen.getByTestId("borrow-market-row-USDC")).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.loans.reserveNotFound),
    ).not.toBeInTheDocument();
  });

  // The toggle is flipped while sitting on some real market route, so the id
  // in the URL never matches a fixture — blanking the page there defeats the
  // point of a preview toggle.
  it("falls back to the first fixture when demo is on and the routed id matches none", () => {
    const DEMO_RESERVE = { ...USDC_RESERVE, reserveId: 9001n };
    setUpHooks({
      identity: null,
      demoMarketData: {
        reserves: [DEMO_RESERVE],
        liquidityByReserveId: {
          "9001": {
            availableLiquidity: 11_400_000,
            totalBorrowed: 24_500_000,
            suppliedLiquidity: 38_500_000,
            utilizationBps: 6259,
          },
        },
        aprPercentByReserveId: { "9001": 3.5 },
        pricesByReserveId: { "9001": 1 },
        collateralFactor: 0.75,
      },
    });

    renderPage("42");

    expect(screen.getByTestId("market-stats-bar")).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.loans.reserveNotFound),
    ).not.toBeInTheDocument();
  });

  it("reports a not-found reserve when demo is on and there are no fixtures at all", () => {
    setUpHooks({
      identity: null,
      demoMarketData: {
        reserves: [],
        liquidityByReserveId: {},
        aprPercentByReserveId: {},
        pricesByReserveId: {},
        collateralFactor: 0.75,
      },
    });

    renderPage("9999");

    expect(screen.getByText(COPY.loans.reserveNotFound)).toBeInTheDocument();
  });

  // Review catch: without its own error state a failed batch read rendered
  // every cell as "–" on an otherwise complete page, so a user could not tell
  // a broken read from a metric with no value.
  it("surfaces a failed market-data read instead of a page of empty placeholders", () => {
    setUpHooks({ liquidityError: new Error("multicall reverted") });

    renderPage("1");

    expect(
      screen.getByText(COPY.marketData.dataUnavailable),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("market-stats-bar")).not.toBeInTheDocument();
  });

  it("holds on a loading state while the market reads are still in flight", () => {
    setUpHooks({ aprsLoading: true });

    renderPage("1");

    expect(screen.getByText(COPY.common.loading)).toBeInTheDocument();
    expect(screen.queryByTestId("market-stats-bar")).not.toBeInTheDocument();
  });
});
