import { Text } from "@babylonlabs-io/core-ui";
import { PiWarningOctagonFill } from "react-icons/pi";

import { GEO_BLOCK_MESSAGE } from "@/types/healthCheck";

interface GeoBlockBannerProps {
  visible: boolean;
}

export function GeoBlockBanner({ visible }: GeoBlockBannerProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="flex flex-row items-center justify-between gap-2 bg-red-100 px-4 py-3 text-red-800 dark:bg-red-900/30 dark:text-red-300">
      <div className="flex flex-row items-center gap-2">
        <PiWarningOctagonFill className="flex-shrink-0" />
        <Text variant="body1">
          <strong>Unavailable In Your Region</strong>
          <br />
          {GEO_BLOCK_MESSAGE}
        </Text>
      </div>
    </div>
  );
}
