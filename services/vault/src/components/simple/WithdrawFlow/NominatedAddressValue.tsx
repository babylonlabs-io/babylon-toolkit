import { truncateAddress } from "@/utils/addressUtils";

interface NominatedAddressValueProps {
  /** Deduped BTC addresses. Empty array renders nothing. */
  addresses: string[];
}

/**
 * Renders one or more nominated payout addresses on a single DetailsCard line.
 * Multi-address case is rare (would only happen if a user deposited from
 * different wallets across vaults) but must remain accurate when it occurs —
 * we show the first address with a "(+N more)" indicator and put the full list
 * in the title attribute so the user can still verify every destination.
 */
export function NominatedAddressValue({
  addresses,
}: NominatedAddressValueProps) {
  if (addresses.length === 0) return null;

  const [first, ...rest] = addresses;

  if (rest.length === 0) {
    return <span title={first}>{truncateAddress(first)}</span>;
  }

  return (
    <span title={addresses.join("\n")}>
      {truncateAddress(first)} (+{rest.length} more)
    </span>
  );
}
