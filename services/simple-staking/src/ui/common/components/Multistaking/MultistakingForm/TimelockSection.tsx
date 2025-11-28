import {
  Slider,
  SubSection,
  Text,
  useFormContext,
  useWatch,
} from "@babylonlabs-io/core-ui";
import { useEffect, useMemo, useState } from "react";

import { type MultistakingFormFields } from "@/ui/common/state/MultistakingState";
import { useStakingState } from "@/ui/common/state/StakingState";
import { blocksToDisplayTime } from "@/ui/common/utils/time";

/**
 * TimelockSection
 *
 * Renders a "Timelock" row with:
 * - a read-only label showing the current block count and estimated duration
 * - a slider constrained between the min / max staking time
 * - a small helper text showing the minimum term
 *
 * The field is wired to the shared `term` form field used by staking.
 */
export function TimelockSection() {
  const { stakingInfo } = useStakingState();
  const { setValue } = useFormContext();
  const rawTerm = useWatch<MultistakingFormFields, "term">({ name: "term" });

  const minStakingTimeBlocks = stakingInfo?.minStakingTimeBlocks ?? 0;
  const maxStakingTimeBlocks = stakingInfo?.maxStakingTimeBlocks ?? 0;

  // Keep track of the last valid numeric term so the slider stays stable
  const [lastValidTerm, setLastValidTerm] =
    useState<number>(minStakingTimeBlocks);

  // Ensure local state stays in sync if network params change
  useEffect(() => {
    if (minStakingTimeBlocks > 0) {
      setLastValidTerm(minStakingTimeBlocks);
    }
  }, [minStakingTimeBlocks]);

  const clampedTerm = useMemo(() => {
    if (rawTerm === undefined || minStakingTimeBlocks === 0) {
      return undefined;
    }
    return Math.min(
      Math.max(Math.round(rawTerm), minStakingTimeBlocks),
      maxStakingTimeBlocks,
    );
  }, [rawTerm, minStakingTimeBlocks, maxStakingTimeBlocks]);

  // Keep `lastValidTerm` in sync with a valid parsed value
  useEffect(() => {
    if (clampedTerm !== undefined && clampedTerm !== lastValidTerm) {
      setLastValidTerm(clampedTerm);
    }
  }, [clampedTerm, lastValidTerm]);

  // Initialise the form field with the minimum if it is empty
  useEffect(() => {
    if (minStakingTimeBlocks > 0 && rawTerm === undefined) {
      setValue("term", minStakingTimeBlocks, {
        shouldValidate: true,
        shouldDirty: false,
        shouldTouch: false,
      });
    }
  }, [rawTerm, minStakingTimeBlocks, setValue]);

  if (!stakingInfo) {
    return null;
  }

  const sliderValue = clampedTerm !== undefined ? clampedTerm : lastValidTerm;

  const handleSliderChange = (value: number) => {
    const clamped = Math.min(
      Math.max(Math.round(value), minStakingTimeBlocks),
      maxStakingTimeBlocks,
    );

    setLastValidTerm(clamped);
    setValue("term", clamped, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  return (
    <SubSection className="flex w-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <Text variant="body1" className="text-accent-primary">
          Timelock
        </Text>

        <Text variant="body1" className="text-accent-primary">
          {sliderValue} Blocks{" "}
          <span className="text-accent-secondary">
            ({blocksToDisplayTime(sliderValue)})
          </span>
        </Text>
      </div>

      <div className="px-1 pt-2">
        <Slider
          value={sliderValue}
          min={minStakingTimeBlocks}
          max={maxStakingTimeBlocks}
          step={1}
          onChange={handleSliderChange}
        />
      </div>

      <Text variant="caption" className="text-accent-secondary">
        Min term {minStakingTimeBlocks} Blocks
      </Text>
    </SubSection>
  );
}
