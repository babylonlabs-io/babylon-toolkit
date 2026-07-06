import { Avatar, CheckIcon, CopyIcon, Text, useCopy } from "@babylonlabs-io/core-ui";
import { memo, type KeyboardEvent, type MouseEvent } from "react";
import { twMerge } from "tailwind-merge";

interface ConnectedWalletProps {
  className?: string;
  logo: string;
  address: string;
}

// Addresses longer than this are middle-truncated (keep the head and tail) so
// the user can verify the start and end at a glance. The full value is always
// available via the `title` tooltip and the copy button.
const ADDRESS_TRUNCATE_THRESHOLD = 36;
const ADDRESS_EDGE_CHARS = 14;

function truncateAddress(address: string) {
  if (address.length <= ADDRESS_TRUNCATE_THRESHOLD) return address;
  return `${address.slice(0, ADDRESS_EDGE_CHARS)}…${address.slice(-ADDRESS_EDGE_CHARS)}`;
}

export const ConnectedWallet = memo(({ className, logo, address }: ConnectedWalletProps) => {
  const { isCopied, copyToClipboard } = useCopy();
  const copied = isCopied(address);

  // This row renders inside the clickable chain button, so stop propagation (and
  // use a span rather than a nested <button>) to keep the copy action isolated.
  const handleCopy = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    copyToClipboard(address, address);
  };

  return (
    <div className={twMerge("flex items-center gap-2.5 rounded-lg bg-secondary-highlight p-2", className)}>
      <Avatar variant="circular" size="small" className="shrink-0" url={logo} />

      <Text
        as="div"
        variant="caption"
        title={address}
        className="min-w-0 flex-1 truncate text-left font-mono text-accent-secondary"
      >
        {truncateAddress(address)}
      </Text>

      <span
        role="button"
        tabIndex={0}
        aria-label={copied ? "Address copied" : "Copy address"}
        onClick={handleCopy}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleCopy(e);
        }}
        className="flex shrink-0 cursor-pointer items-center text-accent-secondary hover:text-accent-primary"
      >
        {copied ? <CheckIcon size={16} variant="success" /> : <CopyIcon size={16} />}
      </span>
    </div>
  );
});
