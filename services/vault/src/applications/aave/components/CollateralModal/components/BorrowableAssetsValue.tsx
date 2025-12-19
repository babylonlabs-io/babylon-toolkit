/**
 * Borrowable Assets value display component
 * Renders avatar group of borrowable asset icons
 */

import { Avatar, AvatarGroup } from "@babylonlabs-io/core-ui";

import { getTokenByAddress } from "@/services/token";

import type { AaveReserveConfig } from "../../../services";

interface BorrowableAssetsValueProps {
  reserves: AaveReserveConfig[];
}

export function BorrowableAssetsValue({
  reserves,
}: BorrowableAssetsValueProps) {
  const assetIcons = reserves.map((reserve) => {
    const tokenMetadata = getTokenByAddress(reserve.token.address);
    return {
      address: reserve.token.address,
      symbol: reserve.token.symbol,
      icon: tokenMetadata?.icon,
    };
  });

  return (
    <AvatarGroup size="small" max={5} variant="circular">
      {assetIcons.map((asset) => (
        <Avatar
          key={asset.address}
          url={asset.icon}
          alt={asset.symbol}
          size="small"
        />
      ))}
    </AvatarGroup>
  );
}
