import { KeyValueList, SubSection } from "@babylonlabs-io/core-ui";
import type { ComponentProps } from "react";

import {
  getHealthFactorColor,
  getHealthFactorStatusFromValue,
} from "@/applications/aave/utils";
import { HeartIcon } from "@/components/shared";

type KeyValueListItems = ComponentProps<typeof KeyValueList>["items"];

interface BorrowDetailsCardProps {
  borrowRatio: string;
  borrowRatioOriginal?: string;
  healthFactor: string;
  healthFactorValue: number;
  healthFactorOriginal?: string;
  healthFactorOriginalValue?: number;
}

/**
 * BorrowDetailsCard - Displays borrow rate and health factor with before → after indicators
 */
export function BorrowDetailsCard({
  borrowRatio,
  borrowRatioOriginal,
  healthFactor,
  healthFactorValue,
  healthFactorOriginal,
  healthFactorOriginalValue,
}: BorrowDetailsCardProps) {
  const status = getHealthFactorStatusFromValue(healthFactorValue);
  const color = getHealthFactorColor(status);
  const originalStatus =
    healthFactorOriginalValue !== undefined
      ? getHealthFactorStatusFromValue(healthFactorOriginalValue)
      : undefined;
  const originalColor = originalStatus
    ? getHealthFactorColor(originalStatus)
    : undefined;

  const items: KeyValueListItems = [
    {
      label: "Borrow rate",
      value: borrowRatioOriginal ? (
        <span className="flex items-center gap-2">
          <span className="text-accent-secondary">{borrowRatioOriginal}</span>
          <span className="text-accent-secondary">→</span>
          <span>{borrowRatio}</span>
        </span>
      ) : (
        borrowRatio
      ),
    },
    {
      label: "Health factor",
      value:
        healthFactorOriginal && originalColor ? (
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-accent-secondary">
              <HeartIcon color={originalColor} />
              {healthFactorOriginal}
            </span>
            <span className="text-accent-secondary">→</span>
            <span className="flex items-center gap-1">
              <HeartIcon color={color} />
              {healthFactor}
            </span>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <HeartIcon color={color} />
            {healthFactor}
          </span>
        ),
    },
  ];

  return (
    <SubSection className="w-full flex-col">
      <KeyValueList
        items={items}
        showDivider={false}
        className="w-full"
        textSize="small"
      />
    </SubSection>
  );
}
