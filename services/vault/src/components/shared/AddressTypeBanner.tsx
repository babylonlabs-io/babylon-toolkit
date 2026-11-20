import { Text } from "@babylonlabs-io/core-ui";
import { PiWarningOctagonFill } from "react-icons/pi";

import { COPY } from "@/copy";

interface AddressTypeBannerProps {
  visible: boolean;
}

export function AddressTypeBanner({ visible }: AddressTypeBannerProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="flex flex-row items-center justify-between gap-2 bg-amber-100 px-4 py-3 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
      <div className="flex flex-row items-center gap-2">
        <PiWarningOctagonFill className="flex-shrink-0" />
        <Text variant="body1">
          <strong>{COPY.wallet.addressTypeBanner.title}</strong>
          <br />
          {COPY.wallet.addressTypeBanner.body}
        </Text>
      </div>
    </div>
  );
}
