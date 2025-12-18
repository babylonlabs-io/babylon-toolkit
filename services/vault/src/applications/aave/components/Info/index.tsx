import {
  Avatar,
  Button,
  KeyValueList,
  Tabs,
  Text,
} from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

interface MarketInfoProps {
  onBack: () => void;
  marketPair: string;
  usdcIcon?: string;
  loanSymbol?: string;
  attributes?: Array<{ label: string; value: string | ReactNode }>;
  positions?: Array<{ label: string; value: string }>;
  priceDisplay?: {
    value: string;
    label: string;
  };
}

export function MarketInfo({
  onBack,
  marketPair,
  usdcIcon,
  loanSymbol = "USDC",
  attributes,
  positions,
  priceDisplay,
}: MarketInfoProps) {
  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        color="primary"
        size="medium"
        className="flex items-center gap-3 !px-2"
        onClick={onBack}
        aria-label="Back to Aave"
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
        <span className="text-base">Aave</span>
      </Button>

      <div className="flex items-center gap-6">
        <Avatar
          {...(usdcIcon ? { url: usdcIcon } : {})}
          alt={loanSymbol}
          size="xlarge"
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
        <span className="text-[48px] font-normal text-accent-primary">
          {marketPair}
        </span>
      </div>

      {priceDisplay ? (
        <div className="!mt-[31px]">
          <div className="flex flex-col gap-1">
            <span className="text-[32px] font-normal text-accent-primary">
              {priceDisplay.value}
            </span>
            <span className="text-xl text-accent-secondary">
              {priceDisplay.label}
            </span>
          </div>
        </div>
      ) : attributes ? (
        <div className="!mt-[62px]">
          <Tabs
            variant="simple"
            items={[
              {
                id: "market-attributes",
                label: "Market Attributes",
                content: (
                  <KeyValueList items={attributes} showDivider={false} />
                ),
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
      ) : null}
    </div>
  );
}
