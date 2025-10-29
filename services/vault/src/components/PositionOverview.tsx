import {
  Avatar,
  AvatarGroup,
  Table,
  useIsMobile,
  VaultDetailCard,
  type ColumnProps,
} from "@babylonlabs-io/core-ui";
import { useETHWallet } from "@babylonlabs-io/wallet-connector";
import { useNavigate } from "react-router";

import { useUserPositions } from "../hooks/useUserPositions";
import type { PositionWithMorpho } from "../services/position";

// Extend PositionWithMorpho to include id for Table component
type PositionWithId = PositionWithMorpho & { id: string };

export function PositionOverview() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { address } = useETHWallet();

  // Fetch real position data from API
  const { positions, loading, error } = useUserPositions(
    address as `0x${string}` | undefined,
  );

  const handlePositionClick = (position: PositionWithId | null) => {
    if (position) {
      // Navigate to market detail with repay tab
      navigate(`/market/${position.marketData.id}?tab=repay`);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-accent-secondary">
        Loading positions...
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="py-8 text-center text-sm text-red-500">
        Error loading positions: {error.message}
      </div>
    );
  }

  // No wallet connected
  if (!address) {
    return (
      <div className="py-8 text-center text-sm text-accent-secondary">
        Please connect your wallet to view positions
      </div>
    );
  }

  // No positions
  if (positions.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-accent-secondary">
        No positions available
      </div>
    );
  }

  // Transform positions to include id for Table component
  const positionsWithId: PositionWithId[] = positions.map((position) => ({
    ...position,
    id: position.positionId,
  }));

  // Helper functions for formatting
  const formatUSDC = (value: bigint) => {
    return (Number(value) / 1e6).toFixed(2);
  };

  const formatBTC = (value: bigint) => {
    return (Number(value) / 1e8).toFixed(8);
  };

  const calculateLTV = (
    borrowAssets: bigint,
    collateral: bigint,
    btcPrice: number,
  ) => {
    if (collateral === 0n) return 0;
    const collateralUSD = (Number(collateral) / 1e8) * btcPrice;
    const borrowUSD = Number(borrowAssets) / 1e6;
    return (borrowUSD / collateralUSD) * 100;
  };

  const formatLLTV = (lltv: bigint) => {
    const lltvNumber = Number(lltv) / 1e16;
    return `${lltvNumber.toFixed(1)}%`;
  };

  const columns: ColumnProps<PositionWithId>[] = [
    {
      key: "market",
      header: "Market",
      render: () => (
        <div className="flex items-center gap-2">
          <AvatarGroup size="small">
            <Avatar
              url="/images/btc.png"
              alt="BTC"
              size="small"
              variant="circular"
            />
            <Avatar
              url="/images/usdc.png"
              alt="USDC"
              size="small"
              variant="circular"
            />
          </AvatarGroup>
          <span className="text-sm font-medium text-accent-primary">
            BTC/USDC
          </span>
        </div>
      ),
    },
    {
      key: "ltv",
      header: "LTV",
      render: (_value: unknown, row: PositionWithId) => {
        const ltv = calculateLTV(
          row.morphoPosition.borrowAssets,
          row.morphoPosition.collateral,
          row.btcPriceUSD,
        );
        return (
          <span className="text-sm text-accent-primary">{ltv.toFixed(1)}%</span>
        );
      },
    },
    {
      key: "liquidationLtv",
      header: "Liquidation LTV",
      render: (_value: unknown, row: PositionWithId) => (
        <span className="text-sm text-accent-primary">
          {formatLLTV(row.marketData.lltv)}
        </span>
      ),
    },
    {
      key: "borrowed",
      header: "Borrowed",
      render: (_value: unknown, row: PositionWithId) => (
        <span className="text-sm text-accent-primary">
          {formatUSDC(row.morphoPosition.borrowAssets)} USDC
        </span>
      ),
    },
    {
      key: "collateral",
      header: "Collateral",
      render: (_value: unknown, row: PositionWithId) => (
        <span className="text-sm text-accent-primary">
          {formatBTC(row.morphoPosition.collateral)} BTC
        </span>
      ),
    },
  ];

  return (
    <>
      {isMobile ? (
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          {positionsWithId.map((position) => {
            const ltv = calculateLTV(
              position.morphoPosition.borrowAssets,
              position.morphoPosition.collateral,
              position.btcPriceUSD,
            );
            return (
              <div
                key={position.positionId}
                onClick={() => handlePositionClick(position)}
                className="cursor-pointer"
              >
                <VaultDetailCard
                  id={position.positionId}
                  title={{
                    icons: ["/images/btc.png", "/images/usdc.png"],
                    text: "BTC/USDC",
                  }}
                  details={[
                    { label: "LTV", value: `${ltv.toFixed(1)}%` },
                    {
                      label: "Liquidation LTV",
                      value: formatLLTV(position.marketData.lltv),
                    },
                    {
                      label: "Borrowed",
                      value: `${formatUSDC(position.morphoPosition.borrowAssets)} USDC`,
                    },
                    {
                      label: "Collateral",
                      value: `${formatBTC(position.morphoPosition.collateral)} BTC`,
                    },
                  ]}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="max-h-[500px] overflow-x-auto overflow-y-auto bg-primary-contrast">
          <Table
            data={positionsWithId}
            columns={columns}
            fluid
            onRowSelect={handlePositionClick}
          />
        </div>
      )}
    </>
  );
}
