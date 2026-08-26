import { Text } from "@babylonlabs-io/core-ui";
import { PiWarningOctagonFill } from "react-icons/pi";

import { COPY } from "@/copy";

interface AddressScreeningBannerProps {
  visible: boolean;
}

export function AddressScreeningBanner({
  visible,
}: AddressScreeningBannerProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="flex flex-row items-center justify-between gap-2 bg-red-100 px-4 py-3 text-red-800 dark:bg-red-900/30 dark:text-red-300">
      <div className="flex flex-row items-center gap-2">
        <PiWarningOctagonFill className="flex-shrink-0" />
        <Text variant="body1">
          <strong>{COPY.addressScreening.title}</strong>
          <br />
          {COPY.addressScreening.body}
        </Text>
      </div>
    </div>
  );
}
