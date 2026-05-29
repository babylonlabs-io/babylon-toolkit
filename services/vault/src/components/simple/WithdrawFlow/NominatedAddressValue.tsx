import { CopyableHash } from "@/components/shared/CopyableHash";

interface NominatedAddressValueProps {
  /** Deduped BTC addresses. Empty array renders nothing. */
  addresses: string[];
}

/**
 * Nominated payout address(es): each truncated with copy-to-clipboard. Multiple
 * (rare — a different wallet per vault) stack so every destination is copyable.
 */
export function NominatedAddressValue({
  addresses,
}: NominatedAddressValueProps) {
  if (addresses.length === 0) return null;

  return (
    <span className="flex flex-col items-end gap-1">
      {addresses.map((address) => (
        <CopyableHash key={address} hash={address} chain="BTC" kind="address" />
      ))}
    </span>
  );
}
