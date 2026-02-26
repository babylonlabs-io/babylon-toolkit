import { useAaveConfig } from "@/applications/aave/context";
import { usePrices } from "@/hooks";
import {
  getCurrencyIconWithFallback,
  getTokenByAddress,
} from "@/services/token/tokenService";
import { formatUsdValue } from "@/utils/formatting";

export interface BorrowableAssetItem {
  reserveId: string;
  symbol: string;
  name: string;
  icon: string;
  priceFormatted: string;
  rateFormatted: string;
}

export interface BorrowAssetSelectionState {
  isLoading: boolean;
  assets: BorrowableAssetItem[];
}

export function useBorrowAssetSelection(): BorrowAssetSelectionState {
  const { borrowableReserves, isLoading: configLoading } = useAaveConfig();
  const { prices, isLoading: pricesLoading } = usePrices();
  const isLoading = configLoading || pricesLoading;

  const assets: BorrowableAssetItem[] = borrowableReserves.map((reserve) => {
    const tokenMetadata = getTokenByAddress(reserve.token.address);
    const priceUsd = prices[reserve.token.symbol];

    return {
      reserveId: reserve.reserveId.toString(),
      symbol: reserve.token.symbol,
      name: reserve.token.name,
      icon: getCurrencyIconWithFallback(
        tokenMetadata?.icon,
        reserve.token.symbol,
      ),
      priceFormatted: priceUsd != null ? formatUsdValue(priceUsd) : "—",
      rateFormatted: "—",
    };
  });

  return { isLoading, assets };
}
