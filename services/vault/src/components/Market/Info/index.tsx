import {
  Avatar,
  AvatarGroup,
  Button,
  KeyValueList,
  MarketStatCard,
  Tabs,
  Text,
} from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

interface MarketInfoProps {
  onBack: () => void;
  marketPair: string;
  btcIcon?: string; // undefined will use Avatar fallback
  usdcIcon?: string; // undefined will use Avatar fallback
  collateralSymbol?: string; // Token symbol for Avatar fallback
  loanSymbol?: string; // Token symbol for Avatar fallback
  totalMarketSize: string;
  totalMarketSizeSubtitle: string;
  totalLiquidity: string;
  totalLiquiditySubtitle: string;
  borrowRate: string;
  attributes: Array<{ label: string; value: string | ReactNode }>;
  positions?: Array<{ label: string; value: string }>;
}

export function MarketInfo({
  onBack,
  marketPair,
  btcIcon,
  usdcIcon,
  collateralSymbol = "BTC",
  loanSymbol = "USDC",
  totalMarketSize,
  totalMarketSizeSubtitle,
  totalLiquidity,
  totalLiquiditySubtitle,
  borrowRate,
  attributes,
  positions,
}: MarketInfoProps) {
  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        color="primary"
        size="medium"
        className="flex items-center gap-3 !px-2"
        onClick={onBack}
        aria-label="Back to dashboard"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12.5 15L7.5 10L12.5 5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-base">Dashboard</span>
      </Button>

      <div className="flex items-center gap-6">
        <AvatarGroup size="xlarge">
          <Avatar
            {...(btcIcon ? { url: btcIcon } : {})}
            alt={collateralSymbol}
            size="large"
            variant="circular"
          >
            {!btcIcon && (
              <Text
                as="span"
                className="inline-flex h-full w-full items-center justify-center bg-secondary-main text-base font-medium text-accent-contrast"
              >
                {collateralSymbol?.charAt(0).toUpperCase() || "?"}
              </Text>
            )}
          </Avatar>
          <Avatar
            {...(usdcIcon ? { url: usdcIcon } : {})}
            alt={loanSymbol}
            size="large"
            variant="circular"
          >
            {!usdcIcon && (
              <Text
                as="span"
                className="inline-flex h-full w-full items-center justify-center bg-secondary-main text-base font-medium text-accent-contrast"
              >
                {loanSymbol?.charAt(0).toUpperCase() || "?"}
              </Text>
            )}
          </Avatar>
        </AvatarGroup>
        <span className="text-[48px] font-normal text-accent-primary">
          {marketPair}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-6 max-md:grid-cols-1">
        <MarketStatCard
          title="Total Market Size"
          amount={totalMarketSize}
          subtitle={totalMarketSizeSubtitle}
        />
        <MarketStatCard
          title="Total Liquidity"
          amount={totalLiquidity}
          subtitle={totalLiquiditySubtitle}
        />
        <MarketStatCard title="Borrow Rate" amount={borrowRate} />
      </div>
      <div className="!mt-[62px]">
        <Tabs
          variant="simple"
          items={[
            {
              id: "market-attributes",
              label: "Market Attributes",
              content: <KeyValueList items={attributes} showDivider={false} />,
            },
            ...(positions
              ? [
                  {
                    id: "positions",
                    label: "Positions",
                    content: (
                      <KeyValueList items={positions} showDivider={false} />
                    ),
                  },
                ]
              : []),
          ]}
          defaultActiveTab="market-attributes"
        />
      </div>
    </div>
  );
}
