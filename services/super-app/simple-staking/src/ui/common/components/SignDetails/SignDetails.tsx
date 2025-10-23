import { EventData } from "@babylonlabs-io/btc-staking-ts";
import { Text } from "@babylonlabs-io/core-ui";
import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import { Hash } from "@/ui/common/components/Hash/Hash";
import { getNetworkConfigBTC } from "@/ui/common/config/network/btc";
import { satoshiToBtc } from "@/ui/common/utils/btc";
import { maxDecimals } from "@/ui/common/utils/maxDecimals";
import { blocksToDisplayTime } from "@/ui/common/utils/time";

interface SignDetailsProps {
  details?: EventData;
  shouldHaveMargin?: boolean;
}

const keyDisplayMappings: Record<string, string> = {
  stakerPk: "Staker Public Key",
  finalityProviders: "Finality Providers",
  covenantPks: "Covenant Public Keys",
  covenantThreshold: "Covenant Threshold",
  minUnbondingTime: "Unbonding Time",
  stakingDuration: "Staking Duration",
  unbondingTimeBlocks: "Unbonding Time",
  address: "Address",
  type: "Type",
  timelockBlocks: "Timelock",
  bech32Address: "BABY Address",
  unbondingFeeSat: "Unbonding Fee",
  slashingFeeSat: "Slashing Fee",
  slashingPkScriptHex: "Slashing Script Hex",
};

const formatDisplayKey = (key: string): string => {
  return keyDisplayMappings[key] || key;
};

// Format the display value based on the key and value type
const formatDisplayValue = (key: string, value: any): ReactNode => {
  const { coinName } = getNetworkConfigBTC();

  // Staking duration, unbonding time
  if (
    typeof value === "number" &&
    (key.toLowerCase().includes("time") ||
      key.toLowerCase().includes("duration"))
  ) {
    return (
      <Text
        variant="body2"
        className="break-all text-right text-accent-primary"
      >
        {blocksToDisplayTime(value)}
      </Text>
    );
  }
  // Finality providers, covenant public keys
  if (Array.isArray(value)) {
    return (
      <div className="flex max-w-xs flex-col items-end">
        {value.map((item, index) => (
          <Hash key={index} value={String(item)} small noFade address />
        ))}
      </div>
    );
  }
  // Public keys and addresses
  if (
    key.toLowerCase().includes("pk") ||
    key.toLowerCase().includes("address")
  ) {
    return <Hash value={value} small noFade address />;
  }
  // Title
  if (key.toLowerCase() === "type") {
    const capitalizedTitle = (value as string)
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
    return (
      <Text
        variant="body2"
        className="break-all text-right text-accent-primary"
      >
        {capitalizedTitle}
      </Text>
    );
  }
  // Fees, convert from satoshis to BTC
  if (key.toLowerCase().includes("fee") && typeof value === "number") {
    return (
      <Text
        variant="body2"
        className="break-all text-right text-accent-primary"
      >
        {maxDecimals(satoshiToBtc(value), 8)} {coinName}
      </Text>
    );
  }
  // Default case for other values
  return (
    <Text variant="body2" className="break-all text-right text-accent-primary">
      {String(value)}
    </Text>
  );
};

const getOrderedKeys = (details: EventData): string[] => {
  // Provide an order for specific keys
  const orderedKeys = ["type", "stakerPk"];
  // Then add any remaining keys from details that aren't already included
  const allKeys = orderedKeys.filter((key) => key in details);
  Object.keys(details).forEach((key) => {
    if (!allKeys.includes(key)) {
      allKeys.push(key);
    }
  });
  return allKeys;
};

export const SignDetails: React.FC<SignDetailsProps> = ({
  details,
  shouldHaveMargin,
}) => {
  if (!details || Object.keys(details).length === 0) {
    return null;
  }

  return (
    <div
      className={twMerge(
        "flex flex-1 flex-col gap-4 overflow-y-auto rounded border border-secondary-strokeLight bg-primary-contrast/50 p-4",
        shouldHaveMargin && "m-4",
      )}
    >
      {getOrderedKeys(details).map((key) => (
        <div key={key} className="flex items-start justify-between gap-2">
          <Text
            variant="body2"
            className="whitespace-nowrap text-accent-secondary"
          >
            {formatDisplayKey(key)}:
          </Text>
          {formatDisplayValue(key, details[key])}
        </div>
      ))}
    </div>
  );
};
