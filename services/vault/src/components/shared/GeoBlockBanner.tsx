import { Text } from "@babylonlabs-io/core-ui";
import { PiWarningOctagonFill } from "react-icons/pi";

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
          We're sorry, but this page isn't accessible in your location at the
          moment due to regional restrictions
        </Text>
      </div>
    </div>
  );
}
