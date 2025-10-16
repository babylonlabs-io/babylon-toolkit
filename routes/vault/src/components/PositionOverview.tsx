import {
  Table,
  Menu,
  MenuItem,
  ThreeDotsMenuIcon,
  useIsMobile,
  VaultDetailCard,
  Avatar,
  AvatarGroup,
  type ColumnProps,
} from "@babylonlabs-io/core-ui";
import type { Position } from "../types/position";

// Hardcoded position data
const HARDCODED_POSITIONS: Position[] = [
  {
    id: "1",
    loan: "BTC/USDC",
    lltv: "70%",
    liquidationLtv: "500M USDC ($500m)",
    borrowRate: "5.37%",
    health: "77.4%",
  },
];

export function PositionOverview() {
  const isMobile = useIsMobile();
  const positions = HARDCODED_POSITIONS;

  if (positions.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-accent-secondary">
        No positions available
      </div>
    );
  }

  const columns: ColumnProps<Position>[] = [
    {
      key: "loan",
      header: "Loan",
      render: (_value: unknown, row: Position) => (
        <div className="flex items-center gap-2">
          <AvatarGroup size="small">
            <Avatar url="/btc.png" alt="BTC" size="small" variant="circular" />
            <Avatar url="/usdc.png" alt="USDC" size="small" variant="circular" />
          </AvatarGroup>
          <span className="text-sm font-medium text-accent-primary">
            {row.loan}
          </span>
        </div>
      ),
    },
    {
      key: "ltv",
      header: "LTV",
      render: (_value: unknown, row: Position) => (
        <span className="text-sm text-accent-primary">{row.lltv}</span>
      ),
    },
    {
      key: "liquidationLtv",
      header: "Liquidation LTV",
      render: (_value: unknown, row: Position) => {
        const parts = row.liquidationLtv.split(" ");
        const mainText = parts.slice(0, 2).join(" ");
        const subText = parts.slice(2).join(" ");
        return (
          <div className="flex items-center gap-1">
            <span className="text-sm text-accent-primary">{mainText}</span>
            {subText && (
              <span className="text-sm text-accent-secondary">{subText}</span>
            )}
          </div>
        );
      },
    },
    {
      key: "borrowRate",
      header: "Borrow Rate",
      render: (_value: unknown, row: Position) => (
        <span className="text-sm text-accent-primary">{row.borrowRate}</span>
      ),
    },
    {
      key: "health",
      header: "Health",
      render: (_value: unknown, row: Position) => (
        <span className="text-sm text-accent-primary">{row.health}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (_value: unknown, row: Position) => (
        <div className="flex justify-end">
          <Menu
            trigger={
              <button
                className="rounded p-1 hover:bg-surface-secondary"
                aria-label="Actions"
              >
                <ThreeDotsMenuIcon size={20} variant="accent-primary" />
              </button>
            }
            placement="bottom-end"
          >
            <MenuItem
              name="Withdraw Deposit"
              onClick={() => console.log("Withdraw", row.id)}
            />
          </Menu>
        </div>
      ),
    },
  ];

  return (
    <>
      {isMobile ? (
        <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
          {positions.map((position) => {
            const parts = position.liquidationLtv.split(" ");
            const mainText = parts.slice(0, 2).join(" ");
            const subText = parts.slice(2).join(" ");
            return (
              <VaultDetailCard
                key={position.id}
                id={position.id}
                title={{
                  icons: ["/btc.png", "/usdc.png"],
                  text: position.loan,
                }}
                details={[
                  { label: "LLTV", value: position.lltv },
                  {
                    label: "Liquidation LTV",
                    value: (
                      <div className="flex flex-col items-end">
                        <span className="text-sm text-accent-primary">{mainText}</span>
                        {subText && (
                          <span className="text-sm text-accent-secondary">{subText}</span>
                        )}
                      </div>
                    ),
                  },
                  { label: "Borrow Rate", value: position.borrowRate },
                  { label: "Health", value: position.health },
                ]}
                actions={[
                  { name: "Withdraw Deposit", action: "withdraw" },
                ]}
                onAction={(positionId, action) =>
                  console.log(`Action ${action} on position ${positionId}`)
                }
              />
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto bg-primary-contrast max-h-[500px] overflow-y-auto">
          <Table data={positions} columns={columns} fluid />
        </div>
      )}
    </>
  );
}

