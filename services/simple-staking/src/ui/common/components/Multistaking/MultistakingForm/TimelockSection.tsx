import {
  Slider,
  SubSection,
  Text,
  useFormContext,
  useWatch,
} from "@babylonlabs-io/core-ui";
import { useDebounce } from "@uidotdev/usehooks";
import { useEffect, useRef, useState } from "react";

import { type MultistakingFormFields } from "@/ui/common/state/MultistakingState";
import { useStakingState } from "@/ui/common/state/StakingState";
import { blocksToDisplayTime } from "@/ui/common/utils/time";

const DEBOUNCE_DELAY = 150;

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

  // Local slider value for immediate visual feedback (no lag)
  const [localSliderValue, setLocalSliderValue] =
    useState<number>(minStakingTimeBlocks);

  // Debounced value for form updates (prevents lag during rapid slider changes)
  const debouncedSliderValue = useDebounce(localSliderValue, DEBOUNCE_DELAY);

  // Track whether we're actively dragging (to ignore form updates during drag)
  const isDraggingRef = useRef(false);

  // Sync local state when network params change
  useEffect(() => {
    if (minStakingTimeBlocks > 0 && !isDraggingRef.current) {
      setLocalSliderValue(minStakingTimeBlocks);
    }
  }, [minStakingTimeBlocks]);

  // Sync local state from form when not dragging (e.g. external updates)
  useEffect(() => {
    if (rawTerm !== undefined && !isDraggingRef.current) {
      const clamped = Math.min(
        Math.max(Math.round(rawTerm), minStakingTimeBlocks || 1),
        maxStakingTimeBlocks || rawTerm,
      );
      setLocalSliderValue(clamped);
    }
  }, [rawTerm, minStakingTimeBlocks, maxStakingTimeBlocks]);

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

  // Update form when debounced value settles
  useEffect(() => {
    if (isDraggingRef.current && debouncedSliderValue > 0) {
      isDraggingRef.current = false;
      setValue("term", debouncedSliderValue, {
        shouldValidate: true,
        shouldDirty: true,
        shouldTouch: true,
      });
    }
  }, [debouncedSliderValue, setValue]);

  if (!stakingInfo) {
    return null;
  }

  const handleSliderChange = (value: number) => {
    const clamped = Math.min(
      Math.max(Math.round(value), minStakingTimeBlocks),
      maxStakingTimeBlocks,
    );

    // Mark as dragging and update local state immediately (no lag)
    isDraggingRef.current = true;
    setLocalSliderValue(clamped);
  };

  return (
    <SubSection className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <Text variant="body1" className="text-accent-primary">
          Timelock
        </Text>

        <Text variant="body1" className="text-accent-primary">
          {localSliderValue} Blocks{" "}
          <span className="text-accent-secondary">
            ({blocksToDisplayTime(localSliderValue)})
          </span>
        </Text>
      </div>

      <Slider
        value={localSliderValue}
        min={minStakingTimeBlocks}
        max={maxStakingTimeBlocks}
        step={1}
        steps={[]}
        onChange={handleSliderChange}
      />

      <Text variant="caption" className="text-accent-secondary">
        Min term {minStakingTimeBlocks} Blocks
      </Text>
    </SubSection>
  );
}
