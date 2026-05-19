import { Card } from "@babylonlabs-io/core-ui";
import { IoCheckmark, IoChevronUp } from "react-icons/io5";

import { COPY } from "@/copy";

interface PartialLiquidationProps {
  isEnabled: boolean;
  onChange: (checked: boolean) => void;
  canSplit: boolean;
  isLoading: boolean;
  splitRatioLabel: string | null;
}

interface UtxoSplitSelectorProps {
  partialLiquidation: PartialLiquidationProps;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

function getSplitOptionMainLabel(splitRatioLabel: string | null): string {
  return splitRatioLabel ? `2 UTXO Split - ${splitRatioLabel}` : "2 UTXO Split";
}

const RECOMMENDED_SUFFIX = "(Recommended)";

export function UtxoSplitSelector({
  partialLiquidation,
  expanded,
  onExpandedChange,
}: UtxoSplitSelectorProps) {
  const splitDisabled =
    !partialLiquidation.canSplit || partialLiquidation.isLoading;

  const handleSelectSplit = () => {
    if (splitDisabled) return;
    partialLiquidation.onChange(true);
  };
  const handleSelectNoSplit = () => partialLiquidation.onChange(false);

  const splitTitleColor = partialLiquidation.isEnabled
    ? "text-accent-primary"
    : "text-accent-secondary";
  const noSplitTitleColor = partialLiquidation.isEnabled
    ? "text-accent-secondary"
    : "text-accent-primary";

  return (
    <>
      <Card variant="filled" className="!rounded-lg !py-4">
        <button
          type="button"
          className="flex w-full items-center justify-between"
          onClick={() => onExpandedChange(!expanded)}
        >
          <span className="text-sm text-accent-primary">
            {partialLiquidation.isEnabled ? (
              <>
                {getSplitOptionMainLabel(partialLiquidation.splitRatioLabel)}{" "}
                <span className="text-accent-secondary">
                  {RECOMMENDED_SUFFIX}
                </span>
              </>
            ) : (
              COPY.deposit.form.doNotSplit
            )}
          </span>
          <IoChevronUp
            className={`text-accent-primary transition-transform ${expanded ? "" : "rotate-180"}`}
          />
        </button>
      </Card>

      {expanded && (
        <Card
          variant="default"
          className="flex flex-col gap-6 !rounded-lg !bg-primary-contrast !py-4"
        >
          <div
            role="button"
            tabIndex={splitDisabled ? -1 : 0}
            aria-disabled={splitDisabled}
            className={`flex w-full items-start justify-between gap-3 text-left ${splitDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            onClick={handleSelectSplit}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleSelectSplit();
              }
            }}
          >
            <span className="flex flex-col gap-1">
              <span className={`text-sm ${splitTitleColor}`}>
                {getSplitOptionMainLabel(partialLiquidation.splitRatioLabel)}{" "}
                <span className="text-accent-secondary">
                  {RECOMMENDED_SUFFIX}
                </span>
              </span>
              <span className="text-xs text-accent-secondary">
                {COPY.deposit.form.splitOptionDescription}
                {/* TODO: restore once we have the final docs URL for split rationale
                {" "}
                <a
                  href="#"
                  className="text-secondary-main underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  {COPY.deposit.form.learnWhyRecommended}
                </a>
                */}
              </span>
            </span>
            {partialLiquidation.isEnabled && (
              <IoCheckmark className="shrink-0 text-accent-primary" size={20} />
            )}
          </div>

          <div
            role="button"
            tabIndex={0}
            className="flex w-full cursor-pointer items-start justify-between gap-3 text-left"
            onClick={handleSelectNoSplit}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleSelectNoSplit();
              }
            }}
          >
            <span className="flex flex-col gap-1">
              <span className={`text-sm ${noSplitTitleColor}`}>
                {COPY.deposit.form.doNotSplit}
              </span>
              <span className="text-xs text-accent-secondary">
                {COPY.deposit.form.noSplitOptionDescription}
              </span>
            </span>
            {!partialLiquidation.isEnabled && (
              <IoCheckmark className="shrink-0 text-accent-primary" size={20} />
            )}
          </div>

          {partialLiquidation.isLoading && (
            <span className="text-xs text-accent-secondary">
              {COPY.deposit.form.computingAllocation}
            </span>
          )}
        </Card>
      )}
    </>
  );
}
