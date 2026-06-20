import { Avatar } from "@babylonlabs-io/core-ui";

import { getNetworkConfigBTC } from "@/config";
import { COPY } from "@/copy";

const btcConfig = getNetworkConfigBTC();

/**
 * Full-content state shown when the indexer responds with HTTP 451 (the user's
 * region is geo-blocked). Replaces the routed page between the navbar and
 * footer with a centered "service unavailable" card, matching the Figma flow.
 */
export function GeoBlockState() {
  return (
    <div className="mx-auto w-full max-w-[760px] px-5 py-20">
      <div className="flex flex-col items-center gap-8 rounded-2xl bg-secondary-highlight px-6 py-10">
        <Avatar
          url={btcConfig.icon}
          alt={btcConfig.coinSymbol}
          size="xlarge"
          className="h-[100px] w-[100px]"
        />
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-[20px] leading-[1.6] text-accent-primary">
            {COPY.geoBlock.title}
          </p>
          <p className="text-[16px] leading-[1.5] text-accent-secondary">
            {COPY.geoBlock.body}
          </p>
        </div>
      </div>
    </div>
  );
}
