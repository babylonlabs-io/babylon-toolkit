/**
 * SupplyCapSection — dashboard card visualizing protocol BTC supply cap state.
 * Shows the configured total cap and the current total deposited, each with a
 * USD equivalent. When no total cap is configured on-chain the cap card
 * displays "Uncapped" while the deposited card continues to show usage.
 */

import type { ReactNode } from "react";

import { COPY } from "@/copy";
import { usePrice } from "@/hooks/usePrices";
import type { CapSnapshot } from "@/services/deposit";
import {
  formatSatoshisToBtcDisplay,
  satoshiToBtcNumber,
} from "@/utils/btcConversion";
import { getVpExplorerHomeUrl } from "@/utils/explorer";
import { formatUsd, getBtcSymbol } from "@/utils/formatting";

interface SupplyCapSectionProps {
  snapshot: CapSnapshot | null;
  isLoading?: boolean;
}

interface CapCardProps {
  label: string;
  btcDisplay: string;
  usd: number | null;
}

const CAP_CARD_CLASS =
  "flex h-[76px] w-full flex-col items-start gap-1 rounded-lg bg-secondary-highlight px-6 py-4";

function CapCard({ label, btcDisplay, usd }: CapCardProps) {
  return (
    <div className={CAP_CARD_CLASS}>
      <span className="text-sm text-accent-secondary">{label}</span>
      <span className="text-base text-accent-primary">
        {btcDisplay}
        {usd !== null && (
          <span className="text-accent-secondary"> ({formatUsd(usd)})</span>
        )}
      </span>
    </div>
  );
}

function CapCardSkeleton() {
  return (
    <div className={`${CAP_CARD_CLASS} animate-pulse`}>
      <div className="h-4 w-32 rounded bg-accent-secondary/20" />
      <div className="h-5 w-48 rounded bg-accent-secondary/20" />
    </div>
  );
}

/**
 * Callout linking to the BTC Vault explorer. Hidden when the explorer base URL
 * (NEXT_PUBLIC_TBV_VP_EXPLORER_URL) is not configured.
 */
function ExplorerCallout() {
  const href = getVpExplorerHomeUrl();
  if (!href) return null;
  return (
    <p className="text-sm text-accent-secondary">
      {COPY.explorer.callout}{" "}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-secondary-main underline underline-offset-2 transition-opacity hover:opacity-80"
      >
        {COPY.explorer.calloutLinkText}
      </a>
      .
    </p>
  );
}

function VaultCapFrame({ children }: { children: ReactNode }) {
  return (
    <div className="w-full space-y-4">
      <h2 className="text-[24px] font-normal text-accent-primary">
        Protocol Cap
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
      <ExplorerCallout />
    </div>
  );
}

export function SupplyCapSection({
  snapshot,
  isLoading = false,
}: SupplyCapSectionProps) {
  const btcPriceUSD = usePrice("BTC");

  if (isLoading && !snapshot) {
    return (
      <VaultCapFrame>
        <CapCardSkeleton />
        <CapCardSkeleton />
      </VaultCapFrame>
    );
  }

  if (!snapshot) return null;

  const coinSymbol = getBtcSymbol();
  const depositedBtc = satoshiToBtcNumber(snapshot.totalBTC);
  // Match simple-staking's formatBTCTvl: 2 decimals for >= 1 BTC, 8 for < 1 BTC.
  const depositedDecimals = depositedBtc >= 1 ? 2 : 8;
  const depositedDisplay = `${formatSatoshisToBtcDisplay(snapshot.totalBTC, depositedDecimals)} ${coinSymbol}`;
  const depositedUsd = btcPriceUSD > 0 ? depositedBtc * btcPriceUSD : null;

  // When the on-chain cap is zero the protocol is uncapped; surface that
  // explicitly instead of hiding the card so depositors still see the
  // current total locked.
  let capDisplay: string;
  let capUsd: number | null;
  if (snapshot.hasTotalCap) {
    const capBtc = satoshiToBtcNumber(snapshot.totalCapBTC);
    const capDecimals = capBtc >= 1 ? 2 : 8;
    capDisplay = `${formatSatoshisToBtcDisplay(snapshot.totalCapBTC, capDecimals)} ${coinSymbol}`;
    capUsd = btcPriceUSD > 0 ? capBtc * btcPriceUSD : null;
  } else {
    capDisplay = COPY.collateral.uncapped;
    capUsd = null;
  }

  return (
    <VaultCapFrame>
      <CapCard label="Total Cap" btcDisplay={capDisplay} usd={capUsd} />
      <CapCard
        label="Total Deposited"
        btcDisplay={depositedDisplay}
        usd={depositedUsd}
      />
    </VaultCapFrame>
  );
}
