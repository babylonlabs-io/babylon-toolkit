import { Text } from "@babylonlabs-io/core-ui";
import { useState } from "react";
import { MdErrorOutline } from "react-icons/md";

import { InfoModal } from "@/ui/common/components/Modals/InfoModal";
import { useStakingState } from "@/ui/common/state/StakingState";
import { blocksToDisplayTime } from "@/ui/common/utils/time";

export function InfoAlert() {
  const [showMore, setShowMore] = useState(false);
  const { stakingInfo } = useStakingState();

  return (
    <div className="flex flex-row items-start justify-between rounded bg-secondary-highlight px-4 py-2">
      <div className="py-2 pr-3">
        <MdErrorOutline size={22} className="text-secondary-strokeDark" />
      </div>

      <div className="flex grow flex-col gap-1">
        <Text variant="subtitle1" className="font-medium text-accent-primary">
          Info
        </Text>
        <Text variant="body1" className="text-accent-secondary">
          You can unbond and withdraw your stake anytime with an unbonding time
          of {blocksToDisplayTime(stakingInfo?.unbondingTime)}.
        </Text>{" "}
        <a
          rel="noopener noreferrer"
          className="cursor-pointer text-secondary-main/90 hover:text-secondary-main"
          onClick={() => setShowMore(true)}
        >
          Learn More
        </a>
      </div>

      <InfoModal open={showMore} onClose={() => setShowMore(false)} />
    </div>
  );
}
